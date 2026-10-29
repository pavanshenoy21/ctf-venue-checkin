'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { api, errorText, fmtTime } from '../api'
import { Bar, Empty, GroupSwatch, GROUPS, Loading, Notice, PageHeader, pct, Section, usePoll, VenueTag } from '../kit'
import { Card } from '../ui/card'
import type { BreakdownRow, Stats, VenueStats } from './types'

const venueName = (label: string) => (label === 'ISE SEMINAR HALL' ? 'ISE Seminar Hall' : label)

function VenueCard({ v }: { v: VenueStats }) {
  return (
    <Card className="gap-0 px-6 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow text-muted-foreground">{venueName(v.label)}</p>
        <span className="num font-mono text-sm text-gold-light">{pct(v.checked_in, v.assigned)}</span>
      </div>
      <p className="num mt-3 text-4xl font-bold leading-none tracking-tight">{v.checked_in}<span className="ml-1.5 text-xl font-bold text-muted-foreground">/ {v.assigned}</span></p>
      <div className="mt-5"><Bar value={v.checked_in} max={v.assigned} label={`${v.label} attendance`} /></div>
      <p className="num mt-3 text-sm text-muted-foreground">{v.remaining} still to arrive · capacity {v.capacity}</p>
    </Card>
  )
}

const na = <span className="text-muted-foreground/60">–</span>

function Breakdown({ rows }: { rows: BreakdownRow[] }) {
  return (
    <Section className="mt-6 overflow-hidden" eyebrow="Breakdown" title="Attendance by team size"
      aside={<Link href="/admin/teams" className="inline-flex items-center gap-1.5 text-sm text-gold-light hover:underline">Every team <ArrowRight className="size-3.5" /></Link>}>
      <div className="overflow-x-auto px-3 pb-2 pt-4">
        <table className="table num min-w-[760px]">
          <thead><tr>
            <th>Group</th><th className="text-right">Teams</th><th className="text-right">People</th><th className="w-52">Checked in</th>
            <th className="text-right">All present</th><th className="text-right">Partly</th><th className="text-right">Not arrived</th>
            <th className="text-right">ISE</th><th className="text-right">DTH</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const g = GROUPS[r.key], none = r.key === 'none'
              return (
                <tr key={r.key}>
                  <td className="font-medium"><GroupSwatch group={r.key} /></td>
                  <td className="text-right">{none ? na : r.teams}</td>
                  <td className="text-right">{r.participants}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex-1"><Bar value={r.present} max={r.participants} color={g.color} label={`${g.label} checked in`} /></div>
                      <span className="w-16 text-right font-mono text-xs">{r.present}<span className="text-muted-foreground">/{r.participants}</span></span>
                    </div>
                  </td>
                  <td className="text-right">{none ? na : <span className={r.teams_full ? 'text-ok' : ''}>{r.teams_full}</span>}</td>
                  <td className="text-right">{none ? na : <span className={r.teams_partial ? 'text-warn' : ''}>{r.teams_partial}</span>}</td>
                  <td className="text-right">{none ? <span className="text-muted-foreground">{r.participants - r.present}</span> : r.teams_absent}</td>
                  <td className="text-right font-mono text-xs">{r.venues.ISE.present}<span className="text-muted-foreground">/{r.venues.ISE.participants}</span></td>
                  <td className="text-right font-mono text-xs">{r.venues.DTH.present}<span className="text-muted-foreground">/{r.venues.DTH.participants}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-6 py-3.5 text-sm text-muted-foreground">
        A team counts as all present once every member has checked in. People without a team are counted individually. ISE and DTH show checked in out of assigned.
      </p>
    </Section>
  )
}

export default function Dashboard() {
  const [s, err, , at] = usePoll<Stats>(() => api('/api/admin/stats'), 8000)
  if (!s) return err ? <Notice title="Could not load attendance">{errorText(err)}</Notice> : <Loading>Loading attendance…</Loading>
  return (
    <>
      <PageHeader eyebrow="Live" title="Attendance">
        Check-ins at both venues, updating every few seconds{at ? ` · last at ${fmtTime(at)}` : ''}.
      </PageHeader>
      {err && <Notice tone="warn" title="Showing the last numbers received">{errorText(err)}</Notice>}
      {s.status !== 'CONFIRMED' && (
        <Notice tone="warn" title="Venues are not confirmed yet">
          Check-in stays closed until the allocation is confirmed. <Link className="underline" href="/admin/import">Finish setup</Link>
        </Notice>
      )}
      {s.total_participants === 0 && <Notice tone="info" title="No participants yet">Import the registration CSV on the <Link className="underline" href="/admin/import">Setup</Link> page.</Notice>}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Card className="relative gap-0 overflow-hidden px-6 py-6">
          <p className="eyebrow text-muted-foreground">Checked in overall</p>
          <p className="num mt-3 text-6xl font-bold leading-none tracking-tight">{s.checked_in}<span className="ml-2 text-3xl text-muted-foreground">/ {s.total_participants}</span></p>
          <div className="mt-5"><Bar value={s.checked_in} max={s.total_participants} height="h-2.5" label="Overall attendance" /></div>
          <p className="num mt-3 text-sm text-muted-foreground">{pct(s.checked_in, s.total_participants)} here · {s.not_checked_in} yet to arrive · {s.total_teams} teams</p>
        </Card>
        <VenueCard v={s.per_venue.ISE} />
        <VenueCard v={s.per_venue.DTH} />
      </div>

      <Breakdown rows={s.breakdown} />

      <Section className="mt-6" eyebrow="Feed" title="Latest check-ins">
        {s.recent.length === 0 ? <Empty>No one has checked in yet. Check-ins from both venues appear here as they happen.</Empty> : (
          <ul className="divide-y divide-border/60 px-6 py-2">
            {s.recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-3">
                <span className="w-full font-medium sm:order-2 sm:w-auto sm:flex-1">{r.name}</span>
                <span className="num font-mono text-xs text-muted-foreground sm:order-1 sm:w-20">{fmtTime(r.at)}</span>
                <span className="flex-1 text-sm text-muted-foreground sm:order-3 sm:flex-none">{r.team || 'No team'}</span>
                <span className="sm:order-4"><VenueTag venue={r.venue} /></span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
