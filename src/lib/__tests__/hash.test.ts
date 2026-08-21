import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashFile } from '../hash'

describe('hashFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pdfslice-hash-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('matches a manually computed sha256 digest', async () => {
    const file = path.join(dir, 'a.txt')
    const content = 'hello pdfslice'
    await writeFile(file, content)

    const expected = createHash('sha256').update(content).digest('hex')
    const actual = await hashFile(file)
    expect(actual).toBe(expected)
  })

  it('produces different hashes for different content', async () => {
    const fileA = path.join(dir, 'a.txt')
    const fileB = path.join(dir, 'b.txt')
    await writeFile(fileA, 'content one')
    await writeFile(fileB, 'content two')

    const hashA = await hashFile(fileA)
    const hashB = await hashFile(fileB)
    expect(hashA).not.toBe(hashB)
  })

  it('produces the same hash for identical content in different files', async () => {
    const fileA = path.join(dir, 'a.txt')
    const fileB = path.join(dir, 'b.txt')
    await writeFile(fileA, 'same content')
    await writeFile(fileB, 'same content')

    expect(await hashFile(fileA)).toBe(await hashFile(fileB))
  })

  it('rejects when the file does not exist', async () => {
    await expect(hashFile(path.join(dir, 'missing.txt'))).rejects.toThrow()
  })
})
