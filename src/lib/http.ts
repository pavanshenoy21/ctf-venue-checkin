import { z } from 'zod'
import { RateLimitError } from './ratelimit'

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) { super(message) }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export function fail(status: number, error: string, detail?: unknown, headers: Record<string, string> = {}): Response {
  return json(detail === undefined ? { error } : { error, detail }, status, headers)
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_VALUE = 'ctf-app'

/**
 * Wraps a route handler: CSRF header on state-changing methods (defence in depth on top of SameSite=Strict
 * cookies), uniform error JSON, no-store caching. Logs only the route label - URLs can carry QR tokens.
 */
export function route<C = unknown>(label: string, fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (UNSAFE.has(req.method) && req.headers.get(CSRF_HEADER) !== CSRF_VALUE) return fail(400, 'Bad request')
      const res = await fn(req, ctx)
      if (!res.headers.has('Cache-Control')) res.headers.set('Cache-Control', 'no-store')
      return res
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, e.detail)
      if (e instanceof RateLimitError) return fail(429, 'Too many requests. Please slow down.', undefined, { 'Retry-After': String(e.retryAfterSec) })
      if (e instanceof z.ZodError) return fail(422, 'Invalid request', e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`))
      console.error(`[${label}] unhandled error on ${req.method}: ${(e as Error)?.name ?? 'Error'}`)
      return fail(500, 'Internal error')
    }
  }
}

// Reads a JSON body with a size cap and validates it. Unknown keys are dropped by the schema.
export async function readJson<T>(req: Request, schema: z.ZodType<T>, maxBytes = 16_384): Promise<T> {
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) throw new HttpError(413, 'Request too large')
  const text = await req.text()
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, 'Request too large')
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new HttpError(400, 'Body must be JSON') }
  return schema.parse(data)
}

// Validates the query string; unknown parameters are ignored.
export function readQuery<T>(req: Request, schema: z.ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams))
}

export function download(body: string | Buffer, contentType: string, filename: string): Response {
  return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
  })
}
