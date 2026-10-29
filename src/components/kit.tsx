'use client'

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { Badge } from './ui/badge'
import { Card } from './ui/card'
import { VENUE, type ApiResult, type Venue } from './api'

// Team-size groups carry one colour each, used identically on every page.
export type GroupKey = '3' | '2' | '1' | 'none'
export const GROUPS: Record<GroupKey, { label: string; short: string; color: string }> = {
  '3': { label: '3-member teams', short: '3-member', color: '#d9b56b' },
  '2': { label: '2-member teams', short: '2-member', color: '#7fb4d9' },
  '1': { label: '1-member teams', short: '1-member', color: '#b49be0' },
  none: { label: 'No team', short: 'No team', color: '#8c826f' },
}
export const groupOf = (size: number | null | undefined): GroupKey => (size ? (String(size) as GroupKey) : 'none')

export function PageHeader({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-primary">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.015em] sm:text-4xl">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div>}
    </header>
  )
}

// A titled card section: mono eyebrow, display title, optional right-hand slot.
export function Section({ title, eyebrow, aside, className, children, ...rest }: {
  title?: ReactNode; eyebrow?: string; aside?: ReactNode; className?: string; children: ReactNode; 'aria-label'?: string
}) {
  return (
    <Card className={cn('gap-0 py-0', className)} {...rest}>
      {(title || aside) && (
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            {eyebrow && <p className="eyebrow mb-1.5 text-muted-foreground">{eyebrow}</p>}
            {title && <h2 className="font-display text-xl font-bold tracking-[-0.01em]">{title}</h2>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </Card>
  )
}

const TONES = {
  bad: ['border-destructive/40 bg-destructive/[0.08]', XCircle, 'text-[#f3a49b]'],
  warn: ['border-warn/35 bg-warn/[0.07]', AlertTriangle, 'text-warn'],
  ok: ['border-ok/35 bg-ok/[0.07]', CheckCircle2, 'text-ok'],
  info: ['border-border bg-white/[0.03]', Info, 'text-muted-foreground'],
} as const
export function Notice({ tone = 'bad', title, children }: { tone?: keyof typeof TONES; title?: string; children?: ReactNode }) {
  if (!children && !title) return null
  const [cls, Icon, ic] = TONES[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('my-4 flex gap-3 rounded-xl border px-4 py-3', cls)}>
      <Icon className={cn('mt-0.5 size-[1.1rem] shrink-0', ic)} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{children}</div>}
      </div>
    </div>
  )
}

export function Bar({ value, max, color = '#d9b56b', height = 'h-2', label }: { value: number; max: number; color?: string; height?: string; label?: string }) {
  const p = max > 0 ? Math.min(100, (100 * value) / max) : 0
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-white/[0.07]', height)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((1000 * a) / b) / 10}%` : '0%')

export function GroupSwatch({ group, withLabel = true }: { group: GroupKey; withLabel?: boolean }) {
  const g = GROUPS[group]
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: g.color }} aria-hidden />
      {withLabel && g.label}
    </span>
  )
}

export function VenueTag({ venue }: { venue: Venue | null | undefined }) {
  if (!venue) return <Badge variant="muted">Unassigned</Badge>
  return <Badge variant="muted" className="text-foreground/85">{VENUE[venue]}</Badge>
}

export function Presence({ present }: { present: boolean }) {
  return <span role="img" aria-label={present ? 'Checked in' : 'Not checked in'}
    className={cn('inline-block size-2.5 shrink-0 rounded-full', present ? 'bg-ok' : 'border border-muted-foreground/50')} />
}

export function AttendancePill({ present, size }: { present: number; size: number }) {
  if (present === 0) return <Badge variant="muted">Not arrived</Badge>
  if (present === size) return <Badge variant="ok">All present</Badge>
  return <Badge variant="warn">{present} of {size} here</Badge>
}

export interface SegOption<T extends string> { value: T; label: string; count?: number; color?: string }
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border bg-black/40 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
            value === o.value ? 'border-border bg-white/[0.08] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {o.color && <span className="size-2 rounded-[2px]" style={{ background: o.color }} aria-hidden />}
          {o.label}{o.count !== undefined && <span className="num font-mono text-xs opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

// Native select styled like the inputs (keeps mobile pickers and keyboard behaviour).
export const selectClass = 'h-11 rounded-lg border border-input bg-black/40 px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40'

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-12 text-center text-muted-foreground">{children}</p>
}

export function Loading({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-3 py-10 text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" />{children}</p>
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
