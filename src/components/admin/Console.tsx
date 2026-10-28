'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'

const NAV: [string, string][] = [
  ['/admin', 'Attendance'], ['/admin/teams', 'Teams'], ['/admin/participants', 'Participants'], ['/admin/checkins', 'Check-ins'],
  ['/admin/qr-codes', 'QR codes'], ['/admin/emails', 'Emails'], ['/admin/import', 'Setup'],
]

function SetupStatus() {
  const [s, setS] = useState<string | null>(null)
  const path = usePathname()
  useEffect(() => { void api<{ status: string }>('/api/admin/allocation').then((r) => r.ok && setS(r.data.status)) }, [path])
  if (!s) return null
  const map: Record<string, [string, string]> = { CONFIRMED: ['Venues confirmed', 'bg-ok'], DRAFT: ['Venues not confirmed', 'bg-warn'], NONE: ['Setup not started', 'bg-bad'] }
  const [text, dot] = map[s] ?? ['', '']
  return <p className="flex items-center gap-2 text-sm text-mist"><span className={`h-2 w-2 rounded-full ${dot}`} />{text}</p>
}

export function useSignOut() {
  const router = useRouter()
  return async () => {
    await api('/api/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }
}

export default function Console({ username, children }: { username: string; children: ReactNode }) {
  const path = usePathname()
  const signOut = useSignOut()
  const link = (to: string) => {
    const active = to === '/admin' ? path === '/admin' : path.startsWith(to)
    return `block whitespace-nowrap rounded-md px-3 py-2 transition-colors ${active ? 'bg-sea-700 text-parchment' : 'text-mist hover:bg-sea-800 hover:text-parchment'}`
  }
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-sea-700 bg-sea-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 lg:block lg:px-5 lg:pt-6">
          <div>
            <p className="font-display text-xl text-bronze-400">Voyage to Ithaca</p>
            <p className="text-sm text-mist">Organizer console</p>
          </div>
          <button className="btn-quiet px-3 py-1.5 text-sm lg:hidden" onClick={signOut}>Sign out</button>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 py-3 lg:mt-6 lg:flex-1 lg:flex-col lg:overflow-visible">
          {NAV.map(([to, label]) => <Link key={to} href={to} className={link(to)} aria-current={(to === '/admin' ? path === to : path.startsWith(to)) ? 'page' : undefined}>{label}</Link>)}
        </nav>
        <div className="hidden space-y-3 border-t border-sea-700 px-5 py-4 lg:block">
          <SetupStatus />
          <p className="text-sm text-mist">Signed in as <span className="text-parchment">{username}</span></p>
          <button className="btn-quiet w-full text-sm" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
