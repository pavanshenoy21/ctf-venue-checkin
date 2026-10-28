import jsQR from 'jsqr'
import { simpleParser, type ParsedMail } from 'mailparser'
import { PNG } from 'pngjs'
import { SMTPServer } from 'smtp-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as emailsCsvGET } from '@/app/api/admin/emails/export.csv/route'
import { GET as emailsGET } from '@/app/api/admin/emails/route'
import { POST as sendPOST } from '@/app/api/admin/emails/send/route'
import { closePool, one, q } from '@/lib/db'
import { waitForSendJob } from '@/lib/mailer'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { confirmedDemo, importDemo, participant } from '../helpers/world'

// A real SMTP server on a random local port that records everything it receives.
let server: SMTPServer
let port = 0
const inbox: ParsedMail[] = []
const reject = new Set<string>()
beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onRcptTo(addr, _s, cb) { reject.has(addr.address) ? cb(new Error('550 mailbox unavailable')) : cb() },
    // keepCidLinks: leave cid: references as sent, instead of inlining them as data: URIs
    onData(stream, _s, cb) { simpleParser(stream, { keepCidLinks: true }).then((m) => { inbox.push(m); cb() }, cb) },
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  port = (server.server.address() as { port: number }).port
})
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); await closePool() })

let root = ''
const smtpOn = () => Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_FROM: 'ctf@organizers.test', SMTP_SECURITY: 'none' })
beforeEach(async () => { await resetDb(); resetRateLimits(); await seedAdmins(); root = await login('root'); inbox.length = 0; reject.clear() })
afterEach(() => { for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_SECURITY']) delete process.env[k] })

const send = (body: unknown) => call(sendPOST, 'POST', '/api/admin/emails/send', { cookie: root, body })
const preview = (qs = '') => call(emailsGET, 'GET', `/api/admin/emails${qs}`, { cookie: root })
const decode = (png: Buffer) => { const i = PNG.sync.read(png); return jsQR(new Uint8ClampedArray(i.data), i.width, i.height)?.data }

describe('email preview and export', () => {
  it('need confirmed venues', async () => {
    await importDemo()
    expect((await preview()).status).toBe(409)
    expect((await call(emailsCsvGET, 'GET', '/api/admin/emails/export.csv', { cookie: root })).status).toBe(409)
  })
  it('preview each personalised email, with the QR served from the admin route', async () => {
    await confirmedDemo()
    const r = (await preview('?offset=0&limit=5')).body
    expect(r).toMatchObject({ total: 171, smtp_configured: false, sent: 0, failed: 0 })
    expect(r.items).toHaveLength(5)
    expect(r.items[0].text).toContain('ISE SEMINAR HALL')
    expect(r.items[0].html).toContain(`src="/api/admin/qr/${r.items[0].id}.png"`)
    const last = (await preview('?offset=170&limit=5')).body.items[0]
    expect(last.text).toContain('You are participating without a team.')
  })
  it('export a mail-merge CSV pointing at the public QR image', async () => {
    await confirmedDemo()
    const csv = (await call(emailsCsvGET, 'GET', '/api/admin/emails/export.csv', { cookie: root })).body as string
    expect(csv.split('\r\n')[0]).toBe('to,name,team,venue,subject,body_text,body_html,qr_url,qr_image_url,qr_file')
    expect(csv).toMatch(/https:\/\/ctf\.test\/api\/public\/qr\/[A-Za-z0-9_-]{32}\.png/)
  })
})

describe('sending', () => {
  it('is refused without SMTP settings or before confirmation', async () => {
    await confirmedDemo()
    expect((await send({})).body.error).toMatch(/SMTP is not configured/)
    await resetDb(); await seedAdmins(); root = await login('root'); await importDemo(); smtpOn()
    expect((await send({})).status).toBe(409)
  })
  it('delivers a test email with the QR attached inline', async () => {
    await confirmedDemo(); smtpOn()
    const p = await participant("assigned_venue = 'ISE'")
    expect((await send({ only_email: p.email.toUpperCase(), resend: true })).body).toEqual({ queued: 1 })
    await waitForSendJob()
    expect(inbox).toHaveLength(1)
    const m = inbox[0]!
    expect(m.to && 'text' in m.to ? m.to.text : '').toBe(p.email)
    expect(m.subject).toBe('CTF Venue & Check-in Details')
    expect(m.text).toContain('ISE SEMINAR HALL')
    const att = m.attachments[0]!
    expect(att.contentType).toBe('image/png')
    expect(m.html).toContain(`cid:${att.cid}`)
    expect(decode(att.content)).toBe(`https://ctf.test/checkin/${p.qr_token}`)
    expect((await one<{ sent: Date | null }>('SELECT email_sent_at AS sent FROM participants WHERE id = $1', [p.id]))!.sent).toBeTruthy()
  })
  it('sends to everyone unsent once, then nothing more unless asked to resend', { timeout: 60_000 }, async () => {
    await confirmedDemo(); smtpOn()
    expect((await send({})).body).toEqual({ queued: 171 })
    await waitForSendJob()
    expect(inbox).toHaveLength(171)
    expect(new Set(inbox.map((m) => (m.to && 'text' in m.to ? m.to.text : ''))).size).toBe(171)
    expect((await preview()).body).toMatchObject({ sent: 171, failed: 0 })
    expect((await send({})).body).toEqual({ queued: 0 })
    await waitForSendJob()
    expect((await send({ resend: true })).body).toEqual({ queued: 171 })
    await waitForSendJob()
  })
  it('records a failed address and retries it on the next send', { timeout: 60_000 }, async () => {
    await confirmedDemo(); smtpOn()
    const p = await participant('team_id IS NULL')
    reject.add(p.email)
    await send({}); await waitForSendJob()
    expect(inbox).toHaveLength(170)
    expect((await preview()).body).toMatchObject({ sent: 170, failed: 1 })
    expect((await one<{ e: string }>('SELECT email_error AS e FROM participants WHERE id = $1', [p.id]))!.e).toMatch(/550/)
    reject.clear()
    expect((await send({})).body).toEqual({ queued: 1 })
    await waitForSendJob()
    expect((await preview()).body).toMatchObject({ sent: 171, failed: 0 })
  })
  it('allows only one job at a time', { timeout: 60_000 }, async () => {
    await confirmedDemo(); smtpOn()
    await send({})
    expect((await send({})).body.error).toMatch(/already running/)
    await waitForSendJob()
  })
  it('validates the request body', async () => {
    await confirmedDemo(); smtpOn()
    expect((await send({ resend: 'yes' })).status).toBe(422)
    expect((await send({ only_email: 'x'.repeat(300) })).status).toBe(422)
  })
})
