import { randomBytes } from 'node:crypto'
import { pool, q } from '@/lib/db'
import { migrate } from '@/lib/migrate'

// Wipes the test database and re-runs every migration, so each test starts from a clean schema.
export async function resetDb(): Promise<void> {
  if (!/test/.test(process.env.DATABASE_URL ?? '')) throw new Error('refusing to reset a non-test database')
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
  await migrate()
}

export const token = (): string => randomBytes(24).toString('base64url')

export async function addTeam(name: string, size: number, venue: string | null = null): Promise<number> {
  const [t] = await q<{ id: number }>('INSERT INTO teams (name, participant_count, assigned_venue) VALUES ($1, $2, $3) RETURNING id', [name, size, venue])
  return t!.id
}

export async function addPerson(name: string, teamId: number | null, venue: string | null = null): Promise<number> {
  const [p] = await q<{ id: number }>(
    'INSERT INTO participants (name, email, team_id, qr_token, assigned_venue) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name, `${name.toLowerCase().replace(/\W+/g, '.')}@x.io`, teamId, token(), venue])
  return p!.id
}

export const confirm = () => q("UPDATE event_state SET allocation_status = 'CONFIRMED', confirmed_at = now()")

// Rejects with the Postgres error message; used to assert a guard fired.
export async function rejects(sql: string, params: unknown[] = []): Promise<string> {
  try { await q(sql, params) } catch (e) { return (e as Error).message }
  throw new Error(`expected failure: ${sql}`)
}
