import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import '@fontsource/marcellus/400.css'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Venue Check-in',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes every page render per request. That is required: Next.js can only
  // stamp the CSP nonce (set in src/proxy.ts) onto its scripts at request time, and a pre-built page's
  // scripts would be blocked by the CSP.
  await headers()
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
