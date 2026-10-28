'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { api } from './api'

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <h1 className="font-display text-2xl text-bronze-400">Voyage to Ithaca</h1>
          <p className="text-sm text-mist">Organizer sign-in</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-mist">Username</span>
          <input className="field" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={u} onChange={(e) => setU(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-mist">Password</span>
          <input className="field" name="password" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
        </label>
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
