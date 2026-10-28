import { config } from './config'

// In-memory sliding-window limiter. Process-local by design: run ONE app instance.
export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) { super('rate limited') }
}

const hits = new Map<string, number[]>()
let lastGc = 0
let clock: () => number = () => Date.now()

export function _setClock(fn: (() => number) | null): void { clock = fn ?? (() => Date.now()) }
export function resetRateLimits(): void { hits.clear(); lastGc = 0 }

function gc(now: number): void {
  if (now - lastGc < 60_000 && hits.size < 20_000) return
  lastGc = now
  for (const [k, q] of hits) if (!q.length || q[q.length - 1]! < now - 120_000) hits.delete(k)
  if (hits.size > 50_000) hits.clear() // hard bound against key flooding
}

// Throws if key is already at its limit, without recording anything.
export function assertUnder(key: string, limit: number, windowMs = 60_000): void {
  const now = clock()
  const q = (hits.get(key) ?? []).filter((t) => t > now - windowMs)
  if (q.length >= limit) throw new RateLimitError(Math.max(1, Math.ceil((q[0]! + windowMs - now) / 1000)))
}

// Records one event for key; throws RateLimitError once `limit` events fall inside the window.
export function hit(key: string, limit: number, windowMs = 60_000): void {
  const now = clock()
  gc(now)
  const q = (hits.get(key) ?? []).filter((t) => t > now - windowMs)
  if (q.length >= limit) {
    hits.set(key, q)
    throw new RateLimitError(Math.max(1, Math.ceil((q[0]! + windowMs - now) / 1000)))
  }
  q.push(now)
  hits.set(key, q)
}

/**
 * Client IP for rate limiting. Route handlers can't see the socket address, so behind a reverse proxy
 * (TRUST_PROXY=true) we take the address the nearest PROXY_HOPS proxies appended to X-Forwarded-For.
 * The left-most entries are client-controlled and are never used. Without a trusted proxy every request
 * shares one bucket.
 */
export function clientIp(req: Request): string {
  if (!config.trustProxy) return 'direct'
  const hops = Math.max(1, Number.parseInt(process.env.PROXY_HOPS ?? '1', 10) || 1)
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const ip = xff.length >= hops ? xff[xff.length - hops]! : req.headers.get('x-real-ip')?.trim()
  return (ip || 'unknown').slice(0, 64)
}
