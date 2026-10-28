import { afterAll, describe, expect, it } from 'vitest'
import { POST as commitPOST } from '@/app/api/admin/import/commit/route'
import { POST as confirmPOST } from '@/app/api/admin/allocation/confirm/route'
import { POST as generatePOST } from '@/app/api/admin/allocation/generate/route'
import { GET as exportGET } from '@/app/api/admin/export/checkins.csv/route'
import { GET as statsGET } from '@/app/api/admin/stats/route'
import { POST as checkinPOST } from '@/app/api/operator/checkin/route'
import { GET as venueGET } from '@/app/api/public/venue/[token]/route'
import { closePool, q } from '@/lib/db'
import { qrUrl } from '@/lib/qr'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, csvForm, login, seedAdmins } from '../helpers/http'

afterAll(closePool)

// The whole event through the HTTP handlers: import -> assign -> confirm -> participants look up
// their venue -> both halls scan everyone (including people at the wrong hall) -> export.
describe('event lifecycle', () => {
  it('runs end to end', { timeout: 60_000 }, async () => {
    await resetDb(); resetRateLimits(); await seedAdmins()
    const root = await login('root'), dth = await login('dth'), ise = await login('ise')
    const csv = ['Team,Full Name,Email',
      ...Array.from({ length: 40 }, (_, t) => [1, 2, 3].map((m) => `Trio${t},T${t}m${m},t${t}m${m}@x.io`)).flat(),
      ...Array.from({ length: 8 }, (_, t) => [1, 2].map((m) => `Duo${t},D${t}m${m},d${t}m${m}@x.io`)).flat(),
      ...Array.from({ length: 5 }, (_, t) => `Solo${t},S${t},s${t}@x.io`),
      ...Array.from({ length: 12 }, (_, i) => `(No team),N${i},n${i}@x.io`)].join('\n')
    expect((await call(commitPOST, 'POST', '/api/admin/import/commit', { cookie: root, body: csvForm(csv) })).body.participants).toBe(153)
    const plan = (await call(generatePOST, 'POST', '/api/admin/allocation/generate', { cookie: root })).body
    expect(plan.venues.ISE).toMatchObject({ participants: 113, teams_3: 37, teams_2: 1 })
    expect((await call(confirmPOST, 'POST', '/api/admin/allocation/confirm', { cookie: root })).body.status).toBe('CONFIRMED')

    const people = await q<{ qr_token: string; assigned_venue: 'DTH' | 'ISE' }>('SELECT qr_token, assigned_venue FROM participants')
    for (const p of people.slice(0, 10)) {
      const v = (await call(venueGET, 'GET', '', { params: { token: p.qr_token } })).body
      expect(v.venue).toBe(p.assigned_venue)
    }
    let wrong = 0
    for (const p of people) {
      const other = p.assigned_venue === 'ISE' ? dth : ise
      const mine = p.assigned_venue === 'ISE' ? ise : dth
      if ((await call(checkinPOST, 'POST', '/api/operator/checkin', { cookie: other, body: { qr_token: qrUrl(p.qr_token) } })).body.status === 'WRONG_VENUE') wrong++
      expect((await call(checkinPOST, 'POST', '/api/operator/checkin', { cookie: mine, body: { qr_token: qrUrl(p.qr_token) } })).body.status).toBe('SUCCESS')
    }
    expect(wrong).toBe(153)
    const s = (await call(statsGET, 'GET', '/api/admin/stats', { cookie: root })).body
    expect(s).toMatchObject({ checked_in: 153, not_checked_in: 0, percent: 100 })
    expect(s.breakdown.every((r: { present: number; participants: number }) => r.present === r.participants)).toBe(true)
    expect(s.breakdown[0]).toMatchObject({ teams_full: 40, teams_partial: 0, teams_absent: 0 })
    const csvOut = (await call(exportGET, 'GET', '/api/admin/export/checkins.csv', { cookie: root })).body as string
    expect(csvOut.trim().split('\r\n')).toHaveLength(154)
  })
})
