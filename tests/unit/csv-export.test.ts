import { describe, expect, it } from 'vitest'
import { csvCell, fmtDateTime, toCsv } from '@/lib/csv-export'

describe('CSV export', () => {
  it('neutralises spreadsheet formulas', () => {
    for (const s of ['=cmd|"/C calc"!A0', '+1', '-2+3', '@SUM(A1)', '\tx', '\rx'])
      expect(csvCell(s).replace(/^"/, '').startsWith("'")).toBe(true)
    expect(csvCell('Ann')).toBe('Ann')
  })
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Rao, Ananya')).toBe('"Rao, Ananya"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
  it('renders empty values and numbers', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(false)).toBe('false')
  })
  it('joins header and rows with CRLF', () => {
    expect(toCsv(['Name', 'Team'], [['Ann', null], ['=x', 'Owls, Inc']])).toBe("Name,Team\r\nAnn,\r\n'=x,\"Owls, Inc\"\r\n")
  })
  it('formats times in the event time zone', () => {
    expect(fmtDateTime(new Date('2026-10-29T05:12:31Z'))).toBe('2026-10-29 10:42:31')   // IST = UTC+5:30
    expect(fmtDateTime(new Date('2026-10-28T23:59:59Z'))).toBe('2026-10-29 05:29:59')
    expect(fmtDateTime(null)).toBe('')
  })
})
