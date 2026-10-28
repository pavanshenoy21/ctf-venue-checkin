import { one } from '@/lib/db'
import { superRoute } from '@/lib/guards'
import { HttpError } from '@/lib/http'
import { qrPng } from '@/lib/qr'

export const dynamic = 'force-dynamic'

// GET /api/admin/qr/<participant id>.png
export const GET = superRoute<{ params: Promise<{ file: string }> }>('admin.qr.png', async (_req, _a, { params }) => {
  const m = /^(\d{1,9})\.png$/.exec((await params).file)
  const p = m ? await one<{ qr_token: string }>('SELECT qr_token FROM participants WHERE id = $1', [Number(m[1])]) : undefined
  if (!p) throw new HttpError(404, 'Not found')
  return new Response(new Uint8Array(await qrPng(p.qr_token)), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
})
