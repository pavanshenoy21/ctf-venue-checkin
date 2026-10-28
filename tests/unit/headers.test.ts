import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import nextConfig, { securityHeaders } from '../../next.config'
import { buildCsp } from '@/lib/csp'
import { config as proxyConfig, proxy } from '@/proxy'

describe('content security policy', () => {
  it('allows scripts only from this site and with the per-request nonce', () => {
    const csp = buildCsp('abc123', { dev: false, https: true })
    const script = csp.split('; ').find((d) => d.startsWith('script-src'))!
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })
  it("adds 'unsafe-eval' only in development and skips https upgrade on plain http", () => {
    expect(buildCsp('n', { dev: true, https: false })).toMatch(/script-src[^;]*'unsafe-eval'/)
    expect(buildCsp('n', { dev: false, https: false })).not.toContain('unsafe-eval')
    expect(buildCsp('n', { dev: false, https: false })).not.toContain('upgrade-insecure-requests')
  })
  it('the proxy sets a fresh nonce per request on the response and the forwarded request', () => {
    const a = proxy(new NextRequest('http://localhost/admin'))
    const b = proxy(new NextRequest('http://localhost/admin'))
    const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)![1]
    const ca = a.headers.get('content-security-policy')!, cb = b.headers.get('content-security-policy')!
    expect(nonceOf(ca)).not.toBe(nonceOf(cb))
    expect(nonceOf(ca)!.length).toBeGreaterThanOrEqual(24)
    expect(a.headers.get('x-middleware-request-x-nonce')).toBe(nonceOf(ca))
  })
  it('runs on pages but not on API routes or static assets', () => {
    const re = new RegExp(`^${proxyConfig.matcher[0]!.source}$`)
    for (const p of ['/admin', '/admin/login', '/checkin/abc', '/']) expect(re.test(p)).toBe(true)
    for (const p of ['/api/auth/login', '/_next/static/x.js', '/_next/image', '/favicon.ico']) expect(re.test(p)).toBe(false)
  })
})

describe('static security headers', () => {
  it('apply to every path', async () => {
    const rules = await nextConfig.headers!()
    expect(rules).toEqual([{ source: '/:path*', headers: securityHeaders }])
    const h = Object.fromEntries(securityHeaders.map((x) => [x.key, x.value]))
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBe('no-referrer')
    expect(h['Permissions-Policy']).toMatch(/camera=\(self\)/)
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
