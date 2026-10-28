import type { Db } from './db'
import { HttpError } from './http'

export type Status = 'NONE' | 'DRAFT' | 'CONFIRMED'
export interface State { allocation_status: Status; confirmed_at: Date | null }

// lock=true takes the row lock that serialises import / assign / confirm against each other.
export async function getState(db: Db, lock = false): Promise<State> {
  const r = await db.query<State>(`SELECT allocation_status, confirmed_at FROM event_state WHERE id = 1${lock ? ' FOR UPDATE' : ''}`)
  return r.rows[0]!
}

export async function requireConfirmed(db: Db): Promise<void> {
  if ((await getState(db)).allocation_status !== 'CONFIRMED') throw new HttpError(409, 'Confirm the allocation first.')
}
