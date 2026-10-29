import { z } from 'zod'
import { lookup, STATUS_CODE } from '@/lib/checkin'
import { config } from '@/lib/config'
import { operatorRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { hit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

// Who a scanned QR (or a manual search pick) belongs to, so the operator can confirm before checking in.
// Records nothing. Own venue only, like a check-in.
const Body = z.union([z.object({ qr_token: z.string().min(1).max(600) }), z.object({ participant_id: z.number().int().positive() })])

export const POST = operatorRoute('operator.lookup', async (req, op) => {
  hit(`checkin:${op.id}`, config.rate.checkin)
  const res = await lookup(op, await readJson(req, Body))
  return json(res, STATUS_CODE[res.status])
})
