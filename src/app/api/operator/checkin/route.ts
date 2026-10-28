import { z } from 'zod'
import { doCheckin, STATUS_CODE } from '@/lib/checkin'
import { config } from '@/lib/config'
import { operatorRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { hit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

// Only qr_token is read. Any "venue" (or other field) in the body is dropped by the schema.
const Body = z.object({ qr_token: z.string().min(1).max(600) })

export const POST = operatorRoute('operator.checkin', async (req, op) => {
  hit(`checkin:${op.id}`, config.rate.checkin)
  const res = await doCheckin(op, (await readJson(req, Body)).qr_token)
  return json(res, STATUS_CODE[res.status])
})
