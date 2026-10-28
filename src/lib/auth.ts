import { config, type Venue } from './config'
import { one, q } from './db'
import { HttpError } from './http'
import { burnPasswordCheck, newSessionToken, sha256Hex, verifyPassword } from './security'

export type Role = 'SUPER_ADMIN' | 'VENUE_OPERATOR'
export interface Admin { id: number; username: string; role: Role; venue: Venue | null }
export type Operator = Admin & { role: 'VENUE_OPERATOR'; venue: Venue }

export const COOKIE = 'ctf_session'

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

const cookieAttrs = (maxAge: number): string =>
  `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`
export const sessionCookie = (token: string): string => `${COOKIE}=${token}; ${cookieAttrs(config.sessionHours * 3600)}`
export const clearedCookie = (): string => `${COOKIE}=; ${cookieAttrs(0)}`

export async function authenticate(username: string, password: string): Promise<Admin | null> {
  const row = await one<Admin & { password_hash: string }>('SELECT id, username, role, venue, password_hash FROM admins WHERE username = $1', [username])
  if (!row) { await burnPasswordCheck(password); return null }
  if (!(await verifyPassword(password, row.password_hash))) return null
  return { id: row.id, username: row.username, role: row.role, venue: row.venue }
}

export async function createSession(adminId: number): Promise<string> {
  const token = newSessionToken()
  await q(`INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [sha256Hex(token), adminId, config.sessionHours])
  if (Math.random() < 0.05) await q('DELETE FROM sessions WHERE expires_at < now()') // occasional cleanup
  return token
}

export async function sessionAdmin(token: string | null): Promise<Admin | null> {
  if (!token || token.length > 100) return null
  return (await one<Admin>(`SELECT a.id, a.username, a.role, a.venue FROM sessions s JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256Hex(token)])) ?? null
}

export async function deleteSession(token: string | null): Promise<void> {
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256Hex(token)])
}

export async function currentAdmin(req: Request): Promise<Admin> {
  const admin = await sessionAdmin(readCookie(req, COOKIE))
  if (!admin) throw new HttpError(401, 'Not signed in')
  return admin
}

export async function requireSuper(req: Request): Promise<Admin> {
  const a = await currentAdmin(req)
  if (a.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Forbidden')
  return a
}

// The operator's venue comes only from here (their account), never from the request.
export async function requireOperator(req: Request): Promise<Operator> {
  const a = await currentAdmin(req)
  if (a.role !== 'VENUE_OPERATOR' || !a.venue) throw new HttpError(403, 'Forbidden')
  return a as Operator
}

export const publicAdmin = (a: Admin) => ({ username: a.username, role: a.role, venue: a.venue })
