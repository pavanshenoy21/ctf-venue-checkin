import { exitsCsv } from '@/lib/exits'
import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.export.exits', async () => download(await exitsCsv(), 'text/csv; charset=utf-8', 'exits.csv'))
