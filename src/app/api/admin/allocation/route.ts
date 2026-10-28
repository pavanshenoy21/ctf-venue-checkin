import { allocationReport } from '@/lib/allocation-service'
import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.allocation', async () => json(await allocationReport()))
