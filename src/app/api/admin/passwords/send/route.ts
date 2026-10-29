import { z } from 'zod'
import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { sendPasswords } from '@/lib/passwords'

export const dynamic = 'force-dynamic'

// Without id: emails every checked-in player not yet sent theirs (in the background). With id: that one player.
const Body = z.object({ id: z.number().int().positive().nullish() })

export const POST = superRoute('admin.passwords.send', async (req) => json(await sendPasswords({ id: (await readJson(req, Body)).id ?? null })))
