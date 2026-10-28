import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as qrGET } from '@/app/api/public/qr/[file]/route'
import { GET as venueGET } from '@/app/api/public/venue/[token]/route'
import { closePool, one } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call } from '../helpers/http'
import { confirmedDemo, importDemo, participant } from '../helpers/world'

beforeEach(async () => { await resetDb(); resetRateLimits() })
afterEach(() => { delete process.env.TRUST_PROXY })
afterAll(closePool)

const venue = (token: string, headers: Record<string, string> = {}) => call(venueGET, 'GET', `/api/public/venue/${token}`, { params: { token }, headers })
const qr = (file: string, headers: Record<string, string> = {}) => call(qrGET, 'GET', `/api/public/qr/${file}`, { params: { file }, headers })

describe('participant venue page', () => {
  it('shows ISE, DTH and no-team participants their venue', async () => {
    await confirmedDemo()
    const ise = await participant("assigned_venue = 'ISE'")
    expect((await venue(ise.qr_token)).body).toEqual({ ready: true, name: ise.name, team: 'Demo Trio 00', venue: 'ISE', venue_label: 'ISE SEMINAR HALL' })
    const dth = await participant("assigned_venue = 'DTH' AND team_id IS NOT NULL")
    expect((await venue(dth.qr_token)).body).toMatchObject({ ready: true, venue: 'DTH', venue_label: 'DTH' })
    const solo = await participant('team_id IS NULL')
    expect((await venue(solo.qr_token)).body).toMatchObject({ ready: true, team: null, venue: 'DTH' })
  })
  it('says "not ready" before confirmation', async () => {
    await importDemo()
    const p = await participant('true')
    expect((await venue(p.qr_token)).body).toEqual({ ready: false, name: p.name })
  })
  it('viewing is not a check-in, and nothing private is returned', async () => {
    await confirmedDemo()
    const p = await participant('true')
    const r = await venue(p.qr_token)
    expect(Object.keys(r.body).sort()).toEqual(['name', 'ready', 'team', 'venue', 'venue_label'])
    expect(JSON.stringify(r.body)).not.toContain(p.email)
    expect(await one('SELECT count(*)::int AS n FROM check_ins')).toEqual({ n: 0 })
  })
  it('unknown and malformed tokens are 404', async () => {
    await confirmedDemo()
    for (const t of ['A'.repeat(32), 'short', '%27%20OR%201%3D1', 'x'.repeat(65)]) expect((await venue(t)).status).toBe(404)
  })
})

describe('guessing protection', () => {
  it('blocks an address after 30 failed lookups, but not other visitors', async () => {
    await confirmedDemo()
    process.env.TRUST_PROXY = 'true'
    const p = await participant('true')
    const atk = { 'x-forwarded-for': '6.6.6.6' }
    const codes = []
    for (let i = 0; i < 31; i++) codes.push((await venue(`${'G'.repeat(31)}${i % 10}`, atk)).status)
    expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true)
    expect(codes[30]).toBe(429)
    expect((await venue(p.qr_token, atk)).status).toBe(429)            // the attacker is blocked even for real codes
    expect((await venue(p.qr_token, { 'x-forwarded-for': '7.7.7.7' })).status).toBe(200)
  })
  it('lets a busy shared Wi-Fi address view many valid pages', async () => {
    await confirmedDemo()
    process.env.TRUST_PROXY = 'true'
    const p = await participant('true')
    for (let i = 0; i < 200; i++) expect((await venue(p.qr_token, { 'x-forwarded-for': '10.1.1.1' })).status).toBe(200)
  })
})

describe('public QR image', () => {
  it('serves the PNG for a real token, decoding to the check-in link', async () => {
    await confirmedDemo()
    const p = await participant('true')
    const r = await qr(`${p.qr_token}.png`)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('cache-control')).toBe('private, max-age=3600')
    const img = PNG.sync.read(r.body as Buffer)
    expect(jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data).toBe(`https://ctf.test/checkin/${p.qr_token}`)
  })
  it('404s for unknown tokens and bad file names, and counts them as misses', async () => {
    await confirmedDemo()
    process.env.TRUST_PROXY = 'true'
    const h = { 'x-forwarded-for': '8.8.8.8' }
    for (const f of [`${'A'.repeat(32)}.png`, 'x.png', 'abc', '../etc.png']) expect((await qr(f, h)).status).toBe(404)
    for (let i = 0; i < 26; i++) await qr('nope.png', h)
    expect((await qr('nope.png', h)).status).toBe(429)
  })
})

describe('a blocked guesser learns nothing', () => {
  it('gets the same 429 for valid and invalid tokens once over the limit', async () => {
    await confirmedDemo()
    process.env.TRUST_PROXY = 'true'
    const h = { 'x-forwarded-for': '9.9.9.9' }
    const real = await participant('true')
    for (let i = 0; i < 30; i++) await venue(`${'Q'.repeat(31)}${i % 10}`, h)
    const valid = await venue(real.qr_token, h), invalid = await venue('Z'.repeat(32), h)
    expect([valid.status, invalid.status]).toEqual([429, 429])
    expect(valid.body).toEqual(invalid.body)
    expect((await qr(`${real.qr_token}.png`, h)).status).toBe(429)
  })
})
