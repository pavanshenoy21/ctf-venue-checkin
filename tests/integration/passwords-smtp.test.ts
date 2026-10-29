import { simpleParser, type ParsedMail } from 'mailparser'
import { SMTPServer } from 'smtp-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as exportGET } from '@/app/api/admin/export/passwords.csv/route'
import { POST as assignPOST } from '@/app/api/admin/passwords/assign/route'
import { GET as seedGET } from '@/app/api/admin/export/ctfd-seed.csv/route'
import { GET as listGET } from '@/app/api/admin/passwords/route'
import { POST as sendPOST } from '@/app/api/admin/passwords/send/route'
import { closePool, one, q } from '@/lib/db'
import { playerPassword, teamPassword, WORDS, waitForPasswordJob } from '@/lib/passwords'
import { resetRateLimits } from '@/lib/ratelimit'
import { createSender, resetSmtpRests, serverProblem } from '@/lib/smtp'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { checkIn, confirmedDemo, participant } from '../helpers/world'

// Two local SMTP servers: "main" can be told to refuse with a quota error; "backup" always accepts.
const boxes: Record<'main' | 'backup', ParsedMail[]> = { main: [], backup: [] }
let quota = false
const servers: SMTPServer[] = []
const ports: Record<'main' | 'backup', number> = { main: 0, backup: 0 }
const reject = new Set<string>()
async function start(name: 'main' | 'backup') {
  const s = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onMailFrom(_a, _s, cb) {
      if (name === 'main' && quota) return cb(Object.assign(new Error('5.4.5 Daily user sending limit exceeded'), { responseCode: 550 }))
      cb()
    },
    onRcptTo(addr, _s, cb) { reject.has(addr.address) ? cb(new Error('550 mailbox unavailable')) : cb() },
    onData(stream, _s, cb) { simpleParser(stream, { keepCidLinks: true }).then((m) => { boxes[name].push(m); cb() }, cb) },
  })
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  ports[name] = (s.server.address() as { port: number }).port
  servers.push(s)
}
beforeAll(async () => { await start('main'); await start('backup') })
afterAll(async () => { await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r())))); await closePool() })

const KEYS = ['PASSWORD_SEED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_SECURITY', 'SMTP2_HOST', 'SMTP2_PORT', 'SMTP2_FROM', 'SMTP2_SECURITY', 'CTF_URL']
const mainOn = (port = ports.main) => Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_FROM: 'main@organizers.test', SMTP_SECURITY: 'none' })
const backupOn = () => Object.assign(process.env, { SMTP2_HOST: '127.0.0.1', SMTP2_PORT: String(ports.backup), SMTP2_FROM: 'backup@organizers.test', SMTP2_SECURITY: 'none' })
let root = ''
beforeEach(async () => {
  await resetDb(); resetRateLimits(); resetSmtpRests(); await seedAdmins(); root = await login('root')
  boxes.main.length = 0; boxes.backup.length = 0; quota = false; reject.clear()
  process.env.PASSWORD_SEED = 'test-seed-0123456789abcdef'
})
afterEach(() => { for (const k of KEYS) delete process.env[k] })

const msg = (to: string) => ({ to, subject: 'hi', text: 'hi' })
const from = (m: ParsedMail) => (m.from && 'text' in m.from ? m.from.text : '')

describe('mail server failover', () => {
  it('uses the main server while it works', async () => {
    mainOn(); backupOn()
    const s = createSender()
    expect(await s.send(msg('a@x.io'))).toEqual({ via: 'primary' })
    s.close()
    expect([boxes.main.length, boxes.backup.length]).toEqual([1, 0])
  })
  it('moves to the backup when the main one is out of quota, and stays there', async () => {
    mainOn(); backupOn(); quota = true
    const s = createSender()
    expect(await s.send(msg('a@x.io'))).toEqual({ via: 'backup 1' })
    expect(await s.send(msg('b@x.io'))).toEqual({ via: 'backup 1' })
    s.close()
    expect(boxes.backup.map(from)).toEqual(['backup@organizers.test', 'backup@organizers.test'])
    // a later send skips the exhausted server instead of trying it first every time
    quota = false
    const s2 = createSender()
    expect((await s2.send(msg('c@x.io'))).via).toBe('backup 1')
    s2.close()
  })
  it('moves to the backup when the main one cannot be reached', async () => {
    mainOn(1); backupOn() // nothing listens on port 1
    const s = createSender()
    expect((await s.send(msg('a@x.io'))).via).toBe('backup 1')
    s.close()
  })
  it('does not switch servers because one recipient address is refused', async () => {
    mainOn(); backupOn(); reject.add('bad@x.io')
    const s = createSender()
    await expect(s.send(msg('bad@x.io'))).rejects.toThrow()
    expect((await s.send(msg('good@x.io'))).via).toBe('primary')
    s.close()
    expect(boxes.backup).toHaveLength(0)
  })
  it('fails when every server is out', async () => {
    mainOn(); quota = true
    const s = createSender()
    await expect(s.send(msg('a@x.io'))).rejects.toThrow(/limit exceeded/)
    s.close()
  })
  it('classifies errors', () => {
    expect(serverProblem(Object.assign(new Error('x'), { code: 'EAUTH' }))).toBe(true)
    expect(serverProblem(Object.assign(new Error('x'), { responseCode: 421 }))).toBe(true)
    expect(serverProblem(Object.assign(new Error('550 5.4.5 Daily user sending quota exceeded'), { responseCode: 550 }))).toBe(true)
    expect(serverProblem(Object.assign(new Error('550 no such user'), { responseCode: 550, command: 'RCPT TO' }))).toBe(false)
  })
})

describe('player passwords', () => {
  const list = () => call(listGET, 'GET', '/api/admin/passwords', { cookie: root })
  const assign = () => call(assignPOST, 'POST', '/api/admin/passwords/assign', { cookie: root })
  const send = (body: unknown = {}) => call(sendPOST, 'POST', '/api/admin/passwords/send', { cookie: root, body })

  it('gives everyone a fixed word + 4 digit password, the same after a re-import', async () => {
    await confirmedDemo()
    expect((await assign()).body).toEqual({ assigned: 171 })
    const rows = await q<{ email: string; password: string }>('SELECT email, password FROM participants ORDER BY email')
    for (const r of rows) {
      expect(r.password).toBe(playerPassword(r.email))
      expect(WORDS).toContain(/^([a-z]+)\d{4}$/.exec(r.password)![1])
    }
    expect((await assign()).body).toEqual({ assigned: 0 })
    // wipe and import again: same people, same passwords
    await resetDb(); await seedAdmins(); root = await login('root'); await confirmedDemo(); await assign()
    expect(await q('SELECT email, password FROM participants ORDER BY email')).toEqual(rows)
    // a different seed gives different passwords
    const before = playerPassword('a@x.io')
    process.env.PASSWORD_SEED = 'another-seed-0123456789abc'
    expect(playerPassword('a@x.io')).not.toBe(before)
    expect(playerPassword('A@X.io ')).toBe(playerPassword('a@x.io'))
  })
  it('needs PASSWORD_SEED', async () => {
    await confirmedDemo(); delete process.env.PASSWORD_SEED
    expect((await assign()).body.error).toMatch(/PASSWORD_SEED/)
  })
  it('exports a CTFd seed file with every player, their team, and both passwords', async () => {
    await confirmedDemo()
    const csv = (await call(seedGET, 'GET', '/api/admin/export/ctfd-seed.csv', { cookie: root })).body as string
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('team,team_password,name,email,password')
    expect(lines).toHaveLength(172)
    const p = await participant('team_id IS NOT NULL')
    const team = (await one<{ name: string }>('SELECT t.name FROM teams t JOIN participants p ON p.team_id = t.id WHERE p.id = $1', [p.id]))!.name
    expect(lines).toContain([team, teamPassword(team), p.name, p.email, playerPassword(p.email)].join(','))
    expect(lines.filter((l) => l.startsWith(','))).toHaveLength(10) // people without a team come last, team blank
  })
  it('emails only checked-in players, once, through the backup if the main server is out', async () => {
    await confirmedDemo(); mainOn(); backupOn(); process.env.CTF_URL = 'https://ctf.example.edu/'
    const a = await participant('team_id IS NOT NULL'), b = await participant('team_id IS NOT NULL AND id <> $1', [a.id])
    await checkIn(a.id); await checkIn(b.id)
    quota = true
    expect((await send()).body).toEqual({ queued: 2 }) // missing passwords are assigned on the way
    await waitForPasswordJob()
    expect(boxes.backup).toHaveLength(2)
    const m = boxes.backup.find((x) => (x.to && 'text' in x.to ? x.to.text : '') === a.email)!
    const pw = (await one<{ password: string }>('SELECT password FROM participants WHERE id = $1', [a.id]))!.password
    expect(m.subject).toBe('Your CTF password')
    expect(m.text).toContain(pw)
    expect(m.text).toContain('Log in at https://ctf.example.edu')
    expect(m.attachments.map((x) => x.filename)).toEqual(['email-logo.png'])
    expect((await list()).body).toMatchObject({ sent: 2, to_send: 0 })
    expect((await send()).body).toEqual({ queued: 0 })
  })
  it('a single send needs a checked-in player, and includes the team password', async () => {
    await confirmedDemo(); mainOn()
    const p = await participant('team_id IS NOT NULL')
    expect((await send({ id: p.id })).body.error).toMatch(/only sent to people who have checked in/)
    await checkIn(p.id)
    expect((await send({ id: p.id })).status).toBe(200)
    const team = (await one<{ name: string }>('SELECT t.name FROM teams t JOIN participants p ON p.team_id = t.id WHERE p.id = $1', [p.id]))!.name
    expect(boxes.main[0]!.text).toContain(`team password: ${teamPassword(team)}`)
    expect((await send({ id: 999999 })).status).toBe(404)
  })
  it('records a failed address and carries on with the rest', async () => {
    await confirmedDemo(); mainOn()
    const a = await participant('team_id IS NOT NULL'), b = await participant('team_id IS NOT NULL AND id <> $1', [a.id])
    await checkIn(a.id); await checkIn(b.id); reject.add(a.email)
    await send(); await waitForPasswordJob()
    expect(boxes.main).toHaveLength(1)
    expect((await one<{ e: string }>('SELECT password_error AS e FROM participants WHERE id = $1', [a.id]))!.e).toMatch(/550/)
    expect((await list()).body.to_send).toBe(1)
  })
  it('refuses without a mail server; exports a CSV; operators are kept out', async () => {
    await confirmedDemo(); await assign()
    expect((await send()).body.error).toMatch(/SMTP is not configured/)
    const csv = (await call(exportGET, 'GET', '/api/admin/export/passwords.csv', { cookie: root })).body as string
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Team,Team password,Venue,Password,Checked in,Password emailed')
    expect(csv.split('\r\n')[1]).toMatch(/,[a-z]+\d{4},no,no$/)
    expect((await call(listGET, 'GET', '/api/admin/passwords', { cookie: await login('dth') })).status).toBe(403)
  })
})
