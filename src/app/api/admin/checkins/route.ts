import { z } from 'zod'
import { listCheckins } from '@/lib/admin-queries'
import { VENUES } from '@/lib/config'
import { superRoute } from '@/lib/guards'
import { json, readQuery } from '@/lib/http'

export const dynamic = 'force-dynamic'

const Query = z.object({ venue: z.enum(VENUES).optional() })

export const GET = superRoute('admin.checkins', async (req) => json(await listCheckins(readQuery(req, Query).venue ?? null)))
