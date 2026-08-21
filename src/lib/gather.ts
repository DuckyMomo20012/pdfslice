import type { Logger } from 'winston'
import type { Manifest } from './manifest'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { findImagesDeep, parsePageFromImageName } from './discover'
import { hashFile } from './hash'
import {

  manifestPathFor,
  readManifest,
  writeManifest,
} from './manifest'

export type GatherOptions = {
  /** Root folder: either a single "folder of a file" or a folder containing many such folders. */
  input: string
  dryRun?: boolean
  /** If true, only report status — never write an output PDF. Used by the `check` command. */
  checkOnly?: boolean
  logger: Logger
}

export type UnitReport = {
  folder: string
  sourcePdf: string | null
  pageCount: number | null
  foundImages: number
  missingPages: number[]
  outputPdf?: string
  action:
    | 'created'
    | 'skipped-unchanged'
    | 'would-create'
    | 'missing-source'
    | 'check-only'
}

/**
 * Discover "unit" folders: a folder produced by `split` — it directly
 * contains both a PDF file and the `.pdfslice-manifest.json` written by
 * split. The manifest is the reliable marker: since split copies the PDF
 * (never deletes the original), the *source* folder the PDF was found in
 * also still contains a PDF, but never gets a manifest, so it's correctly
 * skipped here.
 */
async function findUnitFolders(root: string): Promise<string[]> {
  const st = await stat(root)
  if (!st.isDirectory())
    return []

  const units: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    const hasPdf = entries.some(
      e =>
        e.isFile()
        && e.name.toLowerCase().endsWith('.pdf')
        && !e.name.toLowerCase().endsWith('.gathered.pdf'),
    )
    const hasManifest = existsSync(manifestPathFor(dir))
    if (hasPdf && hasManifest) {
      units.push(dir)
      return // don't descend further into a recognized unit
    }
    for (const e of entries) {
      if (e.isDirectory())
        await walk(path.join(dir, e.name))
    }
  }
  await walk(root)
  return units
}

export async function gatherAll(opts: GatherOptions): Promise<UnitReport[]> {
  const units = await findUnitFolders(opts.input)
  opts.logger.info(`Found ${units.length} unit folder(s) under ${opts.input}`)

  const reports: UnitReport[] = []
  for (const folder of units) {
    reports.push(await gatherOne(folder, opts))
  }
  return reports
}

async function gatherOne(
  folder: string,
  opts: GatherOptions,
): Promise<UnitReport> {
  const { logger, dryRun = false, checkOnly = false } = opts

  const entries = await readdir(folder, { withFileTypes: true })
  const pdfEntry = entries.find(
    e =>
      e.isFile()
      && e.name.toLowerCase().endsWith('.pdf')
      && !e.name.toLowerCase().endsWith('.gathered.pdf'),
  )

  if (!pdfEntry) {
    logger.warn(`No source PDF found in unit folder`, { folder })
    return {
      folder,
      sourcePdf: null,
      pageCount: null,
      foundImages: 0,
      missingPages: [],
      action: 'missing-source',
    }
  }

  const sourcePdfPath = path.join(folder, pdfEntry.name)
  const pdfBytes = await readFile(sourcePdfPath)
  const doc = await PDFDocument.load(pdfBytes)
  const pageCount = doc.getPageCount()

  const imagePaths = await findImagesDeep(folder)
  const foundPages = new Set<number>()
  for (const imgPath of imagePaths) {
    const page = parsePageFromImageName(path.basename(imgPath))
    if (page !== null)
      foundPages.add(page)
  }

  const missingPages: number[] = []
  for (let p = 1; p <= pageCount; p++) {
    if (!foundPages.has(p))
      missingPages.push(p)
  }

  if (missingPages.length > 0) {
    logger.warn(`Missing page image(s)`, {
      folder,
      missingPages,
      expected: pageCount,
      found: foundPages.size,
    })
  }
  else {
    logger.info(`All ${pageCount} page image(s) present`, { folder })
  }

  if (checkOnly) {
    return {
      folder,
      sourcePdf: sourcePdfPath,
      pageCount,
      foundImages: foundPages.size,
      missingPages,
      action: 'check-only',
    }
  }

  // Decide whether to (re)build the combined PDF, using the manifest to
  // detect whether page count or image content actually changed.
  const manifest = await readManifest(folder)
  const currentHashes = await Promise.all(
    imagePaths
      .filter(p => parsePageFromImageName(path.basename(p)) !== null)
      .sort(
        (a, b) =>
          (parsePageFromImageName(path.basename(a)) ?? 0)
          - (parsePageFromImageName(path.basename(b)) ?? 0),
      )
      .map(async p => ({
        file: path.basename(p),
        page: parsePageFromImageName(path.basename(p))!,
        hash: await hashFile(p),
        path: p,
      })),
  )

  const outputPdfPath = path.join(
    folder,
    `${path.basename(sourcePdfPath, path.extname(sourcePdfPath))}.gathered.pdf`,
  )

  const unchanged
    = existsSync(outputPdfPath)
      && manifest
      && manifest.pageCount === pageCount
      && manifest.images.length === currentHashes.length
      && manifest.images.every((entry, i) => currentHashes[i]?.hash === entry.hash)

  if (unchanged && missingPages.length === 0) {
    logger.info(`No changes detected, skipping PDF creation`, { folder })
    return {
      folder,
      sourcePdf: sourcePdfPath,
      pageCount,
      foundImages: foundPages.size,
      missingPages,
      outputPdf: outputPdfPath,
      action: 'skipped-unchanged',
    }
  }

  if (dryRun) {
    logger.info(`[dry-run] would create ${outputPdfPath}`)
    return {
      folder,
      sourcePdf: sourcePdfPath,
      pageCount,
      foundImages: foundPages.size,
      missingPages,
      outputPdf: outputPdfPath,
      action: 'would-create',
    }
  }

  const outDoc = await PDFDocument.create()
  for (const entry of currentHashes) {
    const bytes = await readFile(entry.path)
    const img = await outDoc.embedJpg(bytes)
    const pageDoc = outDoc.addPage([img.width, img.height])
    pageDoc.drawImage(img, {
      x: 0,
      y: 0,
      width: img.width,
      height: img.height,
    })
  }
  const outBytes = await outDoc.save()
  await (await import('node:fs/promises')).writeFile(outputPdfPath, outBytes)

  await writeManifest(folder, {
    version: 1,
    sourcePdf: pdfEntry.name,
    sourcePdfHash: await hashFile(sourcePdfPath),
    pageCount,
    images: currentHashes.map(({ file, page, hash }) => ({ file, page, hash })),
    updatedAt: new Date().toISOString(),
  } satisfies Manifest)

  logger.info(`Gathered PDF created`, { outputPdf: outputPdfPath })
  return {
    folder,
    sourcePdf: sourcePdfPath,
    pageCount,
    foundImages: foundPages.size,
    missingPages,
    outputPdf: outputPdfPath,
    action: 'created',
  }
}
