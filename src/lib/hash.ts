import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** SHA-256 hash of a file's contents, streamed (safe for large PDFs/images). */
export async function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
