/**
 * Parse a registration CSV: one row per participant, a team column groups members.
 *
 * Columns are matched by header name (see ALIASES); extra columns are ignored. A blank team cell or a
 * value in the no-team marker list (env NO_TEAM_MARKERS, comma separated) means "no team".
 */
import { parse } from 'csv-parse/sync'
import { config } from './config'

export const MAX_BYTES = 2_000_000
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\x00-\x1f\x7f]/

type Field = 'team' | 'declared' | 'name' | 'email' | 'phone' | 'sap' | 'year' | 'branch'
export const ALIASES: Record<Field, string[]> = {
  team: ['team', 'team name', 'teamname', 'group', 'squad'],
  declared: ['team size', 'size', 'team_size'],
  name: ['full name', 'name', 'participant', 'participant name', 'student name', 'member name'],
  email: ['email', 'e-mail', 'email address', 'mail', 'email id'],
  phone: ['phone', 'mobile', 'phone number', 'contact', 'whatsapp'],
  sap: ['sap id / admission no.', 'sap id', 'usn', 'roll no', 'id', 'student id', 'admission no'],
  year: ['year', 'class', 'semester'],
  branch: ['branch', 'department', 'dept', 'course'],
}
const COLS = new Map<string, Field>(Object.entries(ALIASES).flatMap(([f, al]) => al.map((a) => [a, f as Field])))

export interface Row {
  line: number
  name: string
  email: string
  team: string | null
  phone: string
  sap: string
  year: string
  branch: string
}

export interface Summary {
  participants: number
  teams: number
  no_team: number
  teams_3: number
  teams_2: number
  teams_1: number
  teams_over_3: number
  empty_rows_skipped: number
}

export interface Parsed {
  rows: Row[]
  errors: string[]
  warnings: string[]
  summary: Summary
  teams: { name: string; size: number }[]
  oversized: { name: string; size: number }[]
}

export function noTeamMarkers(): Set<string> {
  return new Set(['', ...config.noTeamMarkers.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)])
}

const clean = (s: string | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ')
const fold = (s: string): string => s.toLowerCase()

const emptySummary = (): Summary => ({ participants: 0, teams: 0, no_team: 0, teams_3: 0, teams_2: 0, teams_1: 0, teams_over_3: 0, empty_rows_skipped: 0 })

export function parseCsv(data: Uint8Array): Parsed {
  const out: Parsed = { rows: [], errors: [], warnings: [], summary: emptySummary(), teams: [], oversized: [] }
  if (data.byteLength > MAX_BYTES) { out.errors.push('File too large.'); return out }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    out.errors.push('File is not valid UTF-8 text (malformed CSV).')
    return out
  }
  if (text.includes('\u0000')) { out.errors.push('Malformed CSV: contains NUL bytes.'); return out }
  let raw: string[][]
  try {
    raw = parse(text, { bom: true, relax_column_count: true, skip_empty_lines: false }) as string[][]
  } catch (e) {
    out.errors.push(`Malformed CSV: ${(e as Error).message}`)
    return out
  }
  if (raw.length === 0) { out.errors.push('CSV is empty.'); return out }

  const header = raw[0]!.map((h) => h.trim().toLowerCase())
  const idx = new Map<Field, number>()
  header.forEach((h, i) => { const f = COLS.get(h); if (f && !idx.has(f)) idx.set(f, i) })
  for (const need of ['team', 'name', 'email'] as const) {
    if (!idx.has(need)) out.errors.push(`Missing required column for '${need}'. Found columns: ${raw[0]!.join(', ')}`)
  }
  if (out.errors.length) return out

  const get = (r: string[], f: Field): string => { const i = idx.get(f); return i === undefined ? '' : clean(r[i]) }
  const markers = noTeamMarkers()
  const declared = new Map<string, Set<string>>()
  const seenEmail = new Map<string, number>()
  let empty = 0

  raw.slice(1).forEach((r, i) => {
    const ln = i + 2
    if (!r.some((c) => c.trim())) { empty++; return }
    if (r.length !== raw[0]!.length) { out.errors.push(`Line ${ln}: expected ${raw[0]!.length} columns, got ${r.length}.`); return }
    const name = get(r, 'name'), email = get(r, 'email').toLowerCase(), team = get(r, 'team')
    if (!name) out.errors.push(`Line ${ln}: missing name.`)
    if (!email) out.errors.push(`Line ${ln}: missing email.`)
    else if (!EMAIL_RE.test(email) || email.length > 254) out.errors.push(`Line ${ln}: invalid email '${email}'.`)
    else if (seenEmail.has(email)) out.errors.push(`Line ${ln}: duplicate email '${email}' (also line ${seenEmail.get(email)}).`)
    else seenEmail.set(email, ln)
    if (CTRL_RE.test(name + team) || name.length > 200 || team.length > 120) out.errors.push(`Line ${ln}: invalid characters/length in name or team.`)
    const isNone = markers.has(fold(team))
    const key = isNone ? '' : fold(team)
    if (!declared.has(key)) declared.set(key, new Set())
    declared.get(key)!.add(get(r, 'declared'))
    out.rows.push({ line: ln, name, email, team: isNone ? null : team, phone: get(r, 'phone'), sap: get(r, 'sap'), year: get(r, 'year'), branch: get(r, 'branch') })
  })

  // Group by case-folded name; the first spelling seen becomes the team's name.
  const teams = new Map<string, Row[]>()
  const spelled = new Map<string, Set<string>>()
  for (const row of out.rows) {
    if (!row.team) continue
    const k = fold(row.team)
    if (!teams.has(k)) { teams.set(k, []); spelled.set(k, new Set()) }
    teams.get(k)!.push(row)
    spelled.get(k)!.add(row.team)
  }
  for (const [k, members] of teams) {
    const canon = members[0]!.team!
    const spellings = spelled.get(k)!
    if (spellings.size > 1) out.warnings.push(`Team name spelled differently (${[...spellings].sort().join(', ')}); merged as '${canon}'.`)
    for (const m of members) m.team = canon
    const decl = [...(declared.get(k) ?? [])].filter(Boolean)
    if (decl.length && !(decl.length === 1 && decl[0] === String(members.length)))
      out.warnings.push(`Team '${canon}': declared size ${JSON.stringify(decl.sort())} but ${members.length} rows found.`)
    if (members.length > 3) {
      out.oversized.push({ name: canon, size: members.length })
      out.errors.push(`Team '${canon}' has ${members.length} participants (maximum is 3).`)
    }
  }

  for (const [label, attr] of [['SAP/admission ID', 'sap'], ['phone number', 'phone']] as const) {
    const seen = new Map<string, Row>()
    for (const row of out.rows) {
      const v = row[attr].trim().toLowerCase()
      if (!v) continue
      const prev = seen.get(v)
      if (prev) out.warnings.push(`Duplicate ${label} '${row[attr]}': ${prev.name} (line ${prev.line}) and ${row.name} (line ${row.line}) - same person registered twice, or a typo?`)
      else seen.set(v, row)
    }
  }

  const noTeamRows = out.rows.filter((r) => !r.team)
  const nd = [...(declared.get('') ?? [])].filter(Boolean)
  if (noTeamRows.length && nd.length && !(nd.length === 1 && nd[0] === String(noTeamRows.length)))
    out.warnings.push(`'(No team)' rows: CSV declares size ${JSON.stringify(nd.sort())} but only ${noTeamRows.length} rows exist - possibly missing registrations.`)

  const sizes = [...teams.values()].map((m) => m.length)
  out.teams = [...teams.values()].map((m) => ({ name: m[0]!.team!, size: m.length }))
  out.summary = {
    participants: out.rows.length, teams: teams.size, no_team: noTeamRows.length,
    teams_3: sizes.filter((s) => s === 3).length, teams_2: sizes.filter((s) => s === 2).length,
    teams_1: sizes.filter((s) => s === 1).length, teams_over_3: sizes.filter((s) => s > 3).length,
    empty_rows_skipped: empty,
  }
  if (!out.rows.length) out.errors.push('No participants found.')
  return out
}
