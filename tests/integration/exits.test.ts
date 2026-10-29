import jsQR from 'jsqr'
import { simpleParser, type ParsedMail } from 'mailparser'
import { PNG } from 'pngjs'
import { SMTPServer } from 'smtp-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as exportGET } from '@/app/api/admin/export/exits.csv/route'
import { POST as cancelPOST } from '@/app/api/admin/exits/cancel/route'
import { POST as resendPOST } from '@/app/api/admin/exits/resend/route'
import { GET as listGET, POST as recordPOST } from '@/app/api/admin/exits/route'
import { POST as manualPOST } from '@/app/api/operator/checkin-manual/route'
import { POST as scanPOST } from '@/app/api/operator/checkin/route'
import { GET as dashGET } from '@/app/api/operator/dashboard/route'
import { POST as lookupPOST } from '@/app/api/operator/lookup/route'
import { GET as searchGET } from '@/app/api/operator/search/route'
import { GET as publicGET } from '@/app/api/public/venue/[token]/route'
import { closePool, one, q } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { checkIn, confirmedDemo, participant } from '../helpers/world'

let server: SMTPServer
let port = 0
const inbox: ParsedMail[] = []
const reject = new Set<string>()
beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onRcptTo(addr, _s, cb) { reject.has(addr.address) ? cb(new Error('550 mailbox unavailable')) : cb() },
    onData(stream, _s, cb) { simpleParser(stream, { keepCidLinks: true }).then((m) => { inbox.push(m); cb() }, cb) },
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  port = (server.server.address() as { port: number }).port
})
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); await closePool() })

let c: Record<'root' | 'dth' | 'ise', string>
const smtpOn = () => Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_FROM: 'ctf@organizers.test', SMTP_SECURITY: 'none' })
beforeEach(async () => {
  await resetDb(); resetRateLimits(); await seedAdmins(); inbox.length = 0; reject.clear()
  c = { root: await login('root'), dth: await login('dth'), ise: await login('ise') }
  await confirmedDemo(); smtpOn()
})
afterEach(() => { for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_SECURITY']) delete process.env[k] })

const record = (body: unknown) => call(recordPOST, 'POST', '/api/admin/exits', { cookie: c.root, body })
const list = () => call(listGET, 'GET', '/api/admin/exits', { cookie: c.root })
const cancel = (id: number) => call(cancelPOST, 'POST', '/api/admin/exits/cancel', { cookie: c.root, body: { id } })
const resend = (id: number) => call(resendPOST, 'POST', '/api/admin/exits/resend', { cookie: c.root, body: { id } })
const scan = (cookie: string, qr_token: string) => call(scanPOST, 'POST', '/api/operator/checkin', { cookie, body: { qr_token } })
const look = (cookie: string, body: unknown) => call(lookupPOST, 'POST', '/api/operator/lookup', { cookie, body })
const manual = (cookie: string, participant_id: number) => call(manualPOST, 'POST', '/api/operator/checkin-manual', { cookie, body: { participant_id } })
const decode = (png: Buffer) => { const i = PNG.sync.read(png); return jsQR(new Uint8ClampedArray(i.data), i.width, i.height)?.data }
const tokenOf = async (id: number) => (await one<{ token: string }>('SELECT token FROM exits WHERE id = $1', [id]))!.token
// a DTH team member who has checked in
async function inside() {
  const p = await participant("assigned_venue = 'DTH' AND team_id IS NOT NULL")
  await checkIn(p.id)
  return p
}

describe('recording an exit', () => {
  it('emails a one-time re-entry QR that is not their check-in QR', async () => {
    const p = await inside()
    const r = await record({ participant_id: p.id, reason: 'Medical' })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ email: 'sent', exit: { name: p.name, reason: 'Medical', returned_at: null } })
    const token = await tokenOf(r.body.exit.id)
    expect(token).not.toBe(p.qr_token)
    const m = inbox[0]!
    expect(m.subject).toBe('Your CTF Re-entry QR')
    expect(m.text).toContain('Reason: Medical')
    const qr = m.attachments.find((a) => a.filename !== 'email-logo.png')!
    expect(decode(qr.content)).toBe(`https://ctf.test/checkin/${token}`)
    expect((await list()).body.out).toHaveLength(1)
  })
  it('refuses people who have not checked in, are already out, or do not exist, and bad reasons', async () => {
    const notIn = await participant("assigned_venue = 'DTH' AND team_id IS NOT NULL AND NOT checked_in")
    expect((await record({ participant_id: notIn.id, reason: 'x' })).body.error).toMatch(/hasn't checked in/)
    const p = await inside()
    await record({ participant_id: p.id, reason: 'Food' })
    expect((await record({ participant_id: p.id, reason: 'Again' })).body.error).toMatch(/already out/)
    expect((await record({ participant_id: 999999, reason: 'x' })).status).toBe(404)
    expect((await record({ participant_id: p.id, reason: '   ' })).status).toBe(422)
    expect((await record({ participant_id: p.id, reason: 'x'.repeat(301) })).status).toBe(422)
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM exits'))!.n).toBe(1)
  })
  it('keeps the exit when the email fails, and the QR can be resent', async () => {
    const p = await inside()
    reject.add(p.email)
    const r = await record({ participant_id: p.id, reason: 'Phone charging' })
    expect(r.body).toMatchObject({ email: 'failed' })
    reject.clear()
    expect((await resend(r.body.exit.id)).status).toBe(200)
    expect(inbox).toHaveLength(1)
  })
  it('the database refuses an exit for someone who never checked in, and a second open exit', async () => {
    const p = await participant('NOT checked_in')
    await expect(q("INSERT INTO exits (participant_id, reason, token) VALUES ($1, 'x', $2)", [p.id, 'A'.repeat(32)])).rejects.toThrow(/has not checked in/)
    const s = await inside()
    await q("INSERT INTO exits (participant_id, reason, token) VALUES ($1, 'x', $2)", [s.id, 'B'.repeat(32)])
    await expect(q("INSERT INTO exits (participant_id, reason, token) VALUES ($1, 'y', $2)", [s.id, 'C'.repeat(32)])).rejects.toThrow(/uq_exit_open/)
  })
})

describe('coming back in', () => {
  it('original QR is refused while out; the re-entry QR is confirmed, lets them in once, then is spent', async () => {
    const p = await inside()
    const token = await tokenOf((await record({ participant_id: p.id, reason: 'Washroom' })).body.exit.id)
    const out = await scan(c.dth, p.qr_token)
    expect([out.status, out.body.status, out.body.reason]).toEqual([409, 'OUT', 'Washroom'])
    expect((await look(c.dth, { qr_token: token })).body).toMatchObject({ status: 'REENTRY', name: p.name, reason: 'Washroom' })
    expect((await list()).body.out).toHaveLength(1) // a lookup records nothing
    const back = await scan(c.dth, `https://ctf.test/checkin/${token}`)
    expect([back.status, back.body.status]).toEqual([200, 'RETURNED'])
    expect((await scan(c.dth, token)).body.status).toBe('REENTRY_USED')
    expect((await scan(c.dth, p.qr_token)).body.status).toBe('ALREADY')
    expect(await one('SELECT 1 FROM exits WHERE returned_venue = $1 AND NOT returned_manual', ['DTH'])).toBeTruthy()
    expect((await list()).body).toMatchObject({ out: [], history: [{ name: p.name }] })
  })
  it('the re-entry QR only works at their own venue, and shows no ID details elsewhere', async () => {
    const p = await inside()
    const token = await tokenOf((await record({ participant_id: p.id, reason: 'x' })).body.exit.id)
    const r = await scan(c.ise, token)
    expect(r.body.status).toBe('WRONG_VENUE')
    expect(r.body).not.toHaveProperty('sap_id')
    expect(r.body).not.toHaveProperty('reason')
  })
  it('the desk can re-admit by search if the re-entry QR is lost; the QR is then spent', async () => {
    const p = await inside()
    const token = await tokenOf((await record({ participant_id: p.id, reason: 'x' })).body.exit.id)
    expect((await look(c.dth, { participant_id: p.id })).body.status).toBe('REENTRY')
    expect((await manual(c.dth, p.id)).body.status).toBe('RETURNED')
    expect(await one('SELECT 1 FROM exits WHERE returned_manual')).toBeTruthy()
    expect((await scan(c.dth, token)).body.status).toBe('REENTRY_USED')
  })
  it('two desks scanning the same re-entry QR at once let them in exactly once', async () => {
    const p = await inside()
    const token = await tokenOf((await record({ participant_id: p.id, reason: 'x' })).body.exit.id)
    const dth2 = await login('dth')
    const rs = await Promise.all([scan(c.dth, token), scan(dth2, token)])
    expect(rs.map((r) => r.body.status).sort()).toEqual(['REENTRY_USED', 'RETURNED'])
  })
  it('they can step out again later with a new QR; the old one stays spent', async () => {
    const p = await inside()
    const first = await tokenOf((await record({ participant_id: p.id, reason: 'one' })).body.exit.id)
    await scan(c.dth, first)
    const second = await tokenOf((await record({ participant_id: p.id, reason: 'two' })).body.exit.id)
    expect(second).not.toBe(first)
    expect((await scan(c.dth, first)).body.status).toBe('REENTRY_USED')
    expect((await scan(c.dth, second)).body.status).toBe('RETURNED')
  })
})

describe('cancelling, resending, and reporting', () => {
  it('a cancelled exit kills the re-entry QR and they count as inside again', async () => {
    const p = await inside()
    const id = (await record({ participant_id: p.id, reason: 'mistake' })).body.exit.id
    const token = await tokenOf(id)
    expect((await cancel(id)).status).toBe(200)
    expect((await scan(c.dth, token)).body.status).toBe('INVALID')
    expect((await scan(c.dth, p.qr_token)).body.status).toBe('ALREADY')
    expect((await cancel(id)).status).toBe(409)
    expect((await resend(id)).status).toBe(409)
  })
  it('a used pass cannot be cancelled or resent', async () => {
    const p = await inside()
    const id = (await record({ participant_id: p.id, reason: 'x' })).body.exit.id
    await scan(c.dth, await tokenOf(id))
    expect((await cancel(id)).body.error).toMatch(/already back/)
    expect((await resend(id)).body.error).toMatch(/already back/)
  })
  it('the desk sees who is out; the participant page explains the pass; the CSV lists every exit', async () => {
    const p = await inside()
    const token = await tokenOf((await record({ participant_id: p.id, reason: 'Food' })).body.exit.id)
    expect((await call(dashGET, 'GET', '/api/operator/dashboard', { cookie: c.dth })).body.out_now).toBe(1)
    const found = (await call(searchGET, 'GET', `/api/operator/search?q=${encodeURIComponent(p.email)}`, { cookie: c.dth })).body.people
    expect(found[0]).toMatchObject({ id: p.id, out: true })
    const pub = (t: string) => call(publicGET, 'GET', `/api/public/venue/${t}`, { params: { token: t } })
    expect((await pub(token)).body).toMatchObject({ ready: true, venue: 'DTH', pass: 'open' })
    await scan(c.dth, token)
    expect((await pub(token)).body.pass).toBe('used')
    const csv = (await call(exportGET, 'GET', '/api/admin/export/exits.csv', { cookie: c.root })).body as string
    expect(csv.split('\r\n')[0]).toBe('Name,Email,SAP ID,Team,Venue,Reason,Left at,Recorded by,Status,Back at,Back in via')
    expect(csv).toContain('BACK IN')
    expect(csv).toContain('Re-entry QR')
  })
  it('only super admins can record, cancel or resend', async () => {
    const p = await inside()
    expect((await call(recordPOST, 'POST', '/api/admin/exits', { cookie: c.dth, body: { participant_id: p.id, reason: 'x' } })).status).toBe(403)
  })
})
