import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { config } from './config'

// One pool per process; cached on globalThis so Next's dev hot-reload doesn't leak pools.
const g = globalThis as unknown as { __ctfPool?: Pool }

export function pool(): Pool {
  if (!g.__ctfPool) {
    g.__ctfPool = new Pool({ connectionString: config.databaseUrl, max: 20, idleTimeoutMillis: 30_000 })
    g.__ctfPool.on('error', (e) => console.error('postgres pool error:', e.message))
  }
  return g.__ctfPool
}

export type Db = Pick<PoolClient, 'query'>

// Every query is parameterised ($1, $2 ...); never interpolate values into SQL text.
export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T | undefined> {
  return (await q<T>(sql, params, db))[0]
}

// Runs fn inside BEGIN/COMMIT on a dedicated client; any throw rolls back.
export async function tx<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function closePool(): Promise<void> {
  if (g.__ctfPool) { await g.__ctfPool.end(); g.__ctfPool = undefined }
}
