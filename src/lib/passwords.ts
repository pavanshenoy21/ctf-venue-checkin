import { createHmac } from 'node:crypto'
import { config, type Venue } from './config'
import { toCsv } from './csv-export'
import { one, q, tx, type Db } from './db'
import { renderPasswordEmail } from './email'
import { HttpError } from './http'
import { composeMessage, createSender, smtpConfigured } from './mailer'

// Player passwords: an easy-to-type word (an animal or a fruit) plus four digits, e.g. mango4821. Each one is
// derived from the player's email and the secret PASSWORD_SEED, so it is fixed: the same person gets the same
// password every time, across re-imports, and it can be loaded into CTFd before the event. Teams get one the
// same way from their name. The super admin sees them in plain text and emails players theirs after check-in.

export const WORDS = [
  'apple', 'apricot', 'banana', 'cherry', 'coconut', 'date', 'fig', 'grape', 'guava', 'jackfruit', 'kiwi', 'lemon',
  'lime', 'lychee', 'mango', 'melon', 'orange', 'papaya', 'peach', 'pear', 'plum', 'pomelo', 'quince', 'berry',
  'tamarind', 'olive', 'chikoo', 'jamun', 'amla', 'mulberry', 'raisin', 'avocado', 'pineapple', 'cranberry',
  'badger', 'beaver', 'bison', 'camel', 'cheetah', 'cobra', 'crane', 'dolphin', 'eagle', 'falcon', 'ferret',
  'gazelle', 'gecko', 'giraffe', 'hawk', 'heron', 'hippo', 'husky', 'ibis', 'jaguar', 'koala', 'lemur', 'leopard',
  'lion', 'llama', 'lynx', 'macaw', 'mongoose', 'moose', 'otter', 'owl', 'panda', 'panther', 'parrot', 'pelican',
  'penguin', 'puma', 'python', 'rabbit', 'raven', 'rhino', 'robin', 'salmon', 'seal', 'shark', 'sparrow', 'squid',
  'swan', 'tiger', 'turtle', 'walrus', 'whale', 'wolf', 'yak', 'zebra', 'peacock', 'elephant', 'kingfisher',
]

const seeded = () => config.passwordSeed.length >= 16
function seed(): string {
  if (!seeded()) throw new HttpError(409, 'Set PASSWORD_SEED in .env (any long random string, e.g. openssl rand -hex 24) before using passwords. Keep it the same, or every password changes.')
  return config.passwordSeed
}
function derive(kind: 'player' | 'team', key: string): string {
  const h = createHmac('sha256', seed()).update(`${kind}:${key.trim().toLowerCase()}`).digest()
  return `${WORDS[h.readUInt32BE(0) % WORDS.length]}${String(h.readUInt32BE(4) % 10_000).padStart(4, '0')}`
}
export const playerPassword = (email: string): string => derive('player', email)
export const teamPassword = (team: string): string => derive('team', team)

// Stores the (fixed) password for everyone who doesn't have one yet, e.g. after an import or for a walk-in added
// at the desk. What's stored is what was derived, so running it again changes nothing.
export async function assignMissing(): Promise<{ assigned: number }> {
  return tx(async (db: Db) => {
    const rows = (await db.query<{ id: number; email: string }>('SELECT id, email FROM participants WHERE password IS NULL ORDER BY id FOR UPDATE')).rows
    for (const r of rows) await db.query('UPDATE participants SET password = $1 WHERE id = $2', [playerPassword(r.email), r.id])
    return { assigned: rows.length }
  })
}

export interface PasswordRow {
  id: number; name: string; email: string; team: string | null; venue: Venue | null; checked_in: boolean
  password: string | null; password_sent_at: Date | null; password_error: string | null; team_password?: string | null
}
const ROWS = `SELECT p.id, p.name, p.email, t.name AS team, p.assigned_venue AS venue, p.checked_in, p.password,
    p.password_sent_at, p.password_error FROM participants p LEFT JOIN teams t ON t.id = p.team_id`

export async function listPasswords() {
  const rows = (await q<PasswordRow>(`${ROWS} ORDER BY lower(p.name), p.id`))
    .map((r) => ({ ...r, team_password: r.team && seeded() ? teamPassword(r.team) : null }))
  return {
    smtp_configured: smtpConfigured(), seed_set: seeded(), sending: job !== null, people: rows,
    assigned: rows.filter((r) => r.password).length,
    checked_in: rows.filter((r) => r.checked_in).length,
    sent: rows.filter((r) => r.password_sent_at).length,
    // checked in but not yet sent their password: what "Send" will email
    to_send: rows.filter((r) => r.checked_in && !r.password_sent_at).length,
  }
}

export async function passwordsCsv(): Promise<string> {
  await assignMissing()
  return toCsv(['Name', 'Email', 'Team', 'Team password', 'Venue', 'Password', 'Checked in', 'Password emailed'],
    (await q<PasswordRow>(`${ROWS} ORDER BY lower(p.name), p.id`)).map((r) =>
      [r.name, r.email, r.team ?? '(No team)', r.team ? teamPassword(r.team) : '', r.venue ?? '', r.password ?? '', r.checked_in ? 'yes' : 'no', r.password_sent_at ? 'yes' : 'no']))
}

// For seeding the CTFd database directly: one row per player, with their team (blank for people without one) and
// both passwords in plain text. Teammates are listed together, first row first.
export async function ctfdSeedCsv(): Promise<string> {
  await assignMissing()
  const rows = await q<PasswordRow>(`${ROWS} ORDER BY t.name NULLS LAST, p.id`)
  return toCsv(['team', 'team_password', 'name', 'email', 'password'],
    rows.map((r) => [r.team ?? '', r.team ? teamPassword(r.team) : '', r.name, r.email, r.password!]))
}

async function sendOne(sender: ReturnType<typeof createSender>, id: number): Promise<void> {
  const p = await one<PasswordRow>(`${ROWS} WHERE p.id = $1`, [id])
  if (!p || !p.checked_in) return
  const password = p.password ?? playerPassword(p.email)
  if (!p.password) await q('UPDATE participants SET password = $1 WHERE id = $2', [password, id])
  const m = renderPasswordEmail({ name: p.name, email: p.email, team: p.team, password, teamPassword: p.team ? teamPassword(p.team) : null })
  try {
    await sender.send(await composeMessage(m))
    await q('UPDATE participants SET password_sent_at = now(), password_error = NULL WHERE id = $1', [id])
  } catch (e) {
    const error = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 300)
    await q('UPDATE participants SET password_error = $1 WHERE id = $2', [error, id])
    throw new HttpError(502, `Could not send the password email. ${error}`)
  }
}

let job: Promise<void> | null = null
export const waitForPasswordJob = async (): Promise<void> => { await job }

// Emails passwords to checked-in players: everyone not yet sent theirs, or just one (also as a resend).
// Anyone without a password yet gets one first. People who haven't checked in are never sent one.
export async function sendPasswords(opts: { id?: number | null }): Promise<{ queued: number }> {
  if (!smtpConfigured()) throw new HttpError(409, 'SMTP is not configured (set SMTP_HOST / SMTP_FROM in .env).')
  seed()
  if (opts.id) {
    const p = await one<{ checked_in: boolean }>('SELECT checked_in FROM participants WHERE id = $1', [opts.id])
    if (!p) throw new HttpError(404, 'Participant not found.')
    if (!p.checked_in) throw new HttpError(409, 'Passwords are only sent to people who have checked in.')
    const sender = createSender()
    try { await sendOne(sender, opts.id) } finally { sender.close() }
    return { queued: 1 }
  }
  if (job) throw new HttpError(409, 'Passwords are already being sent.')
  const ids = (await q<{ id: number }>('SELECT id FROM participants WHERE checked_in AND password_sent_at IS NULL ORDER BY id')).map((r) => r.id)
  const delay = Math.max(0, Number(process.env.SMTP_DELAY_MS ?? 0) || 0)
  job = (async () => {
    const sender = createSender()
    try {
      for (const id of ids) {
        await sendOne(sender, id).catch(() => {}) // recorded per person; carry on with the rest
        if (delay) await new Promise((r) => setTimeout(r, delay))
      }
    } finally { sender.close() }
  })().catch((e) => console.error(`[passwords.send] job failed: ${(e as Error).name}`)).finally(() => { job = null })
  return { queued: ids.length }
}

