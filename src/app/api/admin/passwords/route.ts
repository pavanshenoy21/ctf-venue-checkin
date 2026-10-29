import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { listPasswords } from '@/lib/passwords'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.passwords', async () => json(await listPasswords()))
