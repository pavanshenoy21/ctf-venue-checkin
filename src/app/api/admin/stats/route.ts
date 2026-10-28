import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { eventStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.stats', async () => json(await eventStats()))
