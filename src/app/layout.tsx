import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import Nonce from '@/components/Nonce'
import './globals.css'

// The CTFd theme's type, self-hosted (the CSP allows fonts from this origin only).
const grotesk = localFont({ src: './fonts/space-grotesk.woff2', weight: '300 700', variable: '--font-grotesk', display: 'swap' })
const syne = localFont({ src: [{ path: './fonts/syne-700.woff2', weight: '700' }, { path: './fonts/syne-800.woff2', weight: '800' }], variable: '--font-syne', display: 'swap' })
const jetbrains = localFont({ src: './fonts/jetbrains-mono.woff2', weight: '100 800', variable: '--font-jetbrains', display: 'swap' })

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
  const nonce = (await headers()).get('x-nonce') ?? ''
  return (
    <html lang="en" className={`${grotesk.variable} ${syne.variable} ${jetbrains.variable}`}>
      <body><Nonce nonce={nonce} />{children}</body>
    </html>
  )
}
