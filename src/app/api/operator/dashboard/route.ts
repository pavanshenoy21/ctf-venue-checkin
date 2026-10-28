import { operatorRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { venueStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

// Own venue only: the venue comes from the operator's account.
export const GET = operatorRoute('operator.dashboard', async (_req, op) => json(await venueStats(op.venue, 15)))
