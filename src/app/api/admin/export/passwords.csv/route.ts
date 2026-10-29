import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'
import { passwordsCsv } from '@/lib/passwords'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.export.passwords', async () => download(await passwordsCsv(), 'text/csv; charset=utf-8', 'passwords.csv'))
