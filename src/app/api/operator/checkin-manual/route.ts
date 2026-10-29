import { z } from 'zod'
import { doManualCheckin, STATUS_CODE } from '@/lib/checkin'
import { config } from '@/lib/config'
import { operatorRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { hit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

// Check in someone picked from the manual search, when their QR won't scan. Venue rules as for a scan.
const Body = z.object({ participant_id: z.number().int().positive() })

export const POST = operatorRoute('operator.checkin_manual', async (req, op) => {
  hit(`checkin:${op.id}`, config.rate.checkin)
  const res = await doManualCheckin(op, (await readJson(req, Body)).participant_id)
  return json(res, STATUS_CODE[res.status])
})
