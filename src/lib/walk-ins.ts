import { DatabaseError } from 'pg'
import { z } from 'zod'
import { q, pool, tx } from './db'
import { HttpError } from './http'
import { sendWalkInQr, smtpConfigured } from './mailer'
import { newQrToken } from './security'
import { requireConfirmed } from './state'

// Walk-ins: people who registered without a team. They report to the DTH desk, where an organiser registers
// them into a walk-in team (a team of one for someone going solo), then emails each their check-in QR.

export interface WalkIn {
  id: number; name: string; email: string; phone: string | null; sap_id: string | null; year: string | null; branch: string | null
  team_id: number | null; team: string | null; qr_sent_at: Date | null; qr_error: string | null; checked_in: boolean
}

export async function listWalkIns() {
  await requireConfirmed(pool())
  const people = await q<WalkIn>(`
    SELECT p.id, p.name, p.email, p.phone, p.sap_id, p.year, p.branch, p.team_id, t.name AS team,
      p.qr_sent_at, p.qr_error, p.checked_in
    FROM participants p LEFT JOIN teams t ON t.id = p.team_id
    WHERE p.team_id IS NULL OR t.walk_in
    ORDER BY t.created_at NULLS LAST, t.id, p.id`)
  return { smtp_configured: smtpConfigured(), people }
}

// eslint-disable-next-line no-control-regex
const text = (max: number) => z.string().trim().max(max).regex(/^[^\x00-\x1f\x7f]*$/, 'must not contain control characters')
const NewMember = z.object({
  name: text(200).min(1),
  email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/, 'invalid email'),
  phone: text(40).default(''), sap_id: text(60).default(''), year: text(40).default(''), branch: text(120).default(''),
})
export const RegisterBody = z.object({
  name: text(120).default(''),
  member_ids: z.array(z.number().int().positive()).max(3).default([]),
  new_members: z.array(NewMember).max(3).default([]),
  send_qr: z.boolean().default(true),
})
export type Register = z.infer<typeof RegisterBody>

type QrResult = { id: number; name: string; email: string; qr: 'sent' | 'failed' | 'not_sent'; error?: string }

const unique = (e: unknown, index: string) => e instanceof DatabaseError && e.code === '23505' && e.constraint === index

export async function registerWalkInTeam(b: Register): Promise<{ team: { id: number; name: string }; members: QrResult[] }> {
  const size = b.member_ids.length + b.new_members.length
  if (size < 1 || size > 3) throw new HttpError(422, 'A walk-in team has 1 to 3 members.')
  if (new Set(b.member_ids).size !== b.member_ids.length) throw new HttpError(422, 'The same person is listed twice.')
  const emails = b.new_members.map((m) => m.email)
  if (new Set(emails).size !== emails.length) throw new HttpError(422, 'The same email is listed twice.')

  const created = await tx(async (db) => {
    await requireConfirmed(db)
    const picked = (await db.query<{ id: number; name: string; team_id: number | null; assigned_venue: string }>(
      'SELECT id, name, team_id, assigned_venue FROM participants WHERE id = ANY($1::int[]) FOR UPDATE', [b.member_ids])).rows
    if (picked.length !== b.member_ids.length) throw new HttpError(404, 'A selected participant no longer exists.')
    const taken = picked.filter((p) => p.team_id !== null || p.assigned_venue !== 'DTH')
    if (taken.length) throw new HttpError(409, `Already in a team: ${taken.map((p) => p.name).join(', ')}.`)

    // Someone going solo can leave the name blank: the team is named after them.
    const name = b.name || (size === 1 ? (picked[0]?.name ?? b.new_members[0]!.name) : '')
    if (!name) throw new HttpError(422, 'Enter a team name.')
    let teamId: number
    try {
      teamId = (await db.query<{ id: number }>(
        "INSERT INTO teams (name, participant_count, assigned_venue, walk_in) VALUES ($1, $2, 'DTH', true) RETURNING id", [name, size])).rows[0]!.id
    } catch (e) {
      if (unique(e, 'uq_team_name_ci')) throw new HttpError(409, `A team called '${name}' already exists. Pick another name.`)
      throw e
    }
    await db.query('UPDATE participants SET team_id = $1 WHERE id = ANY($2::int[])', [teamId, b.member_ids])
    for (const m of b.new_members) {
      try {
        await db.query(
          `INSERT INTO participants (name, email, phone, sap_id, year, branch, team_id, qr_token, assigned_venue)
           VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, $8, 'DTH')`,
          [m.name, m.email, m.phone, m.sap_id, m.year, m.branch, teamId, newQrToken()])
      } catch (e) {
        if (unique(e, 'uq_participant_email_ci')) throw new HttpError(409, `${m.email} is already registered. Pick them from the list instead.`)
        throw e
      }
    }
    const members = (await db.query<{ id: number; name: string; email: string }>('SELECT id, name, email FROM participants WHERE team_id = $1 ORDER BY id', [teamId])).rows
    return { team: { id: teamId, name }, members }
  })

  // After the commit: the team stands even if an email fails, and a failed QR can be resent from the list.
  const members: QrResult[] = []
  for (const m of created.members) {
    if (!b.send_qr || !smtpConfigured()) { members.push({ ...m, qr: 'not_sent' }); continue }
    try {
      await sendWalkInQr(m.id)
      members.push({ ...m, qr: 'sent' })
    } catch (e) {
      members.push({ ...m, qr: 'failed', error: (e as Error).message })
    }
  }
  return { team: created.team, members }
}
