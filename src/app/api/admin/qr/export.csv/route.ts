import { qrCsv } from '@/lib/exports'
import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.qr.csv', async () => download(await qrCsv(), 'text/csv; charset=utf-8', 'qr_codes.csv'))
