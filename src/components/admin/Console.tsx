'use client'

import { Activity, DoorOpen, KeyRound, ListChecks, LogOut, Mail, QrCode, Settings2, UserPlus, Users, UsersRound, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { api } from '../api'
import { Button } from '../ui/button'

const NAV: [string, string, LucideIcon][] = [
  ['/admin', 'Attendance', Activity], ['/admin/teams', 'Teams', UsersRound], ['/admin/participants', 'Participants', Users],
  ['/admin/checkins', 'Check-ins', ListChecks], ['/admin/qr-codes', 'QR codes', QrCode], ['/admin/emails', 'Emails', Mail],
  ['/admin/walk-ins', 'Walk-ins', UserPlus], ['/admin/exits', 'Temp exits', DoorOpen], ['/admin/passwords', 'Passwords', KeyRound], ['/admin/import', 'Setup', Settings2],
]

function SetupStatus() {
  const [s, setS] = useState<string | null>(null)
  const path = usePathname()
  useEffect(() => { void api<{ status: string }>('/api/admin/allocation').then((r) => r.ok && setS(r.data.status)) }, [path])
  if (!s) return null
  const map: Record<string, [string, string]> = { CONFIRMED: ['Venues confirmed', 'bg-ok'], DRAFT: ['Venues not confirmed', 'bg-warn'], NONE: ['Setup not started', 'bg-destructive'] }
  const [text, dot] = map[s] ?? ['', '']
  return <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className={cn('size-2 rounded-full', dot)} />{text}</p>
}

export function useSignOut() {
  const router = useRouter()
  return async () => {
    await api('/api/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }
}

export function Brand({ sub }: { sub: string }) {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
      <img src="/email-logo.png" alt="" className="h-8 w-auto shrink-0" />
      <div className="min-w-0 leading-tight">
        <p className="whitespace-nowrap font-display text-[0.85rem] font-extrabold tracking-[-0.01em] text-gold-light">Voyage to Ithaca</p>
        <p className="eyebrow mt-0.5 whitespace-nowrap text-[0.6rem] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

export default function Console({ username, children }: { username: string; children: ReactNode }) {
  const path = usePathname()
  const signOut = useSignOut()
  const active = (to: string) => (to === '/admin' ? path === '/admin' : path.startsWith(to))
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b bg-black/50 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[17rem] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 lg:px-5 lg:pt-6">
          <Brand sub="Organizer console" />
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={signOut}><LogOut />Sign out</Button>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 py-3 lg:mt-6 lg:flex-1 lg:flex-col lg:overflow-visible">
          {NAV.map(([to, label, Icon]) => (
            <Link key={to} href={to} aria-current={active(to) ? 'page' : undefined}
              className={cn('group relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-[0.93rem] transition-colors',
                active(to) ? 'bg-white/[0.07] font-medium text-foreground' : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground')}>
              <Icon className={cn('size-[1.05rem]', active(to) ? 'text-foreground' : 'opacity-70 group-hover:opacity-100')} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden space-y-4 border-t px-5 py-5 lg:block">
          <SetupStatus />
          <p className="text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground">{username}</span></p>
          <Button variant="muted" size="sm" className="w-full" onClick={signOut}><LogOut />Sign out</Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
