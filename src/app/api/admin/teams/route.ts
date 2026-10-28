import { teamsWithMembers } from '@/lib/admin-queries'
import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.teams', async () => json(await teamsWithMembers()))
