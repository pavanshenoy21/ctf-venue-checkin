import { superRoute } from '@/lib/guards'
import { json, readJson } from '@/lib/http'
import { RegisterBody, registerWalkInTeam } from '@/lib/walk-ins'

export const dynamic = 'force-dynamic'

// Registers 1-3 walk-ins (picked from the no-team list, or new people) as a DTH team, then emails their QRs.
export const POST = superRoute('admin.walk_ins.team', async (req) => {
  const b = await readJson(req, RegisterBody)
  return json(await registerWalkInTeam(b), 201)
})
