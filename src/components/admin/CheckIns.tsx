'use client'

import { useState } from 'react'
import { api, errorText, fmtTime, type Venue } from '../api'
import { Empty, Notice, PageHeader, Segmented, usePoll, VenueTag } from '../ui'
import type { CheckinRow } from './types'

export default function CheckIns() {
  const [v, setV] = useState<'' | Venue>('')
  const [rows, err] = usePoll<CheckinRow[]>(() => api(`/api/admin/checkins${v ? `?venue=${v}` : ''}`), 8000, [v])
  return (
    <>
      <PageHeader title="Check-ins" actions={<>
        <a className="btn-primary" href="/api/admin/export/checkins.csv">Export check-ins</a>
        <a className="btn-quiet" href="/api/admin/export/allocation.csv">Export full participant list</a>
      </>}>Every successful check-in, newest first. Exports are CSV files that open in Excel or Sheets.</PageHeader>
      <div className="mb-4"><Segmented label="Venue" value={v} onChange={setV} options={[{ value: '', label: 'Both venues' }, { value: 'ISE', label: 'ISE Seminar Hall' }, { value: 'DTH', label: 'DTH' }]} /></div>
      {err && <Notice title="Could not load check-ins">{errorText(err)}</Notice>}
      <div className="panel overflow-x-auto px-2">
        {rows && rows.length === 0 ? <Empty>No check-ins yet.</Empty> : (
          <table className="table min-w-[720px]">
            <thead><tr><th>Time</th><th>Name</th><th>Email</th><th>Team</th><th>Venue</th></tr></thead>
            <tbody>{rows?.map((r, i) => (
              <tr key={i}><td className="num text-mist">{fmtTime(r.at)}</td><td className="font-medium">{r.name}</td><td className="text-mist">{r.email}</td>
                <td>{r.team || <span className="text-mist">No team</span>}</td><td><VenueTag venue={r.venue} /></td></tr>))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
