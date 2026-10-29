'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, errorText, fmtDateTime } from '../api'
import { Check, FileUp, Lock, Shuffle } from 'lucide-react'
import { cn } from 'cn'
import { Bar, GroupSwatch, Loading, Notice, PageHeader, type GroupKey } from '../kit'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import type { Allocation, ImportPreview, Stats, VenueSummary } from './types'

function Step({ n, title, done, locked, children }: { n: number; title: string; done: boolean; locked: boolean; children: ReactNode }) {
  return (
    <Card className={cn('relative mb-5 gap-0 px-5 py-6 sm:px-7', locked && !done && 'opacity-50')} aria-label={`Step ${n}: ${title}`}>
      <div className="flex items-start gap-5">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border-2 font-mono text-sm font-bold',
          done ? 'border-ok/50 text-ok' : 'border-border text-muted-foreground')} aria-label={done ? 'done' : `step ${n}`}>
          {done ? <Check className="size-5" /> : String(n).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">{title}</h2>
          <div className="mt-2 text-[0.95rem]">{children}</div>
        </div>
      </div>
    </Card>
  )
}

type Counts = { teams_3: number; teams_2: number; teams_1: number; no_team: number }
const GroupCounts = ({ c, wide = false }: { c: Counts; wide?: boolean }) => (
  <dl className={`num mt-3 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 ${wide ? 'xl:grid-cols-4' : ''}`}>
    {([['3', c.teams_3], ['2', c.teams_2], ['1', c.teams_1], ['none', c.no_team]] as [GroupKey, number][]).map(([k, v]) => (
      <div key={k} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5">
        <dt className="text-muted-foreground"><GroupSwatch group={k} /></dt><dd className="font-mono text-base">{v}</dd>
      </div>
    ))}
  </dl>
)

function ImportStep({ locked, onImported }: { locked: boolean; onImported: (participants: number) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [pv, setPv] = useState<ImportPreview | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = async (f: File | undefined) => {
    setFile(f ?? null); setPv(null); setMsg('')
    if (!f) return
    const fd = new FormData(); fd.append('file', f)
    const r = await api<ImportPreview>('/api/admin/import/preview', { method: 'POST', form: fd })
    if (r.ok) setPv(r.data); else setMsg(errorText(r))
  }
  const commit = async () => {
    if (!file || !confirm('Replace all existing participants with this file?')) return
    setBusy(true)
    const fd = new FormData(); fd.append('file', file)
    const r = await api<{ participants: number }>('/api/admin/import/commit', { method: 'POST', form: fd })
    setBusy(false)
    if (r.ok) { setPv(null); setFile(null); setMsg(''); onImported(r.data.participants) } else setMsg(errorText(r))
  }
  if (locked) return <p className="text-muted-foreground">Participants can&apos;t be re-imported once venues are confirmed.</p>
  const S = pv?.summary
  return (
    <>
      <p className="text-muted-foreground">Upload the registration CSV. It needs a header row with team, name and email columns. An optional Venue column (DTH or ISE Seminar Hall) fixes each person&apos;s venue; other columns are ignored. Nothing changes until you import.</p>
      <input type="file" accept=".csv,text/csv" aria-label="Registration CSV" onChange={(e) => void preview(e.target.files?.[0])}
        className="mt-5 block w-full cursor-pointer rounded-xl border border-dashed border-border bg-black/30 p-4 text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-2 file:border-primary file:bg-transparent file:px-4 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase file:tracking-[0.14em] file:text-primary hover:border-foreground/30" />
      {pv && pv.errors.length > 0 && <Notice title="Fix these problems in the CSV, then upload it again">{pv.errors.join('\n')}</Notice>}
      {pv && pv.warnings.length > 0 && <Notice tone="warn" title="Check these before importing">{pv.warnings.join('\n')}</Notice>}
      {S && (
        <div className="mt-4">
          <p className="num text-lg"><b>{S.participants}</b> participants in <b>{S.teams}</b> teams, plus <b>{S.no_team}</b> without a team.</p>
          <GroupCounts c={S} wide />
          {S.empty_rows_skipped > 0 && <p className="mt-2 text-sm text-muted-foreground">{S.empty_rows_skipped} empty row(s) will be skipped.</p>}
          {pv.venues && <p className="num mt-2 text-sm">This file has a Venue column: <b>{pv.venues.ISE}</b> in ISE Seminar Hall, <b>{pv.venues.DTH}</b> in DTH. Assigning venues will use these as they are.</p>}
        </div>
      )}
      <Notice>{msg}</Notice>
      {pv && pv.errors.length === 0 && S && <Button variant="solid" className="mt-6" disabled={busy} onClick={commit}><FileUp />Import {S.participants} participants</Button>}
    </>
  )
}

function VenueSummaryBlock({ v }: { v: VenueSummary }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="eyebrow text-muted-foreground">{v.label === 'ISE SEMINAR HALL' ? 'ISE Seminar Hall' : v.label}</h3>
        <span className="num text-2xl font-bold tracking-tight">{v.participants}<span className="text-base text-muted-foreground"> / {v.capacity}</span></span>
      </div>
      <div className="mt-2"><Bar value={v.participants} max={v.capacity} label={`${v.label} seats used`} /></div>
      <p className="num mt-1 text-sm text-muted-foreground">{v.remaining} seats free</p>
      <GroupCounts c={v} />
    </div>
  )
}

export default function Setup() {
  const [a, setA] = useState<Allocation | null>(null)
  const [total, setTotal] = useState(0)
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState('')
  const load = useCallback(async () => {
    const [r, s] = await Promise.all([api<Allocation>('/api/admin/allocation'), api<Stats>('/api/admin/stats')])
    if (r.ok) setA(r.data)
    if (s.ok) setTotal(s.data.total_participants)
  }, [])
  useEffect(() => { void load() }, [load])
  const act = async (path: string, ask: string | null, done: string) => {
    if (ask && !confirm(ask)) return
    setMsg(''); setNote('')
    const r = await api<Allocation>(path, { method: 'POST' })
    if (r.ok) { setA(r.data); setNote(done) } else { setMsg(errorText(r)); void load() }
  }
  if (!a) return <Loading>Loading setup…</Loading>
  const confirmed = a.status === 'CONFIRMED'
  return (
    <>
      <PageHeader eyebrow="Before the doors open" title="Setup">Three steps before the doors open. Once venues are confirmed they are final, and QR codes and emails become available.</PageHeader>

      <Step n={1} title="Import participants" done={total > 0} locked={confirmed}>
        {total > 0 && <p className="num mb-2">{total} participants are loaded.</p>}
        <ImportStep locked={confirmed} onImported={(n) => { setNote(`Imported ${n} participants.`); void load() }} />
      </Step>

      <Step n={2} title="Assign venues" done={a.status !== 'NONE'} locked={confirmed || total === 0}>
        <p className="text-muted-foreground">{a.from_csv
          ? 'The imported file has a Venue column, so each person gets the venue it lists. Capacities are still checked.'
          : '3-member teams fill ISE Seminar Hall first, then 2-member and 1-member teams. Teams are never split, and people without a team are always seated in DTH.'}</p>
        {!confirmed && total > 0 && (
          <Button className="mt-5" onClick={() => act('/api/admin/allocation/generate', null, 'Venues assigned. Review them, then confirm.')}>
            <Shuffle />{a.status === 'NONE' ? 'Assign venues' : 'Assign venues again'}
          </Button>
        )}
        {a.status !== 'NONE' && (
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <VenueSummaryBlock v={a.venues.ISE} /><VenueSummaryBlock v={a.venues.DTH} />
          </div>
        )}
        {a.validation_errors.length > 0 && <Notice title="These problems block confirmation">{a.validation_errors.join('\n')}</Notice>}
        {a.status !== 'NONE' && <p className="mt-4 text-sm text-muted-foreground">Each team&apos;s venue is listed on the <Link className="underline" href="/admin/teams">Teams</Link> page.</p>}
      </Step>

      <Step n={3} title="Confirm venues" done={confirmed} locked={a.status === 'NONE'}>
        {confirmed ? (
          <p>Confirmed {fmtDateTime(a.confirmed_at)}. Venues are final. Next, <Link className="underline" href="/admin/qr-codes">download QR codes</Link> or <Link className="underline" href="/admin/emails">send emails</Link>.</p>
        ) : (
          <>
            <p className="text-muted-foreground">Confirming locks every venue for good and opens check-in at both halls.</p>
            <Button variant="solid" className="mt-5" disabled={a.status !== 'DRAFT' || a.validation_errors.length > 0}
              onClick={() => act('/api/admin/allocation/confirm', 'Confirm venues? This cannot be undone.', 'Venues confirmed.')}><Lock />Confirm venues</Button>
          </>
        )}
      </Step>

      <Notice tone="ok">{note}</Notice>
      <Notice>{msg}</Notice>
    </>
  )
}
