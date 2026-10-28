import { json, route } from '@/lib/http'
import { publicVenue } from '@/lib/public'

export const dynamic = 'force-dynamic'

export const GET = route<{ params: Promise<{ token: string }> }>('public.venue', async (req, { params }) =>
  json(await publicVenue(req, (await params).token)))
