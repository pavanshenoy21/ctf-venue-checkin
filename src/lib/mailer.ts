import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { allParticipants, participantById, type FullParticipant } from './admin-queries'
import { config, type Venue } from './config'
import { toCsv } from './csv-export'
import { pool, q } from './db'
import { LOGO_FILE, LOGO_SRC, QR_SRC, renderEmail, renderQrEmail, type RenderedEmail } from './email'
import { HttpError } from './http'
import { qrPng } from './qr'
import { requireConfirmed } from './state'

import { createSender, smtpConfigured, smtpServers } from './smtp'

export { createSender, smtpConfigured }

const input = (p: FullParticipant) => ({ name: p.name, email: p.email, team: p.team, venue: p.venue as Venue, token: p.qr_token })
const render = (p: FullParticipant) => renderEmail(input(p))
// The admin page's CSP blocks the email's web-font link and <style> block (they're for mail clients), so the
// in-app preview leaves them out; inline styles carry the look.
const forPreview = (html: string) => html.replace(/<link\b[^>]*>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '')
const publicQrImage = (token: string) => `${config.publicBaseUrl}/api/public/qr/${token}.png`
let logo: Promise<Buffer> | null = null
const logoPng = () => (logo ??= readFile(path.join(process.cwd(), 'public', LOGO_FILE)))

export async function emailPreview(offset: number, limit: number) {
  await requireConfirmed(pool())
  const ps = await allParticipants()
  return {
    total: ps.length, smtp_configured: smtpConfigured(), smtp_backups: Math.max(0, smtpServers().length - 1),
    sent: ps.filter((p) => p.email_sent_at).length, failed: ps.filter((p) => !p.email_sent_at && p.email_error).length,
    items: ps.slice(offset, offset + limit).map((p) => {
      const m = render(p)
      return { id: p.id, to: m.to, name: p.name, team: p.team ?? '(No team)', venue: p.venue, subject: m.subject, text: m.text,
        html: forPreview(m.html).replace(QR_SRC, `/api/admin/qr/${p.id}.png`).replace(LOGO_SRC, `/${LOGO_FILE}`), qr_url: m.qrUrl, qr_file: m.qrFile,
        sent_at: p.email_sent_at, error: p.email_error }
    }),
  }
}

// Mail-merge dataset: one row per participant, HTML pointing at the hosted QR image.
export async function emailsCsv(): Promise<string> {
  await requireConfirmed(pool())
  return toCsv(['to', 'name', 'team', 'venue', 'subject', 'body_text', 'body_html', 'qr_url', 'qr_image_url', 'qr_file'],
    (await allParticipants()).map((p) => {
      const m = render(p), img = m.hasQr ? publicQrImage(p.qr_token) : ''
      const html = m.html.replace(QR_SRC, img).replace(LOGO_SRC, `${config.publicBaseUrl}/${LOGO_FILE}`)
      return [m.to, p.name, p.team ?? '(No team)', p.venue, m.subject, m.text, html, m.hasQr ? m.qrUrl : '', img, m.hasQr ? m.qrFile : '']
    }))
}

// The QR and logo travel as inline attachments referenced by cid:, so they show without loading remote images.
// qrToken: the code to draw into the email, when it carries one
export async function composeMessage(m: Pick<RenderedEmail, 'to' | 'subject' | 'text' | 'html'> & { qrFile?: string }, qrToken: string | null = null) {
  const id = randomBytes(8).toString('hex')
  const cid = `qr-${id}@ctf`, logoCid = `logo-${id}@ctf`
  return {
    to: m.to, subject: m.subject, text: m.text,
    html: m.html.replace(QR_SRC, `cid:${cid}`).replace(LOGO_SRC, `cid:${logoCid}`),
    attachments: [
      ...(qrToken ? [{ filename: m.qrFile ?? 'qr.png', content: await qrPng(qrToken), cid, contentType: 'image/png' }] : []),
      { filename: LOGO_FILE, content: await logoPng(), cid: logoCid, contentType: 'image/png' },
    ],
  }
}

// token: whose QR goes in the email (a re-entry pass has its own one-time code)
export const buildMessage = (p: FullParticipant, m: RenderedEmail = render(p), token = p.qr_token) => composeMessage(m, m.hasQr ? token : null)

// The check-in QR for one walk-in (registered without a team), sent from the Walk-ins page once they have
// formed a team or confirmed they are going solo at the DTH desk. Sent right away, not queued.
export async function sendWalkInQr(id: number): Promise<{ qr_sent_at: Date }> {
  if (!smtpConfigured()) throw new HttpError(409, 'SMTP is not configured (set SMTP_HOST / SMTP_FROM in .env).')
  await requireConfirmed(pool())
  const p = await participantById(id)
  if (!p) throw new HttpError(404, 'Participant not found.')
  if (p.team && !p.walk_in) throw new HttpError(409, 'This participant registered with a team; their QR was in their venue email.')
  const sender = createSender()
  try {
    await sender.send(await buildMessage(p, renderQrEmail(input(p))))
  } catch (e) {
    const error = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 300)
    await q('UPDATE participants SET qr_error = $1 WHERE id = $2', [error, id])
    throw new HttpError(502, `Could not send the QR email. ${error}`)
  } finally {
    sender.close()
  }
  const [row] = await q<{ qr_sent_at: Date }>('UPDATE participants SET qr_sent_at = now(), qr_error = NULL WHERE id = $1 RETURNING qr_sent_at', [id])
  return { qr_sent_at: row!.qr_sent_at }
}

let job: Promise<void> | null = null
export const waitForSendJob = async (): Promise<void> => { await job }

async function runJob(ids: number[]): Promise<void> {
  const sender = createSender()
  const delay = Math.max(0, Number(process.env.SMTP_DELAY_MS ?? 0) || 0)
  try {
    for (const id of ids) {
      const p = await participantById(id)
      if (!p) continue
      try {
        await sender.send(await buildMessage(p))
        await q('UPDATE participants SET email_sent_at = now(), email_error = NULL WHERE id = $1', [id])
      } catch (e) {
        // record what failed per person; SMTP errors don't contain secrets, but keep them short
        await q('UPDATE participants SET email_error = $1 WHERE id = $2', [`${(e as Error).name}: ${(e as Error).message}`.slice(0, 300), id])
      }
      if (delay) await new Promise((r) => setTimeout(r, delay))
    }
  } finally {
    sender.close()
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
