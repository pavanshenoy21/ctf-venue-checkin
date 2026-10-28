import { qrList } from '@/lib/exports'
import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.qr.list', async () => json(await qrList()))
