import { config, VENUE_LABEL, VENUES, type Venue } from './config'
import { pool, type Db } from './db'
import { allocationReport } from './allocation-service'

export interface Recent { at: Date; name: string; team: string | null; venue: Venue }

export async function recentCheckins(limit: number, venue: Venue | null = null, db: Db = pool()): Promise<Recent[]> {
  return (await db.query<Recent>(`SELECT c.scanned_at AS at, p.name, t.name AS team, c.venue
    FROM check_ins c JOIN participants p ON p.id = c.participant_id LEFT JOIN teams t ON t.id = p.team_id
    WHERE ($1::text IS NULL OR c.venue = $1) ORDER BY c.scanned_at DESC, c.id DESC LIMIT $2`, [venue, limit])).rows
}

export async function venueStats(venue: Venue, recent = 15, db: Db = pool()) {
  const r = (await db.query<{ assigned: number; checked: number }>(`SELECT
      (SELECT count(*)::int FROM participants WHERE assigned_venue = $1) AS assigned,
      (SELECT count(*)::int FROM check_ins WHERE venue = $1) AS checked`, [venue])).rows[0]!
  return {
    venue, label: VENUE_LABEL[venue], capacity: config.capacity[venue], assigned: r.assigned, checked_in: r.checked,
    remaining: r.assigned - r.checked, percent: r.assigned ? Math.round((1000 * r.checked) / r.assigned) / 10 : 0,
    recent: recent ? (await recentCheckins(recent, venue, db)).map(({ venue: _v, ...x }) => x) : [],
  }
}

type GroupKey = '3' | '2' | '1' | 'none'
const GROUPS: [GroupKey, string][] = [['3', '3-member teams'], ['2', '2-member teams'], ['1', '1-member teams'], ['none', 'No team']]

// Attendance per team-size group; a team is full / partial / absent by how many members checked in.
export async function attendanceBreakdown(db: Db = pool()) {
  const people = (await db.query<{ grp: GroupKey; venue: Venue | null; n: number; present: number }>(`
    SELECT COALESCE(t.participant_count::text, 'none') AS grp, p.assigned_venue AS venue,
           count(*)::int AS n, count(*) FILTER (WHERE p.checked_in)::int AS present
    FROM participants p LEFT JOIN teams t ON t.id = p.team_id GROUP BY 1, 2`)).rows
  const teams = (await db.query<{ grp: GroupKey; teams: number; full: number; partial: number; absent: number }>(`
    SELECT t.participant_count::text AS grp, count(*)::int AS teams,
           count(*) FILTER (WHERE x.present = t.participant_count)::int AS full,
           count(*) FILTER (WHERE x.present > 0 AND x.present < t.participant_count)::int AS partial,
           count(*) FILTER (WHERE x.present = 0)::int AS absent
    FROM teams t JOIN LATERAL (SELECT count(*) FILTER (WHERE p.checked_in)::int AS present FROM participants p WHERE p.team_id = t.id) x ON true
    GROUP BY 1`)).rows
  return GROUPS.map(([key, label]) => {
    const mine = people.filter((r) => r.grp === key)
    const sum = (rows: typeof mine, f: 'n' | 'present') => rows.reduce((a, r) => a + r[f], 0)
    const t = teams.find((r) => r.grp === key)
    return {
      key, label, teams: key === 'none' ? null : t?.teams ?? 0,
      participants: sum(mine, 'n'), present: sum(mine, 'present'),
      venues: Object.fromEntries(VENUES.map((v) => [v, {
        participants: sum(mine.filter((r) => r.venue === v), 'n'), present: sum(mine.filter((r) => r.venue === v), 'present'),
      }])) as Record<Venue, { participants: number; present: number }>,
      ...(key === 'none' ? {} : { teams_full: t?.full ?? 0, teams_partial: t?.partial ?? 0, teams_absent: t?.absent ?? 0 }),
    }
  })
}

export async function eventStats(db: Db = pool()) {
  const rep = await allocationReport(db)
  const c = (await db.query<{ total: number; teams: number; checked: number }>(`SELECT
      (SELECT count(*)::int FROM participants) AS total, (SELECT count(*)::int FROM teams) AS teams,
      (SELECT count(*)::int FROM check_ins) AS checked`)).rows[0]!
  return {
    status: rep.status, total_participants: c.total, total_teams: c.teams, venues: rep.venues,
    checked_in: c.checked, not_checked_in: c.total - c.checked,
    percent: c.total ? Math.round((1000 * c.checked) / c.total) / 10 : 0,
    capacity_total: VENUES.reduce((a, v) => a + config.capacity[v], 0),
    per_venue: Object.fromEntries(await Promise.all(VENUES.map(async (v) => [v, await venueStats(v, 0, db)]))),
    breakdown: await attendanceBreakdown(db),
    recent: await recentCheckins(12, null, db),
  }
}
