import { confirmAllocation, generateAllocation } from '@/lib/allocation-service'
import { parseCsv } from '@/lib/csv-import'
import { q } from '@/lib/db'
import { demoCsv } from '@/lib/demo'
import { commitImport } from '@/lib/import-service'

// The demo event: 45 trios, 10 duos, 6 solos, 10 people without a team (171 people).
export async function importDemo(): Promise<void> { await commitImport(parseCsv(demoCsv())) }
export async function confirmedDemo(): Promise<void> { await importDemo(); await generateAllocation(); await confirmAllocation() }

export async function participant(where: string, params: unknown[] = []) {
  const [p] = await q<{ id: number; name: string; email: string; qr_token: string; assigned_venue: string; team_id: number | null }>(
    `SELECT id, name, email, qr_token, assigned_venue, team_id FROM participants WHERE ${where} ORDER BY id LIMIT 1`, params)
  return p!
}

// Records a check-in straight into the DB (the operator API arrives in Phase 5).
export async function checkIn(id: number): Promise<void> {
  await q('INSERT INTO check_ins (participant_id, venue) SELECT id, assigned_venue FROM participants WHERE id = $1', [id])
}
