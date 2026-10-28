import { z } from 'zod'
import { searchParticipants } from '@/lib/admin-queries'
import { VENUES } from '@/lib/config'
import { superRoute } from '@/lib/guards'
import { json, readQuery } from '@/lib/http'

export const dynamic = 'force-dynamic'

const Query = z.object({
  q: z.string().max(100).default(''),
  venue: z.enum(VENUES).optional(),
  checked: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
  offset: z.coerce.number().int().min(0).default(0),
})

export const GET = superRoute('admin.participants', async (req) => {
  const f = readQuery(req, Query)
  return json(await searchParticipants({ q: f.q, venue: f.venue ?? null, checked: f.checked ? f.checked === 'true' : null, limit: f.limit, offset: f.offset }))
})
