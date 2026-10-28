import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as loginPOST } from '@/app/api/auth/login/route'
import { POST as logoutPOST } from '@/app/api/auth/logout/route'
import { GET as meGET } from '@/app/api/auth/me/route'
import { upsertAdmin } from '@/lib/admins'
import { requireOperator, requireSuper } from '@/lib/auth'
import { closePool, one, q } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { _setClock, resetRateLimits } from '@/lib/ratelimit'
import { sha256Hex } from '@/lib/security'
import { resetDb } from '../helpers/db'
import { call, cookieOf, login, makeReq, PW, seedAdmins } from '../helpers/http'

const signIn = (username: string, password = PW, o: { headers?: Record<string, string>; csrf?: boolean } = {}) =>
  call(loginPOST, 'POST', '/api/auth/login', { body: { username, password }, ...o })
const me = (cookie?: string) => call(meGET, 'GET', '/api/auth/me', { cookie })

beforeEach(async () => { await resetDb(); resetRateLimits(); await seedAdmins() })
afterEach(() => { process.env.COOKIE_SECURE = 'false'; delete process.env.TRUST_PROXY; _setClock(null) })
afterAll(closePool)

describe('sign in', () => {
  it('returns the role and sets an HttpOnly, SameSite=Strict session cookie', async () => {
    const r = await signIn('dth')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ username: 'dth', role: 'VENUE_OPERATOR', venue: 'DTH' })
    const c = r.headers.get('set-cookie')!
    expect(c).toMatch(/^ctf_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('adds Secure to the cookie when COOKIE_SECURE is on', async () => {
    process.env.COOKIE_SECURE = 'true'
    expect((await signIn('root')).headers.get('set-cookie')).toMatch(/; Secure$/)
  })
  it('stores only a SHA-256 of the session token', async () => {
    const token = cookieOf((await signIn('root')).headers).split('=')[1]!
    const rows = await q<{ token_hash: string }>('SELECT token_hash FROM sessions')
    expect(rows).toEqual([{ token_hash: sha256Hex(token) }])
  })
  it('gives the same answer for a wrong password and an unknown user', async () => {
    const a = await signIn('dth', 'wrong-password')
    const b = await signIn('nobody', 'wrong-password')
    expect([a.status, b.status]).toEqual([401, 401])
    expect(a.body).toEqual(b.body)
    expect(a.headers.get('set-cookie')).toBeNull()
  })
  it('ignores extra fields, so a role in the body cannot escalate', async () => {
    const r = await call(loginPOST, 'POST', '/api/auth/login', { body: { username: 'dth', password: PW, role: 'SUPER_ADMIN', venue: 'ISE' } })
    expect(r.body).toEqual({ username: 'dth', role: 'VENUE_OPERATOR', venue: 'DTH' })
  })
  it('validates the body', async () => {
    expect((await call(loginPOST, 'POST', '/api/auth/login', { body: 'not json' })).status).toBe(400)
    expect((await call(loginPOST, 'POST', '/api/auth/login', { body: { username: 'dth' } })).status).toBe(422)
    expect((await signIn('x'.repeat(65))).status).toBe(422)
    expect((await signIn('dth', 'p'.repeat(257))).status).toBe(422)
    expect((await call(loginPOST, 'POST', '/api/auth/login', { body: { username: 'dth', password: 'x'.repeat(20000) } })).status).toBe(413)
  })
  it('requires the CSRF header', async () => {
    expect((await signIn('dth', PW, { csrf: false })).status).toBe(400)
    expect((await call(logoutPOST, 'POST', '/api/auth/logout', { csrf: false })).status).toBe(400)
  })
})

describe('sessions', () => {
  it('identify the signed-in account', async () => {
    const r = await me(await login('ise'))
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ username: 'ise', role: 'VENUE_OPERATOR', venue: 'ISE' })
  })
  it('reject missing, malformed and forged cookies', async () => {
    for (const c of [undefined, 'ctf_session=', 'ctf_session=garbage', `ctf_session=${'A'.repeat(43)}`, `ctf_session=${'A'.repeat(500)}`, 'other=1'])
      expect((await me(c)).status).toBe(401)
  })
  it('expire', async () => {
    const c = await login('dth')
    await q("UPDATE sessions SET expires_at = now() - interval '1 second'")
    expect((await me(c)).status).toBe(401)
  })
  it('end on sign out, and the cookie is cleared', async () => {
    const c = await login('dth')
    const r = await call(logoutPOST, 'POST', '/api/auth/logout', { cookie: c })
    expect(r.headers.get('set-cookie')).toMatch(/^ctf_session=; .*Max-Age=0/)
    expect((await me(c)).status).toBe(401)
    expect(await one('SELECT count(*)::int AS n FROM sessions')).toEqual({ n: 0 })
  })
  it('are revoked when the password is changed', async () => {
    const c = await login('dth')
    await upsertAdmin({ username: 'dth', role: 'VENUE_OPERATOR', venue: 'DTH', password: 'a-brand-new-password' })
    expect((await me(c)).status).toBe(401)
    expect((await signIn('dth')).status).toBe(401)
    expect((await signIn('dth', 'a-brand-new-password')).status).toBe(200)
  })
  it('die with their account', async () => {
    const c = await login('dth')
    await q("DELETE FROM admins WHERE username = 'dth'")
    expect((await me(c)).status).toBe(401)
  })
})

describe('role guards', () => {
  const guard = async (fn: (r: Request) => Promise<unknown>, cookie?: string) => {
    try { await fn(makeReq('GET', '/x', { cookie })); return 200 } catch (e) { return (e as HttpError).status }
  }
  it('super admin only', async () => {
    expect(await guard(requireSuper, await login('root'))).toBe(200)
    expect(await guard(requireSuper, await login('dth'))).toBe(403)
    expect(await guard(requireSuper)).toBe(401)
  })
  it('venue operators only, with the venue taken from their account', async () => {
    expect(await guard(requireSuper, await login('ise'))).toBe(403)
    expect(await guard(requireOperator, await login('root'))).toBe(403)
    const op = await requireOperator(makeReq('GET', '/x', { cookie: await login('ise'), headers: { 'x-venue': 'DTH' } }))
    expect(op.venue).toBe('ISE')
  })
})

describe('login rate limits', () => {
  it('block after 10 attempts for one address and username, with Retry-After', async () => {
    const codes = []
    for (let i = 0; i < 11; i++) codes.push((await signIn('dth', 'wrong')).status)
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
    const r = await signIn('dth', 'wrong')
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
  })
  it('cannot be used to lock an operator out from another address', async () => {
    process.env.TRUST_PROXY = 'true'
    for (let i = 0; i < 15; i++) await signIn('dth', 'wrong', { headers: { 'x-forwarded-for': '6.6.6.6' } })
    expect((await signIn('dth', 'wrong', { headers: { 'x-forwarded-for': '6.6.6.6' } })).status).toBe(429)
    expect((await signIn('dth', PW, { headers: { 'x-forwarded-for': '7.7.7.7' } })).status).toBe(200)
  })
  it('ignore spoofed client-side X-Forwarded-For entries', async () => {
    process.env.TRUST_PROXY = 'true'
    const codes = []
    for (let i = 0; i < 12; i++) codes.push((await signIn('dth', 'wrong', { headers: { 'x-forwarded-for': `10.0.0.${i}, 8.8.8.8` } })).status)
    expect(codes).toContain(429)                      // the proxy-appended 8.8.8.8 is the key
  })
  it('ignore forwarding headers entirely without a trusted proxy', async () => {
    const codes = []
    for (let i = 0; i < 12; i++) codes.push((await signIn('dth', 'wrong', { headers: { 'x-forwarded-for': `9.9.9.${i}`, 'x-real-ip': `9.9.9.${i}` } })).status)
    expect(codes).toContain(429)
  })
  it('cap attempts per address across usernames', async () => {
    process.env.TRUST_PROXY = 'true'
    const codes = []
    for (let i = 0; i < 31; i++) codes.push((await signIn(`user${i}`, 'wrong', { headers: { 'x-forwarded-for': '5.5.5.5' } })).status)
    expect(codes.slice(0, 30).every((c) => c === 401)).toBe(true)
    expect(codes[30]).toBe(429)
  })
  it('reset after the window', async () => {
    let now = 1_000_000
    _setClock(() => now)
    for (let i = 0; i < 10; i++) await signIn('dth', 'wrong')
    expect((await signIn('dth')).status).toBe(429)
    now += 61_000
    expect((await signIn('dth')).status).toBe(200)
  })
})
