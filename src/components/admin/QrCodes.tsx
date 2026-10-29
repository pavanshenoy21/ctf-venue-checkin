'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, errorText } from '../api'
import { Empty, Notice, PageHeader, usePoll, VenueTag } from '../kit'
import { Archive, Download } from 'lucide-react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import type { QrRow } from './types'

export default function QrCodes() {
  const [list, err] = usePoll<QrRow[]>(() => api('/api/admin/qr'), 0)
  const [pick, setPick] = useState<QrRow | null>(null)
  const [q, setQ] = useState('')
  const notReady = err?.status === 409
  const needle = q.trim().toLowerCase()
  const items = (list ?? []).filter((p) => !needle || `${p.name} ${p.team ?? ''}`.toLowerCase().includes(needle))
  return (
    <>
      <PageHeader eyebrow="Codes" title="QR codes" actions={!notReady && <>
        <Button asChild><a href="/api/admin/qr/all.zip"><Archive />All QR codes (ZIP)</a></Button>
        <Button asChild variant="muted"><a href="/api/admin/qr/export.csv"><Download />List (CSV)</a></Button>
      </>}>One QR per participant. The code only holds a random link, never names or venues. File names include the venue so printed codes are easy to sort.</PageHeader>
      {notReady && <Notice tone="warn" title="Confirm venues first">QR codes are issued after the allocation is final. <Link className="underline" href="/admin/import">Go to Setup</Link></Notice>}
      {err && !notReady && <Notice title="Could not load QR codes">{errorText(err)}</Notice>}
      {list && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_18rem]">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="p-3"><Input type="search" aria-label="Find a participant" placeholder="Find a participant" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="max-h-[65vh] overflow-auto px-2">
              {items.length === 0 ? <Empty>No match.</Empty> : (
                <table className="table">
                  <thead className="sticky top-0 bg-card"><tr><th>Name</th><th>Team</th><th>Venue</th></tr></thead>
                  <tbody>{items.map((p) => (
                    <tr key={p.id} onClick={() => setPick(p)} className={`cursor-pointer ${pick?.id === p.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                      <td className="font-medium"><button type="button" className="text-left" onClick={() => setPick(p)}>{p.name}</button></td>
                      <td className="text-muted-foreground">{p.team ?? 'No team'}</td><td><VenueTag venue={p.venue} /></td>
                    </tr>))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
          <Card className="gap-0 p-5 text-center lg:sticky lg:top-6" aria-label="QR preview">
            {pick ? (<>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset */}
              <img alt={`QR code for ${pick.name}`} className="mx-auto aspect-square w-full max-w-[14rem] rounded-xl bg-white p-2.5 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.8)]" src={`/api/admin/qr/${pick.id}.png`} />
              <p className="mt-3 font-medium">{pick.name}</p>
              <p className="text-sm text-muted-foreground">{pick.team ?? 'No team'}</p>
              <div className="mt-2"><VenueTag venue={pick.venue} /></div>
              <Button asChild variant="muted" size="sm" className="mt-5 w-full"><a href={`/api/admin/qr/${pick.id}.png`} download={pick.file}><Download />Download PNG</a></Button>
            </>) : <p className="py-10 text-muted-foreground">Select a participant to preview their code.</p>}
          </Card>
        </div>
      )}
    </>
  )
}
