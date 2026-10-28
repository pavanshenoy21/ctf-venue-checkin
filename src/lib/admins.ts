import { z } from 'zod'
import { VENUES } from './config'
import { tx } from './db'
import { hashPassword } from './security'

export const AdminInput = z.object({
  username: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, 'letters, digits, _ . - only (max 64)'),
  role: z.enum(['SUPER_ADMIN', 'VENUE_OPERATOR']),
  venue: z.enum(VENUES).nullable(),
  password: z.string().min(10, 'at least 10 characters').max(256),
}).refine((a) => (a.role === 'VENUE_OPERATOR') === (a.venue !== null), {
  message: 'VENUE_OPERATOR needs a venue; SUPER_ADMIN must not have one', path: ['venue'],
})
export type AdminInput = z.infer<typeof AdminInput>

// Creates the account, or updates it and signs out every existing session of that account.
export async function upsertAdmin(input: AdminInput): Promise<{ created: boolean }> {
  const a = AdminInput.parse(input)
  const hash = await hashPassword(a.password)
  return tx(async (db) => {
    const ex = await db.query<{ id: number }>('SELECT id FROM admins WHERE username = $1 FOR UPDATE', [a.username])
    if (ex.rows[0]) {
      await db.query('UPDATE admins SET password_hash = $1, role = $2, venue = $3 WHERE id = $4', [hash, a.role, a.venue, ex.rows[0].id])
      await db.query('DELETE FROM sessions WHERE admin_id = $1', [ex.rows[0].id])
      return { created: false }
    }
    await db.query('INSERT INTO admins (username, password_hash, role, venue) VALUES ($1, $2, $3, $4)', [a.username, hash, a.role, a.venue])
    return { created: true }
  })
}
