import type { NextConfig } from 'next'

// Builds always run from the project folder; pin the root so a stray lockfile higher up can't change it.
const root = process.cwd()

// Sent on every response, pages and API alike. The per-request CSP for pages is added in src/proxy.ts.
export const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' }, // ignored by browsers over plain http
]

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  reactStrictMode: true,
  // pg is a native-style Node package; keep it out of the server bundle
  serverExternalPackages: ['pg'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
