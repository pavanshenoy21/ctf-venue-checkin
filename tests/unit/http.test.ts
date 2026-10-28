import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HttpError, readJson, route } from '@/lib/http'
import { clientIp, hit, RateLimitError, resetRateLimits, _setClock } from '@/lib/ratelimit'
import { makeReq } from '../helpers/http'

afterEach(() => { vi.restoreAllMocks(); delete process.env.TRUST_PROXY; delete process.env.PROXY_HOPS; resetRateLimits(); _setClock(null) })

const ok = route('t.ok', async () => Response.json({ ok: true }))
const run = (h: ReturnType<typeof route>, method = 'POST', o: Parameters<typeof makeReq>[2] = {}) => h(makeReq(method, '/api/x', o), {} as never)

describe('route wrapper', () => {
  it('requires the CSRF header on state-changing methods only', async () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await run(ok, m, { csrf: false })).status).toBe(400)
    expect((await run(ok, 'GET', { csrf: false })).status).toBe(200)
    expect((await run(ok, 'POST', { headers: { 'x-requested-with': 'XMLHttpRequest' }, csrf: false })).status).toBe(400)
  })
  it('marks responses no-store', async () => {
    expect((await run(ok, 'GET')).headers.get('cache-control')).toBe('no-store')
  })
  it('maps HttpError, ZodError and RateLimitError to clean JSON', async () => {
    const h = route('t', async () => { throw new HttpError(409, 'Nope', ['why']) })
    const r = await run(h)
    expect([r.status, await r.json()]).toEqual([409, { error: 'Nope', detail: ['why'] }])
    const z422 = await run(route('t', async () => { z.object({ a: z.string() }).parse({ a: 1 }); return new Response() }))
    expect(z422.status).toBe(422)
    expect((await z422.json()).detail[0]).toMatch(/^a: /)
    const r429 = await run(route('t', async () => { throw new RateLimitError(7) }))
    expect([r429.status, r429.headers.get('retry-after')]).toEqual([429, '7'])
  })
  it('hides internal errors and never logs the URL (which can contain QR tokens)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secret = 'SECRETTOKENSECRETTOKENSECRETTOKEN'
    const h = route('public.venue', async () => { throw new Error(`db failed for ${secret}`) })
    const r = await h(makeReq('GET', `/api/public/venue/${secret}`), {} as never)
    expect([r.status, await r.json()]).toEqual([500, { error: 'Internal error' }])
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('public.venue')
    expect(logged).not.toContain(secret)
  })
})

describe('readJson', () => {
  const S = z.object({ a: z.number() })
  it('parses, validates and drops unknown keys', async () => {
    expect(await readJson(makeReq('POST', '/', { body: { a: 1, venue: 'ISE' } }), S)).toEqual({ a: 1 })
  })
  it('rejects bad JSON and oversized bodies', async () => {
    await expect(readJson(makeReq('POST', '/', { body: '{nope' }), S)).rejects.toMatchObject({ status: 400 })
    await expect(readJson(makeReq('POST', '/', { body: { a: 1, pad: 'x'.repeat(100) } }), S, 50)).rejects.toMatchObject({ status: 413 })
    await expect(readJson(makeReq('POST', '/', { body: { a: 1 }, headers: { 'content-length': '999999' } }), S)).rejects.toMatchObject({ status: 413 })
  })
})

describe('rate limiter', () => {
  it('allows `limit` hits per window then reports when to retry', () => {
    let now = 0
    _setClock(() => now)
    for (let i = 0; i < 3; i++) hit('k', 3)
    try { hit('k', 3); throw new Error('expected limit') } catch (e) { expect((e as RateLimitError).retryAfterSec).toBe(60) }
    now = 30_000
    try { hit('k', 3) } catch (e) { expect((e as RateLimitError).retryAfterSec).toBe(30) }
    now = 60_001
    expect(() => hit('k', 3)).not.toThrow()
  })
  it('keeps keys independent', () => {
    hit('a', 1)
    expect(() => hit('b', 1)).not.toThrow()
    expect(() => hit('a', 1)).toThrow(RateLimitError)
  })
  it('stays bounded under key flooding', () => {
    let now = 0
    _setClock(() => now)
    for (let i = 0; i < 60_000; i++) hit(`flood-${i}`, 5)
    now = 200_000
    hit('after', 5)                                   // triggers clean-up of stale keys
    expect(() => hit('flood-1', 1)).not.toThrow()      // old entries were collected
  })
})

describe('clientIp', () => {
  const ip = (headers: Record<string, string>) => clientIp(makeReq('GET', '/', { headers }))
  it('uses one shared bucket when no proxy is trusted', () => {
    expect(ip({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4' })).toBe('direct')
  })
  it('takes the entry appended by the trusted proxy, not the client-supplied ones', () => {
    process.env.TRUST_PROXY = 'true'
    expect(ip({ 'x-forwarded-for': '1.1.1.1' })).toBe('1.1.1.1')
    expect(ip({ 'x-forwarded-for': 'spoofed, 2.2.2.2' })).toBe('2.2.2.2')
    process.env.PROXY_HOPS = '2'
    expect(ip({ 'x-forwarded-for': 'spoofed, 3.3.3.3, 10.0.0.1' })).toBe('3.3.3.3')
  })
  it('falls back to X-Real-IP, then to a shared bucket', () => {
    process.env.TRUST_PROXY = 'true'
    expect(ip({ 'x-real-ip': '4.4.4.4' })).toBe('4.4.4.4')
    expect(ip({})).toBe('unknown')
  })
})
