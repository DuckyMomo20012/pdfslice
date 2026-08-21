import type { Logger } from 'winston'
import type { Manifest, ManifestImageEntry } from './manifest'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { pdf as pdfToImg } from 'pdf-to-img'
import sharp from 'sharp'
import { findPdfs, pageImageName } from './discover'
import { hashFile } from './hash'
import { writeManifest } from './manifest'

export type SplitOptions = {
  /** Root folder or single PDF file to search. */
  input: string
  /** Directory recursion depth for discovery. Default 1 (no descend). */
  level?: number
  /** Pull every discovered PDF's output folder up to `input` root instead of alongside each PDF. */
  flatten?: boolean
  dryRun?: boolean
  logger: Logger
}

export type SplitResult = {
  pdf: string
  outputFolder: string
  pageCount: number
  images: string[]
  skipped: boolean
}

function folderNameFor(pdfPath: string): string {
  const base = path.basename(pdfPath, path.extname(pdfPath))
  return base
}

export async function splitAll(opts: SplitOptions): Promise<SplitResult[]> {
  const { input, level = 1, flatten = false, dryRun = false, logger } = opts
  const pdfs = await findPdfs(input, level)
  logger.info(`Found ${pdfs.length} PDF file(s) under ${input}`, { level })

  const results: SplitResult[] = []
  for (const pdfPath of pdfs) {
    results.push(await splitOne(pdfPath, { input, flatten, dryRun, logger }))
  }
  return results
}

async function splitOne(
  pdfPath: string,
  ctx: { input: string, flatten: boolean, dryRun: boolean, logger: Logger },
): Promise<SplitResult> {
  const { flatten, dryRun, logger } = ctx
  const baseName = folderNameFor(pdfPath)
  const parentDir = flatten ? ctx.input : path.dirname(pdfPath)
  const outputFolder = path.join(parentDir, baseName)
  const destPdfPath = path.join(outputFolder, path.basename(pdfPath))

  logger.info(`Processing ${pdfPath}`, { outputFolder })

  if (dryRun) {
    logger.info(`[dry-run] would create folder ${outputFolder}`)
    logger.info(`[dry-run] would move ${pdfPath} -> ${destPdfPath} (copy, original kept)`)
    const doc = await PDFDocument.load(await (await import('node:fs/promises')).readFile(pdfPath))
    const pageCount = doc.getPageCount()
    for (let i = 1; i <= pageCount; i++) {
      logger.info(`[dry-run] would create image ${pageImageName(baseName, i)}`)
    }
    return { pdf: pdfPath, outputFolder, pageCount, images: [], skipped: true }
  }

  await mkdir(outputFolder, { recursive: true })

  // "Move" without deleting the original: copy into the new folder.
  // The original PDF at its source path is left untouched, per spec.
  if (!existsSync(destPdfPath)) {
    await copyFile(pdfPath, destPdfPath)
  }

  const pdfBytes = await (await import('node:fs/promises')).readFile(destPdfPath)
  const doc = await PDFDocument.load(pdfBytes)
  const pageCount = doc.getPageCount()

  const images: string[] = []
  const imageEntries: ManifestImageEntry[] = []

  const document = await pdfToImg(destPdfPath, { scale: 2 })
  let pageNum = 1
  for await (const image of document) {
    const fileName = pageImageName(baseName, pageNum)
    const imagePath = path.join(outputFolder, fileName)
    // pdf-to-img always returns PNG-encoded bytes regardless of file
    // extension; re-encode to real JPEG so the .jpg extension is accurate.
    const jpegBuffer = await sharp(image).jpeg({ quality: 90 }).toBuffer()
    await (await import('node:fs/promises')).writeFile(imagePath, jpegBuffer)
    const fileHash = await hashFile(imagePath)
    images.push(imagePath)
    imageEntries.push({ file: fileName, page: pageNum, hash: fileHash })
    logger.debug(`Wrote page image`, { fileName, page: pageNum })
    pageNum++
  }

  const sourcePdfHash = await hashFile(destPdfPath)
  const manifest: Manifest = {
    version: 1,
    sourcePdf: path.basename(destPdfPath),
    sourcePdfHash,
    pageCount,
    images: imageEntries,
    updatedAt: new Date().toISOString(),
  }
  await writeManifest(outputFolder, manifest)

  logger.info(`Split complete: ${pageCount} page(s)`, { outputFolder })
  return { pdf: destPdfPath, outputFolder, pageCount, images, skipped: false }
}
