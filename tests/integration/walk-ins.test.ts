import jsQR from 'jsqr'
import { simpleParser, type ParsedMail } from 'mailparser'
import { PNG } from 'pngjs'
import { SMTPServer } from 'smtp-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as checkinPOST } from '@/app/api/operator/checkin/route'
import { GET as listGET } from '@/app/api/admin/walk-ins/route'
import { POST as sendQrPOST } from '@/app/api/admin/walk-ins/send-qr/route'
import { POST as teamPOST } from '@/app/api/admin/walk-ins/team/route'
import { closePool, one, q } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { confirmedDemo, importDemo, participant } from '../helpers/world'

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

let root = ''
const smtpOn = () => Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_FROM: 'ctf@organizers.test', SMTP_SECURITY: 'none' })
beforeEach(async () => { await resetDb(); resetRateLimits(); await seedAdmins(); root = await login('root'); inbox.length = 0; reject.clear() })
afterEach(() => { for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_SECURITY']) delete process.env[k] })

const list = () => call(listGET, 'GET', '/api/admin/walk-ins', { cookie: root })
const register = (body: unknown) => call(teamPOST, 'POST', '/api/admin/walk-ins/team', { cookie: root, body })
const sendQr = (id: unknown) => call(sendQrPOST, 'POST', '/api/admin/walk-ins/send-qr', { cookie: root, body: { id } })
const decode = (png: Buffer) => { const i = PNG.sync.read(png); return jsQR(new Uint8ClampedArray(i.data), i.width, i.height)?.data }
const solos = async (n: number) => (await q<{ id: number; name: string; email: string; qr_token: string }>(
  'SELECT id, name, email, qr_token FROM participants WHERE team_id IS NULL ORDER BY id LIMIT $1', [n]))
const qrOf = (m: ParsedMail) => m.attachments.find((a) => a.filename !== 'email-logo.png')!

describe('walk-in list', () => {
  it('needs confirmed venues', async () => {
    await importDemo()
    expect((await list()).status).toBe(409)
  })
  it('lists everyone without a team', async () => {
    await confirmedDemo()
    const r = (await list()).body
    expect(r.people).toHaveLength(10)
    expect(r.people[0]).toMatchObject({ team: null, qr_sent_at: null, checked_in: false })
  })
})

describe('register a walk-in team', () => {
  it('makes a DTH team from people without one and emails each their QR', async () => {
    await confirmedDemo(); smtpOn()
    const [a, b] = await solos(2)
    const r = await register({ name: 'Late Owls', member_ids: [a!.id, b!.id] })
    expect(r.status).toBe(201)
    expect(r.body.team.name).toBe('Late Owls')
    expect(r.body.members.map((m: { qr: string }) => m.qr)).toEqual(['sent', 'sent'])
    expect(await one("SELECT 1 FROM teams WHERE name = 'Late Owls' AND assigned_venue = 'DTH' AND walk_in AND participant_count = 2")).toBeTruthy()
    expect(inbox).toHaveLength(2)
    const m = inbox.find((x) => (x.to && 'text' in x.to ? x.to.text : '') === a!.email)!
    expect(m.subject).toBe('Your CTF Check-in QR')
    expect(m.text).toContain('Team:\nLate Owls')
    expect(decode(qrOf(m).content)).toBe(`https://ctf.test/checkin/${a!.qr_token}`)
    const people = (await list()).body.people
    expect(people).toHaveLength(10) // walk-in teams stay on the list
    expect(people.filter((p: { qr_sent_at: string | null }) => p.qr_sent_at)).toHaveLength(2)
  })
  it('registers someone going solo, naming the team after them when the name is blank', async () => {
    await confirmedDemo(); smtpOn()
    const [a] = await solos(1)
    const r = await register({ member_ids: [a!.id] })
    expect(r.body.team.name).toBe(a!.name)
  })
  it('adds a person who was not on the list, with their details', async () => {
    await confirmedDemo(); smtpOn()
    const [a] = await solos(1)
    const r = await register({ name: 'Newcomers', member_ids: [a!.id], new_members: [{ name: 'Nia Rao', email: 'NIA@x.io', phone: '+91 98450 00000', sap_id: 'RVCE24CS001', year: '2nd Year', branch: 'CSE' }] })
    expect(r.status).toBe(201)
    const p = await one<{ email: string; phone: string; assigned_venue: string; qr_token: string }>("SELECT email, phone, assigned_venue, qr_token FROM participants WHERE name = 'Nia Rao'")
    expect(p).toMatchObject({ email: 'nia@x.io', phone: '+91 98450 00000', assigned_venue: 'DTH' })
    expect(p!.qr_token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(inbox).toHaveLength(2)
  })
  it('checks in at DTH with the emailed QR', async () => {
    await confirmedDemo(); smtpOn()
    const [a] = await solos(1)
    await register({ member_ids: [a!.id] })
    const dth = await login('dth')
    const r = await call(checkinPOST, 'POST', '/api/operator/checkin', { cookie: dth, body: { qr_token: a!.qr_token } })
    expect(r.body.status).toBe('SUCCESS')
  })
  it('can skip the emails', async () => {
    await confirmedDemo(); smtpOn()
    const [a] = await solos(1)
    expect((await register({ member_ids: [a!.id], send_qr: false })).body.members[0].qr).toBe('not_sent')
    expect(inbox).toHaveLength(0)
  })
  it('keeps the team when an email fails, and the QR can be resent', async () => {
    await confirmedDemo(); smtpOn()
    const [a] = await solos(1)
    reject.add(a!.email)
    const r = await register({ member_ids: [a!.id] })
    expect(r.status).toBe(201)
    expect(r.body.members[0]).toMatchObject({ qr: 'failed' })
    reject.clear()
    expect((await sendQr(a!.id)).status).toBe(200)
    expect(inbox).toHaveLength(1)
  })
  it('refuses bad requests and changes nothing', async () => {
    await confirmedDemo(); smtpOn()
    const [a, b, c, d] = await solos(4)
    const team = await participant('team_id IS NOT NULL')
    const before = (await one<{ n: number }>('SELECT count(*)::int AS n FROM teams'))!.n
    expect((await register({ name: 'Too many', member_ids: [a!.id, b!.id, c!.id, d!.id] })).status).toBe(422)
    expect((await register({ name: 'Nobody' })).status).toBe(422)
    expect((await register({ member_ids: [a!.id, b!.id] })).body.error).toMatch(/team name/)
    expect((await register({ name: 'Dup', member_ids: [a!.id, a!.id] })).status).toBe(422)
    expect((await register({ name: 'Mixed', member_ids: [a!.id, team.id] })).body.error).toMatch(/Already in a team/)
    expect((await register({ name: 'Ghost', member_ids: [999999] })).status).toBe(404)
    const existing = (await one<{ name: string }>('SELECT name FROM teams LIMIT 1'))!.name
    expect((await register({ name: existing.toUpperCase(), member_ids: [a!.id] })).body.error).toMatch(/already exists/)
    expect((await register({ name: 'Copy', new_members: [{ name: 'X', email: team.email }] })).body.error).toMatch(/already registered/)
    expect((await register({ name: 'Bad', new_members: [{ name: 'X', email: 'not-an-email' }] })).status).toBe(422)
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM teams'))!.n).toBe(before)
    expect(inbox).toHaveLength(0)
    // and a person can only join one walk-in team
    await register({ name: 'First', member_ids: [a!.id] })
    expect((await register({ name: 'Second', member_ids: [a!.id] })).status).toBe(409)
  })
  it('needs confirmed venues', async () => {
    await importDemo()
    const [a] = await solos(1)
    expect((await register({ member_ids: [a!.id] })).status).toBe(409)
  })
})

describe('send a walk-in their QR', () => {
  it('refuses people who registered with a team, unknown ids, bad ids, and missing SMTP', async () => {
    await confirmedDemo()
    const [solo] = await solos(1)
    expect((await sendQr(solo!.id)).body.error).toMatch(/SMTP is not configured/)
    smtpOn()
    expect((await sendQr((await participant('team_id IS NOT NULL')).id)).status).toBe(409)
    expect((await sendQr(999999)).status).toBe(404)
    expect((await sendQr('1')).status).toBe(422)
    expect(inbox).toHaveLength(0)
  })
  it('records a failure', async () => {
    await confirmedDemo(); smtpOn()
    const [p] = await solos(1)
    reject.add(p!.email)
    expect((await sendQr(p!.id)).status).toBe(502)
    expect((await one<{ e: string }>('SELECT qr_error AS e FROM participants WHERE id = $1', [p!.id]))!.e).toMatch(/550/)
  })
})
