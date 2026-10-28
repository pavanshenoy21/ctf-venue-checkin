'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, errorText } from '../api'
import { Empty, Notice, PageHeader, usePoll, VenueTag } from '../ui'
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
      <PageHeader title="QR codes" actions={!notReady && <>
        <a className="btn-primary" href="/api/admin/qr/all.zip">Generate all QR codes (ZIP)</a>
        <a className="btn-quiet" href="/api/admin/qr/export.csv">Export list (CSV)</a>
      </>}>One QR per participant. The code only holds a random link, never names or venues. File names include the venue so printed codes are easy to sort.</PageHeader>
      {notReady && <Notice tone="warn" title="Confirm venues first">QR codes are issued after the allocation is final. <Link className="underline" href="/admin/import">Go to Setup</Link></Notice>}
      {err && !notReady && <Notice title="Could not load QR codes">{errorText(err)}</Notice>}
      {list && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_18rem]">
          <div className="panel overflow-hidden">
            <div className="p-3"><input className="field" type="search" aria-label="Find a participant" placeholder="Find a participant" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="max-h-[65vh] overflow-auto px-2">
              {items.length === 0 ? <Empty>No match.</Empty> : (
                <table className="table">
                  <thead className="sticky top-0 bg-sea-800"><tr><th>Name</th><th>Team</th><th>Venue</th></tr></thead>
                  <tbody>{items.map((p) => (
                    <tr key={p.id} onClick={() => setPick(p)} className={`cursor-pointer ${pick?.id === p.id ? 'bg-sea-700' : 'hover:bg-sea-700/50'}`}>
                      <td className="font-medium"><button type="button" className="text-left" onClick={() => setPick(p)}>{p.name}</button></td>
                      <td className="text-mist">{p.team ?? 'No team'}</td><td><VenueTag venue={p.venue} /></td>
                    </tr>))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <aside className="panel p-5 text-center lg:sticky lg:top-6" aria-label="QR preview">
            {pick ? (<>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not a static asset */}
              <img alt={`QR code for ${pick.name}`} className="mx-auto aspect-square w-full max-w-[14rem] rounded bg-white p-2" src={`/api/admin/qr/${pick.id}.png`} />
              <p className="mt-3 font-medium">{pick.name}</p>
              <p className="text-sm text-mist">{pick.team ?? 'No team'}</p>
              <div className="mt-2"><VenueTag venue={pick.venue} /></div>
              <a className="btn-quiet mt-4 w-full text-sm" href={`/api/admin/qr/${pick.id}.png`} download={pick.file}>Download PNG</a>
            </>) : <p className="py-10 text-mist">Select a participant to preview their code.</p>}
          </aside>
        </div>
      )}
    </>
  )
}
