import { config, VENUE_LABEL, type Venue } from './config'
import { one, pool } from './db'
import { HttpError } from './http'
import { assertUnder, clientIp, hit } from './ratelimit'
import { TOKEN_RE } from './security'
import { getState } from './state'

// pass: set when the token is a temporary-exit re-entry QR rather than the person's check-in QR
interface Found { id: number; name: string; team: string | null; venue: Venue | null; pass?: 'open' | 'used' | 'cancelled' }

/**
 * Looks up a participant by QR token for the public (no-login) endpoints. Every request counts toward a
 * generous per-IP limit; failed lookups also count toward a strict one. Once an address uses up its failed
 * lookups it gets 429 for every token, valid or not, so it learns nothing more.
 */
export async function findByToken(req: Request, token: string): Promise<Found> {
  const ip = clientIp(req)
  hit(`public:${ip}`, config.rate.public)
  // Refuse BEFORE looking up: otherwise a blocked guesser still sees 200 for a correct guess and 429 for a
  // wrong one, which is exactly the oracle the limit exists to remove.
  assertUnder(`public-miss:${ip}`, config.rate.publicInvalid)
  const p = TOKEN_RE.test(token)
    ? (await one<Found>('SELECT p.id, p.name, t.name AS team, p.assigned_venue AS venue FROM participants p LEFT JOIN teams t ON t.id = p.team_id WHERE p.qr_token = $1', [token])) ??
      (await one<Found>(`SELECT p.id, p.name, t.name AS team, p.assigned_venue AS venue,
          CASE WHEN e.cancelled_at IS NOT NULL THEN 'cancelled' WHEN e.returned_at IS NOT NULL THEN 'used' ELSE 'open' END AS pass
        FROM exits e JOIN participants p ON p.id = e.participant_id LEFT JOIN teams t ON t.id = p.team_id WHERE e.token = $1`, [token]))
    : undefined
  if (!p) {
    hit(`public-miss:${ip}`, config.rate.publicInvalid)
    throw new HttpError(404, 'Not found')
  }
  return p
}

// What a participant sees after scanning their own QR. Viewing is not a check-in.
export async function publicVenue(req: Request, token: string) {
  const p = await findByToken(req, token)
  if ((await getState(pool())).allocation_status !== 'CONFIRMED' || !p.venue) return { ready: false as const, name: p.name }
  return { ready: true as const, name: p.name, team: p.team, venue: p.venue, venue_label: VENUE_LABEL[p.venue], ...(p.pass ? { pass: p.pass } : {}) }
}
