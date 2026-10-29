'use client'

import { AlertTriangle, Ban, CheckCircle2, Clock, DoorOpen, LogIn, LogOut, ScanLine, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { Brand, useSignOut } from '../admin/Console'
import { api, fmtTime, VENUE, VENUE_CAPS, type ApiResult, type Venue } from '../api'
import { Bar } from '../kit'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import ManualCheckin from './ManualCheckin'
import Scanner from './Scanner'

export interface ScanResult {
  status: 'READY' | 'SUCCESS' | 'ALREADY' | 'WRONG_VENUE' | 'INVALID' | 'NOT_READY' | 'NOT_REGISTERED' | 'ERROR'
    | 'REENTRY' | 'RETURNED' | 'OUT' | 'REENTRY_USED'
  name?: string; team?: string | null; sap_id?: string | null; year?: string | null; branch?: string | null
  assigned_venue?: Venue | null; current_venue?: Venue
  checked_in_at?: string; venue?: Venue; message?: string
  reason?: string; out_at?: string; returned_at?: string // temporary exits
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null)
const minutes = (from?: string, to?: string) => (from && to ? Math.max(0, Math.round((+new Date(to) - +new Date(from)) / 60000)) : 0)

// Full-screen outcome after a check-in attempt: one glance tells the operator what to do.
const THEME: Record<Exclude<ScanResult['status'], 'READY' | 'REENTRY'>, { bg: string; ring: string; title: string; ms: number; Icon: LucideIcon }> = {
  SUCCESS: { bg: 'from-[#0f6b39] to-[#04220f]', ring: 'text-[#8ff0b4]', title: 'CHECK-IN SUCCESSFUL', ms: 2500, Icon: CheckCircle2 },
  ALREADY: { bg: 'from-[#8a5d0c] to-[#2a1c03]', ring: 'text-[#ffd98a]', title: 'ALREADY CHECKED IN', ms: 4000, Icon: Clock },
  WRONG_VENUE: { bg: 'from-[#8f1f1a] to-[#2a0806]', ring: 'text-[#ffb0a8]', title: 'WRONG VENUE', ms: 6000, Icon: Ban },
  INVALID: { bg: 'from-[#8f1f1a] to-[#2a0806]', ring: 'text-[#ffb0a8]', title: 'INVALID QR CODE', ms: 4000, Icon: XCircle },
  NOT_READY: { bg: 'from-[#8f1f1a] to-[#2a0806]', ring: 'text-[#ffb0a8]', title: 'CHECK-IN NOT OPEN', ms: 4000, Icon: AlertTriangle },
  NOT_REGISTERED: { bg: 'from-[#8f1f1a] to-[#2a0806]', ring: 'text-[#ffb0a8]', title: 'NOT REGISTERED YET', ms: 6000, Icon: AlertTriangle },
  ERROR: { bg: 'from-[#8f1f1a] to-[#2a0806]', ring: 'text-[#ffb0a8]', title: 'ERROR', ms: 4000, Icon: AlertTriangle },
  RETURNED: { bg: 'from-[#0f6b39] to-[#04220f]', ring: 'text-[#8ff0b4]', title: 'WELCOME BACK', ms: 2500, Icon: LogIn },
  OUT: { bg: 'from-[#8a5d0c] to-[#2a1c03]', ring: 'text-[#ffd98a]', title: 'ON TEMPORARY EXIT', ms: 7000, Icon: DoorOpen },
  REENTRY_USED: { bg: 'from-[#8f1f1a] to-[#2a0806]', ring: 'text-[#ffb0a8]', title: 'RE-ENTRY QR ALREADY USED', ms: 6000, Icon: XCircle },
}

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null
  return <div className="mt-5"><p className="eyebrow text-white/60">{k}</p><p className="mt-1 text-2xl font-bold sm:text-3xl">{v}</p></div>
}

function ResultScreen({ res, onDone }: { res: ScanResult; onDone: () => void }) {
  const t = THEME[res.status as keyof typeof THEME]
  useEffect(() => { const id = setTimeout(onDone, t.ms); return () => clearTimeout(id) }, [res, onDone, t.ms])
  return (
    <div onClick={onDone} role="alertdialog" aria-live="assertive" aria-label={t.title}
      className={cn('fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b px-6 text-center text-white', t.bg)}>
      <t.Icon className={cn('animate-pop size-24 drop-shadow-[0_0_30px_currentColor] sm:size-28', t.ring)} strokeWidth={1.75} aria-hidden />
      <h1 className="mt-6 whitespace-nowrap font-bold tracking-tight" style={{ fontSize: `min(3rem, calc((100vw - 3.5rem) / ${(Math.max(t.title.length, 15) * 0.66).toFixed(2)}))` }}>{t.title}</h1>
      {res.status === 'INVALID' && <p className="mt-4 text-lg text-white/85">This QR code is not recognized.<br />Please contact the organizers.</p>}
      {res.status === 'NOT_READY' && <p className="mt-4 text-lg text-white/85">The allocation has not been confirmed yet.</p>}
      {res.status === 'NOT_REGISTERED' && <p className="mt-4 text-lg text-white/85">They registered without a team and haven&apos;t been registered at the walk-in desk.<br />Send them there first.</p>}
      {res.status === 'ERROR' && <p className="mt-4 text-lg text-white/85">{res.message}</p>}
      {/* one line, never cut off: the size comes from the screen width and the name's length */}
      {res.name && <p className="mt-7 whitespace-nowrap font-bold leading-tight tracking-tight" style={{ fontSize: `min(3rem, calc((100vw - 3.5rem) / ${(res.name.length * 0.64).toFixed(2)}))` }}>{res.name}</p>}
      {res.name && res.status !== 'WRONG_VENUE' && res.status !== 'NOT_REGISTERED' && <Row k="Team" v={res.team || 'No team'} />}
      {res.status === 'OUT' && (<>
        <Row k="Stepped out" v={`${time(res.out_at)} · ${res.reason}`} />
        <p className="mt-6 max-w-md text-lg text-white/85">Their original QR won&apos;t let them back in. Scan the re-entry QR from their email, or use Manual check-in to let them back in.</p>
      </>)}
      {res.status === 'REENTRY_USED' && <Row k="Already back in at" v={time(res.returned_at)} />}
      {res.status === 'RETURNED' && <Row k="Was out" v={`${minutes(res.out_at, res.checked_in_at)} min · ${res.reason}`} />}
      {res.status === 'ALREADY' && <Row k="SAP ID" v={res.sap_id} />}
      {res.status === 'WRONG_VENUE' && (<>
        <Row k="Assigned Venue" v={res.assigned_venue ? VENUE_CAPS[res.assigned_venue] : null} />
        <Row k="Current Venue" v={res.current_venue ? VENUE_CAPS[res.current_venue] : null} />
        <p className="mt-8 rounded-lg border-4 border-white px-5 py-2 font-display text-4xl font-extrabold sm:text-5xl">DO NOT CHECK IN</p>
        <p className="mt-4 text-lg text-white/85">Please direct the participant to the correct venue.</p>
      </>)}
      {res.status === 'SUCCESS' && <Row k="Venue" v={res.assigned_venue ? VENUE_CAPS[res.assigned_venue] : null} />}
      {res.status === 'ALREADY' && <Row k="Venue" v={res.venue ? VENUE_CAPS[res.venue] : null} />}
      {(res.status === 'SUCCESS' || res.status === 'ALREADY') && <Row k="Checked in at" v={res.checked_in_at && new Date(res.checked_in_at).toLocaleTimeString()} />}
      {res.status === 'RETURNED' && <Row k="Back in at" v={time(res.checked_in_at)} />}
      <p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] font-mono text-xs uppercase tracking-[0.2em] text-white/60">Tap to continue</p>
    </div>
  )
}

const initials = (name = '') => name.split(/\s+/).filter((w) => w.length > 1).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

// Shown after a scan or a manual pick: who this is, so the operator can check their ID before confirming.
function ConfirmScreen({ p, venue, busy, onConfirm, onCancel }: { p: ScanResult; venue: Venue; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const detail = (k: string, v?: string | null, wide = false) => (
    <div className={cn('rounded-xl border bg-black/30 px-4 py-3', wide && 'col-span-2')}>
      <p className="eyebrow text-[0.62rem] text-muted-foreground">{k}</p>
      <p className="mt-1 break-words font-medium leading-snug">{v || <span className="text-muted-foreground">Not on file</span>}</p>
    </div>
  )
  const back = p.status === 'REENTRY'
  return (
    <div role="alertdialog" aria-label={back ? 'Confirm re-entry' : 'Confirm check-in'} className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/85 backdrop-blur-sm sm:items-center sm:p-6">
      <Card className="animate-in slide-in-from-bottom-6 fade-in w-full max-w-md gap-0 rounded-b-none px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 duration-200 sm:rounded-2xl sm:px-7">
        <p className="eyebrow flex items-center gap-2 text-primary"><ShieldCheck className="size-4" />{back ? 'Re-entry' : 'Confirm check-in'} · {VENUE[venue]}</p>

        <div className="mt-5 flex items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border bg-white/[0.05] font-display text-2xl font-extrabold text-foreground">{initials(p.name)}</span>
          <h1 className="min-w-0 break-words text-[1.5rem] font-bold leading-tight tracking-tight">{p.name}</h1>
        </div>

        <div className="mt-6 rounded-xl border bg-white/[0.04] px-4 py-3.5">
          <p className="eyebrow text-[0.62rem] text-muted-foreground">SAP ID · match with their ID card</p>
          <p className="mt-1 break-all font-mono text-[1.65rem] font-bold tracking-wide text-foreground">{p.sap_id || <span className="font-sans text-lg font-medium text-muted-foreground">Not on file</span>}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {back && detail('Stepped out', `${time(p.out_at)} · ${p.reason}`, true)}
          {detail('Team', p.team || 'No team', true)}
          {detail('Year', p.year)}
          {detail('Branch', p.branch)}
        </div>

        <div className="mt-8 grid gap-4">
          <Button variant="success" size="lg" className="h-16 w-full text-base" disabled={busy} onClick={onConfirm} autoFocus>
            {back ? <LogIn className="size-5" /> : <CheckCircle2 className="size-5" />}{busy ? 'Saving…' : back ? 'LET BACK IN' : 'CONFIRM CHECK-IN'}
          </Button>
          <Button variant="muted" className="w-full" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
      </Card>
    </div>
  )
}

interface DeskStats { label: string; capacity: number; assigned: number; checked_in: number; remaining: number; out_now: number; percent: number; recent: { at: string; name: string; team: string | null }[] }

export default function Desk({ venue, username }: { venue: Venue; username: string }) {
  const [d, setD] = useState<DeskStats | null>(null)
  const [scan, setScan] = useState(false)
  const [res, setRes] = useState<ScanResult | null>(null)
  // a lookup waiting for the operator to confirm, and how to check it in
  const [pending, setPending] = useState<{ p: ScanResult; body: object; path: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const busy = useRef(false)
  const last = useRef({ t: '', at: 0 })
  const signOut = useSignOut()
  const load = useCallback(async () => { const r = await api<DeskStats>('/api/operator/dashboard'); if (r.ok) setD(r.data) }, [])
  useEffect(() => { void load(); const id = setInterval(() => void load(), 10000); return () => clearInterval(id) }, [load])

  const show = useCallback((r: ApiResult<ScanResult>) => {
    const out: ScanResult = r.data?.status ? r.data : {
      status: 'ERROR',
      message: r.status === 429 ? 'Too many scans, slow down.' : r.status === 401 ? 'Session expired. Sign in again.' : r.status === 422 ? 'That is not a valid QR code.' : 'Network error. Try again.',
    }
    if (navigator.vibrate) navigator.vibrate(out.status === 'SUCCESS' ? 80 : [120, 60, 120])
    setRes(out)
    void load()
  }, [load])

  // Look the person up first. If they can be checked in here, show their details and wait for the operator;
  // otherwise (wrong venue, already in, invalid) show the result straight away.
  const look = useCallback(async (body: object, path: string) => {
    const r = await api<ScanResult>('/api/operator/lookup', { method: 'POST', body })
    if (r.data?.status === 'READY' || r.data?.status === 'REENTRY') { navigator.vibrate?.(40); setPending({ p: r.data, body, path }) } else show(r)
  }, [show])

  const onToken = useCallback(async (raw: string, manual = false) => {
    if (busy.current) return
    const now = Date.now()
    // the camera re-reads a QR still in view; manual entry is deliberate, so never deduped
    if (!manual && last.current.t === raw && now - last.current.at < 4000) return
    busy.current = true
    last.current = { t: raw, at: now }
    await look({ qr_token: raw }, '/api/operator/checkin')
  }, [look])

  // picked from the manual search when a QR won't scan
  const onManual = useCallback(async (id: number) => {
    if (busy.current) return
    busy.current = true
    await look({ participant_id: id }, '/api/operator/checkin-manual')
  }, [look])
  const confirmCheckin = useCallback(async () => {
    if (!pending) return
    setConfirming(true)
    const r = await api<ScanResult>(pending.path, { method: 'POST', body: pending.body })
    setConfirming(false); setPending(null)
    show(r)
  }, [pending, show])
  const cancel = useCallback(() => { setPending(null); busy.current = false }, [])
  const done = useCallback(() => { setRes(null); busy.current = false }, [])

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-3">
        <Brand sub={`Desk · ${username}`} />
        <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut /></Button>
      </header>

      <div className="mt-8 text-center">
        <p className="eyebrow text-muted-foreground">Checking in at</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-[-0.02em] text-gold-light sm:text-6xl">{VENUE[venue]}</h1>
      </div>

      {d && (<>
        <Card className="mt-8 gap-0 px-6 py-6" aria-label="Venue attendance">
          <div className="flex items-end justify-between">
            <p className="num text-5xl font-bold leading-none tracking-tight">{d.checked_in}<span className="ml-2 text-2xl text-muted-foreground"> of {d.assigned}</span></p>
            <p className="num font-mono text-lg text-gold-light">{d.percent}%</p>
          </div>
          <p className="eyebrow mt-2 text-muted-foreground">checked in</p>
          <div className="mt-5"><Bar value={d.checked_in} max={d.assigned} height="h-3" label="Share checked in" /></div>
          <p className="num mt-3 text-sm text-muted-foreground">{d.remaining} still to arrive · hall capacity {d.capacity}{d.out_now > 0 && <span className="text-warn"> · {d.out_now} out on temporary exit</span>}</p>
        </Card>

        <Button variant="solid" size="xl" className="mt-9 w-full" onClick={() => setScan(true)}><ScanLine className="size-7" />SCAN QR</Button>

        <div className="mb-3 mt-12 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Recent check-ins</h2>
          <span className="eyebrow text-[0.62rem] text-muted-foreground">Live</span>
        </div>
        <Card className="gap-0 divide-y divide-border/70 py-0">
          {d.recent.length === 0 && <p className="p-5 text-muted-foreground">No one has checked in here yet.</p>}
          {d.recent.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <span className="num w-[5.6rem] shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtTime(r.at)}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{r.name}</span>
                <span className="block break-words text-sm text-muted-foreground">{r.team || 'No team'}</span>
              </span>
            </div>))}
        </Card>
      </>)}
      {scan && <Scanner venueLabel={VENUE[venue]} onToken={onToken} paused={!!res || !!pending} onClose={() => setScan(false)} />}
      {!res && !pending && <ManualCheckin venue={venue} raised={scan} onCheckIn={onManual} />}
      {pending && <ConfirmScreen p={pending.p} venue={venue} busy={confirming} onConfirm={confirmCheckin} onCancel={cancel} />}
      {res && <ResultScreen res={res} onDone={done} />}
    </div>
  )
}
