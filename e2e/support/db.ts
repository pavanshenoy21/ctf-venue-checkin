import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { upsertAdmin } from '@/lib/admins'
import { confirmAllocation, generateAllocation } from '@/lib/allocation-service'
import { parseCsv } from '@/lib/csv-import'
import { pool, q } from '@/lib/db'
import { demoCsv } from '@/lib/demo'
import { commitImport } from '@/lib/import-service'
import { migrate } from '@/lib/migrate'
import { MAILBOX } from '../../playwright.config'

export const PW = 'correct-horse-battery'

// Puts the e2e database into a known state. The app server keeps running; it reconnects transparently.
export async function resetTo(state: 'empty' | 'imported' | 'confirmed'): Promise<void> {
  if (!/test/.test(process.env.DATABASE_URL ?? '')) throw new Error('refusing to reset a non-test database')
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  await migrate()
  await upsertAdmin({ username: 'root', role: 'SUPER_ADMIN', venue: null, password: PW })
  await upsertAdmin({ username: 'dth', role: 'VENUE_OPERATOR', venue: 'DTH', password: PW })
  await upsertAdmin({ username: 'ise', role: 'VENUE_OPERATOR', venue: 'ISE', password: PW })
  if (state === 'empty') return
  await commitImport(parseCsv(demoCsv()))
  if (state === 'imported') return
  await generateAllocation()
  await confirmAllocation()
}

export async function person(where: string) {
  // `where` uses participant column names (assigned_venue, team_id, name...) without table prefixes
  const [p] = await q<{ id: number; name: string; email: string; qr_token: string; venue: string; team: string | null }>(
    `SELECT id, name, email, qr_token, assigned_venue AS venue, team FROM (
       SELECT p.*, t.name AS team FROM participants p LEFT JOIN teams t ON t.id = p.team_id) x
     WHERE ${where} ORDER BY id LIMIT 1`)
  if (!p) throw new Error(`no participant where ${where}`)
  return p
}

export const count = async (sql: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`))[0]!.n
export { q }

export interface Mail { to: string; subject: string; text: string; html: string; attachments: { cid: string; contentType: string; filename: string; base64: string }[] }
export function mailbox(): Mail[] {
  return readdirSync(MAILBOX).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(path.join(MAILBOX, f), 'utf8')))
}
