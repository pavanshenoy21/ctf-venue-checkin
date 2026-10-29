import { z } from 'zod'
import { cancelExit } from '@/lib/exits'
import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

const Body = z.object({ id: z.number().int().positive() })

export const POST = superRoute('admin.exits.cancel', async (req) => json(await cancelExit((await readJson(req, Body)).id)))
