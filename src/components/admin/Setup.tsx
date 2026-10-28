'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, errorText, fmtDateTime } from '../api'
import { Bar, GroupSwatch, Notice, PageHeader, type GroupKey } from '../ui'
import type { Allocation, ImportPreview, Stats, VenueSummary } from './types'

function Step({ n, title, done, locked, children }: { n: number; title: string; done: boolean; locked: boolean; children: ReactNode }) {
  return (
    <section className={`panel relative mb-5 p-5 sm:p-6 ${locked && !done ? 'opacity-50' : ''}`} aria-label={`Step ${n}: ${title}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display ${done ? 'border-ok bg-ok/15 text-ok' : 'border-sea-600 text-mist'}`} aria-label={done ? 'done' : `step ${n}`}>{done ? '✓' : n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl">{title}</h2>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </section>
  )
}

type Counts = { teams_3: number; teams_2: number; teams_1: number; no_team: number }
const GroupCounts = ({ c, wide = false }: { c: Counts; wide?: boolean }) => (
  <dl className={`num mt-3 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 ${wide ? 'xl:grid-cols-4' : ''}`}>
    {([['3', c.teams_3], ['2', c.teams_2], ['1', c.teams_1], ['none', c.no_team]] as [GroupKey, number][]).map(([k, v]) => (
      <div key={k} className="flex items-center justify-between gap-3 border-b border-sea-700/60 py-1">
        <dt className="text-mist"><GroupSwatch group={k} /></dt><dd className="text-lg">{v}</dd>
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
  if (locked) return <p className="text-mist">Participants can&apos;t be re-imported once venues are confirmed.</p>
  const S = pv?.summary
  return (
    <>
      <p className="text-mist">Upload the registration CSV. It needs a header row with team, name and email columns; other columns are ignored. Nothing changes until you import.</p>
      <input type="file" accept=".csv,text/csv" aria-label="Registration CSV" onChange={(e) => void preview(e.target.files?.[0])}
        className="mt-4 block w-full text-sm text-mist file:mr-4 file:rounded-md file:border-0 file:bg-sea-700 file:px-4 file:py-2 file:text-parchment hover:file:bg-sea-600" />
      {pv && pv.errors.length > 0 && <Notice title="Fix these problems in the CSV, then upload it again">{pv.errors.join('\n')}</Notice>}
      {pv && pv.warnings.length > 0 && <Notice tone="warn" title="Check these before importing">{pv.warnings.join('\n')}</Notice>}
      {S && (
        <div className="mt-4">
          <p className="num text-lg"><b>{S.participants}</b> participants in <b>{S.teams}</b> teams, plus <b>{S.no_team}</b> without a team.</p>
          <GroupCounts c={S} wide />
          {S.empty_rows_skipped > 0 && <p className="mt-2 text-sm text-mist">{S.empty_rows_skipped} empty row(s) will be skipped.</p>}
        </div>
      )}
      <Notice>{msg}</Notice>
      {pv && pv.errors.length === 0 && S && <button className="btn-primary mt-4" disabled={busy} onClick={commit}>Import {S.participants} participants</button>}
    </>
  )
}

function VenueSummaryBlock({ v }: { v: VenueSummary }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg">{v.label === 'ISE SEMINAR HALL' ? 'ISE Seminar Hall' : v.label}</h3>
        <span className="num text-mist">{v.participants} / {v.capacity}</span>
      </div>
      <div className="mt-2"><Bar value={v.participants} max={v.capacity} label={`${v.label} seats used`} /></div>
      <p className="num mt-1 text-sm text-mist">{v.remaining} seats free</p>
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
  if (!a) return <p className="text-mist">Loading setup…</p>
  const confirmed = a.status === 'CONFIRMED'
  return (
    <>
      <PageHeader title="Setup">Three steps before the doors open. Once venues are confirmed they are final, and QR codes and emails become available.</PageHeader>

      <Step n={1} title="Import participants" done={total > 0} locked={confirmed}>
        {total > 0 && <p className="num mb-2">{total} participants are loaded.</p>}
        <ImportStep locked={confirmed} onImported={(n) => { setNote(`Imported ${n} participants.`); void load() }} />
      </Step>

      <Step n={2} title="Assign venues" done={a.status !== 'NONE'} locked={confirmed || total === 0}>
        <p className="text-mist">3-member teams fill ISE Seminar Hall first, then 2-member and 1-member teams. Teams are never split, and people without a team are always seated in DTH.</p>
        {!confirmed && total > 0 && (
          <button className="btn-quiet mt-4" onClick={() => act('/api/admin/allocation/generate', null, 'Venues assigned. Review them, then confirm.')}>
            {a.status === 'NONE' ? 'Assign venues' : 'Assign venues again'}
          </button>
        )}
        {a.status !== 'NONE' && (
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <VenueSummaryBlock v={a.venues.ISE} /><VenueSummaryBlock v={a.venues.DTH} />
          </div>
        )}
        {a.validation_errors.length > 0 && <Notice title="These problems block confirmation">{a.validation_errors.join('\n')}</Notice>}
        {a.status !== 'NONE' && <p className="mt-4 text-sm text-mist">Each team&apos;s venue is listed on the <Link className="underline" href="/admin/teams">Teams</Link> page.</p>}
      </Step>

      <Step n={3} title="Confirm venues" done={confirmed} locked={a.status === 'NONE'}>
        {confirmed ? (
          <p>Confirmed {fmtDateTime(a.confirmed_at)}. Venues are final. Next, <Link className="underline" href="/admin/qr-codes">download QR codes</Link> or <Link className="underline" href="/admin/emails">send emails</Link>.</p>
        ) : (
          <>
            <p className="text-mist">Confirming locks every venue for good and opens check-in at both halls.</p>
            <button className="btn-primary mt-4" disabled={a.status !== 'DRAFT' || a.validation_errors.length > 0}
              onClick={() => act('/api/admin/allocation/confirm', 'Confirm venues? This cannot be undone.', 'Venues confirmed.')}>Confirm venues</button>
          </>
        )}
      </Step>

      <Notice tone="ok">{note}</Notice>
      <Notice>{msg}</Notice>
    </>
  )
}
