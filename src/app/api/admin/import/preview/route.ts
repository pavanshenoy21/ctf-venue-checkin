import { parseCsv } from '@/lib/csv-import'
import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { readUpload } from '@/lib/upload'

export const dynamic = 'force-dynamic'

// Dry run: parse and validate, change nothing.
export const POST = superRoute('admin.import.preview', async (req) => {
  const p = parseCsv(await readUpload(req))
  return json({ summary: p.summary, errors: p.errors, warnings: p.warnings, oversized: p.oversized, teams: p.teams })
})
