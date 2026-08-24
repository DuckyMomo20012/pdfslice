import type { Logger } from 'winston'
import type { Manifest } from './manifest'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { findImagesDeep, parsePageFromImageName } from './discover'
import { DEFAULT_TEMPLATE } from './filename-template'
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
  /** Back up the existing PDF before overwriting it. Default true. */
  backup?: boolean
  logger: Logger
}

export type UnitReport = {
  folder: string
  sourcePdf: string | null
  pageCount: number | null
  foundImages: number
  missingPages: number[]
  outputPdf?: string
  action: 'created' | 'skipped-unchanged' | 'would-create' | 'missing-source' | 'check-only'
}

/**
 * Discover "unit" folders: a folder produced by `split` — recognized by
 * the `.pdfslice-manifest.json` written by split (not by the mere presence
 * of a PDF, since the source folder the PDF was found in also still
 * contains a PDF that split never deletes).
 */
async function findUnitFolders(root: string): Promise<string[]> {
  const st = await stat(root)
  if (!st.isDirectory())
    return []

  const units: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    const hasManifest = existsSync(manifestPathFor(dir))
    if (hasManifest) {
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

async function gatherOne(folder: string, opts: GatherOptions): Promise<UnitReport> {
  const { logger, dryRun = false, checkOnly = false, backup = true } = opts

  const manifest = await readManifest(folder)
  if (!manifest) {
    logger.warn(`No manifest found in unit folder`, { folder })
    return {
      folder,
      sourcePdf: null,
      pageCount: null,
      foundImages: 0,
      missingPages: [],
      action: 'missing-source',
    }
  }

  const sourcePdfPath = path.join(folder, manifest.sourcePdf)
  if (!existsSync(sourcePdfPath)) {
    logger.warn(`Source PDF recorded in manifest is missing`, {
      folder,
      expected: manifest.sourcePdf,
    })
    return {
      folder,
      sourcePdf: null,
      pageCount: null,
      foundImages: 0,
      missingPages: [],
      action: 'missing-source',
    }
  }

  const pdfBytes = await readFile(sourcePdfPath)
  const doc = await PDFDocument.load(pdfBytes)
  const pageCount = doc.getPageCount()

  const template = manifest.filenameTemplate ?? DEFAULT_TEMPLATE

  const imagePaths = await findImagesDeep(folder)
  const foundPages = new Set<number>()
  for (const imgPath of imagePaths) {
    const page = parsePageFromImageName(path.basename(imgPath), template)
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

  // Decide whether to (re)build the combined PDF, comparing the manifest's
  // recorded image hashes against the current on-disk images.
  const currentHashes = await Promise.all(
    imagePaths
      .filter(p => parsePageFromImageName(path.basename(p), template) !== null)
      .sort(
        (a, b) =>
          (parsePageFromImageName(path.basename(a), template) ?? 0)
          - (parsePageFromImageName(path.basename(b), template) ?? 0),
      )
      .map(async p => ({
        file: path.basename(p),
        page: parsePageFromImageName(path.basename(p), template)!,
        hash: await hashFile(p),
        path: p,
      })),
  )

  // Output overwrites the source PDF in place, per spec.
  const outputPdfPath = sourcePdfPath

  const unchanged
    = !!(manifest.gatheredAt ?? '')
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
    logger.info(`[dry-run] would overwrite ${outputPdfPath}`)
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

  // Back up the existing PDF before overwriting it (default on; --no-backup to skip).
  if (backup) {
    const backupPath = path.join(
      folder,
      `${path.basename(outputPdfPath, '.pdf')}.bak-${Date.now()}.pdf`,
    )
    await (await import('node:fs/promises')).copyFile(outputPdfPath, backupPath)
    logger.info(`Backed up previous PDF`, { backupPath })
  }

  const outDoc = await PDFDocument.create()
  for (const entry of currentHashes) {
    const bytes = await readFile(entry.path)
    const img = await outDoc.embedJpg(bytes)
    const pageDoc = outDoc.addPage([img.width, img.height])
    pageDoc.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }
  const outBytes = await outDoc.save()
  await (await import('node:fs/promises')).writeFile(outputPdfPath, outBytes)

  await writeManifest(folder, {
    version: 1,
    sourcePdf: manifest.sourcePdf,
    sourcePdfHash: await hashFile(outputPdfPath),
    pageCount,
    images: currentHashes.map(({ file, page, hash }) => ({ file, page, hash })),
    updatedAt: new Date().toISOString(),
    gatheredAt: new Date().toISOString(),
    filenameTemplate: template,
  } satisfies Manifest)

  logger.info(`PDF overwritten`, { outputPdf: outputPdfPath })
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
