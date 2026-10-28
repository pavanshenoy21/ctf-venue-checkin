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
    <div className="flex min-h-screen flex-col">
      <div className="meander" />
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="font-display text-sm tracking-[0.3em] text-bronze-400 sm:text-base">VOYAGE TO ITHACA</p>
        {'error' in d && d.error === 'invalid' && (<>
          <h1 className="mt-10 text-3xl font-bold">INVALID QR CODE</h1>
          <p className="mt-3 text-parchment/80">This QR code is not recognized.<br />Please contact the organizers.</p>
        </>)}
        {'error' in d && d.error === 'busy' && <p className="mt-10 text-parchment/80">Too many requests. Please try again in a minute.</p>}
        {'ready' in d && !d.ready && (<>
          <h1 className="mt-10 text-3xl font-bold">VENUE NOT ASSIGNED YET</h1>
          <p className="mt-3 text-parchment/80">Hello {d.name}. Venues have not been announced yet. Please check back soon.</p>
        </>)}
        {'ready' in d && d.ready && (<>
          <p className="mt-10 text-sm tracking-widest text-mist">YOUR VENUE</p>
          <h1 className="mt-2 font-display text-5xl font-bold leading-tight text-bronze-400 sm:text-7xl">{d.venue_label}</h1>
          <div className="mt-8 text-lg">
            {d.team ? (<><p className="text-sm text-mist">Team</p><p className="text-2xl font-semibold">{d.team}</p></>) : <p className="text-xl">You are participating without a team.</p>}
            <p className="mt-2 text-mist">{d.name}</p>
          </div>
          <p className="mt-8">Please report to {d.team ? 'the ' : ''}<b>{d.venue_label}</b>{d.team ? ' venue' : ''} for check-in.</p>
          <p className="mt-2 text-sm text-mist">Your QR code will be verified at the entrance.</p>
        </>)}
      </main>
      <div className="meander" />
    </div>
  )
}
