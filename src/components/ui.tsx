'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { VENUE, type ApiResult, type Venue } from './api'

// Team-size groups carry one colour each, used identically on every page.
export type GroupKey = '3' | '2' | '1' | 'none'
export const GROUPS: Record<GroupKey, { label: string; short: string; color: string }> = {
  '3': { label: '3-member teams', short: '3-member', color: '#4FB3A9' },
  '2': { label: '2-member teams', short: '2-member', color: '#6E9CDB' },
  '1': { label: '1-member teams', short: '1-member', color: '#A88FD8' },
  none: { label: 'No team', short: 'No team', color: '#8B98A9' },
}
export const groupOf = (size: number | null | undefined): GroupKey => (size ? (String(size) as GroupKey) : 'none')

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-parchment">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-mist">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

const TONES = { bad: 'border-bad/60 bg-bad/10', warn: 'border-warn/60 bg-warn/10', ok: 'border-ok/60 bg-ok/10', info: 'border-sea-600 bg-sea-800' }
export function Notice({ tone = 'bad', title, children }: { tone?: keyof typeof TONES; title?: string; children?: ReactNode }) {
  if (!children && !title) return null
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`my-4 rounded-md border px-4 py-3 ${TONES[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className="whitespace-pre-wrap text-sm leading-relaxed text-parchment/90">{children}</div>}
    </div>
  )
}

export function Bar({ value, max, color = '#C8964A', height = 'h-2', label }: { value: number; max: number; color?: string; height?: string; label?: string }) {
  const p = max > 0 ? Math.min(100, (100 * value) / max) : 0
  return (
    <div className={`w-full overflow-hidden rounded-full bg-sea-950 ${height}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((1000 * a) / b) / 10}%` : '0%')

export function GroupSwatch({ group, withLabel = true }: { group: GroupKey; withLabel?: boolean }) {
  const g = GROUPS[group]
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color }} aria-hidden />
      {withLabel && g.label}
    </span>
  )
}

export function VenueTag({ venue }: { venue: Venue | null | undefined }) {
  if (!venue) return <span className="text-mist">Unassigned</span>
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-sm ${venue === 'ISE' ? 'bg-bronze-500/15 text-bronze-300' : 'bg-sea-600/40 text-parchment'}`}>{VENUE[venue]}</span>
}

export function Presence({ present }: { present: boolean }) {
  return <span role="img" aria-label={present ? 'Checked in' : 'Not checked in'}
    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${present ? 'bg-ok' : 'border border-mist/60'}`} />
}

export function AttendancePill({ present, size }: { present: number; size: number }) {
  const [text, cls] = present === 0 ? ['Not arrived', 'text-mist bg-sea-950'] : present === size ? ['All present', 'text-ok bg-ok/10'] : [`${present} of ${size} here`, 'text-warn bg-warn/10']
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-sm ${cls}`}>{text}</span>
}

export interface SegOption<T extends string> { value: T; label: string; count?: number; color?: string }
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-sea-600 bg-sea-950 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${value === o.value ? 'bg-sea-700 text-parchment' : 'text-mist hover:text-parchment'}`}>
          {o.color && <span className="h-2 w-2 rounded-sm" style={{ background: o.color }} aria-hidden />}
          {o.label}{o.count !== undefined && <span className="num text-mist">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-mist">{children}</p>
}

// Polls a loader every `ms` (0 = load once). Returns [data, error, reload, lastUpdated].
export function usePoll<T>(load: () => Promise<ApiResult<T>>, ms: number, deps: unknown[] = []): [T | null, ApiResult | null, () => Promise<void>, Date | null] {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<ApiResult | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  const ref = useRef(load)
  ref.current = load
  const run = async () => {
    const r = await ref.current()
    if (r.ok) { setData(r.data); setErr(null); setAt(new Date()) } else setErr(r)
  }
  useEffect(() => {
    void run()
    if (!ms) return
    const id = setInterval(() => void run(), ms)
    return () => clearInterval(id)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return [data, err, run, at]
}
