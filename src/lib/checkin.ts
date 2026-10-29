import type { Operator } from './auth'
import type { Venue } from './config'
import { q, tx } from './db'
import { extractToken } from './security'
import { getState } from './state'

// READY / REENTRY: a lookup found someone who can be checked in / let back in here; nothing recorded yet.
// RETURNED: back in after a temporary exit. OUT: their original QR while they are out (refused).
// REENTRY_USED: a re-entry QR that has already brought them back.
export type CheckinStatus = 'READY' | 'SUCCESS' | 'ALREADY' | 'WRONG_VENUE' | 'INVALID' | 'NOT_READY' | 'NOT_REGISTERED'
  | 'REENTRY' | 'RETURNED' | 'OUT' | 'REENTRY_USED'
export interface CheckinResult {
  status: CheckinStatus
  name?: string
  team?: string | null
  sap_id?: string | null
  year?: string | null
  branch?: string | null
  assigned_venue?: Venue | null
  current_venue?: Venue
  checked_in_at?: Date
  venue?: Venue
  reason?: string // temporary exit: why they stepped out, and when
  out_at?: Date
  returned_at?: Date
}

export const STATUS_CODE: Record<CheckinStatus, number> = { READY: 200, SUCCESS: 200, ALREADY: 200, INVALID: 404, WRONG_VENUE: 409, NOT_READY: 409, NOT_REGISTERED: 409, REENTRY: 200, RETURNED: 200, OUT: 409, REENTRY_USED: 409 }

/**
 * Checks a scanned QR in at the operator's venue.
 *
 * The venue compared against is operator.venue, which comes from the signed-in account. Nothing in the
 * request can change it. The DB trigger on check_ins repeats the venue check, and UNIQUE(participant_id)
 * plus the row lock make simultaneous scans produce exactly one check-in.
 */
export async function doCheckin(operator: Operator, raw: string): Promise<CheckinResult> {
  const token = extractToken(raw)
  if (!token) return { status: 'INVALID' }
  return checkIn(operator, { token }, false)
}

// Before checking in, the desk shows who the QR (or search result) belongs to, and the operator confirms.
// Same checks as a check-in, but nothing is recorded: READY / REENTRY mean "can be let in here".
export async function lookup(operator: Operator, by: { qr_token: string } | { participant_id: number }): Promise<CheckinResult> {
  if ('participant_id' in by) return checkIn(operator, { id: by.participant_id }, true, true)
  const token = extractToken(by.qr_token)
  if (!token) return { status: 'INVALID' }
  return checkIn(operator, { token }, false, true)
}

// The desk's fallback when a QR won't scan: an operator picked the person from a search of their own venue.
// Same checks as a scan. Walk-ins still without a team must be registered at the walk-in desk first. Someone
// out on a temporary exit is let back in (their phone may be dead), recorded as a manual return.
export async function doManualCheckin(operator: Operator, participantId: number): Promise<CheckinResult> {
  return checkIn(operator, { id: participantId }, true)
}

type Exit = { id: number; reason: string; created_at: Date; returned_at: Date | null; cancelled_at: Date | null }
type Person = { id: number; name: string; team: string | null; venue: Venue | null; sap_id: string | null; year: string | null; branch: string | null }
const PERSON = `SELECT p.id, p.name, t.name AS team, p.assigned_venue AS venue, p.sap_id, p.year, p.branch
  FROM participants p LEFT JOIN teams t ON t.id = p.team_id`

async function checkIn(operator: Operator, key: { token: string } | { id: number }, manual: boolean, dryRun = false): Promise<CheckinResult> {
  return tx(async (db) => {
    let p: Person | undefined
    let pass: (Exit & { participant_id: number }) | undefined // set when the scanned code is a re-entry QR rather than a check-in QR
    if ('id' in key) p = (await db.query<Person>(`${PERSON} WHERE p.id = $1 FOR UPDATE OF p`, [key.id])).rows[0]
    else {
      p = (await db.query<Person>(`${PERSON} WHERE p.qr_token = $1 FOR UPDATE OF p`, [key.token])).rows[0]
      if (!p) {
        pass = (await db.query<Exit & { participant_id: number }>(
          'SELECT id, participant_id, reason, created_at, returned_at, cancelled_at FROM exits WHERE token = $1 FOR UPDATE', [key.token])).rows[0]
        if (pass) p = (await db.query<Person>(`${PERSON} WHERE p.id = $1 FOR UPDATE OF p`, [pass.participant_id])).rows[0]
      }
    }
    if (!p || pass?.cancelled_at) return { status: 'INVALID' }
    const base = { name: p.name, team: p.team, assigned_venue: p.venue, current_venue: operator.venue }
    if ((await getState(db)).allocation_status !== 'CONFIRMED' || !p.venue) return { status: 'NOT_READY', ...base }
    if (p.venue !== operator.venue) return { status: 'WRONG_VENUE', ...base }
    // ID details only go to the desk of the person's own venue
    const info = { ...base, sap_id: p.sap_id, year: p.year, branch: p.branch }

    if (pass) {
      if (pass.returned_at) return { status: 'REENTRY_USED', ...info, reason: pass.reason, out_at: pass.created_at, returned_at: pass.returned_at }
      return letBackIn(pass, false)
    }
    const open = (await db.query<Exit>(
      'SELECT id, reason, created_at, returned_at, cancelled_at FROM exits WHERE participant_id = $1 AND returned_at IS NULL AND cancelled_at IS NULL FOR UPDATE', [p.id])).rows[0]
    if (open) return manual ? letBackIn(open, true) : { status: 'OUT', ...info, reason: open.reason, out_at: open.created_at }

    if (manual && !p.team) return { status: 'NOT_REGISTERED', ...info }
    if (dryRun) {
      const prev = (await db.query<{ at: Date; venue: Venue }>('SELECT scanned_at AS at, venue FROM check_ins WHERE participant_id = $1', [p.id])).rows[0]
      return prev ? { status: 'ALREADY', ...info, checked_in_at: prev.at, venue: prev.venue } : { status: 'READY', ...info }
    }
    const ins = await db.query<{ at: Date }>(
      `INSERT INTO check_ins (participant_id, venue, operator_id, manual) VALUES ($1, $2, $3, $4)
       ON CONFLICT (participant_id) DO NOTHING RETURNING scanned_at AS at`, [p.id, operator.venue, operator.id, manual])
    if (ins.rows[0]) return { status: 'SUCCESS', ...info, checked_in_at: ins.rows[0].at }
    const prev = (await db.query<{ at: Date; venue: Venue }>('SELECT scanned_at AS at, venue FROM check_ins WHERE participant_id = $1', [p.id])).rows[0]!
    return { status: 'ALREADY', ...info, checked_in_at: prev.at, venue: prev.venue }

    async function letBackIn(e: Exit, viaDesk: boolean): Promise<CheckinResult> {
      const extra = { ...info, reason: e.reason, out_at: e.created_at }
      if (dryRun) return { status: 'REENTRY', ...extra }
      const at = (await db.query<{ at: Date }>(
        'UPDATE exits SET returned_at = now(), returned_venue = $2, returned_by = $3, returned_manual = $4 WHERE id = $1 RETURNING returned_at AS at',
        [e.id, operator.venue, operator.id, viaDesk])).rows[0]!.at
      return { status: 'RETURNED', ...extra, checked_in_at: at, venue: operator.venue }
    }
  })
}

export interface DeskPerson { id: number; name: string; email: string; team: string | null; sap_id: string | null; checked_in: boolean; checked_in_at: Date | null; out: boolean }

// Search the operator's own venue by name, email, SAP ID or team. Other venues are never searched.
export async function searchVenue(operator: Operator, term: string): Promise<DeskPerson[]> {
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return q<DeskPerson>(
    `SELECT p.id, p.name, p.email, t.name AS team, p.sap_id, p.checked_in, p.checked_in_at,
       EXISTS (SELECT 1 FROM exits e WHERE e.participant_id = p.id AND e.returned_at IS NULL AND e.cancelled_at IS NULL) AS out
     FROM participants p LEFT JOIN teams t ON t.id = p.team_id
     WHERE p.assigned_venue = $1 AND (p.name ILIKE $2 OR p.email ILIKE $2 OR p.sap_id ILIKE $2 OR t.name ILIKE $2)
     ORDER BY p.checked_in, lower(p.name) LIMIT 20`, [operator.venue, like])
}
