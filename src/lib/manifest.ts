import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MANIFEST_FILENAME = '.pdfslice-manifest.json'

export type ManifestImageEntry = {
  /** File name relative to the manifest's folder. */
  file: string
  page: number
  hash: string
}

export type Manifest = {
  version: 1
  /** File name of the source PDF, relative to the manifest's folder. */
  sourcePdf: string
  sourcePdfHash: string
  pageCount: number
  images: ManifestImageEntry[]
  updatedAt: string
  /** Set once `gather` has run at least once against this folder. */
  gatheredAt?: string
  /** Filename template used to generate the page images (see filename-template.ts). */
  filenameTemplate: string
}

export function manifestPathFor(folder: string): string {
  return path.join(folder, MANIFEST_FILENAME)
}

export async function readManifest(folder: string): Promise<Manifest | null> {
  const p = manifestPathFor(folder)
  if (!existsSync(p))
    return null
  const raw = await readFile(p, 'utf-8')
  return JSON.parse(raw) as Manifest
}

export async function writeManifest(
  folder: string,
  manifest: Manifest,
): Promise<void> {
  const p = manifestPathFor(folder)
  await writeFile(p, JSON.stringify(manifest, null, 2), 'utf-8')
}
