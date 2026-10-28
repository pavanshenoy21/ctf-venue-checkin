import { route } from '@/lib/http'
import { findByToken } from '@/lib/public'
import { qrPng } from '@/lib/qr'

export const dynamic = 'force-dynamic'

// GET /api/public/qr/<token>.png - the hosted QR image used by mail-merge emails.
export const GET = route<{ params: Promise<{ file: string }> }>('public.qr', async (req, { params }) => {
  const m = /^([A-Za-z0-9_-]{32,64})\.png$/.exec((await params).file)
  const token = m ? m[1]! : ''
  if (!token) await findByToken(req, '') // counts as a miss, throws 404
  await findByToken(req, token)
  return new Response(new Uint8Array(await qrPng(token)), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
})
