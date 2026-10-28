'use client'

import { useEffect, useState } from 'react'
import { api, errorText, fmtDateTime, type Venue } from '../api'
import { Empty, GroupSwatch, groupOf, Notice, PageHeader, Presence, Segmented, VenueTag } from '../ui'
import type { ParticipantRow } from './types'

export default function Participants() {
  const [q, setQ] = useState('')
  const [venue, setVenue] = useState<'' | Venue>('')
  const [st, setSt] = useState<'' | 'true' | 'false'>('')
  const [d, setD] = useState<{ total: number; items: ParticipantRow[] } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const id = setTimeout(async () => {
      const p = new URLSearchParams({ q: q.slice(0, 100), limit: '1000' })
      if (venue) p.set('venue', venue)
      if (st) p.set('checked', st)
      const r = await api<{ total: number; items: ParticipantRow[] }>(`/api/admin/participants?${p}`)
      if (r.ok) { setD(r.data); setErr('') } else setErr(errorText(r))
    }, 200)
    return () => clearTimeout(id)
  }, [q, venue, st])
  return (
    <>
      <PageHeader title="Participants">Search by name, email, team or participant ID.</PageHeader>
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="field min-w-[16rem] flex-1" type="search" aria-label="Search participants" placeholder="Search participants" maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <select className="field w-auto" aria-label="Venue" value={venue} onChange={(e) => setVenue(e.target.value as '' | Venue)}>
          <option value="">Both venues</option><option value="ISE">ISE Seminar Hall</option><option value="DTH">DTH</option>
        </select>
        <Segmented label="Check-in status" value={st} onChange={setSt} options={[{ value: '', label: 'Everyone' }, { value: 'true', label: 'Checked in' }, { value: 'false', label: 'Not yet' }]} />
      </div>
      <Notice>{err}</Notice>
      {d && <p className="num mb-2 text-sm text-mist" aria-live="polite">{d.total} {d.total === 1 ? 'participant' : 'participants'}</p>}
      <div className="panel overflow-x-auto px-2">
        {d && d.items.length === 0 ? <Empty>No participants match. Try a shorter search.</Empty> : (
          <table className="table min-w-[860px]">
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Team</th><th>Venue</th><th>Checked in</th></tr></thead>
            <tbody>{d?.items.map((p) => (
              <tr key={p.id}>
                <td className="num text-mist">{p.id}</td>
                <td className="font-medium">{p.name}</td>
                <td className="text-mist">{p.email}</td>
                <td><span className="inline-flex items-center gap-2"><GroupSwatch group={groupOf(p.team_size)} withLabel={false} />{p.team || <span className="text-mist">No team</span>}</span></td>
                <td><VenueTag venue={p.venue} /></td>
                <td><span className="inline-flex items-center gap-2"><Presence present={p.checked_in} />{p.checked_in ? <span className="num">{fmtDateTime(p.checked_in_at)}</span> : <span className="text-mist">Not yet</span>}</span></td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
