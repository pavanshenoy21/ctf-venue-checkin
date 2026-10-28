import { z } from 'zod'
import { superRoute } from '@/lib/guards'
import { json, readQuery } from '@/lib/http'
import { emailPreview } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const Query = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const GET = superRoute('admin.emails', async (req) => {
  const { offset, limit } = readQuery(req, Query)
  return json(await emailPreview(offset, limit))
})
