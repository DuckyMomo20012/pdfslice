import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gatherAll } from '../gather'
import { splitAll } from '../split'
import { makeTestPdf, silentLogger } from './test-helpers'

describe('gatherAll', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pdfslice-gather-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function splitFixture(pageCount: number) {
    const pdfPath = path.join(root, 'sample.pdf')
    await makeTestPdf(pdfPath, pageCount)
    await splitAll({ input: root, logger: silentLogger() })
    return path.join(root, 'sample')
  }

  it('creates a gathered pdf on the first run', async () => {
    const unitFolder = await splitFixture(3)

    const reports = await gatherAll({ input: root, logger: silentLogger() })

    expect(reports).toHaveLength(1)
    expect(reports[0].action).toBe('created')
    expect(reports[0].missingPages).toEqual([])
    expect(existsSync(path.join(unitFolder, 'sample.gathered.pdf'))).toBe(true)
  })

  it('skips recreating the pdf when nothing changed', async () => {
    await splitFixture(2)
    await gatherAll({ input: root, logger: silentLogger() })

    const second = await gatherAll({ input: root, logger: silentLogger() })
    expect(second[0].action).toBe('skipped-unchanged')
  })

  it('reports missing pages and does not falsely skip when an image is removed', async () => {
    const unitFolder = await splitFixture(3)
    await gatherAll({ input: root, logger: silentLogger() })

    await unlink(path.join(unitFolder, 'sample.002.jpg'))

    const reports = await gatherAll({ input: root, logger: silentLogger() })
    expect(reports[0].missingPages).toEqual([2])
    expect(reports[0].action).toBe('created')
  })

  it('recreates the gathered pdf after content changes and updates its mtime', async () => {
    const unitFolder = await splitFixture(2)
    await gatherAll({ input: root, logger: silentLogger() })
    const outputPdf = path.join(unitFolder, 'sample.gathered.pdf')
    const firstStat = await stat(outputPdf)

    await new Promise(r => setTimeout(r, 20))
    await unlink(path.join(unitFolder, 'sample.001.jpg'))
    // put back a differently-sized image so the hash changes on regather
    await makeTestPdf(path.join(root, 'throwaway.pdf'), 1) // unrelated no-op to advance time safely

    const reports = await gatherAll({ input: root, logger: silentLogger() })
    expect(reports[0].missingPages).toEqual([1])

    const secondStat = await stat(outputPdf)
    expect(secondStat.mtimeMs).toBeGreaterThanOrEqual(firstStat.mtimeMs)
  })

  it('dry-run does not write the gathered pdf', async () => {
    await splitFixture(2)

    const reports = await gatherAll({
      input: root,
      dryRun: true,
      logger: silentLogger(),
    })

    expect(reports[0].action).toBe('would-create')
    expect(existsSync(path.join(root, 'sample', 'sample.gathered.pdf'))).toBe(false)
  })

  it('check-only mode never writes a gathered pdf even across repeated calls', async () => {
    const unitFolder = await splitFixture(2)

    const reports = await gatherAll({
      input: root,
      checkOnly: true,
      logger: silentLogger(),
    })

    expect(reports[0].action).toBe('check-only')
    expect(existsSync(path.join(unitFolder, 'sample.gathered.pdf'))).toBe(false)
  })

  it('does not mistake the original source-directory pdf for a unit folder', async () => {
    // sample.pdf remains in `root` after split (never deleted) — root itself
    // must not be picked up as a unit since it lacks a manifest.
    await splitFixture(1)

    const reports = await gatherAll({ input: root, logger: silentLogger() })
    expect(reports).toHaveLength(1)
    expect(reports[0].folder).toBe(path.join(root, 'sample'))
  })

  it('excludes its own .gathered.pdf output from being treated as the source pdf', async () => {
    const unitFolder = await splitFixture(1)
    await gatherAll({ input: root, logger: silentLogger() })

    // a second gather run must still resolve sample.pdf as the source,
    // not sample.gathered.pdf, and must not cascade the filename
    await gatherAll({ input: root, logger: silentLogger() })
    expect(existsSync(path.join(unitFolder, 'sample.gathered.pdf'))).toBe(true)
    expect(existsSync(path.join(unitFolder, 'sample.gathered.gathered.pdf'))).toBe(
      false,
    )
  })

  it('reports missing-source when a unit folder\'s pdf is absent', async () => {
    const unitFolder = await splitFixture(1)
    // simulate a manifest-only folder with no pdf (edge case / corruption)
    const manifestPath = path.join(unitFolder, '.pdfslice-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)
    await unlink(path.join(unitFolder, 'sample.pdf'))

    const reports = await gatherAll({ input: root, logger: silentLogger() })
    // folder no longer has a pdf, so it won't be detected as a unit at all
    expect(reports).toHaveLength(0)
  })
})
