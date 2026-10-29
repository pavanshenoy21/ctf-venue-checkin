'use client'

import { LogIn } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { api } from './api'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'

export default function LoginForm() {
  const router = useRouter()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const r = await api<{ role: string; venue: string | null }>('/api/auth/login', { method: 'POST', body: { username: u, password: p } })
    if (r.ok) {
      router.replace(r.data.role === 'SUPER_ADMIN' ? '/admin' : `/admin/${r.data.venue!.toLowerCase()}`)
      router.refresh()
      return
    }
    setBusy(false)
    setErr(r.status === 429 ? 'Too many attempts. Wait a minute and try again.' : r.status === 0 ? 'Cannot reach the server.' : 'Invalid username or password')
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
          <img src="/email-logo.png" alt="Coding Club · 10 Years" className="mx-auto h-20 w-auto" />
          <p className="eyebrow mt-6 whitespace-nowrap text-primary">Voyage to Ithaca</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.015em]">Organizer sign-in</h1>
        </div>
        <Card className="px-6 pb-7 pt-6">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="eyebrow text-muted-foreground">Username</Label>
              <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={u} onChange={(e) => setU(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="eyebrow text-muted-foreground">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
            </div>
            {err && <p role="alert" className="text-sm text-[#f3a49b]">{err}</p>}
            <Button className="mt-2 w-full" disabled={busy || !u || !p}><LogIn />{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
