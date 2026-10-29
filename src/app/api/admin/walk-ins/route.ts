import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { listWalkIns } from '@/lib/walk-ins'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.walk_ins', async () => json(await listWalkIns()))
