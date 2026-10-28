// Per-request Content-Security-Policy for pages. Next.js reads the nonce from this header while rendering
// and stamps it on its own <script> tags, so no inline script without the nonce can run.
export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean }): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // progress bars and the email preview use style="" attributes; those can't run code
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}
