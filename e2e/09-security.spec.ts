import { expect, test } from './support/fixtures'
import { person, PW, resetTo } from './support/db'

const H = { 'x-requested-with': 'ctf-app' }

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { await resetTo('confirmed') })

test('pages carry a strict CSP whose nonce is on every script and changes per request', async ({ request }) => {
  const nonces = new Set<string>()
  for (let i = 0; i < 3; i++) {
    const r = await request.get('/admin/login')
    const csp = r.headers()['content-security-policy']!
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]!
    nonces.add(nonce)
    const html = await r.text()
    const scripts = html.match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) expect(s).toContain(`nonce="${nonce}"`)
  }
  expect(nonces.size).toBe(3)
})

test('security headers on pages and API responses; no framework banner', async ({ request }) => {
  for (const path of ['/admin/login', '/api/health']) {
    const h = (await request.get(path)).headers()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['referrer-policy']).toBe('no-referrer')
    expect(h['permissions-policy']).toContain('camera=(self)')
    expect(h['x-powered-by']).toBeUndefined()
  }
})

test('session cookie is HttpOnly and SameSite=Strict; the API refuses requests without the CSRF header', async ({ request }) => {
  const noHeader = await request.post('/api/auth/login', { data: { username: 'root', password: PW } })
  expect(noHeader.status()).toBe(400)
  const r = await request.post('/api/auth/login', { data: { username: 'root', password: PW }, headers: H })
  expect(r.status()).toBe(200)
  expect(r.headers()['set-cookie']).toMatch(/HttpOnly; SameSite=Strict/)
})

test('a DTH operator cannot check in an ISE participant by editing the request', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3200' })
  await api.post('/api/auth/login', { data: { username: 'dth', password: PW }, headers: H })
  const p = await person("assigned_venue = 'ISE'")
  for (const extra of [{ venue: 'ISE' }, { current_venue: 'ISE' }, { operator: { venue: 'ISE' } }]) {
    const r = await api.post('/api/operator/checkin?venue=ISE', { data: { qr_token: p.qr_token, ...extra }, headers: { ...H, 'x-venue': 'ISE' } })
    expect(r.status()).toBe(409)
    expect((await r.json()).status).toBe('WRONG_VENUE')
  }
  for (const path of ['/api/admin/stats', '/api/admin/participants', '/api/admin/export/checkins.csv', '/api/admin/qr/all.zip'])
    expect((await api.get(path)).status()).toBe(403)
  await api.dispose()
})

test('signed-out requests to private APIs are refused', async ({ request }) => {
  for (const path of ['/api/admin/stats', '/api/admin/teams', '/api/operator/dashboard', '/api/auth/me']) expect((await request.get(path)).status()).toBe(401)
  expect((await request.post('/api/operator/checkin', { data: { qr_token: 'x' }, headers: H })).status()).toBe(401)
})

// Last: it uses up this machine's failed-lookup budget for a minute.
test('guessing QR codes gets blocked, and a blocked address learns nothing', async ({ request }) => {
  const real = await person('true')
  const codes: number[] = []
  for (let i = 0; i < 31; i++) codes.push((await request.get(`/api/public/venue/${'G'.repeat(31)}${i % 10}`)).status())
  expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true)
  expect(codes[30]).toBe(429)
  expect((await request.get(`/api/public/venue/${real.qr_token}`)).status()).toBe(429)
})
