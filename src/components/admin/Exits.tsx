'use client'

import { Ban, DoorOpen, Download, RotateCw, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, errorText, fmtTime } from '../api'
import { Empty, Loading, Notice, PageHeader, Section, usePoll, VenueTag } from '../kit'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import type { ExitRow, Exits as ExitsData, ParticipantRow } from './types'

type Msg = { tone: 'ok' | 'bad' | 'warn'; text: string } | null
const REASONS = ['Washroom', 'Medical', 'Food / water', 'Phone charging', 'Personal']
const mins = (from: string, to?: string | null) => Math.max(0, Math.round(((to ? +new Date(to) : Date.now()) - +new Date(from)) / 60000))

function EmailStatus({ e }: { e: ExitRow }) {
  if (e.email_sent_at) return <Badge variant="ok">QR emailed {fmtTime(e.email_sent_at)}</Badge>
  if (e.email_error) return <Badge variant="bad" title={e.email_error}>Email failed</Badge>
  return <Badge variant="muted">Not emailed</Badge>
}

// Temporary exits: let a checked-in participant step out with a reason and email them a one-time re-entry QR.
// Their original QR is refused while they are out; the re-entry QR (or a manual re-admit at the desk) lets them back.
export default function Exits() {
  const [d, err, reload] = usePoll<ExitsData>(() => api('/api/admin/exits'), 8000)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState<number | null>(null)

  if (!d) {
    if (err?.status === 409) return (<><PageHeader eyebrow="Pass-outs" title="Temporary exits" /><Notice tone="warn" title="Confirm venues first">Exits are recorded once check-in is open. <Link className="underline" href="/admin/import">Go to Setup</Link></Notice></>)
    return err ? <Notice title="Could not load exits">{errorText(err)}</Notice> : <Loading>Loading exits…</Loading>
  }
  const back = d.history.filter((e) => e.returned_at).length

  const act = async (e: ExitRow, path: 'resend' | 'cancel') => {
    const ask = path === 'cancel'
      ? `Cancel ${e.name}'s exit? Their re-entry QR stops working and they count as inside again. Use this only if the exit was recorded by mistake.`
      : `Resend the re-entry QR to ${e.name} (${e.email})?`
    if (!confirm(ask)) return
    setBusy(e.id)
    const r = await api(`/api/admin/exits/${path}`, { method: 'POST', body: { id: e.id } })
    setBusy(null)
    setMsg(r.ok ? { tone: 'ok', text: path === 'cancel' ? `Cancelled ${e.name}'s exit.` : `Re-entry QR sent to ${e.name}.` } : { tone: 'bad', text: errorText(r) })
    void reload()
  }

  return (
    <>
      <PageHeader eyebrow="Pass-outs" title="Temporary exits" actions={<>
        <Button asChild variant="muted"><a href="/api/admin/export/exits.csv"><Download />Exits CSV</a></Button>
        {!open && <Button variant="solid" onClick={() => { setOpen(true); setMsg(null) }}><DoorOpen />Record exit</Button>}
      </>}>
        Let a checked-in participant step out. They get a one-time re-entry QR by email; their original QR won&apos;t let them back in while they are out.
      </PageHeader>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
        {([['Out now', d.out.length], ['Back in', back], ['Cancelled', d.history.length - back]] as const).map(([k, v]) => (
          <Card key={k} className="gap-0 px-4 py-4">
            <p className="eyebrow text-[0.62rem] text-muted-foreground">{k}</p>
            <p className={`num mt-1.5 text-3xl font-bold tracking-tight ${k === 'Out now' && v > 0 ? 'text-warn' : ''}`}>{v}</p>
          </Card>
        ))}
      </div>

      {open && (
        <RecordForm smtp={d.smtp_configured} outIds={new Set(d.out.map((e) => e.participant_id))} onCancel={() => setOpen(false)}
          onDone={(name, email, error) => {
            setOpen(false)
            setMsg(email === 'failed' ? { tone: 'warn', text: `Exit recorded for ${name}, but the re-entry email failed: ${error}. Resend it below.` }
              : { tone: 'ok', text: `Exit recorded for ${name}.${email === 'sent' ? ' Re-entry QR emailed.' : ' Re-entry QR not emailed.'}` })
            void reload()
          }} />
      )}
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <Section className="mb-6" eyebrow={`${d.out.length} outside`} title="Out now" aria-label="Out now">
        {d.out.length === 0 ? <Empty>Nobody is out right now.</Empty> : (
          <ul className="divide-y divide-border/70 px-5 pb-2 pt-2 sm:px-6">
            {d.out.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{e.name}<VenueTag venue={e.venue} /></p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.team ?? 'No team'} · {e.reason}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">Left {fmtTime(e.created_at)} · {mins(e.created_at)} min ago{e.created_by ? ` · by ${e.created_by}` : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <EmailStatus e={e} />
                  <Button variant="muted" size="sm" disabled={!d.smtp_configured || busy !== null} onClick={() => act(e, 'resend')}><RotateCw />{busy === e.id ? 'Sending…' : 'Resend QR'}</Button>
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => act(e, 'cancel')}><Ban />Cancel exit</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section eyebrow="History" title="Returned and cancelled" aria-label="History">
        {d.history.length === 0 ? <Empty>No completed exits yet.</Empty> : (
          <div className="overflow-x-auto px-3 pb-2 pt-3">
            <table className="table min-w-[760px]">
              <thead><tr><th>Name</th><th>Venue</th><th>Reason</th><th>Left</th><th>Back</th><th>Out for</th><th>Via</th></tr></thead>
              <tbody>{d.history.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.name}</td>
                  <td><VenueTag venue={e.venue} /></td>
                  <td className="text-muted-foreground">{e.reason}</td>
                  <td className="num font-mono text-xs">{fmtTime(e.created_at)}</td>
                  <td className="num font-mono text-xs">{e.returned_at ? fmtTime(e.returned_at) : '–'}</td>
                  <td className="num font-mono text-xs">{e.returned_at ? `${mins(e.created_at, e.returned_at)} min` : '–'}</td>
                  <td>{e.cancelled_at ? <Badge variant="muted">Cancelled</Badge> : e.returned_manual ? <Badge variant="warn">Desk search</Badge> : <Badge variant="ok">Re-entry QR</Badge>}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}

function RecordForm({ smtp, outIds, onCancel, onDone }: { smtp: boolean; outIds: Set<number>; onCancel: () => void; onDone: (name: string, email: string, error?: string) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<ParticipantRow[] | null>(null)
  const [pick, setPick] = useState<ParticipantRow | null>(null)
  const [reason, setReason] = useState('')
  const [send, setSend] = useState(smtp)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setFound(null); return }
    const id = setTimeout(async () => {
      const r = await api<{ items: ParticipantRow[] }>(`/api/admin/participants?checked=true&limit=8&q=${encodeURIComponent(term)}`)
      if (r.ok) setFound(r.data.items)
    }, 200)
    return () => clearTimeout(id)
  }, [q])

  const submit = async () => {
    setError('')
    if (!pick) return setError('Pick the participant who is stepping out.')
    if (!reason.trim()) return setError('Enter a reason.')
    setBusy(true)
    const r = await api<{ email: string; error?: string }>('/api/admin/exits', { method: 'POST', body: { participant_id: pick.id, reason: reason.trim(), send_email: send } })
    setBusy(false)
    if (r.ok) onDone(pick.name, r.data.email, r.data.error); else setError(errorText(r))
  }

  return (
    <Card className="mb-8 gap-0 px-5 py-6 sm:px-7" aria-label="Record exit">
      <p className="eyebrow text-primary">New exit</p>
      <h2 className="mt-1.5 font-display text-2xl font-extrabold">Record a temporary exit</h2>
      <p className="mt-1 text-sm text-muted-foreground">Only people who have checked in can step out. One open exit per person.</p>

      <p className="eyebrow mt-6 text-[0.62rem] text-muted-foreground">Participant</p>
      {pick ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border bg-black/30 px-4 py-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">{pick.name}<VenueTag venue={pick.venue} /></p>
            <p className="font-mono text-xs text-muted-foreground">{[pick.team ?? 'No team', pick.email].join(' · ')}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Choose someone else" onClick={() => setPick(null)}><X /></Button>
        </div>
      ) : (
        <div className="mt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-10" type="search" autoFocus aria-label="Find a checked-in participant" placeholder="Search checked-in participants: name, email, team or ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {found && (
            <ul className="mt-2 overflow-hidden rounded-xl border bg-popover">
              {found.map((p) => {
                const out = outIds.has(p.id)
                return (
                  <li key={p.id} className="border-b last:border-b-0">
                    <button disabled={out} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => { setPick(p); setQ('') }}>
                      <span className="min-w-0"><span className="block font-medium">{p.name}</span><span className="block font-mono text-xs text-muted-foreground">{p.team ?? 'No team'} · {p.email}</span></span>
                      {out ? <Badge variant="warn">Already out</Badge> : <VenueTag venue={p.venue} />}
                    </button>
                  </li>
                )
              })}
              {found.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No checked-in participant matches “{q.trim()}”.</li>}
            </ul>
          )}
        </div>
      )}

      <Label htmlFor="exit-reason" className="eyebrow mt-6 block text-[0.62rem] text-muted-foreground">Reason *</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${reason === r ? 'border-foreground/30 bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
        ))}
      </div>
      <textarea id="exit-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type the reason"
        className="mt-2 w-full rounded-lg border border-input bg-black/40 px-3.5 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40" />

      <div className="mt-5 flex items-center gap-3">
        <Checkbox id="send-reentry" checked={send} disabled={!smtp} onCheckedChange={(v) => setSend(v === true)} />
        <Label htmlFor="send-reentry" className="text-[0.95rem] font-normal">Email them a re-entry QR now{!smtp && <span className="text-sm text-muted-foreground"> (no mail server set)</span>}</Label>
      </div>

      {error && <Notice>{error}</Notice>}
      <div className="mt-7 flex flex-wrap gap-3">
        <Button variant="solid" disabled={busy || !pick} onClick={submit}><DoorOpen />{busy ? 'Saving…' : 'Record exit'}</Button>
        <Button variant="muted" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}
