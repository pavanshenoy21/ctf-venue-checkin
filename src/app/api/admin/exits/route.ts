import { ExitBody, listExits, recordExit } from '@/lib/exits'
import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.exits', async () => json(await listExits()))

// Let a checked-in participant step out: records the reason and emails a one-time re-entry QR.
export const POST = superRoute('admin.exits.record', async (req, admin) => json(await recordExit(admin, await readJson(req, ExitBody)), 201))
