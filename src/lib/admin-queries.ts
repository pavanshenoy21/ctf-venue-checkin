import type { Venue } from './config'
import { q } from './db'

// LIKE pattern for a literal substring: %, _ and \ in the search text match themselves.
export const likeContains = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export interface ParticipantFilter { q: string; venue: Venue | null; checked: boolean | null; limit: number; offset: number }

export async function searchParticipants(f: ParticipantFilter) {
  const term = f.q.trim()
  const where = `($1 = '' OR p.name ILIKE $2 OR p.email ILIKE $2 OR t.name ILIKE $2 OR p.id::text = $1)
    AND ($3::text IS NULL OR p.assigned_venue = $3) AND ($4::boolean IS NULL OR p.checked_in = $4)`
  const params = [term, likeContains(term), f.venue, f.checked]
  const [{ n }] = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM participants p LEFT JOIN teams t ON t.id = p.team_id WHERE ${where}`, params)) as [{ n: number }]
  const items = await q(`SELECT p.id, p.name, p.email, t.name AS team, t.participant_count AS team_size, p.assigned_venue AS venue,
      p.checked_in, p.checked_in_at
    FROM participants p LEFT JOIN teams t ON t.id = p.team_id WHERE ${where} ORDER BY p.id LIMIT $5 OFFSET $6`,
    [...params, f.limit, f.offset])
  return { total: n, items }
}

interface Member { name: string; checked_in: boolean; checked_in_at: Date | null }

// Largest teams first, each with members and presence, plus everyone without a team.
export async function teamsWithMembers() {
  const teams = await q<{ id: number; name: string; size: number; venue: Venue | null; present: number; members: Member[] }>(`
    SELECT t.id, t.name, t.participant_count AS size, t.assigned_venue AS venue,
      count(*) FILTER (WHERE p.checked_in)::int AS present,
      COALESCE(json_agg(json_build_object('name', p.name, 'checked_in', p.checked_in, 'checked_in_at', p.checked_in_at) ORDER BY p.id)
        FILTER (WHERE p.id IS NOT NULL), '[]') AS members
    FROM teams t LEFT JOIN participants p ON p.team_id = t.id
    GROUP BY t.id ORDER BY t.participant_count DESC, lower(t.name), t.name`)
  const no_team = await q(`SELECT id, name, checked_in, checked_in_at, assigned_venue AS venue FROM participants
    WHERE team_id IS NULL ORDER BY lower(name), id`)
  return { teams, no_team }
}

export async function listCheckins(venue: Venue | null) {
  return q(`SELECT p.name, p.email, t.name AS team, c.venue, c.scanned_at AS at
    FROM check_ins c JOIN participants p ON p.id = c.participant_id LEFT JOIN teams t ON t.id = p.team_id
    WHERE ($1::text IS NULL OR c.venue = $1) ORDER BY c.scanned_at DESC, c.id DESC LIMIT 1000`, [venue])
}

export interface FullParticipant {
  id: number; name: string; email: string; team: string | null; venue: Venue | null; qr_token: string
  checked_in: boolean; checked_in_at: Date | null; email_sent_at: Date | null; email_error: string | null
  qr_sent_at: Date | null; qr_error: string | null; walk_in: boolean
}

const FULL = `SELECT p.id, p.name, p.email, t.name AS team, p.assigned_venue AS venue, p.qr_token,
    p.checked_in, p.checked_in_at, p.email_sent_at, p.email_error, p.qr_sent_at, p.qr_error,
    coalesce(t.walk_in, false) AS walk_in
  FROM participants p LEFT JOIN teams t ON t.id = p.team_id`

export function allParticipants(): Promise<FullParticipant[]> {
  return q<FullParticipant>(`${FULL} ORDER BY p.id`)
}

export async function participantById(id: number): Promise<FullParticipant | undefined> {
  return (await q<FullParticipant>(`${FULL} WHERE p.id = $1`, [id]))[0]
}
