import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { parseCsv } from '@/lib/csv-import'

const enc = (s: string) => new TextEncoder().encode(s)
const HEADER = 'Team,Team Size,Member #,Full Name,Email,Phone,SAP ID / Admission No.,Year,Branch,Registered At'
const row = (team: string, size: string, name: string, email: string, sap = '', phone = '') => `${team},${size},1,${name},${email},${phone},${sap},1st Year,CSE,2026-10-24 05:27`

afterEach(() => { delete process.env.NO_TEAM_MARKERS })

describe('parseCsv: structure', () => {
  it('reads the registration export format and groups teams', () => {
    const p = parseCsv(enc([HEADER,
      row('Athena', '3', 'Alice', 'a@x.io'), row('Athena', '3', 'Bob', 'b@x.io'), row('Athena', '3', 'Cara', 'c@x.io'),
      row('Apollo', '2', 'Dan', 'd@x.io'), row('Apollo', '2', 'Eve', 'e@x.io'),
      row('Hermes', '1', 'Finn', 'f@x.io'),
      row('(No team)', '2', 'Gus', 'g@x.io'), row('(No team)', '2', 'Hal', 'h@x.io')].join('\n')))
    expect(p.errors).toEqual([])
    expect(p.summary).toEqual({ participants: 8, teams: 3, no_team: 2, teams_3: 1, teams_2: 1, teams_1: 1, teams_over_3: 0, empty_rows_skipped: 0 })
    expect(p.teams).toEqual([{ name: 'Athena', size: 3 }, { name: 'Apollo', size: 2 }, { name: 'Hermes', size: 1 }])
    expect(p.rows.find((r) => r.name === 'Gus')!.team).toBeNull()
  })
  it('accepts minimal and aliased headers in any order, ignoring extra columns', () => {
    const p = parseCsv(enc('E-mail,Notes,Participant Name,Team Name\nz@x.io,hi,Zed,Owls\n'))
    expect(p.errors).toEqual([])
    expect(p.rows[0]).toMatchObject({ name: 'Zed', email: 'z@x.io', team: 'Owls' })
  })
  it('reports missing required columns', () => {
    const p = parseCsv(enc('foo,bar\n1,2\n'))
    expect(p.errors.join()).toMatch(/team.*\n?.*|name|email/)
    expect(p.errors).toHaveLength(3)
  })
  it('handles BOM, CRLF line endings and quoted commas', () => {
    const p = parseCsv(enc('﻿Team,Full Name,Email\r\n"Owls, Inc",\"Rao, Ananya\",ar@x.io\r\n'))
    expect(p.errors).toEqual([])
    expect(p.rows[0]).toMatchObject({ team: 'Owls, Inc', name: 'Rao, Ananya' })
  })
  it('collapses whitespace and lower-cases emails', () => {
    const p = parseCsv(enc('Team,Full Name,Email\n  Owls  ,  Ann   Lee ,ANN@X.IO \n'))
    expect(p.rows[0]).toMatchObject({ team: 'Owls', name: 'Ann Lee', email: 'ann@x.io' })
  })
  it('skips and counts empty rows', () => {
    const p = parseCsv(enc('Team,Full Name,Email\nA,x,a@x.io\n,,\n\nB,y,b@x.io\n'))
    expect(p.errors).toEqual([])
    expect(p.summary.empty_rows_skipped).toBe(2)
    expect(p.summary.participants).toBe(2)
  })
})

describe('parseCsv: no-team detection', () => {
  it('treats blank and marker values as no team', () => {
    const vals = ['', '(No team)', 'no team', 'NONE', 'n/a', '-', 'Solo']
    const p = parseCsv(enc('Team,Full Name,Email\n' + vals.map((v, i) => `${v},P${i},p${i}@x.io`).join('\n')))
    expect(p.errors).toEqual([])
    expect(p.summary.no_team).toBe(vals.length)
    expect(p.summary.teams).toBe(0)
  })
  it('uses NO_TEAM_MARKERS from the environment', () => {
    process.env.NO_TEAM_MARKERS = 'lone wolf'
    const p = parseCsv(enc('Team,Full Name,Email\nLone Wolf,A,a@x.io\nnone,B,b@x.io\n'))
    expect(p.summary.no_team).toBe(1)                 // "none" is now a real team name
    expect(p.summary.teams).toBe(1)
  })
})

describe('parseCsv: validation errors block import', () => {
  const errs = (body: string) => parseCsv(enc('Team,Full Name,Email\n' + body)).errors.join('\n')
  it('flags teams with more than 3 members', () => {
    const p = parseCsv(enc('Team,Full Name,Email\n' + [1, 2, 3, 4].map((i) => `Big,P${i},p${i}@x.io`).join('\n')))
    expect(p.errors.join()).toMatch(/Team 'Big' has 4 participants \(maximum is 3\)/)
    expect(p.oversized).toEqual([{ name: 'Big', size: 4 }])
    expect(p.summary.teams_over_3).toBe(1)
  })
  it('flags missing names and emails', () => {
    expect(errs('A,,a@x.io')).toMatch(/Line 2: missing name/)
    expect(errs('A,Ann,')).toMatch(/Line 2: missing email/)
  })
  it('flags invalid emails', () => {
    for (const bad of ['plainaddress', 'a@b', 'a b@x.io', 'a@x.io;b@x.io']) expect(errs(`A,Ann,"${bad}"`)).toMatch(/invalid email/)
  })
  it('flags duplicate emails ignoring case', () => {
    expect(errs('A,Ann,ann@x.io\nB,Bob,ANN@x.io')).toMatch(/Line 3: duplicate email 'ann@x.io' \(also line 2\)/)
  })
  it('flags wrong column counts and malformed quoting', () => {
    expect(errs('A,Ann,a@x.io,extra')).toMatch(/expected 3 columns, got 4/)
    expect(parseCsv(enc('Team,Full Name,Email\n"A,Ann,a@x.io\n')).errors.join()).toMatch(/Malformed CSV/)
  })
  it('flags control characters and over-long values', () => {
    expect(errs('A,"An\u0007n",a@x.io')).toMatch(/invalid characters/)
    expect(errs(`${'T'.repeat(121)},Ann,a@x.io`)).toMatch(/invalid characters\/length/)
  })
  it('rejects empty, binary, NUL-containing and oversized files', () => {
    expect(parseCsv(enc('')).errors.join()).toMatch(/empty/)
    expect(parseCsv(new Uint8Array([0xff, 0xfe, 0xfd])).errors.join()).toMatch(/UTF-8/)
    expect(parseCsv(enc('Team,Full Name,Email\nA,B\u0000,a@x.io')).errors.join()).toMatch(/NUL/)
    expect(parseCsv(new Uint8Array(2_000_001)).errors.join()).toMatch(/too large/)
    expect(parseCsv(enc('Team,Full Name,Email\n')).errors.join()).toMatch(/No participants/)
  })
})

describe('parseCsv: warnings do not block import', () => {
  it('merges case variants of a team name and says so', () => {
    const p = parseCsv(enc('Team,Full Name,Email\nOwls,A,a@x.io\nOWLS,B,b@x.io\n'))
    expect(p.errors).toEqual([])
    expect(p.summary.teams).toBe(1)
    expect(p.rows.map((r) => r.team)).toEqual(['Owls', 'Owls'])
    expect(p.warnings.join()).toMatch(/spelled differently/)
  })
  it('warns when a declared team size disagrees with the rows', () => {
    const p = parseCsv(enc([HEADER, row('Owls', '3', 'A', 'a@x.io'), row('Owls', '3', 'B', 'b@x.io'),
      row('(No team)', '29', 'C', 'c@x.io')].join('\n')))
    expect(p.errors).toEqual([])
    expect(p.warnings.join('\n')).toMatch(/Team 'Owls': declared size \["3"\] but 2 rows/)
    expect(p.warnings.join('\n')).toMatch(/declares size \["29"\] but only 1 rows/)
  })
  it('warns about duplicate SAP IDs and phone numbers', () => {
    const p = parseCsv(enc([HEADER, row('A', '1', 'Sarayu', 's@x.io', 'RVCE1', '9001'), row('B', '1', 'Maanya', 'm@x.io', 'rvce1', '9001')].join('\n')))
    expect(p.errors).toEqual([])
    expect(p.warnings.join('\n')).toMatch(/Duplicate SAP\/admission ID 'rvce1': Sarayu \(line 2\) and Maanya \(line 3\)/)
    expect(p.warnings.join('\n')).toMatch(/Duplicate phone number/)
  })
})

const REAL = '/home/pavvy/Desktop/audio/question/Voyage to Ithaca - Teams 28-10-2026 (final).csv'
describe.skipIf(!existsSync(REAL))('parseCsv: the real event CSV (local only)', () => {
  it('matches the numbers established earlier', () => {
    const p = parseCsv(readFileSync(REAL))
    expect(p.errors).toEqual([])
    expect(p.summary).toEqual({ participants: 253, teams: 91, no_team: 26, teams_3: 56, teams_2: 24, teams_1: 11, teams_over_3: 0, empty_rows_skipped: 1 })
    expect(p.warnings.some((w) => /RVCE26BCS125/i.test(w))).toBe(true)
  })
})
