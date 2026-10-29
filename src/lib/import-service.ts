import type { Parsed } from './csv-import'
import { tx } from './db'
import { HttpError } from './http'
import { newQrToken } from './security'
import { getState } from './state'

// Replaces every participant and team with the parsed CSV, giving each person a fresh QR token.
export async function commitImport(parsed: Parsed): Promise<Parsed['summary']> {
  if (parsed.errors.length) throw new HttpError(422, 'CSV has validation errors; fix them before importing.', parsed.errors)
  return tx(async (db) => {
    const st = await getState(db, true)
    if (st.allocation_status === 'CONFIRMED') throw new HttpError(409, 'Allocation is confirmed; participants can no longer be re-imported.')
    // check_ins can only exist after confirmation, so there are none to clear here
    await db.query('DELETE FROM participants')
    await db.query('DELETE FROM teams')
    const teams = parsed.teams
    const ids = new Map<string, number>()
    if (teams.length) {
      const r = await db.query<{ id: number; name: string }>(
        'INSERT INTO teams (name, participant_count) SELECT * FROM unnest($1::text[], $2::int[]) RETURNING id, name',
        [teams.map((t) => t.name), teams.map((t) => t.size)])
      for (const row of r.rows) ids.set(row.name.toLowerCase(), row.id)
    }
    const rows = parsed.rows
    const col = <K extends keyof (typeof rows)[number]>(k: K) => rows.map((r) => (r[k] === '' ? null : r[k]))
    await db.query(
      `INSERT INTO participants (name, email, phone, sap_id, year, branch, team_id, qr_token, preset_venue)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[])`,
      [col('name'), col('email'), col('phone'), col('sap'), col('year'), col('branch'),
        rows.map((r) => (r.team ? ids.get(r.team.toLowerCase())! : null)), rows.map(() => newQrToken()), col('venue')])
    await db.query("UPDATE event_state SET allocation_status = 'NONE', confirmed_at = NULL WHERE id = 1")
    return parsed.summary
  })
}
