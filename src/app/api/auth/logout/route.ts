import { clearedCookie, COOKIE, deleteSession, readCookie } from '@/lib/auth'
import { json, route } from '@/lib/http'

export const dynamic = 'force-dynamic'

export const POST = route('auth.logout', async (req) => {
  await deleteSession(readCookie(req, COOKIE))
  return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie() })
})
