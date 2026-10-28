import { allocationCsv } from '@/lib/exports'
import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.export.allocation', async () => download(await allocationCsv(), 'text/csv; charset=utf-8', 'allocation.csv'))
