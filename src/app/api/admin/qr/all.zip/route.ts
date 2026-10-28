import { qrZip } from '@/lib/exports'
import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.qr.zip', async () => download(await qrZip(), 'application/zip', 'qr_codes.zip'))
