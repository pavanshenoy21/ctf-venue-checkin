'use client'

import { Mail, Plus, RotateCw, Search, UserPlus, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { api, errorText, fmtTime } from '../api'
import { Loading, Notice, PageHeader, Section, usePoll } from '../kit'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import type { NewMember, Registered, WalkIn, WalkIns as WalkInsData } from './types'

type Msg = { tone: 'ok' | 'bad' | 'warn'; text: string } | null
const BLANK: NewMember = { name: '', email: '', phone: '', sap_id: '', year: '', branch: '' }
const details = (p: { email: string; phone?: string | null; year?: string | null; branch?: string | null; sap_id?: string | null }) =>
  [p.sap_id, p.email, p.phone, p.year, p.branch].filter(Boolean).join(' · ')

function QrStatus({ p }: { p: WalkIn }) {
  if (p.checked_in) return <Badge variant="ok">Checked in</Badge>
  if (p.qr_sent_at) return <Badge variant="ok">QR sent {fmtTime(p.qr_sent_at)}</Badge>
  if (p.qr_error) return <Badge variant="bad" title={p.qr_error}>QR failed</Badge>
  return <Badge variant="muted">QR not sent</Badge>
}

function Person({ p, children }: { p: { name: string; email: string; phone?: string | null; year?: string | null; branch?: string | null; sap_id?: string | null }; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{p.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{details(p)}</p>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

// People who registered without a team report to the DTH desk. Register them into a walk-in team (a team of one
// for someone going solo) and email each member their check-in QR.
export default function WalkIns() {
  const [d, err, reload] = usePoll<WalkInsData>(() => api('/api/admin/walk-ins'), 6000)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<WalkIn[]>([])
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState<number | null>(null)

  if (!d) {
    if (err?.status === 409) return (<><PageHeader eyebrow="DTH desk" title="Walk-ins" /><Notice tone="warn" title="Confirm venues first">Walk-ins are registered after the allocation is final. <Link className="underline" href="/admin/import">Go to Setup</Link></Notice></>)
    return err ? <Notice title="Could not load walk-ins">{errorText(err)}</Notice> : <Loading>Loading walk-ins…</Loading>
  }

  const waiting = d.people.filter((p) => !p.team_id)
  const teams = new Map<number, WalkIn[]>()
  for (const p of d.people) if (p.team_id) teams.set(p.team_id, [...(teams.get(p.team_id) ?? []), p])
  const sent = d.people.filter((p) => p.qr_sent_at).length

  const start = (p?: WalkIn) => { setPicked(p ? [p] : []); setOpen(true); setMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const sendQr = async (p: WalkIn) => {
    if (!confirm(`${p.qr_sent_at ? 'Resend' : 'Send'} the check-in QR to ${p.name} (${p.email})?`)) return
    setBusy(p.id)
    const r = await api('/api/admin/walk-ins/send-qr', { method: 'POST', body: { id: p.id } })
    setBusy(null)
    setMsg(r.ok ? { tone: 'ok', text: `Check-in QR sent to ${p.name}.` } : { tone: 'bad', text: errorText(r) })
    void reload()
  }

  return (
    <>
      <PageHeader eyebrow="DTH desk" title="Walk-ins" actions={!open && <Button variant="solid" onClick={() => start()}><UserPlus />Register walk-in team</Button>}>
        People who registered without a team come to the DTH desk to form a team or confirm they are going solo. Register them here; each member is then emailed their check-in QR.
      </PageHeader>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
        {([['Registered', d.people.length - waiting.length], ['Waiting', waiting.length], ['QRs sent', sent]] as const).map(([k, v]) => (
          <Card key={k} className="gap-0 px-4 py-4">
            <p className="eyebrow text-[0.62rem] text-muted-foreground">{k}</p>
            <p className="num mt-1.5 text-3xl font-bold tracking-tight">{v}</p>
          </Card>
        ))}
      </div>

      {open && (
        <RegisterForm
          key={picked.map((p) => p.id).join(',')}
          initial={picked} waiting={waiting} smtp={d.smtp_configured}
          onCancel={() => setOpen(false)}
          onDone={(r) => {
            setOpen(false)
            const failed = r.members.filter((m) => m.qr === 'failed')
            const unsent = r.members.filter((m) => m.qr === 'not_sent')
            setMsg({
              tone: failed.length ? 'warn' : 'ok',
              text: `Registered ${r.team.name} (${r.members.map((m) => m.name).join(', ')}).` +
                (failed.length ? ` QR email failed for ${failed.map((m) => m.name).join(', ')}; resend it below.` : '') +
                (unsent.length ? ` QR not emailed to ${unsent.map((m) => m.name).join(', ')}.` : '') +
                (!failed.length && !unsent.length ? ' Check-in QRs emailed.' : ''),
            })
            void reload()
          }}
        />
      )}

      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <Section className="mb-6" eyebrow={`${teams.size} registered`} title="Walk-in teams" aria-label="Walk-in teams">
        {teams.size === 0 ? <p className="px-6 pb-6 pt-3 text-muted-foreground">No walk-in teams yet.</p> : (
          <ul className="divide-y divide-border/70 px-5 pb-2 pt-2 sm:px-6">
            {[...teams.values()].map((members) => (
              <li key={members[0]!.team_id} className="py-4">
                <div className="mb-2 flex items-center gap-3">
                  <p className="font-display text-lg font-bold">{members[0]!.team}</p>
                  <Badge variant="gold">{members.length === 1 ? 'Solo' : `${members.length} members`}</Badge>
                </div>
                <ul className="space-y-2.5 border-l-2 border-border pl-4">
                  {members.map((p) => (
                    <li key={p.id}>
                      <Person p={p}>
                        <QrStatus p={p} />
                        {!p.checked_in && (
                          <Button variant={p.qr_sent_at ? 'muted' : 'default'} size="sm" disabled={!d.smtp_configured || busy !== null} onClick={() => sendQr(p)}>
                            {p.qr_sent_at ? <RotateCw /> : <Mail />}{busy === p.id ? 'Sending…' : p.qr_sent_at ? 'Resend QR' : 'Send QR'}
                          </Button>
                        )}
                      </Person>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section eyebrow={`${waiting.length} waiting`} title="Not registered yet" aria-label="Not registered yet">
        <p className="px-5 pt-1 text-sm text-muted-foreground sm:px-6">Registered without a team and not yet seen at the DTH desk. They don&apos;t have a check-in QR.</p>
        {waiting.length === 0 ? <p className="px-6 pb-6 pt-3 text-muted-foreground">Everyone has been registered.</p> : (
          <ul className="divide-y divide-border/70 px-5 pb-2 pt-2 sm:px-6">
            {waiting.map((p) => (
              <li key={p.id} className="py-3">
                <Person p={p}><Button variant="muted" size="sm" onClick={() => start(p)}><Plus />Start a team</Button></Person>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {!d.smtp_configured && <p className="mt-3 text-sm text-muted-foreground">QR emails are off because no mail server is set.</p>}
    </>
  )
}

function RegisterForm({ initial, waiting, smtp, onCancel, onDone }: {
  initial: WalkIn[]; waiting: WalkIn[]; smtp: boolean; onCancel: () => void; onDone: (r: Registered) => void
}) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState<WalkIn[]>(initial)
  const [extra, setExtra] = useState<NewMember[]>([])
  const [draft, setDraft] = useState<NewMember | null>(null)
  const [find, setFind] = useState('')
  const [sendQr, setSendQr] = useState(smtp)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const size = members.length + extra.length
  const full = size >= 3
  const f = find.trim().toLowerCase()
  const matches = f ? waiting.filter((p) => !members.some((m) => m.id === p.id) && (p.name.toLowerCase().includes(f) || p.email.includes(f) || (p.sap_id ?? '').toLowerCase().includes(f))).slice(0, 6) : []
  const field = (k: keyof NewMember, label: string, type = 'text', required = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`new-${k}`} className="eyebrow text-[0.62rem] text-muted-foreground">{label}{required && ' *'}</Label>
      <Input id={`new-${k}`} type={type} required={required} value={draft![k]} onChange={(e) => setDraft({ ...draft!, [k]: e.target.value })} />
    </div>
  )
  const submit = async () => {
    setError('')
    if (size === 0) return setError('Add at least one member.')
    if (size > 1 && !name.trim()) return setError('Enter a team name.')
    setBusy(true)
    const r = await api<Registered>('/api/admin/walk-ins/team', { method: 'POST', body: { name: name.trim(), member_ids: members.map((m) => m.id), new_members: extra, send_qr: sendQr } })
    setBusy(false)
    if (r.ok) onDone(r.data); else setError(errorText(r))
  }

  return (
    <Card className="mb-8 gap-0 px-5 py-6 sm:px-7" aria-label="Register walk-in team">
      <p className="eyebrow text-primary">New walk-in team</p>
      <h2 className="mt-1.5 font-display text-2xl font-extrabold">Register walk-in team</h2>
      <p className="mt-1 text-sm text-muted-foreground">1 to 3 members, seated in DTH. For someone going solo, add just them; leave the team name blank to use their name.</p>

      <div className="mt-6 space-y-1.5">
        <Label htmlFor="team-name" className="eyebrow text-[0.62rem] text-muted-foreground">Team name{size > 1 && ' *'}</Label>
        <Input id="team-name" maxLength={120} placeholder={size === 1 ? (members[0]?.name ?? extra[0]?.name) : 'e.g. Late Argonauts'} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <p className="eyebrow text-[0.62rem] text-muted-foreground">Members</p>
        <span className="num font-mono text-xs text-muted-foreground">{size}/3</span>
      </div>
      <ul className="mt-2 grid gap-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-xl border bg-black/30 px-4 py-3">
            <Person p={m}><Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => setMembers(members.filter((x) => x.id !== m.id))}><X /></Button></Person>
          </li>
        ))}
        {extra.map((m, i) => (
          <li key={m.email} className="rounded-xl border bg-black/30 px-4 py-3">
            <Person p={m}><Badge variant="gold">New</Badge><Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => setExtra(extra.filter((_, j) => j !== i))}><X /></Button></Person>
          </li>
        ))}
        {size === 0 && <li className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No members yet. Search below.</li>}
      </ul>

      {!full && !draft && (
        <div className="mt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-10" type="search" aria-label="Find someone without a team" placeholder="Add someone without a team: name, email or SAP ID" value={find} onChange={(e) => setFind(e.target.value)} />
          </div>
          {f && (
            <ul className="mt-2 overflow-hidden rounded-xl border bg-popover">
              {matches.map((p) => (
                <li key={p.id} className="border-b last:border-b-0">
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]" onClick={() => { setMembers([...members, p]); setFind('') }}>
                    <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="block truncate font-mono text-xs text-muted-foreground">{details(p)}</span></span>
                    <span className="eyebrow flex items-center gap-1 text-[0.62rem] text-primary"><Plus className="size-3.5" />Add</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nobody without a team matches “{find}”.</li>}
            </ul>
          )}
          <Button variant="link" className="mt-2 h-auto px-0" onClick={() => setDraft({ ...BLANK })}><Plus />Add someone who isn&apos;t on the list</Button>
        </div>
      )}

      {draft && (
        <form className="mt-4 rounded-xl border bg-black/30 p-5" onSubmit={(e) => {
          e.preventDefault()
          const m = { ...draft, name: draft.name.trim(), email: draft.email.trim().toLowerCase() }
          if (extra.some((x) => x.email === m.email)) return setError('That email is already in this team.')
          setExtra([...extra, m]); setDraft(null); setError('')
        }}>
          <p className="mb-4 text-sm text-muted-foreground">New participant, not in the registrations</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('name', 'Full name', 'text', true)}
            {field('email', 'Email', 'email', true)}
            {field('phone', 'Phone', 'tel')}
            {field('sap_id', 'SAP ID / Admission no.')}
            {field('year', 'Year')}
            {field('branch', 'Branch')}
          </div>
          <div className="mt-6 flex gap-3">
            <Button size="sm" type="submit"><Plus />Add to team</Button>
            <Button size="sm" variant="muted" type="button" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Checkbox id="send-qr" checked={sendQr} disabled={!smtp} onCheckedChange={(v) => setSendQr(v === true)} />
        <Label htmlFor="send-qr" className="text-[0.95rem] font-normal">Email each member their check-in QR now{!smtp && <span className="text-sm text-muted-foreground"> (no mail server set)</span>}</Label>
      </div>

      {error && <Notice>{error}</Notice>}
      <div className="mt-7 flex flex-wrap gap-3">
        <Button variant="solid" disabled={busy || size === 0 || draft !== null} onClick={submit}>
          <UserPlus />{busy ? 'Registering…' : size <= 1 ? 'Register solo' : `Register team of ${size}`}
        </Button>
        <Button variant="muted" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}
