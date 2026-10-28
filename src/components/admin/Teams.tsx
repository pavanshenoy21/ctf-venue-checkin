'use client'

import { useMemo, useState } from 'react'
import { api, errorText, type Venue } from '../api'
import { AttendancePill, Empty, GROUPS, GroupSwatch, Notice, PageHeader, Presence, Segmented, usePoll, VenueTag, type GroupKey } from '../ui'
import type { SoloRow, TeamRow } from './types'

type Att = 'any' | 'full' | 'partial' | 'absent'
const status = (present: number, size: number): Att => (present === 0 ? 'absent' : present === size ? 'full' : 'partial')

export default function Teams() {
  const [d, err] = usePoll<{ teams: TeamRow[]; no_team: SoloRow[] }>(() => api('/api/admin/teams'), 15000)
  const [group, setGroup] = useState<'all' | GroupKey>('all')
  const [att, setAtt] = useState<Att>('any')
  const [venue, setVenue] = useState<'' | Venue>('')
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c: Record<'all' | GroupKey, number> = { all: 0, '3': 0, '2': 0, '1': 0, none: d?.no_team.length ?? 0 }
    d?.teams.forEach((t) => { c[String(t.size) as GroupKey]++; c.all++ })
    return c
  }, [d])

  if (!d) return err ? <Notice title="Could not load teams">{errorText(err)}</Notice> : <p className="text-mist">Loading teams…</p>

  const needle = q.trim().toLowerCase()
  const teams = d.teams.filter((t) =>
    (group === 'all' || String(t.size) === group) && (!venue || t.venue === venue) &&
    (att === 'any' || status(t.present, t.size) === att) &&
    (!needle || t.name.toLowerCase().includes(needle) || t.members.some((m) => m.name.toLowerCase().includes(needle))))
  const solo = d.no_team.filter((p) =>
    (group === 'all' || group === 'none') && (!venue || p.venue === venue) &&
    (att === 'any' || (att === 'full' ? p.checked_in : att === 'absent' ? !p.checked_in : false)) &&
    (!needle || p.name.toLowerCase().includes(needle)))
  const sections = (['3', '2', '1'] as const).map((k) => [k, teams.filter((t) => String(t.size) === k)] as const).filter(([, l]) => l.length)

  return (
    <>
      <PageHeader title="Teams">
        {counts.all} teams and {counts.none} participants without a team, largest teams first. Green dots mark members who have checked in.
      </PageHeader>

      <div className="mb-6 flex flex-col gap-3">
        <Segmented label="Team size" value={group} onChange={setGroup} options={[
          { value: 'all', label: 'All', count: counts.all + counts.none },
          ...(['3', '2', '1', 'none'] as const).map((k) => ({ value: k, label: GROUPS[k].short, count: counts[k], color: GROUPS[k].color })),
        ]} />
        <div className="flex flex-wrap gap-3">
          <Segmented label="Attendance" value={att} onChange={setAtt} options={[
            { value: 'any', label: 'Any attendance' }, { value: 'full', label: 'All present' },
            { value: 'partial', label: 'Partly here' }, { value: 'absent', label: 'Not arrived' }]} />
          <select className="field w-auto" aria-label="Venue" value={venue} onChange={(e) => setVenue(e.target.value as '' | Venue)}>
            <option value="">Both venues</option><option value="ISE">ISE Seminar Hall</option><option value="DTH">DTH</option>
          </select>
          <input className="field min-w-[14rem] flex-1" type="search" aria-label="Search team or member" placeholder="Search team or member" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {sections.length === 0 && solo.length === 0 && <div className="panel"><Empty>No teams match these filters.</Empty></div>}

      {sections.map(([k, list]) => (
        <section key={k} className="panel mb-6 overflow-hidden" aria-label={GROUPS[k].label}>
          <h2 className="flex items-baseline gap-3 px-5 pt-4 font-display text-lg">
            <GroupSwatch group={k} /><span className="num font-sans text-base text-mist">{list.length}</span>
          </h2>
          <div className="overflow-x-auto px-2 pb-1 pt-2">
            <table className="table min-w-[640px]">
              <thead><tr><th className="w-[28%]">Team</th><th>Venue</th><th>Members</th><th className="text-right">Attendance</th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}</td>
                    <td><VenueTag venue={t.venue} /></td>
                    <td>
                      <ul className="flex flex-wrap gap-x-5 gap-y-1">
                        {t.members.map((m, i) => (
                          <li key={i} className="flex items-center gap-2"><Presence present={m.checked_in} />
                            <span className={m.checked_in ? '' : 'text-mist'}>{m.name}</span></li>
                        ))}
                      </ul>
                    </td>
                    <td className="text-right"><AttendancePill present={t.present} size={t.size} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {solo.length > 0 && (
        <section className="panel mb-6 overflow-hidden" aria-label="No team">
          <h2 className="flex items-baseline gap-3 px-5 pt-4 font-display text-lg">
            <GroupSwatch group="none" /><span className="num font-sans text-base text-mist">{solo.length}</span>
          </h2>
          <p className="px-5 text-sm text-mist">Participants without a team are always seated in DTH.</p>
          <div className="overflow-x-auto px-2 pb-1 pt-2">
            <table className="table min-w-[480px]">
              <thead><tr><th>Participant</th><th>Venue</th><th className="text-right">Attendance</th></tr></thead>
              <tbody>{solo.map((p) => (
                <tr key={p.id}>
                  <td><span className="flex items-center gap-2"><Presence present={p.checked_in} /><span className={p.checked_in ? 'font-medium' : 'text-mist'}>{p.name}</span></span></td>
                  <td><VenueTag venue={p.venue} /></td>
                  <td className="text-right"><AttendancePill present={p.checked_in ? 1 : 0} size={1} /></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
