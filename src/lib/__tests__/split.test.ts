import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readManifest } from '../manifest'
import { splitAll } from '../split'
import { makeTestPdf, silentLogger } from './test-helpers'

describe('splitAll', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pdfslice-split-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('splits a pdf into per-page jpg images alongside it, keeping the original', async () => {
    const pdfPath = path.join(root, 'sample.pdf')
    await makeTestPdf(pdfPath, 3)

    const results = await splitAll({ input: root, logger: silentLogger() })

    expect(results).toHaveLength(1)
    const [result] = results
    expect(result.pageCount).toBe(3)
    expect(result.skipped).toBe(false)

    // original pdf at source path must still exist (never deleted)
    expect(existsSync(pdfPath)).toBe(true)

    const outputFolder = path.join(root, 'sample')
    expect(existsSync(outputFolder)).toBe(true)

    const files = (await readdir(outputFolder)).sort()
    expect(files).toEqual(
      [
        '.pdfslice-manifest.json',
        'sample.001.jpg',
        'sample.002.jpg',
        'sample.003.jpg',
        'sample.pdf',
      ].sort(),
    )
  })

  it('writes a manifest recording page count and per-image hashes', async () => {
    const pdfPath = path.join(root, 'doc.pdf')
    await makeTestPdf(pdfPath, 2)

    await splitAll({ input: root, logger: silentLogger() })

    const manifest = await readManifest(path.join(root, 'doc'))
    expect(manifest).not.toBeNull()
    expect(manifest?.pageCount).toBe(2)
    expect(manifest?.images).toHaveLength(2)
    expect(manifest?.images[0]).toMatchObject({ file: 'doc.001.jpg', page: 1 })
    expect(manifest?.images[0].hash).toBeTruthy()
  })

  it('does not descend into subfolders at default level 1', async () => {
    await makeTestPdf(path.join(root, 'top.pdf'), 1)
    const sub = path.join(root, 'sub')
    await mkdir(sub)
    await makeTestPdf(path.join(sub, 'nested.pdf'), 1)

    const results = await splitAll({ input: root, logger: silentLogger() })
    expect(results).toHaveLength(1)
    expect(results[0].pdf).toContain('top.pdf')
  })

  it('descends into subfolders when level=2', async () => {
    await makeTestPdf(path.join(root, 'top.pdf'), 1)
    const sub = path.join(root, 'sub')
    await mkdir(sub)
    await makeTestPdf(path.join(sub, 'nested.pdf'), 1)

    const results = await splitAll({ input: root, level: 2, logger: silentLogger() })
    expect(results).toHaveLength(2)
  })

  it('dry-run does not write any files', async () => {
    const pdfPath = path.join(root, 'sample.pdf')
    await makeTestPdf(pdfPath, 2)

    const results = await splitAll({
      input: root,
      dryRun: true,
      logger: silentLogger(),
    })

    expect(results).toHaveLength(1)
    expect(results[0].skipped).toBe(true)
    expect(existsSync(path.join(root, 'sample'))).toBe(false)
  })

  it('flatten places the output folder at the input root instead of alongside the pdf', async () => {
    const sub = path.join(root, 'sub')
    await mkdir(sub)
    const pdfPath = path.join(sub, 'nested.pdf')
    await makeTestPdf(pdfPath, 1)

    await splitAll({ input: root, level: 2, flatten: true, logger: silentLogger() })

    expect(existsSync(path.join(root, 'nested'))).toBe(true)
    expect(existsSync(path.join(sub, 'nested'))).toBe(false)
  })

  it('produces real jpeg-encoded bytes, not mislabeled png', async () => {
    const pdfPath = path.join(root, 'sample.pdf')
    await makeTestPdf(pdfPath, 1)
    await splitAll({ input: root, logger: silentLogger() })

    const imgPath = path.join(root, 'sample', 'sample.001.jpg')
    const buf = await (await import('node:fs/promises')).readFile(imgPath)
    // JPEG files start with FF D8 FF
    expect(buf[0]).toBe(0xFF)
    expect(buf[1]).toBe(0xD8)
    expect(buf[2]).toBe(0xFF)
  })
})
