import { planAllocation } from './allocation'
import { config, VENUE_LABEL, VENUES, type Venue } from './config'
import { pool, tx, type Db } from './db'
import { HttpError } from './http'
import { getState, type Status } from './state'

export async function generateAllocation(): Promise<AllocationReport> {
  const failure = await tx(async (db) => {
    const st = await getState(db, true)
    if (st.allocation_status === 'CONFIRMED') throw new HttpError(409, 'Allocation is already confirmed and final.')
    const total = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM participants')).rows[0]!.n
    if (total === 0) throw new HttpError(409, 'Import participants first.')
    const teams = (await db.query<{ id: number; name: string; size: number }>('SELECT id, name, participant_count AS size FROM teams')).rows
    const noTeam = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM participants WHERE team_id IS NULL')).rows[0]!.n
    const plan = planAllocation(teams.map((t) => ({ key: t.id, name: t.name, size: t.size })), noTeam, config.capacity.ISE, config.capacity.DTH)
    if (!plan.ok) {
      // Leave nobody half-assigned, then report (the transaction commits this reset).
      await db.query('UPDATE participants SET assigned_venue = NULL')
      await db.query('UPDATE teams SET assigned_venue = NULL')
      await db.query("UPDATE event_state SET allocation_status = 'NONE' WHERE id = 1")
      return plan
    }
    await db.query("UPDATE participants SET assigned_venue = 'DTH' WHERE team_id IS NULL")
    await db.query("UPDATE teams SET assigned_venue = CASE WHEN id = ANY($1::int[]) THEN 'ISE' ELSE 'DTH' END", [[...plan.iseKeys]])
    // members inherit their team's venue in one statement, so a team can never be split
    await db.query('UPDATE participants p SET assigned_venue = t.assigned_venue FROM teams t WHERE p.team_id = t.id')
    await db.query("UPDATE event_state SET allocation_status = 'DRAFT' WHERE id = 1")
    return null
  })
  if (failure) throw new HttpError(422, failure.error!, failure.conflicts)
  return allocationReport()
}

// The checks that must all pass before confirmation (the DB triggers enforce most of them too).
export async function validateAllocation(db: Db = pool()): Promise<string[]> {
  const errs: string[] = []
  const one = async <T>(sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as T[]
  const total = (await one<{ n: number }>('SELECT count(*)::int AS n FROM participants'))[0]!.n
  if (!total) return ['No participants.']
  for (const r of await one<{ id: number }>('SELECT id FROM participants WHERE assigned_venue IS NULL ORDER BY id LIMIT 20'))
    errs.push(`Participant #${r.id} has no venue.`)
  for (const v of VENUES) {
    const n = (await one<{ n: number }>('SELECT count(*)::int AS n FROM participants WHERE assigned_venue = $1', [v]))[0]!.n
    if (n > config.capacity[v]) errs.push(`${v} over capacity: ${n} / ${config.capacity[v]}.`)
  }
  for (const r of await one<{ id: number }>("SELECT id FROM participants WHERE team_id IS NULL AND assigned_venue IS DISTINCT FROM 'DTH' LIMIT 20"))
    errs.push(`No-team participant #${r.id} is not in DTH.`)
  for (const r of await one<{ name: string }>('SELECT name FROM teams WHERE assigned_venue IS NULL ORDER BY name LIMIT 20'))
    errs.push(`Team '${r.name}' has no venue.`)
  for (const r of await one<{ name: string }>(`SELECT t.name FROM teams t JOIN participants p ON p.team_id = t.id
      GROUP BY t.id HAVING count(DISTINCT p.assigned_venue) > 1 OR bool_or(p.assigned_venue IS DISTINCT FROM t.assigned_venue) ORDER BY t.name LIMIT 20`))
    errs.push(`Team '${r.name}' is split or inconsistent.`)
  for (const r of await one<{ name: string }>(`SELECT t.name FROM teams t LEFT JOIN participants p ON p.team_id = t.id
      GROUP BY t.id HAVING count(p.id) <> t.participant_count ORDER BY t.name LIMIT 20`))
    errs.push(`Team '${r.name}' member count mismatch.`)
  return errs
}

export async function confirmAllocation(): Promise<AllocationReport> {
  await tx(async (db) => {
    const st = await getState(db, true)
    if (st.allocation_status === 'CONFIRMED') throw new HttpError(409, 'Allocation is already confirmed.')
    if (st.allocation_status !== 'DRAFT') throw new HttpError(409, 'Generate an allocation first.')
    const errs = await validateAllocation(db)
    if (errs.length) throw new HttpError(422, 'Allocation failed validation; cannot confirm.', errs)
    await db.query("UPDATE event_state SET allocation_status = 'CONFIRMED', confirmed_at = now() WHERE id = 1")
  })
  return allocationReport()
}

export interface VenueSummary {
  label: string; capacity: number; participants: number; remaining: number
  teams_3: number; teams_2: number; teams_1: number; no_team: number
}
export interface AllocationReport {
  status: Status; confirmed_at: Date | null
  venues: Record<Venue, VenueSummary>
  teams: { name: string; size: number; venue: Venue | null }[]
  validation_errors: string[]
}

export async function allocationReport(db: Db = pool()): Promise<AllocationReport> {
  const st = await getState(db)
  const rows = (await db.query<{ venue: Venue; people: number; no_team: number; t3: number; t2: number; t1: number }>(`
    SELECT v.venue,
      (SELECT count(*)::int FROM participants p WHERE p.assigned_venue = v.venue) AS people,
      (SELECT count(*)::int FROM participants p WHERE p.assigned_venue = v.venue AND p.team_id IS NULL) AS no_team,
      (SELECT count(*)::int FROM teams t WHERE t.assigned_venue = v.venue AND t.participant_count = 3) AS t3,
      (SELECT count(*)::int FROM teams t WHERE t.assigned_venue = v.venue AND t.participant_count = 2) AS t2,
      (SELECT count(*)::int FROM teams t WHERE t.assigned_venue = v.venue AND t.participant_count = 1) AS t1
    FROM unnest($1::text[]) AS v(venue)`, [[...VENUES]])).rows
  const venues = Object.fromEntries(rows.map((r) => [r.venue, {
    label: VENUE_LABEL[r.venue], capacity: config.capacity[r.venue], participants: r.people,
    remaining: config.capacity[r.venue] - r.people, teams_3: r.t3, teams_2: r.t2, teams_1: r.t1, no_team: r.no_team,
  }])) as Record<Venue, VenueSummary>
  const teams = (await db.query<{ name: string; size: number; venue: Venue | null }>(
    'SELECT name, participant_count AS size, assigned_venue AS venue FROM teams ORDER BY participant_count DESC, lower(name), name')).rows
  const hasPeople = Object.values(venues).some((v) => v.participants) || teams.length > 0
  return {
    status: st.allocation_status, confirmed_at: st.confirmed_at, venues, teams,
    validation_errors: st.allocation_status !== 'NONE' && hasPeople ? await validateAllocation(db) : [],
  }
}
