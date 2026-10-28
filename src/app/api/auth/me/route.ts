import { currentAdmin, publicAdmin } from '@/lib/auth'
import { json, route } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = route('auth.me', async (req) => json(publicAdmin(await currentAdmin(req))))
