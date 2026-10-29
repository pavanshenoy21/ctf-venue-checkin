import { headers } from 'next/headers'
import { HttpError } from '@/lib/http'
import { publicVenue } from '@/lib/public'
import { RateLimitError } from '@/lib/ratelimit'

export const metadata = { title: 'Your venue' }

type Outcome = Awaited<ReturnType<typeof publicVenue>> | { error: 'invalid' | 'busy' }

// Rendered on the server: no client JavaScript needed, and the same rate limits as the public API apply.
async function lookup(token: string): Promise<Outcome> {
  const req = new Request('http://internal/checkin', { headers: await headers() })
  try {
    return await publicVenue(req, token)
  } catch (e) {
    if (e instanceof RateLimitError) return { error: 'busy' }
    if (e instanceof HttpError) return { error: 'invalid' }
    throw e
  }
}

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const d = await lookup((await params).token)
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
      <img src="/email-logo.png" alt="Coding Club · 10 Years" className="h-16 w-auto" />
      <p className="eyebrow mt-6 whitespace-nowrap text-primary">Voyage to Ithaca</p>
      {'error' in d && d.error === 'invalid' && (<>
        <h1 className="mt-10 font-display text-3xl font-extrabold">INVALID QR CODE</h1>
        <p className="mt-3 text-foreground/80">This QR code is not recognized.<br />Please contact the organizers.</p>
      </>)}
      {'error' in d && d.error === 'busy' && <p className="mt-10 text-foreground/80">Too many requests. Please try again in a minute.</p>}
      {'ready' in d && !d.ready && (<>
        <h1 className="mt-10 font-display text-3xl font-extrabold">VENUE NOT ASSIGNED YET</h1>
        <p className="mt-3 text-foreground/80">Hello {d.name}. Venues have not been announced yet. Please check back soon.</p>
      </>)}
      {'ready' in d && d.ready && (
        <div className="mt-10 w-full rounded-2xl border bg-card px-6 py-8 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.9)]">
          {d.pass && <p className={`eyebrow mb-4 ${d.pass === 'open' ? 'text-gold-light' : 'text-[#f3a49b]'}`}>
            {d.pass === 'open' ? 'Re-entry pass · works once' : d.pass === 'used' ? 'Re-entry pass · already used' : 'Re-entry pass · cancelled'}</p>}
          <p className="eyebrow text-muted-foreground">Your venue</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.05] tracking-[-0.02em] text-gold-light sm:text-6xl">{d.venue_label}</h1>
          <div className="mt-8 border-t pt-6">
            {d.team ? (<><p className="eyebrow text-muted-foreground">Team</p><p className="mt-1 font-display text-2xl font-bold">{d.team}</p></>) : <p className="text-xl">You are participating without a team.</p>}
            <p className="mt-2 text-muted-foreground">{d.name}</p>
          </div>
          {d.pass === 'open'
            ? <p className="mt-6">Show this re-entry QR at the <b className="text-gold-light">{d.venue_label}</b> desk to come back in.</p>
            : <p className="mt-6">Please report to {d.team ? 'the ' : ''}<b className="text-gold-light">{d.venue_label}</b>{d.team ? ' venue' : ''} for check-in.</p>}
          <p className="mt-2 text-sm text-muted-foreground">Your QR code will be verified at the entrance.</p>
        </div>
      )}
    </main>
  )
}
