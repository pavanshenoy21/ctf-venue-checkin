import { z } from 'zod'
import { authenticate, createSession, publicAdmin, sessionCookie } from '@/lib/auth'
import { config } from '@/lib/config'
import { HttpError, json, readJson, route } from '@/lib/http'
import { clientIp, hit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const Body = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) })

export const POST = route('auth.login', async (req) => {
  const body = await readJson(req, Body)
  const ip = clientIp(req)
  // Per IP, and per IP+username. Deliberately no global per-username bucket: that would let anyone
  // lock an operator out by hammering their username.
  hit(`login:${ip}`, config.rate.login * 3)
  hit(`login:${ip}:${body.username.toLowerCase()}`, config.rate.login)
  const admin = await authenticate(body.username, body.password)
  if (!admin) throw new HttpError(401, 'Invalid username or password')
  const token = await createSession(admin.id)
  return json(publicAdmin(admin), 200, { 'Set-Cookie': sessionCookie(token) })
})
