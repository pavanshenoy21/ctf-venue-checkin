import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as manualPOST } from '@/app/api/operator/checkin-manual/route'
import { POST as scanPOST } from '@/app/api/operator/checkin/route'
import { POST as lookupPOST } from '@/app/api/operator/lookup/route'
import { GET as searchGET } from '@/app/api/operator/search/route'
import { closePool, one } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { confirmedDemo, importDemo, participant } from '../helpers/world'

let c: Record<'root' | 'dth' | 'ise', string>
beforeEach(async () => {
  await resetDb(); resetRateLimits(); await seedAdmins()
  c = { root: await login('root'), dth: await login('dth'), ise: await login('ise') }
})
afterAll(closePool)

const search = (cookie: string | undefined, term: string) => call(searchGET, 'GET', `/api/operator/search?q=${encodeURIComponent(term)}`, { cookie })
const manual = (cookie: string | undefined, body: unknown) => call(manualPOST, 'POST', '/api/operator/checkin-manual', { cookie, body })
const look = (cookie: string | undefined, body: unknown) => call(lookupPOST, 'POST', '/api/operator/lookup', { cookie, body })
const checkins = async () => (await one<{ n: number }>('SELECT count(*)::int AS n FROM check_ins'))!.n
const ISE = () => participant("assigned_venue = 'ISE'")
const DTH = () => participant("assigned_venue = 'DTH' AND team_id IS NOT NULL")

describe('manual search', () => {
  beforeEach(confirmedDemo)
  it('finds people in the operator\'s own venue by name, email or team', async () => {
    const p = await ISE()
    const team = (await one<{ name: string }>('SELECT t.name FROM teams t JOIN participants p ON p.team_id = t.id WHERE p.id = $1', [p.id]))!.name
    for (const term of [p.name, p.email.toUpperCase(), team]) {
      const r = await search(c.ise, term)
      expect(r.status).toBe(200)
      expect(r.body.people.map((x: { id: number }) => x.id)).toContain(p.id)
    }
  })
  it('never returns another venue\'s participants', async () => {
    const p = await ISE()
    expect((await search(c.dth, p.email)).body.people).toEqual([])
    const all = (await search(c.dth, 'example')).body.people as { id: number }[]
    const venues = await Promise.all(all.map((x) => one<{ v: string }>('SELECT assigned_venue AS v FROM participants WHERE id = $1', [x.id])))
    expect(new Set(venues.map((v) => v!.v))).toEqual(new Set(['DTH']))
  })
  it('treats % and _ literally', async () => {
    expect((await search(c.dth, '%%')).body.people).toEqual([])
  })
  it('needs an operator and a 2-100 character term', async () => {
    expect((await search(undefined, 'demo')).status).toBe(401)
    expect((await search(c.root, 'demo')).status).toBe(403)
    expect((await search(c.dth, 'd')).status).toBe(422)
    expect((await search(c.dth, 'x'.repeat(101))).status).toBe(422)
  })
})

describe('manual check-in', () => {
  it('checks in someone from the operator\'s venue, once, marked as manual', async () => {
    await confirmedDemo()
    const p = await DTH()
    const r = await manual(c.dth, { participant_id: p.id })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ status: 'SUCCESS', name: p.name })
    expect(await one('SELECT 1 FROM check_ins WHERE participant_id = $1 AND manual', [p.id])).toBeTruthy()
    expect((await manual(c.dth, { participant_id: p.id })).body.status).toBe('ALREADY')
    // and a later scan of their QR says already checked in
    expect((await call(scanPOST, 'POST', '/api/operator/checkin', { cookie: c.dth, body: { qr_token: p.qr_token } })).body.status).toBe('ALREADY')
  })
  it('refuses someone from the other venue', async () => {
    await confirmedDemo()
    const r = await manual(c.dth, { participant_id: (await ISE()).id })
    expect([r.status, r.body.status]).toEqual([409, 'WRONG_VENUE'])
    expect(await one('SELECT 1 FROM check_ins')).toBeUndefined()
  })
  it('refuses walk-ins who have not been registered into a team', async () => {
    await confirmedDemo()
    const r = await manual(c.dth, { participant_id: (await participant('team_id IS NULL')).id })
    expect([r.status, r.body.status]).toEqual([409, 'NOT_REGISTERED'])
  })
  it('handles unknown ids, bad bodies, and unconfirmed venues', async () => {
    await importDemo()
    expect((await manual(c.dth, { participant_id: (await participant('true')).id })).body.status).toBe('NOT_READY')
    expect((await manual(c.dth, { participant_id: 999999 })).body.status).toBe('INVALID')
    expect((await manual(c.dth, { participant_id: '1' })).status).toBe(422)
    expect((await manual(c.root, { participant_id: 1 })).status).toBe(403)
  })
})

describe('lookup before confirming', () => {
  it('shows who a QR belongs to, with SAP ID, and records nothing', async () => {
    await confirmedDemo()
    const p = await DTH()
    const sap = (await one<{ sap_id: string | null }>('SELECT sap_id FROM participants WHERE id = $1', [p.id]))!.sap_id
    for (const body of [{ qr_token: p.qr_token }, { qr_token: `https://ctf.test/checkin/${p.qr_token}` }, { participant_id: p.id }]) {
      const r = await look(c.dth, body)
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ status: 'READY', name: p.name, sap_id: sap })
      expect(r.body).toHaveProperty('year')
      expect(r.body).toHaveProperty('branch')
    }
    expect(await checkins()).toBe(0)
  })
  it('reports the same problems a check-in would', async () => {
    await confirmedDemo()
    const ise = await ISE(), dth = await DTH()
    expect((await look(c.dth, { qr_token: ise.qr_token })).body.status).toBe('WRONG_VENUE')
    expect((await look(c.dth, { participant_id: ise.id })).body.status).toBe('WRONG_VENUE')
    expect((await look(c.dth, { qr_token: 'nope' })).body.status).toBe('INVALID')
    expect((await look(c.dth, { participant_id: (await participant('team_id IS NULL')).id })).body.status).toBe('NOT_REGISTERED')
    await manual(c.dth, { participant_id: dth.id })
    expect((await look(c.dth, { qr_token: dth.qr_token })).body).toMatchObject({ status: 'ALREADY', venue: 'DTH' })
    expect(await checkins()).toBe(1)
  })
  it('needs an operator and a valid body', async () => {
    await confirmedDemo()
    expect((await look(undefined, { qr_token: 'x' })).status).toBe(401)
    expect((await look(c.root, { qr_token: 'x' })).status).toBe(403)
    expect((await look(c.dth, {})).status).toBe(422)
  })
})

