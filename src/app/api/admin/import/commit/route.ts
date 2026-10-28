import { parseCsv } from '@/lib/csv-import'
import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { commitImport } from '@/lib/import-service'
import { readUpload } from '@/lib/upload'

export const dynamic = 'force-dynamic'

export const POST = superRoute('admin.import.commit', async (req) => json(await commitImport(parseCsv(await readUpload(req)))))
