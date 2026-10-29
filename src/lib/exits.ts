import { DatabaseError } from 'pg'
import { z } from 'zod'
import { participantById } from './admin-queries'
import type { Admin } from './auth'
import type { Venue } from './config'
import { fmtDateTime, toCsv } from './csv-export'
import { one, pool, q, tx } from './db'
import { renderReentryEmail } from './email'
import { HttpError } from './http'
import { buildMessage, createSender, smtpConfigured } from './mailer'
import { newQrToken } from './security'
import { requireConfirmed } from './state'

// Temporary exits: an organiser lets a checked-in participant step out with a reason, and emails them a
// one-time re-entry QR. While they are out their original QR is refused at the desk; the re-entry QR (or a
// manual re-admit by the desk) brings them back in, once.

export interface ExitRow {
  id: number; participant_id: number; name: string; email: string; team: string | null; venue: Venue; sap_id: string | null
  reason: string; created_at: Date; created_by: string | null
  returned_at: Date | null; returned_manual: boolean | null; cancelled_at: Date | null
  email_sent_at: Date | null; email_error: string | null
}

const ROWS = `SELECT e.id, e.participant_id, p.name, p.email, t.name AS team, p.assigned_venue AS venue, p.sap_id,
    e.reason, e.created_at, a.username AS created_by, e.returned_at, e.returned_manual, e.cancelled_at,
    e.email_sent_at, e.email_error
  FROM exits e JOIN participants p ON p.id = e.participant_id LEFT JOIN teams t ON t.id = p.team_id
  LEFT JOIN admins a ON a.id = e.created_by`

export async function listExits() {
  await requireConfirmed(pool())
  const rows = await q<ExitRow>(`${ROWS} ORDER BY e.created_at DESC, e.id DESC`)
  const open = rows.filter((r) => !r.returned_at && !r.cancelled_at)
  return { smtp_configured: smtpConfigured(), out: open, history: rows.filter((r) => r.returned_at || r.cancelled_at) }
}

// eslint-disable-next-line no-control-regex
export const ExitBody = z.object({
  participant_id: z.number().int().positive(),
  reason: z.string().trim().min(1, 'Enter a reason').max(300).regex(/^[^\x00-\x09\x0b-\x1f\x7f]*$/, 'must not contain control characters'),
  send_email: z.boolean().default(true),
})
export type ExitInput = z.infer<typeof ExitBody>

type Email = { email: 'sent' | 'failed' | 'not_sent'; error?: string }

export async function recordExit(admin: Admin, b: ExitInput): Promise<{ exit: ExitRow } & Email> {
  const id = await tx(async (db) => {
    await requireConfirmed(db)
    const p = (await db.query<{ id: number; name: string; checked_in: boolean }>(
      'SELECT id, name, checked_in FROM participants WHERE id = $1 FOR UPDATE', [b.participant_id])).rows[0]
    if (!p) throw new HttpError(404, 'Participant not found.')
    if (!p.checked_in) throw new HttpError(409, `${p.name} hasn't checked in, so they can't step out.`)
    const open = (await db.query<{ created_at: Date }>(
      'SELECT created_at FROM exits WHERE participant_id = $1 AND returned_at IS NULL AND cancelled_at IS NULL', [p.id])).rows[0]
    if (open) throw new HttpError(409, `${p.name} is already out (since ${fmtDateTime(open.created_at)}).`)
    // a fresh 192-bit code; it must never equal anyone's check-in QR
    let token = newQrToken()
    while ((await db.query('SELECT 1 FROM participants WHERE qr_token = $1', [token])).rowCount) token = newQrToken()
    try {
      return (await db.query<{ id: number }>('INSERT INTO exits (participant_id, reason, token, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
        [p.id, b.reason, token, admin.id])).rows[0]!.id
    } catch (e) {
      if (e instanceof DatabaseError && e.constraint === 'uq_exit_open') throw new HttpError(409, `${p.name} is already out.`)
      throw e
    }
  })
  // After the commit: the exit stands even if the email fails, and it can be resent.
  const email: Email = b.send_email && smtpConfigured() ? await deliver(id).then(() => ({ email: 'sent' as const }), (e: Error) => ({ email: 'failed' as const, error: e.message })) : { email: 'not_sent' }
  return { exit: (await one<ExitRow>(`${ROWS} WHERE e.id = $1`, [id]))!, ...email }
}

async function openExit(id: number) {
  const e = await one<{ id: number; participant_id: number; reason: string; token: string; created_at: Date; returned_at: Date | null; cancelled_at: Date | null }>(
    'SELECT id, participant_id, reason, token, created_at, returned_at, cancelled_at FROM exits WHERE id = $1', [id])
  if (!e) throw new HttpError(404, 'Exit not found.')
  if (e.returned_at) throw new HttpError(409, 'They are already back in; this re-entry pass has been used.')
  if (e.cancelled_at) throw new HttpError(409, 'This exit was cancelled.')
  return e
}

async function deliver(id: number): Promise<void> {
  const e = await openExit(id)
  const p = (await participantById(e.participant_id))!
  const m = renderReentryEmail({ name: p.name, email: p.email, team: p.team, venue: p.venue as Venue, token: e.token, reason: e.reason, outAt: e.created_at })
  const sender = createSender()
  try {
    await sender.send(await buildMessage(p, m, e.token))
  } catch (err) {
    const error = `${(err as Error).name}: ${(err as Error).message}`.slice(0, 300)
    await q('UPDATE exits SET email_error = $1 WHERE id = $2', [error, id])
    throw new HttpError(502, `Could not send the re-entry email. ${error}`)
  } finally {
    sender.close()
  }
  await q('UPDATE exits SET email_sent_at = now(), email_error = NULL WHERE id = $1', [id])
}

export async function resendExitEmail(id: number): Promise<{ email_sent_at: Date }> {
  if (!smtpConfigured()) throw new HttpError(409, 'SMTP is not configured (set SMTP_HOST / SMTP_FROM in .env).')
  await deliver(id)
  return { email_sent_at: (await one<{ t: Date }>('SELECT email_sent_at AS t FROM exits WHERE id = $1', [id]))!.t }
}

// For an exit recorded by mistake: the re-entry pass stops working and the person counts as inside again.
export async function cancelExit(id: number): Promise<{ cancelled_at: Date }> {
  return tx(async (db) => {
    const e = (await db.query<{ returned_at: Date | null; cancelled_at: Date | null }>('SELECT returned_at, cancelled_at FROM exits WHERE id = $1 FOR UPDATE', [id])).rows[0]
    if (!e) throw new HttpError(404, 'Exit not found.')
    if (e.returned_at) throw new HttpError(409, 'They are already back in.')
    if (e.cancelled_at) throw new HttpError(409, 'This exit was already cancelled.')
    return (await db.query<{ cancelled_at: Date }>('UPDATE exits SET cancelled_at = now() WHERE id = $1 RETURNING cancelled_at', [id])).rows[0]!
  })
}

export async function exitsCsv(): Promise<string> {
  const rows = await q<ExitRow & { returned_venue: string | null }>(`${ROWS.replace('e.email_sent_at,', 'e.email_sent_at, e.returned_venue,')} ORDER BY e.created_at, e.id`)
  return toCsv(['Name', 'Email', 'SAP ID', 'Team', 'Venue', 'Reason', 'Left at', 'Recorded by', 'Status', 'Back at', 'Back in via'],
    rows.map((r) => [r.name, r.email, r.sap_id ?? '', r.team ?? '(No team)', r.venue, r.reason, fmtDateTime(r.created_at), r.created_by ?? '',
      r.cancelled_at ? 'CANCELLED' : r.returned_at ? 'BACK IN' : 'OUT', fmtDateTime(r.returned_at),
      r.returned_at ? (r.returned_manual ? 'Manual (desk search)' : 'Re-entry QR') : '']))
}
