import { checkinsCsv } from '@/lib/exports'
import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.export.checkins', async () => download(await checkinsCsv(), 'text/csv; charset=utf-8', 'checkins.csv'))
