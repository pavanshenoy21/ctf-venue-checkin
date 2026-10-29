import { z } from 'zod'
import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { sendWalkInQr } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const Body = z.object({ id: z.number().int().positive() })

// Emails one person without a team their check-in QR, after they report at the DTH desk.
export const POST = superRoute('admin.walk_ins.send_qr', async (req) => {
  const b = await readJson(req, Body)
  return json(await sendWalkInQr(b.id))
})
