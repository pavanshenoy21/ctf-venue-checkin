import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, one, pool, q, tx } from '@/lib/db'
import { migrate } from '@/lib/migrate'
import { addPerson, addTeam, confirm, rejects, resetDb } from '../helpers/db'

beforeEach(resetDb)
afterAll(closePool)

describe('migrations', () => {
  it('apply once and are idempotent', async () => {
    expect(await migrate()).toEqual([])
    const v = await q<{ version: string }>('SELECT version FROM schema_migrations ORDER BY 1')
    expect(v.map((r) => r.version)).toEqual(['001_schema.sql', '002_guards.sql'])
  })
  it('create a single event_state row in NONE', async () => {
    expect(await one('SELECT allocation_status FROM event_state')).toEqual({ allocation_status: 'NONE' })
    expect(await rejects('INSERT INTO event_state (id) VALUES (2)')).toMatch(/check/)
  })
})

describe('table constraints', () => {
  it('emails and team names are unique ignoring case', async () => {
    await addPerson('Ann', null)
    expect(await rejects("INSERT INTO participants (name, email, qr_token) VALUES ('A2', 'ANN@x.io', repeat('a', 32))")).toMatch(/uq_participant_email_ci/)
    await addTeam('Athena', 1)
    expect(await rejects("INSERT INTO teams (name, participant_count) VALUES ('ATHENA', 2)")).toMatch(/uq_team_name_ci/)
  })
  it('team size must be 1 to 3', async () => {
    expect(await rejects("INSERT INTO teams (name, participant_count) VALUES ('Big', 4)")).toMatch(/participant_count/)
    expect(await rejects("INSERT INTO teams (name, participant_count) VALUES ('Zero', 0)")).toMatch(/participant_count/)
  })
  it('people without a team can never be in ISE', async () => {
    expect(await rejects("INSERT INTO participants (name, email, qr_token, assigned_venue) VALUES ('S', 's@x.io', repeat('b', 32), 'ISE')")).toMatch(/ck_noteam_not_ise/)
    const id = await addPerson('Solo', null, 'DTH')
    expect(await rejects("UPDATE participants SET assigned_venue = 'ISE' WHERE id = $1", [id])).toMatch(/ck_noteam_not_ise/)
  })
  it('QR tokens must be long random-looking strings and unique', async () => {
    expect(await rejects("INSERT INTO participants (name, email, qr_token) VALUES ('T', 't@x.io', 'short')")).toMatch(/qr_token/)
    await q("INSERT INTO participants (name, email, qr_token) VALUES ('U', 'u@x.io', repeat('c', 32))")
    expect(await rejects("INSERT INTO participants (name, email, qr_token) VALUES ('V', 'v@x.io', repeat('c', 32))")).toMatch(/qr_token/)
  })
  it('venue must be DTH or ISE', async () => {
    expect(await rejects("INSERT INTO teams (name, participant_count, assigned_venue) VALUES ('X', 1, 'GYM')")).toMatch(/assigned_venue/)
  })
  it('operators need a venue and super admins must not have one', async () => {
    expect(await rejects("INSERT INTO admins (username, password_hash, role) VALUES ('op', 'h', 'VENUE_OPERATOR')")).toMatch(/ck_admin_venue/)
    expect(await rejects("INSERT INTO admins (username, password_hash, role, venue) VALUES ('root', 'h', 'SUPER_ADMIN', 'DTH')")).toMatch(/ck_admin_venue/)
    expect(await rejects("INSERT INTO admins (username, password_hash, role) VALUES ('bad name!', 'h', 'SUPER_ADMIN')")).toMatch(/username/)
    await q("INSERT INTO admins (username, password_hash, role, venue) VALUES ('dth', 'h', 'VENUE_OPERATOR', 'DTH')")
  })
})

describe('team split guard', () => {
  it('rejects a member whose venue differs from the team, at commit', async () => {
    const t = await addTeam('Apollo', 2)
    const a = await addPerson('A1', t); await addPerson('A2', t)
    expect(await rejects("UPDATE participants SET assigned_venue = 'ISE' WHERE id = $1", [a])).toMatch(/team split/)
  })
  it('accepts team and members moving together in one transaction', async () => {
    const t = await addTeam('Zeus', 2)
    await addPerson('Z1', t); await addPerson('Z2', t)
    await tx(async (db) => {
      await db.query("UPDATE teams SET assigned_venue = 'ISE' WHERE id = $1", [t])
      await db.query("UPDATE participants SET assigned_venue = 'ISE' WHERE team_id = $1", [t])
    })
    expect(await q("SELECT DISTINCT assigned_venue FROM participants WHERE team_id = $1", [t])).toEqual([{ assigned_venue: 'ISE' }])
  })
  it('rejects moving a team without its members', async () => {
    const t = await addTeam('Hera', 1)
    await addPerson('H1', t)
    expect(await rejects("UPDATE teams SET assigned_venue = 'DTH' WHERE id = $1", [t])).toMatch(/team split/)
  })
})

async function confirmedWorld() {
  const t = await addTeam('Ares', 1, 'ISE')
  const ise = await addPerson('Ise Person', t, 'ISE')
  const dth = await addPerson('Dth Person', null, 'DTH')
  await confirm()
  return { t, ise, dth }
}

describe('confirmed allocation is frozen', () => {
  it('blocks venue changes and deletions', async () => {
    const { t, ise } = await confirmedWorld()
    expect(await rejects("UPDATE participants SET assigned_venue = 'DTH' WHERE id = $1", [ise])).toMatch(/confirmed and final/)
    expect(await rejects("UPDATE teams SET assigned_venue = 'DTH' WHERE id = $1", [t])).toMatch(/confirmed and final/)
    expect(await rejects('DELETE FROM participants')).toMatch(/confirmed and final/)
    expect(await rejects('DELETE FROM teams')).toMatch(/confirmed and final/)
  })
  it('cannot be un-confirmed or deleted', async () => {
    await confirmedWorld()
    expect(await rejects("UPDATE event_state SET allocation_status = 'DRAFT', confirmed_at = NULL")).toMatch(/confirmed and final/)
    expect(await rejects('DELETE FROM event_state')).toMatch(/confirmed and final/)
  })
  it('still allows non-venue updates such as email status', async () => {
    const { ise } = await confirmedWorld()
    await q('UPDATE participants SET email_sent_at = now() WHERE id = $1', [ise])
  })
})

describe('check-in guard', () => {
  const insert = (pid: number, venue: string) =>
    q('INSERT INTO check_ins (participant_id, venue) VALUES ($1, $2)', [pid, venue])

  it('requires a confirmed allocation', async () => {
    const id = await addPerson('Early', null, 'DTH')
    expect(await rejects('INSERT INTO check_ins (participant_id, venue) VALUES ($1, $2)', [id, 'DTH'])).toMatch(/not confirmed/)
  })
  it('rejects a venue that differs from the participant venue', async () => {
    const { ise, dth } = await confirmedWorld()
    expect(await rejects('INSERT INTO check_ins (participant_id, venue) VALUES ($1, $2)', [ise, 'DTH'])).toMatch(/wrong venue/)
    expect(await rejects('INSERT INTO check_ins (participant_id, venue) VALUES ($1, $2)', [dth, 'ISE'])).toMatch(/wrong venue/)
  })
  it('accepts the right venue and marks the participant checked in', async () => {
    const { ise } = await confirmedWorld()
    await insert(ise, 'ISE')
    const p = await one<{ checked_in: boolean; checked_in_at: Date }>('SELECT checked_in, checked_in_at FROM participants WHERE id = $1', [ise])
    const c = await one<{ scanned_at: Date }>('SELECT scanned_at FROM check_ins WHERE participant_id = $1', [ise])
    expect(p!.checked_in).toBe(true)
    expect(p!.checked_in_at.getTime()).toBe(c!.scanned_at.getTime())
  })
  it('allows only one check-in per participant', async () => {
    const { dth } = await confirmedWorld()
    await insert(dth, 'DTH')
    expect(await rejects('INSERT INTO check_ins (participant_id, venue) VALUES ($1, $2)', [dth, 'DTH'])).toMatch(/participant_id/)
  })
  it('keeps check-ins append-only', async () => {
    const { dth } = await confirmedWorld()
    await insert(dth, 'DTH')
    expect(await rejects('DELETE FROM check_ins')).toMatch(/append-only/)
    expect(await rejects("UPDATE check_ins SET scanned_at = now() - interval '1 hour'")).toMatch(/append-only/)
  })
  it('lets exactly one of many simultaneous inserts succeed', async () => {
    const { dth } = await confirmedWorld()
    const results = await Promise.allSettled(Array.from({ length: 10 }, () =>
      pool().query('INSERT INTO check_ins (participant_id, venue) VALUES ($1, $2)', [dth, 'DTH'])))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await one('SELECT count(*)::int AS n FROM check_ins')).toEqual({ n: 1 })
  })
  it('keeps checked_in and its timestamp consistent', async () => {
    const id = await addPerson('Flag', null, 'DTH')
    expect(await rejects('UPDATE participants SET checked_in = true WHERE id = $1', [id])).toMatch(/ck_checked_in_time/)
  })
})
