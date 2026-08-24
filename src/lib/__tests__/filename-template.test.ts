import { describe, expect, it } from 'vitest'
import { compileTemplate, DEFAULT_TEMPLATE } from '../filename-template'

describe('compileTemplate', () => {
  it('renders the default template with zero-padded page numbers', () => {
    const t = compileTemplate(DEFAULT_TEMPLATE)
    expect(t.render('sample', 1)).toBe('sample.001.jpg')
    expect(t.render('sample', 42)).toBe('sample.042.jpg')
    expect(t.render('sample', 999)).toBe('sample.999.jpg')
  })

  it('does not pad page numbers 1000 and above', () => {
    const t = compileTemplate(DEFAULT_TEMPLATE)
    expect(t.render('sample', 1000)).toBe('sample.1000.jpg')
    expect(t.render('sample', 2026)).toBe('sample.2026.jpg')
  })

  it('parses page numbers back out of names it rendered', () => {
    const t = compileTemplate(DEFAULT_TEMPLATE)
    expect(t.parsePage('sample.001.jpg')).toBe(1)
    expect(t.parsePage('sample.042.jpg')).toBe(42)
    expect(t.parsePage('sample.2026.jpg')).toBe(2026)
  })

  it('returns null when parsing a name that doesn\'t match the template', () => {
    const t = compileTemplate(DEFAULT_TEMPLATE)
    expect(t.parsePage('readme.txt')).toBeNull()
    expect(t.parsePage('sample.jpg')).toBeNull()
  })

  it('supports a page-number-only template', () => {
    const t = compileTemplate('{{page_number}}.jpg')
    expect(t.render('ignored', 1)).toBe('001.jpg')
    expect(t.render('ignored', 7)).toBe('007.jpg')
    expect(t.parsePage('007.jpg')).toBe(7)
  })

  it('supports filename before a custom prefix/suffix arrangement', () => {
    const t = compileTemplate('page-{{page_number}}-{{filename}}.jpg')
    expect(t.render('report', 3)).toBe('page-003-report.jpg')
    expect(t.parsePage('page-003-report.jpg')).toBe(3)
  })

  it('round-trips page numbers for filenames containing dots', () => {
    const t = compileTemplate(DEFAULT_TEMPLATE)
    const rendered = t.render('my.report.v2', 5)
    expect(rendered).toBe('my.report.v2.005.jpg')
    expect(t.parsePage(rendered)).toBe(5)
  })

  it('throws when the template has no {{page_number}} placeholder', () => {
    expect(() => compileTemplate('{{filename}}.jpg')).toThrow(
      /exactly one \{\{page_number\}\}/,
    )
  })

  it('throws when the template has more than one {{page_number}} placeholder', () => {
    expect(() =>
      compileTemplate('{{page_number}}-{{page_number}}.jpg'),
    ).toThrow(/exactly one \{\{page_number\}\}/)
  })

  it('parsePage is case-insensitive on the jpg/jpeg-style suffix', () => {
    const t = compileTemplate('{{filename}}.{{page_number}}.JPG')
    expect(t.parsePage('sample.001.JPG')).toBe(1)
  })
})
