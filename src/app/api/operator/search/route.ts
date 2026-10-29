import { z } from 'zod'
import { searchVenue } from '@/lib/checkin'
import { config } from '@/lib/config'
import { operatorRoute } from '@/lib/guards'
import { json, readQuery } from '@/lib/http'
import { hit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const Query = z.object({ q: z.string().trim().min(2).max(100) })

// Manual check-in search, own venue only: the venue comes from the operator's account.
export const GET = operatorRoute('operator.search', async (req, op) => {
  hit(`search:${op.id}`, config.rate.checkin)
  return json({ people: await searchVenue(op, readQuery(req, Query).q) })
})
