import { confirmAllocation } from '@/lib/allocation-service'
import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const POST = superRoute('admin.allocation.confirm', async () => json(await confirmAllocation()))
