import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pool } from './db'

const LOCK_KEY = 727274 // serialises concurrent starters (several instances, or app + CLI)

export function migrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), 'migrations')
}

// Applies every migrations/NNN_*.sql not yet recorded, each in its own transaction, in file order.
export async function migrate(dir = migrationsDir()): Promise<string[]> {
  // turbopackIgnore: migrations/ is copied into the image explicitly; don't trace the whole project
  const files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort()
  const client = await pool().connect()
  const applied: string[] = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
    const done = new Set((await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version))
    for (const file of files) {
      if (done.has(file)) continue
      const sql = await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, file), 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
        await client.query('COMMIT')
        applied.push(file)
      } catch (e) {
        await client.query('ROLLBACK')
        throw new Error(`migration ${file} failed: ${(e as Error).message}`)
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
    client.release()
  }
  return applied
}

// Waits for Postgres to accept connections (container start-up), then migrates.
export async function migrateWithRetry(attempts = 40, delayMs = 1500): Promise<string[]> {
  for (let i = 1; ; i++) {
    try {
      return await migrate()
    } catch (e) {
      const msg = (e as Error).message
      if (i >= attempts || msg.startsWith('migration ')) throw e
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}
