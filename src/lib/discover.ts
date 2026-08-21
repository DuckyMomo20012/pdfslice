import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * Find all PDF files under `root`, descending up to `level` directories deep.
 * level=1 (default) means: PDFs directly in `root` only.
 * level=2 means: `root` and one subfolder deep. Etc.
 * If `root` itself is a PDF file, returns just that file.
 */
export async function findPdfs(root: string, level = 1): Promise<string[]> {
  const st = await stat(root)
  if (st.isFile()) {
    return root.toLowerCase().endsWith('.pdf') ? [root] : []
  }

  const results: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push(full)
      }
      else if (entry.isDirectory() && depth < level) {
        await walk(full, depth + 1)
      }
    }
  }

  await walk(root, 1)
  return results
}

/**
 * Recursively find all image files (jpg/jpeg) under `root`, any depth.
 * Used by gather/check, since split output can be nested by flatten mode.
 */
export async function findImagesDeep(root: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && /\.jpe?g$/i.test(entry.name)) {
        results.push(full)
      }
      else if (entry.isDirectory()) {
        await walk(full)
      }
    }
  }

  await walk(root)
  return results
}

/**
 * Build the page-image filename: <filename>.<page>.jpg
 * Page number zero-padded to 3 digits; if the number itself is wider
 * than 3 digits, no padding is applied (natural width is used).
 */
export function pageImageName(baseName: string, page: number): string {
  const padded = page < 1000 ? String(page).padStart(3, '0') : String(page)
  return `${baseName}.${padded}.jpg`
}

/** Parse a page number back out of a name produced by pageImageName. */
export function parsePageFromImageName(fileName: string): number | null {
  const m = fileName.match(/\.(\d+)\.jpe?g$/i)
  return m ? parseInt(m[1]!, 10) : null
}
