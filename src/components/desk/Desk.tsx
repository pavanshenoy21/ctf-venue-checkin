'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSignOut } from '../admin/Console'
import { api, fmtTime, VENUE_CAPS, type Venue } from '../api'
import { Bar } from '../ui'
import Scanner from './Scanner'

export interface ScanResult {
  status: 'SUCCESS' | 'ALREADY' | 'WRONG_VENUE' | 'INVALID' | 'NOT_READY' | 'ERROR'
  name?: string; team?: string | null; assigned_venue?: Venue | null; current_venue?: Venue
  checked_in_at?: string; venue?: Venue; message?: string
}

const THEME: Record<ScanResult['status'], { bg: string; title: string; ms: number }> = {
  SUCCESS: { bg: 'bg-green-600', title: 'CHECK-IN SUCCESSFUL', ms: 2500 },
  ALREADY: { bg: 'bg-amber-500 text-black', title: 'ALREADY CHECKED IN', ms: 4000 },
  WRONG_VENUE: { bg: 'bg-red-700', title: 'WRONG VENUE', ms: 6000 },
  INVALID: { bg: 'bg-red-700', title: 'INVALID QR CODE', ms: 4000 },
  NOT_READY: { bg: 'bg-red-700', title: 'CHECK-IN NOT OPEN', ms: 4000 },
  ERROR: { bg: 'bg-red-700', title: 'ERROR', ms: 4000 },
}

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null
  return <div className="mt-4"><p className="text-sm opacity-80">{k}</p><p className="text-3xl font-bold">{v}</p></div>
}

function ResultScreen({ res, onDone }: { res: ScanResult; onDone: () => void }) {
  const t = THEME[res.status]
  useEffect(() => { const id = setTimeout(onDone, t.ms); return () => clearTimeout(id) }, [res, onDone, t.ms])
  return (
    <div onClick={onDone} role="alertdialog" aria-live="assertive" aria-label={t.title}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center ${t.bg}`}>
      <h1 className="text-4xl font-extrabold sm:text-6xl">{t.title}</h1>
      {res.status === 'SUCCESS' && <p className="mt-2 text-8xl" aria-hidden>✓</p>}
      {res.status === 'INVALID' && <p className="mt-4 text-xl">This QR code is not recognized.<br />Please contact the organizers.</p>}
      {res.status === 'NOT_READY' && <p className="mt-4 text-xl">The allocation has not been confirmed yet.</p>}
      {res.status === 'ERROR' && <p className="mt-4 text-xl">{res.message}</p>}
      {res.name && <p className="mt-6 text-4xl font-extrabold sm:text-5xl">{res.name}</p>}
      {res.name && res.status !== 'WRONG_VENUE' && <Row k="Team" v={res.team || 'No team'} />}
      {res.status === 'WRONG_VENUE' && (<>
        <Row k="Assigned Venue" v={res.assigned_venue ? VENUE_CAPS[res.assigned_venue] : null} />
        <Row k="Current Venue" v={res.current_venue ? VENUE_CAPS[res.current_venue] : null} />
        <p className="mt-8 border-4 border-white px-4 py-2 text-5xl font-black">DO NOT CHECK IN</p>
        <p className="mt-4 text-lg">Please direct the participant to the correct venue.</p>
      </>)}
      {res.status === 'SUCCESS' && <Row k="Venue" v={res.assigned_venue ? VENUE_CAPS[res.assigned_venue] : null} />}
      {res.status === 'ALREADY' && <Row k="Venue" v={res.venue ? VENUE_CAPS[res.venue] : null} />}
      {(res.status === 'SUCCESS' || res.status === 'ALREADY') && <Row k="Checked in at" v={res.checked_in_at && new Date(res.checked_in_at).toLocaleTimeString()} />}
      <p className="absolute bottom-6 text-sm opacity-70">Returning to scanner… (tap to skip)</p>
    </div>
  )
}

interface DeskStats { label: string; capacity: number; assigned: number; checked_in: number; remaining: number; percent: number; recent: { at: string; name: string; team: string | null }[] }

export default function Desk({ venue, username }: { venue: Venue; username: string }) {
  const [d, setD] = useState<DeskStats | null>(null)
  const [scan, setScan] = useState(false)
  const [res, setRes] = useState<ScanResult | null>(null)
  const busy = useRef(false)
  const last = useRef({ t: '', at: 0 })
  const signOut = useSignOut()
  const load = useCallback(async () => { const r = await api<DeskStats>('/api/operator/dashboard'); if (r.ok) setD(r.data) }, [])
  useEffect(() => { void load(); const id = setInterval(() => void load(), 10000); return () => clearInterval(id) }, [load])

  const onToken = useCallback(async (raw: string, manual = false) => {
    if (busy.current) return
    const now = Date.now()
    // the camera re-reads a QR still in view; manual entry is deliberate, so never deduped
    if (!manual && last.current.t === raw && now - last.current.at < 4000) return
    busy.current = true
    last.current = { t: raw, at: now }
    const r = await api<ScanResult>('/api/operator/checkin', { method: 'POST', body: { qr_token: raw } })
    const out: ScanResult = r.data?.status ? r.data : {
      status: 'ERROR',
      message: r.status === 429 ? 'Too many scans, slow down.' : r.status === 401 ? 'Session expired. Sign in again.' : r.status === 422 ? 'That is not a valid QR code.' : 'Network error. Try again.',
    }
    if (navigator.vibrate) navigator.vibrate(out.status === 'SUCCESS' ? 80 : [120, 60, 120])
    setRes(out)
    void load()
  }, [load])
  const done = useCallback(() => { setRes(null); busy.current = false }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10">
      <div className="meander -mx-4" />
      <header className="flex items-center justify-between py-3">
        <span className="text-sm text-mist">Check-in desk, signed in as {username}</span>
        <button className="btn-quiet px-3 py-1.5 text-sm" onClick={signOut}>Sign out</button>
      </header>
      <h1 className="mt-4 text-center font-display text-4xl text-bronze-400 sm:text-5xl">{venue === 'ISE' ? 'ISE Seminar Hall' : 'DTH'}</h1>
      {d && (<>
        <section className="panel mt-6 p-5" aria-label="Venue attendance">
          <div className="flex items-baseline justify-between">
            <p className="num text-4xl font-bold">{d.checked_in}<span className="text-2xl font-normal text-mist"> of {d.assigned}</span></p>
            <p className="num text-2xl text-mist">{d.percent}%</p>
          </div>
          <p className="text-mist">checked in</p>
          <div className="mt-3"><Bar value={d.checked_in} max={d.assigned} height="h-3" label="Share checked in" /></div>
          <p className="num mt-3 text-sm text-mist">{d.remaining} still to arrive. Hall capacity {d.capacity}.</p>
        </section>
        <button className="btn-primary mt-6 w-full py-6 text-3xl font-bold" onClick={() => setScan(true)}>SCAN QR</button>
        <h2 className="mb-2 mt-8 font-display text-xl">Recent check-ins</h2>
        <div className="panel divide-y divide-sea-700/60">
          {d.recent.length === 0 && <p className="p-4 text-mist">No one has checked in here yet.</p>}
          {d.recent.map((r, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <span className="num text-mist">{fmtTime(r.at)}</span><span className="flex-1 font-medium">{r.name}</span><span className="text-mist">{r.team || 'No team'}</span>
            </div>))}
        </div>
      </>)}
      {scan && <Scanner onToken={onToken} paused={!!res} onClose={() => setScan(false)} />}
      {res && <ResultScreen res={res} onDone={done} />}
    </div>
  )
}
