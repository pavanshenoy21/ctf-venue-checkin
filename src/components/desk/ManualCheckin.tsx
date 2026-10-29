'use client'

import { Search, UserSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from 'cn'
import { api, errorText, fmtTime, VENUE, type Venue } from '../api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

interface Person { id: number; name: string; email: string; team: string | null; sap_id: string | null; checked_in: boolean; checked_in_at: string | null; out: boolean }

// Fallback for when a QR won't scan: a small button in the bottom-right corner opens a search of this venue's
// participants. Picking someone opens the same confirm card as a scan. It also sits above the scanner.
// raised: the scanner is open, so sit above its manual-entry bar instead of covering its Check button
export default function ManualCheckin({ venue, raised = false, onCheckIn }: { venue: Venue; raised?: boolean; onCheckIn: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Person[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setPeople(null); setErr(''); return }
    const id = setTimeout(async () => {
      const r = await api<{ people: Person[] }>(`/api/operator/search?q=${encodeURIComponent(term)}`)
      if (r.ok) { setPeople(r.data.people); setErr('') } else setErr(errorText(r))
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  const pick = (p: Person) => { setOpen(false); setQ(''); onCheckIn(p.id) }

  return (
    <>
      <Button variant="muted" size="sm" className={cn('fixed right-4 z-[45] bg-black/80 backdrop-blur', raised ? 'bottom-28' : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]')} onClick={() => setOpen(true)}>
        <UserSearch />Manual check-in
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-label="Manual check-in" className="bottom-0 top-auto flex max-h-[88vh] max-w-full translate-y-0 flex-col gap-0 rounded-b-none p-5 sm:bottom-auto sm:top-[50%] sm:max-w-lg sm:translate-y-[-50%] sm:rounded-2xl">
          <p className="eyebrow text-primary">{VENUE[venue]} · QR won&apos;t scan</p>
          <DialogTitle className="mt-1.5">Manual check-in</DialogTitle>
          <DialogDescription className="mt-1">Find the person, then check their ID on the next screen.</DialogDescription>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-10" type="search" autoFocus aria-label="Search participants" placeholder="Name, SAP ID, email or team" maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {err && <p role="alert" className="mt-2 text-sm text-[#f3a49b]">{err}</p>}
          <ul className="-mx-1 mt-3 min-h-24 flex-1 overflow-y-auto px-1">
            {people?.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-border/70 py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="break-words font-medium">{p.name}</p>
                  <p className="break-words font-mono text-xs text-muted-foreground">{[p.sap_id, p.team ?? 'No team yet'].filter(Boolean).join(' · ')}</p>
                </div>
                {p.out
                  ? <span className="flex shrink-0 items-center gap-2"><Badge variant="warn">Out</Badge><Button size="sm" onClick={() => pick(p)}>Re-admit</Button></span>
                  : p.checked_in
                    ? <Badge variant="ok" className="shrink-0">In · {fmtTime(p.checked_in_at)}</Badge>
                    : <Button size="sm" className="shrink-0" onClick={() => pick(p)}>Check in</Button>}
              </li>
            ))}
            {people && people.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nobody in this venue matches “{q.trim()}”.</li>}
            {!people && <li className="py-6 text-center text-sm text-muted-foreground">Type at least 2 letters.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
