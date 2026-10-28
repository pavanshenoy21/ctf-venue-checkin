import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as checkinPOST } from '@/app/api/operator/checkin/route'
import { GET as dashGET } from '@/app/api/operator/dashboard/route'
import { closePool, one, q } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { confirmedDemo, importDemo, participant } from '../helpers/world'

let c: Record<'root' | 'dth' | 'ise', string>
beforeEach(async () => {
  await resetDb(); resetRateLimits(); await seedAdmins()
  c = { root: await login('root'), dth: await login('dth'), ise: await login('ise') }
})
afterEach(() => { delete process.env.RATE_CHECKIN_PER_MIN })
afterAll(closePool)

const scan = (cookie: string, body: unknown, path = '/api/operator/checkin', headers: Record<string, string> = {}) =>
  call(checkinPOST, 'POST', path, { cookie, body, headers })
const checkins = async () => (await one<{ n: number }>('SELECT count(*)::int AS n FROM check_ins'))!.n
const ISE = () => participant("assigned_venue = 'ISE'")
const DTH = () => participant("assigned_venue = 'DTH' AND team_id IS NOT NULL")

describe('venue security matrix', () => {
  beforeEach(confirmedDemo)
  const cases = [['dth', 'DTH', true], ['dth', 'ISE', false], ['ise', 'ISE', true], ['ise', 'DTH', false]] as const
  for (const [op, venue, accept] of cases) {
    it(`${op.toUpperCase()} operator + ${venue} participant -> ${accept ? 'ACCEPT' : 'REJECT'}`, async () => {
      const p = venue === 'ISE' ? await ISE() : await DTH()
      const r = await scan(c[op], { qr_token: p.qr_token })
      if (accept) {
        expect([r.status, r.body.status]).toEqual([200, 'SUCCESS'])
        expect(r.body).toMatchObject({ name: p.name, assigned_venue: venue, current_venue: venue })
        expect(await checkins()).toBe(1)
      } else {
        expect([r.status, r.body.status]).toEqual([409, 'WRONG_VENUE'])
        expect(r.body).toMatchObject({ name: p.name, assigned_venue: venue, current_venue: op.toUpperCase() })
        expect(r.body.checked_in_at).toBeUndefined()
        expect(await checkins()).toBe(0)
        expect((await one<{ ci: boolean }>('SELECT checked_in AS ci FROM participants WHERE id = $1', [p.id]))!.ci).toBe(false)
      }
    })
  }
  it('people without a team are DTH-only', async () => {
    const solo = await participant('team_id IS NULL')
    expect((await scan(c.ise, { qr_token: solo.qr_token })).body.status).toBe('WRONG_VENUE')
    expect((await scan(c.dth, { qr_token: solo.qr_token })).body.status).toBe('SUCCESS')
  })
})

describe('the request cannot choose the venue', () => {
  beforeEach(confirmedDemo)
  it('ignores venue fields in the body', async () => {
    const p = await ISE()
    for (const extra of [{ venue: 'ISE' }, { venue: 'DTH' }, { current_venue: 'ISE' }, { operator_venue: 'ISE' }, { assigned_venue: 'DTH' }, { operator: { venue: 'ISE' } }])
      expect((await scan(c.dth, { qr_token: p.qr_token, ...extra })).body.status).toBe('WRONG_VENUE')
    expect(await checkins()).toBe(0)
  })
  it('ignores venue in the query string and headers', async () => {
    const p = await ISE()
    const r = await scan(c.dth, { qr_token: p.qr_token }, '/api/operator/checkin?venue=ISE', { 'x-venue': 'ISE', 'x-operator-venue': 'ISE' })
    expect(r.body.status).toBe('WRONG_VENUE')
    expect(await checkins()).toBe(0)
  })
  it('records the check-in against the operator who scanned', async () => {
    const p = await ISE()
    await scan(c.ise, { qr_token: p.qr_token })
    expect(await one("SELECT c.venue, a.username FROM check_ins c JOIN admins a ON a.id = c.operator_id")).toEqual({ venue: 'ISE', username: 'ise' })
  })
})

describe('check-in flow', () => {
  beforeEach(confirmedDemo)
  it('first scan checks in; a repeat shows the original time and adds nothing', async () => {
    const p = await DTH()
    const first = await scan(c.dth, { qr_token: p.qr_token })
    const again = await scan(c.dth, { qr_token: `https://ctf.test/checkin/${p.qr_token}` })   // the scanned URL form
    expect([first.body.status, again.body.status]).toEqual(['SUCCESS', 'ALREADY'])
    expect(again.status).toBe(200)
    expect(again.body.checked_in_at).toBe(first.body.checked_in_at)
    expect(again.body.venue).toBe('DTH')
    expect(await checkins()).toBe(1)
  })
  it('a participant already checked in is still WRONG_VENUE at the other hall', async () => {
    const p = await ISE()
    await scan(c.ise, { qr_token: p.qr_token })
    expect((await scan(c.dth, { qr_token: p.qr_token })).body.status).toBe('WRONG_VENUE')
  })
  it('unknown and malformed codes are INVALID and reveal nothing', async () => {
    for (const t of ['A'.repeat(32), 'nonsense', '../../etc/passwd', "' OR 1=1 --", 'https://evil.test/checkin/short']) {
      const r = await scan(c.dth, { qr_token: t })
      expect([r.status, r.body]).toEqual([404, { status: 'INVALID' }])
    }
  })
  it('validates the body', async () => {
    expect((await scan(c.dth, {})).status).toBe(422)
    expect((await scan(c.dth, { qr_token: '' })).status).toBe(422)
    expect((await scan(c.dth, { qr_token: 'x'.repeat(601) })).status).toBe(422)
    expect((await scan(c.dth, { qr_token: 123 })).status).toBe(422)
    expect((await scan(c.dth, 'not json')).status).toBe(400)
  })
  it('wrong-venue and invalid responses carry no email, id or token', async () => {
    const p = await ISE()
    const r = await scan(c.dth, { qr_token: p.qr_token })
    expect(Object.keys(r.body).sort()).toEqual(['assigned_venue', 'current_venue', 'name', 'status', 'team'])
    expect(JSON.stringify(r.body)).not.toContain(p.email)
  })
})

describe('who may check people in', () => {
  it('nobody before the venues are confirmed', async () => {
    await importDemo()
    const p = await participant('true')
    const r = await scan(c.dth, { qr_token: p.qr_token })
    expect([r.status, r.body.status]).toEqual([409, 'NOT_READY'])
    expect(await checkins()).toBe(0)
  })
  it('only signed-in venue operators', async () => {
    await confirmedDemo()
    const p = await DTH()
    expect((await scan('', { qr_token: p.qr_token })).status).toBe(401)
    expect((await scan('ctf_session=forged', { qr_token: p.qr_token })).status).toBe(401)
    expect((await scan(c.root, { qr_token: p.qr_token })).status).toBe(403)
    expect((await call(checkinPOST, 'POST', '/api/operator/checkin', { cookie: c.dth, body: { qr_token: p.qr_token }, csrf: false })).status).toBe(400)
    expect(await checkins()).toBe(0)
  })
})

describe('under load', () => {
  beforeEach(confirmedDemo)
  it('20 simultaneous scans of one person from two sessions give exactly one check-in', async () => {
    const second = await login('ise')
    const p = await ISE()
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(i % 2 ? c.ise : second, { qr_token: p.qr_token })))
    const statuses = rs.map((r) => r.body.status)
    expect(statuses.filter((s) => s === 'SUCCESS')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'ALREADY')).toHaveLength(19)
    expect(new Set(rs.map((r) => r.body.checked_in_at)).size).toBe(1)
    expect(await checkins()).toBe(1)
  })
  it('DTH and ISE scanning the same ISE person at once: ISE wins, DTH is told wrong venue', async () => {
    const p = await ISE()
    const [d, i] = await Promise.all([scan(c.dth, { qr_token: p.qr_token }), scan(c.ise, { qr_token: p.qr_token })])
    expect([d.body.status, i.body.status]).toEqual(['WRONG_VENUE', 'SUCCESS'])
  })
  it('a whole queue checks in correctly, in parallel', async () => {
    const people = await q<{ qr_token: string }>("SELECT qr_token FROM participants WHERE assigned_venue = 'DTH'")
    const rs = await Promise.all(people.map((p) => scan(c.dth, { qr_token: p.qr_token })))
    expect(rs.every((r) => r.body.status === 'SUCCESS')).toBe(true)
    expect(await checkins()).toBe(58)
  })
  it('rate limits each operator separately', async () => {
    process.env.RATE_CHECKIN_PER_MIN = '3'
    const p = await DTH()
    const codes = []
    for (let i = 0; i < 4; i++) codes.push((await scan(c.dth, { qr_token: p.qr_token })).status)
    expect(codes).toEqual([200, 200, 200, 429])
    expect((await scan(c.ise, { qr_token: p.qr_token })).status).toBe(409)   // ISE's own budget is untouched
  })
})

describe('operator dashboard', () => {
  it('shows only the operator\'s own venue', async () => {
    await confirmedDemo()
    const ise = await ISE(), dth = await DTH()
    await scan(c.ise, { qr_token: ise.qr_token }); await scan(c.dth, { qr_token: dth.qr_token })
    const d = (await call(dashGET, 'GET', '/api/operator/dashboard?venue=ISE', { cookie: c.dth })).body
    expect(d).toMatchObject({ venue: 'DTH', label: 'DTH', capacity: 145, assigned: 58, checked_in: 1, remaining: 57, percent: 1.7 })
    expect(d.recent.map((r: { name: string }) => r.name)).toEqual([dth.name])
    const i = (await call(dashGET, 'GET', '/api/operator/dashboard', { cookie: c.ise })).body
    expect(i).toMatchObject({ venue: 'ISE', label: 'ISE SEMINAR HALL', assigned: 113, checked_in: 1 })
  })
  it('is for venue operators only', async () => {
    expect((await call(dashGET, 'GET', '/api/operator/dashboard', { cookie: c.root })).status).toBe(403)
    expect((await call(dashGET, 'GET', '/api/operator/dashboard')).status).toBe(401)
  })
})
