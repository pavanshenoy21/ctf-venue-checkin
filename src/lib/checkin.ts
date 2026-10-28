import type { Operator } from './auth'
import type { Venue } from './config'
import { tx } from './db'
import { extractToken } from './security'
import { getState } from './state'

export type CheckinStatus = 'SUCCESS' | 'ALREADY' | 'WRONG_VENUE' | 'INVALID' | 'NOT_READY'
export interface CheckinResult {
  status: CheckinStatus
  name?: string
  team?: string | null
  assigned_venue?: Venue | null
  current_venue?: Venue
  checked_in_at?: Date
  venue?: Venue
}

export const STATUS_CODE: Record<CheckinStatus, number> = { SUCCESS: 200, ALREADY: 200, INVALID: 404, WRONG_VENUE: 409, NOT_READY: 409 }

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
  return tx(async (db) => {
    const p = (await db.query<{ id: number; name: string; team: string | null; venue: Venue | null }>(
      `SELECT p.id, p.name, t.name AS team, p.assigned_venue AS venue
       FROM participants p LEFT JOIN teams t ON t.id = p.team_id WHERE p.qr_token = $1 FOR UPDATE OF p`, [token])).rows[0]
    if (!p) return { status: 'INVALID' }
    const info = { name: p.name, team: p.team, assigned_venue: p.venue, current_venue: operator.venue }
    if ((await getState(db)).allocation_status !== 'CONFIRMED' || !p.venue) return { status: 'NOT_READY', ...info }
    if (p.venue !== operator.venue) return { status: 'WRONG_VENUE', ...info }
    const ins = await db.query<{ at: Date }>(
      `INSERT INTO check_ins (participant_id, venue, operator_id) VALUES ($1, $2, $3)
       ON CONFLICT (participant_id) DO NOTHING RETURNING scanned_at AS at`, [p.id, operator.venue, operator.id])
    if (ins.rows[0]) return { status: 'SUCCESS', ...info, checked_in_at: ins.rows[0].at }
    const prev = (await db.query<{ at: Date; venue: Venue }>('SELECT scanned_at AS at, venue FROM check_ins WHERE participant_id = $1', [p.id])).rows[0]!
    return { status: 'ALREADY', ...info, checked_in_at: prev.at, venue: prev.venue }
  })
}
