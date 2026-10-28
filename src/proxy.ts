import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp } from './lib/csp'

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === 'development',
    https: !['0', 'false', 'no', 'off'].includes((process.env.COOKIE_SECURE ?? 'true').toLowerCase()),
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

// Pages only: API responses are JSON/PNG/CSV and get the static headers from next.config.ts.
export const config = {
  matcher: [{
    source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
    missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
  }],
}
