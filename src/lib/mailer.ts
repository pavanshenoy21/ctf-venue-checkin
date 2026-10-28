import { randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'
import { allParticipants, participantById, type FullParticipant } from './admin-queries'
import { config, type Venue } from './config'
import { toCsv } from './csv-export'
import { pool, q } from './db'
import { QR_SRC, renderEmail } from './email'
import { HttpError } from './http'
import { qrPng } from './qr'
import { requireConfirmed } from './state'

export const smtpConfigured = (): boolean => Boolean(config.smtp.host && config.smtp.from)

const render = (p: FullParticipant) => renderEmail({ name: p.name, email: p.email, team: p.team, venue: p.venue as Venue, token: p.qr_token })
const publicQrImage = (token: string) => `${config.publicBaseUrl}/api/public/qr/${token}.png`

export async function emailPreview(offset: number, limit: number) {
  await requireConfirmed(pool())
  const ps = await allParticipants()
  return {
    total: ps.length, smtp_configured: smtpConfigured(),
    sent: ps.filter((p) => p.email_sent_at).length, failed: ps.filter((p) => !p.email_sent_at && p.email_error).length,
    items: ps.slice(offset, offset + limit).map((p) => {
      const m = render(p)
      return { id: p.id, to: m.to, name: p.name, team: p.team ?? '(No team)', venue: p.venue, subject: m.subject, text: m.text,
        html: m.html.replace(QR_SRC, `/api/admin/qr/${p.id}.png`), qr_url: m.qrUrl, qr_file: m.qrFile,
        sent_at: p.email_sent_at, error: p.email_error }
    }),
  }
}

// Mail-merge dataset: one row per participant, HTML pointing at the hosted QR image.
export async function emailsCsv(): Promise<string> {
  await requireConfirmed(pool())
  return toCsv(['to', 'name', 'team', 'venue', 'subject', 'body_text', 'body_html', 'qr_url', 'qr_image_url', 'qr_file'],
    (await allParticipants()).map((p) => {
      const m = render(p), img = publicQrImage(p.qr_token)
      return [m.to, p.name, p.team ?? '(No team)', p.venue, m.subject, m.text, m.html.replace(QR_SRC, img), m.qrUrl, img, m.qrFile]
    }))
}

export function makeTransport() {
  const s = config.smtp
  return nodemailer.createTransport({
    host: s.host, port: s.port,
    secure: s.security === 'ssl', requireTLS: s.security === 'starttls', ignoreTLS: s.security === 'none',
    auth: s.user ? { user: s.user, pass: s.password } : undefined,
    // one reused connection, messages in order: fast, and gentle on provider rate limits
    pool: true, maxConnections: 1, maxMessages: 500,
    connectionTimeout: 15_000, socketTimeout: 30_000,
  })
}

// The QR travels as an inline attachment referenced by cid:, so it shows without loading remote images.
export async function buildMessage(p: FullParticipant) {
  const m = render(p)
  const cid = `qr-${randomBytes(8).toString('hex')}@ctf`
  return {
    from: config.smtp.from, to: m.to, subject: m.subject, text: m.text, html: m.html.replace(QR_SRC, `cid:${cid}`),
    attachments: [{ filename: m.qrFile, content: await qrPng(p.qr_token), cid, contentType: 'image/png' }],
  }
}

let job: Promise<void> | null = null
export const waitForSendJob = async (): Promise<void> => { await job }

async function runJob(ids: number[]): Promise<void> {
  const transport = makeTransport()
  const delay = Math.max(0, Number(process.env.SMTP_DELAY_MS ?? 0) || 0)
  try {
    for (const id of ids) {
      const p = await participantById(id)
      if (!p) continue
      try {
        await transport.sendMail(await buildMessage(p))
        await q('UPDATE participants SET email_sent_at = now(), email_error = NULL WHERE id = $1', [id])
      } catch (e) {
        // record what failed per person; SMTP errors don't contain secrets, but keep them short
        await q('UPDATE participants SET email_error = $1 WHERE id = $2', [`${(e as Error).name}: ${(e as Error).message}`.slice(0, 300), id])
      }
      if (delay) await new Promise((r) => setTimeout(r, delay))
    }
  } finally {
    transport.close()
  }
}

export async function startSend(opts: { onlyEmail?: string | null; resend?: boolean }): Promise<{ queued: number }> {
  if (!smtpConfigured()) throw new HttpError(409, 'SMTP is not configured (set SMTP_HOST / SMTP_FROM in .env). Use the CSV export instead.')
  await requireConfirmed(pool())
  if (job) throw new HttpError(409, 'A send job is already running.')
  let ps = await allParticipants()
  if (opts.onlyEmail) ps = ps.filter((p) => p.email === opts.onlyEmail!.trim().toLowerCase())
  else if (!opts.resend) ps = ps.filter((p) => !p.email_sent_at)
  const ids = ps.map((p) => p.id)
  job = runJob(ids).catch((e) => console.error(`[emails.send] job failed: ${(e as Error).name}`)).finally(() => { job = null })
  return { queued: ids.length }
}
