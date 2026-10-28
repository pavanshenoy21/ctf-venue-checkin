'use client'

import Link from 'next/link'
import { api, errorText, fmtTime } from '../api'
import { Bar, Empty, GroupSwatch, GROUPS, Notice, PageHeader, pct, usePoll, VenueTag } from '../ui'
import type { BreakdownRow, Stats, VenueStats } from './types'

const venueName = (label: string) => (label === 'ISE SEMINAR HALL' ? 'ISE Seminar Hall' : label)

function VenueBlock({ v }: { v: VenueStats }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl">{venueName(v.label)}</h2>
        <span className="num text-mist">{pct(v.checked_in, v.assigned)}</span>
      </div>
      <p className="num mt-1 text-lg">{v.checked_in} <span className="text-mist">of {v.assigned} checked in</span></p>
      <div className="mt-3"><Bar value={v.checked_in} max={v.assigned} label={`${v.label} attendance`} /></div>
      <p className="num mt-2 text-sm text-mist">{v.remaining} still to arrive. Hall capacity {v.capacity}.</p>
    </div>
  )
}

const na = <span className="text-mist">n/a</span>

function Breakdown({ rows }: { rows: BreakdownRow[] }) {
  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="font-display text-xl">Attendance by team size</h2>
        <Link href="/admin/teams" className="text-sm text-bronze-300 underline-offset-4 hover:underline">See every team</Link>
      </div>
      <div className="overflow-x-auto px-2 pb-2 pt-3">
        <table className="table num min-w-[760px]">
          <thead><tr>
            <th>Group</th><th className="text-right">Teams</th><th className="text-right">People</th><th className="w-48">Checked in</th>
            <th className="text-right">All present</th><th className="text-right">Partly here</th><th className="text-right">Not arrived</th>
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
                      <span className="w-16 text-right">{r.present}<span className="text-mist">/{r.participants}</span></span>
                    </div>
                  </td>
                  <td className="text-right">{none ? na : <span className={r.teams_full ? 'text-ok' : ''}>{r.teams_full}</span>}</td>
                  <td className="text-right">{none ? na : <span className={r.teams_partial ? 'text-warn' : ''}>{r.teams_partial}</span>}</td>
                  <td className="text-right">{none ? <span className="text-mist">{r.participants - r.present}</span> : r.teams_absent}</td>
                  <td className="text-right">{r.venues.ISE.present}<span className="text-mist">/{r.venues.ISE.participants}</span></td>
                  <td className="text-right">{r.venues.DTH.present}<span className="text-mist">/{r.venues.DTH.participants}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-sea-700 px-5 py-3 text-sm text-mist">
        A team counts as all present once every member has checked in. People without a team are counted individually. The ISE and DTH columns show checked in out of assigned.
      </p>
    </section>
  )
}

export default function Dashboard() {
  const [s, err, , at] = usePoll<Stats>(() => api('/api/admin/stats'), 8000)
  if (!s) return err ? <Notice title="Could not load attendance">{errorText(err)}</Notice> : <p className="text-mist">Loading attendance…</p>
  return (
    <>
      <PageHeader title="Attendance">Live check-in numbers for both venues. Updates every few seconds{at ? `, last at ${fmtTime(at)}` : ''}.</PageHeader>
      {err && <Notice tone="warn" title="Showing the last numbers received">{errorText(err)}</Notice>}
      {s.status !== 'CONFIRMED' && (
        <Notice tone="warn" title="Venues are not confirmed yet">
          Check-in stays closed until the allocation is confirmed. <Link className="underline" href="/admin/import">Finish setup</Link>
        </Notice>
      )}
      {s.total_participants === 0 && <Notice tone="info" title="No participants yet">Import the registration CSV on the <Link className="underline" href="/admin/import">Setup</Link> page.</Notice>}

      <section className="panel grid gap-8 p-5 sm:p-6 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="text-mist">Checked in overall</p>
          <p className="num mt-1 font-display text-6xl leading-none text-bronze-300">{s.checked_in}<span className="text-3xl text-mist"> / {s.total_participants}</span></p>
          <div className="mt-4"><Bar value={s.checked_in} max={s.total_participants} height="h-3" label="Overall attendance" /></div>
          <p className="num mt-2 text-sm text-mist">{pct(s.checked_in, s.total_participants)} here, {s.not_checked_in} yet to arrive. {s.total_teams} teams registered.</p>
        </div>
        <VenueBlock v={s.per_venue.ISE} />
        <VenueBlock v={s.per_venue.DTH} />
      </section>

      <Breakdown rows={s.breakdown} />

      <section className="panel mt-6">
        <h2 className="px-5 pt-5 font-display text-xl">Latest check-ins</h2>
        {s.recent.length === 0 ? <Empty>No one has checked in yet. Check-ins from both venues appear here as they happen.</Empty> : (
          <ul className="divide-y divide-sea-700/60 px-5 py-2">
            {s.recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-2.5">
                <span className="w-full font-medium sm:order-2 sm:w-auto sm:flex-1">{r.name}</span>
                <span className="num text-sm text-mist sm:order-1 sm:w-24 sm:text-base">{fmtTime(r.at)}</span>
                <span className="flex-1 text-sm text-mist sm:order-3 sm:flex-none sm:text-base">{r.team || 'No team'}</span>
                <span className="sm:order-4"><VenueTag venue={r.venue} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
