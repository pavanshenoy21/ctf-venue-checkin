import JSZip from 'jszip'
import { allParticipants, type FullParticipant } from './admin-queries'
import { fmtDateTime, toCsv } from './csv-export'
import { pool, q } from './db'
import { qrFilename, qrPng, qrUrl } from './qr'
import { requireConfirmed } from './state'

const teamOf = (p: { team: string | null }) => p.team ?? '(No team)'

export async function allocationCsv(): Promise<string> {
  await requireConfirmed(pool())
  return toCsv(['Name', 'Email', 'Team', 'Venue', 'QR URL', 'Check-in status', 'Check-in time'],
    (await allParticipants()).map((p) => [p.name, p.email, teamOf(p), p.venue, qrUrl(p.qr_token),
      p.checked_in ? 'CHECKED IN' : 'NOT CHECKED IN', fmtDateTime(p.checked_in_at)]))
}

export async function checkinsCsv(): Promise<string> {
  const rows = await q<{ name: string; email: string; team: string | null; venue: string; at: Date }>(`
    SELECT p.name, p.email, t.name AS team, c.venue, c.scanned_at AS at FROM check_ins c
    JOIN participants p ON p.id = c.participant_id LEFT JOIN teams t ON t.id = p.team_id ORDER BY c.scanned_at, c.id`)
  return toCsv(['Name', 'Email', 'Team', 'Venue', 'Check-in time'], rows.map((r) => [r.name, r.email, teamOf(r), r.venue, fmtDateTime(r.at)]))
}

// File names are unique inside the ZIP: a clash gets the participant id appended.
export function zipNames(ps: Pick<FullParticipant, 'id' | 'name' | 'team' | 'venue'>[]): Map<number, string> {
  const used = new Set<string>(), out = new Map<number, string>()
  for (const p of ps) {
    let f = qrFilename(p.name, p.team, p.venue)
    if (used.has(f.toLowerCase())) f = f.replace(/\.png$/, `_${p.id}.png`)
    used.add(f.toLowerCase())
    out.set(p.id, f)
  }
  return out
}

export async function qrList() {
  await requireConfirmed(pool())
  const ps = await allParticipants()
  const names = zipNames(ps)
  return ps.map((p) => ({ id: p.id, name: p.name, team: p.team, venue: p.venue, file: names.get(p.id)!, url: qrUrl(p.qr_token) }))
}

export async function qrCsv(): Promise<string> {
  const list = await qrList()
  const emails = new Map((await allParticipants()).map((p) => [p.id, p.email]))
  return toCsv(['Name', 'Email', 'Team', 'Venue', 'QR URL', 'QR file'], list.map((p) => [p.name, emails.get(p.id), teamOf(p), p.venue, p.url, p.file]))
}

export async function qrZip(): Promise<Buffer> {
  await requireConfirmed(pool())
  const ps = await allParticipants()
  const names = zipNames(ps)
  const zip = new JSZip()
  for (const p of ps) zip.file(names.get(p.id)!, await qrPng(p.qr_token)) // PNGs are already compressed
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
}
