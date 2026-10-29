'use client'

import { useState } from 'react'
import { api, errorText, fmtTime, type Venue } from '../api'
import { Empty, Notice, PageHeader, Segmented, usePoll, VenueTag } from '../kit'
import { Download } from 'lucide-react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import type { CheckinRow } from './types'

export default function CheckIns() {
  const [v, setV] = useState<'' | Venue>('')
  const [rows, err] = usePoll<CheckinRow[]>(() => api(`/api/admin/checkins${v ? `?venue=${v}` : ''}`), 8000, [v])
  return (
    <>
      <PageHeader eyebrow="Log" title="Check-ins" actions={<>
        <Button asChild><a href="/api/admin/export/checkins.csv"><Download />Check-ins CSV</a></Button>
        <Button asChild variant="muted"><a href="/api/admin/export/allocation.csv"><Download />Full participant list</a></Button>
      </>}>Every successful check-in, newest first. Exports are CSV files that open in Excel or Sheets.</PageHeader>
      <div className="mb-4"><Segmented label="Venue" value={v} onChange={setV} options={[{ value: '', label: 'Both venues' }, { value: 'ISE', label: 'ISE Seminar Hall' }, { value: 'DTH', label: 'DTH' }]} /></div>
      {err && <Notice title="Could not load check-ins">{errorText(err)}</Notice>}
      <Card className="gap-0 overflow-x-auto px-3 py-1">
        {rows && rows.length === 0 ? <Empty>No check-ins yet.</Empty> : (
          <table className="table min-w-[720px]">
            <thead><tr><th>Time</th><th>Name</th><th>Email</th><th>Team</th><th>Venue</th></tr></thead>
            <tbody>{rows?.map((r, i) => (
              <tr key={i}><td className="num font-mono text-xs text-muted-foreground">{fmtTime(r.at)}</td><td className="font-medium">{r.name}</td><td className="text-muted-foreground">{r.email}</td>
                <td>{r.team || <span className="text-muted-foreground">No team</span>}</td><td><VenueTag venue={r.venue} /></td></tr>))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
