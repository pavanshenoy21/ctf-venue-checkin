import { z } from 'zod'
import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { startSend } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const Body = z.object({ only_email: z.string().max(254).nullish(), resend: z.boolean().default(false) })

// Starts a background job; progress shows up in GET /api/admin/emails (sent / failed counts).
export const POST = superRoute('admin.emails.send', async (req) => {
  const b = await readJson(req, Body)
  return json(await startSend({ onlyEmail: b.only_email ?? null, resend: b.resend }))
})
