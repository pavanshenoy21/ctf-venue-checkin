import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as commitPOST } from '@/app/api/admin/import/commit/route'
import { POST as previewPOST } from '@/app/api/admin/import/preview/route'
import { GET as allocGET } from '@/app/api/admin/allocation/route'
import { POST as confirmPOST } from '@/app/api/admin/allocation/confirm/route'
import { POST as generatePOST } from '@/app/api/admin/allocation/generate/route'
import { closePool, one, q } from '@/lib/db'
import { demoCsv } from '@/lib/demo'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, csvForm, login, seedAdmins } from '../helpers/http'

let root = ''
beforeEach(async () => { await resetDb(); resetRateLimits(); await seedAdmins(); root = await login('root') })
afterEach(() => { delete process.env.ISE_CAPACITY; delete process.env.DTH_CAPACITY })
afterAll(closePool)

const preview = (body: unknown) => call(previewPOST, 'POST', '/api/admin/import/preview', { cookie: root, body })
const commit = (body: unknown) => call(commitPOST, 'POST', '/api/admin/import/commit', { cookie: root, body })
const generate = () => call(generatePOST, 'POST', '/api/admin/allocation/generate', { cookie: root })
const confirm = () => call(confirmPOST, 'POST', '/api/admin/allocation/confirm', { cookie: root })
const report = () => call(allocGET, 'GET', '/api/admin/allocation', { cookie: root })
const count = async (sql: string) => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`))!.n
const status = async () => (await one<{ s: string }>('SELECT allocation_status AS s FROM event_state'))!.s

describe('import', () => {
  it('previews without changing anything', async () => {
    const r = await preview(csvForm(demoCsv()))
    expect(r.status).toBe(200)
    expect(r.body.summary).toMatchObject({ participants: 171, teams: 61, no_team: 10, teams_3: 45, teams_2: 10, teams_1: 6 })
    expect(r.body.errors).toEqual([])
    expect(await count('participants')).toBe(0)
  })
  it('imports teams and participants, each with a unique valid QR token', async () => {
    const r = await commit(csvForm(demoCsv()))
    expect([r.status, r.body.participants]).toEqual([200, 171])
    expect(await count('participants')).toBe(171)
    expect(await count('teams')).toBe(61)
    expect(await count("participants WHERE qr_token !~ '^[A-Za-z0-9_-]{32}$'")).toBe(0)
    expect(await count('(SELECT DISTINCT qr_token FROM participants) x')).toBe(171)
    expect(await count('participants WHERE team_id IS NULL')).toBe(10)
    expect(await status()).toBe('NONE')
  })
  it('replaces the previous import and issues fresh QR tokens', async () => {
    await commit(csvForm(demoCsv()))
    const old = (await q<{ qr_token: string }>('SELECT qr_token FROM participants')).map((r) => r.qr_token)
    await commit(csvForm('Team,Full Name,Email\nOwls,Ann,ann@x.io\n'))
    expect(await count('participants')).toBe(1)
    expect(await count(`participants WHERE qr_token = ANY($1)`.replace('$1', `'{${old.join(',')}}'`))).toBe(0)
  })
  it('refuses a CSV with errors and leaves the database untouched', async () => {
    await commit(csvForm(demoCsv()))
    const r = await commit(csvForm('Team,Full Name,Email\n' + [1, 2, 3, 4].map((i) => `Big,P${i},p${i}@x.io`).join('\n')))
    expect(r.status).toBe(422)
    expect(r.body.detail.join()).toMatch(/maximum is 3/)
    expect(await count('participants')).toBe(171)
  })
  it('rejects missing, non-multipart and oversized uploads', async () => {
    expect((await commit(new FormData())).status).toBe(400)
    expect((await commit({ file: 'x' })).status).toBe(400)
    expect((await commit(csvForm(new Uint8Array(2_000_001)))).status).toBe(413)
  })
  it('is blocked once venues are confirmed', async () => {
    await commit(csvForm(demoCsv())); await generate(); await confirm()
    const r = await commit(csvForm(demoCsv()))
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/confirmed/)
  })
})

describe('assign venues', () => {
  it('needs participants first', async () => {
    expect((await generate()).status).toBe(409)
  })
  it('fills ISE with 3-member teams, keeps teams whole and puts no-team people in DTH', async () => {
    await commit(csvForm(demoCsv()))
    const r = await generate()
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('DRAFT')
    expect(r.body.venues.ISE).toMatchObject({ participants: 113, capacity: 113, remaining: 0, teams_3: 37, teams_2: 1, teams_1: 0, no_team: 0 })
    expect(r.body.venues.DTH).toMatchObject({ participants: 58, capacity: 145, teams_3: 8, teams_2: 9, teams_1: 6, no_team: 10 })
    expect(r.body.validation_errors).toEqual([])
    expect(await count(`(SELECT team_id FROM participants WHERE team_id IS NOT NULL GROUP BY team_id HAVING count(DISTINCT assigned_venue) > 1) x`)).toBe(0)
    expect(await count("participants WHERE team_id IS NULL AND assigned_venue <> 'DTH'")).toBe(0)
    expect(r.body.teams.map((t: { size: number }) => t.size)).toEqual([...r.body.teams.map((t: { size: number }) => t.size)].sort((a, b) => b - a))
  })
  it('can be re-run before confirmation and gives the same result', async () => {
    await commit(csvForm(demoCsv()))
    await generate()
    const a = await q('SELECT id, assigned_venue FROM participants ORDER BY id')
    await generate()
    expect(await q('SELECT id, assigned_venue FROM participants ORDER BY id')).toEqual(a)
  })
  it('reports an impossible allocation with the conflicting teams and assigns nobody', async () => {
    process.env.ISE_CAPACITY = '3'; process.env.DTH_CAPACITY = '3'
    await commit(csvForm('Team,Full Name,Email\n' + ['A', 'B', 'C'].flatMap((t) => [1, 2, 3].map((i) => `${t},${t}${i},${t}${i}@x.io`)).join('\n')))
    const r = await generate()
    expect(r.status).toBe(422)
    expect(r.body.error).toMatch(/^ALLOCATION NOT POSSIBLE/)
    expect(r.body.detail).toEqual([{ name: 'B', size: 3 }, { name: 'C', size: 3 }])
    expect(await count('participants WHERE assigned_venue IS NOT NULL')).toBe(0)
    expect(await status()).toBe('NONE')
  })
  it('too many no-team people is impossible too', async () => {
    await commit(csvForm('Team,Full Name,Email\n' + Array.from({ length: 150 }, (_, i) => `,N${i},n${i}@x.io`).join('\n')))
    const r = await generate()
    expect(r.status).toBe(422)
    expect(r.body.error).toMatch(/150 no-team participants must be in DTH/)
  })
})

describe('confirm venues', () => {
  it('needs a draft first', async () => {
    await commit(csvForm(demoCsv()))
    expect((await confirm()).status).toBe(409)
  })
  it('makes the allocation final', async () => {
    await commit(csvForm(demoCsv())); await generate()
    const r = await confirm()
    expect([r.status, r.body.status]).toEqual([200, 'CONFIRMED'])
    expect(r.body.confirmed_at).toBeTruthy()
    expect((await confirm()).status).toBe(409)
    expect((await generate()).status).toBe(409)
    expect((await report()).body.status).toBe('CONFIRMED')
  })
  it('refuses when validation fails, e.g. a hall shrank after assignment', async () => {
    await commit(csvForm(demoCsv())); await generate()
    process.env.ISE_CAPACITY = '100'
    const r = await confirm()
    expect(r.status).toBe(422)
    expect(r.body.detail.join()).toMatch(/ISE over capacity: 113 \/ 100/)
    expect(await status()).toBe('DRAFT')
  })
  it('stays consistent when confirm and re-import race each other', async () => {
    await commit(csvForm(demoCsv())); await generate()
    const [c, i] = await Promise.all([confirm(), commit(csvForm(demoCsv()))])
    const s = await status()
    if (s === 'CONFIRMED') {
      expect(c.status).toBe(200)
      expect(i.status).toBe(409)
      expect(await count('participants WHERE assigned_venue IS NULL')).toBe(0)
    } else {
      expect(i.status).toBe(200)
      expect(c.status).toBe(409)
      expect(s).toBe('NONE')
    }
  })
})
