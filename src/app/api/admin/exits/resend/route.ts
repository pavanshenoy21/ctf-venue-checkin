import { z } from 'zod'
import { resendExitEmail } from '@/lib/exits'
import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

const Body = z.object({ id: z.number().int().positive() })

export const POST = superRoute('admin.exits.resend', async (req) => json(await resendExitEmail((await readJson(req, Body)).id)))
