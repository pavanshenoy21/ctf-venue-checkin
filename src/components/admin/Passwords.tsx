'use client'

import { Copy, Download, KeyRound, Mail, Search, Send, Swords } from 'lucide-react'
import { useState } from 'react'
import { api, errorText, fmtTime } from '../api'
import { Empty, Loading, Notice, PageHeader, Section, Segmented, usePoll, VenueTag } from '../kit'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import type { PasswordRow, Passwords as PasswordsData } from './types'

type Msg = { tone: 'ok' | 'bad' | 'warn'; text: string } | null

function Status({ p }: { p: PasswordRow }) {
  if (p.password_sent_at) return <Badge variant="ok">Emailed {fmtTime(p.password_sent_at)}</Badge>
  if (p.password_error) return <Badge variant="bad" title={p.password_error}>Email failed</Badge>
  if (!p.checked_in) return <Badge variant="muted">Not checked in</Badge>
  return <Badge variant="warn">Not sent</Badge>
}

// Player passwords (word + 4 digits), in plain text for the organisers. They go out by email only to people who
// have checked in.
export default function Passwords() {
  const [d, err, reload] = usePoll<PasswordsData>(() => api('/api/admin/passwords'), 5000)
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'all' | 'in' | 'unsent'>('all')

  if (!d) return err ? <Notice title="Could not load passwords">{errorText(err)}</Notice> : <Loading>Loading passwords…</Loading>

  const run = async (key: string, path: string, body: object, ok: (data: Record<string, number | string>) => string, ask?: string) => {
    if (ask && !confirm(ask)) return
    setBusy(key)
    const r = await api<Record<string, number | string>>(path, { method: 'POST', body })
    setBusy(null)
    setMsg(r.ok ? { tone: 'ok', text: ok(r.data) } : { tone: 'bad', text: errorText(r) })
    void reload()
  }
  const missing = d.people.length - d.assigned
  const f = q.trim().toLowerCase()
  const rows = d.people.filter((p) =>
    (show === 'all' || (show === 'in' ? p.checked_in : p.checked_in && !p.password_sent_at)) &&
    (!f || `${p.name} ${p.email} ${p.team ?? ''} ${p.password ?? ''}`.toLowerCase().includes(f)))

  return (
    <>
      <PageHeader eyebrow="Logins" title="Passwords" actions={<>
        <Button asChild variant="muted"><a href="/api/admin/export/passwords.csv"><Download />Passwords CSV</a></Button>
        <Button asChild variant="muted"><a href="/api/admin/export/ctfd-seed.csv"><Swords />CTFd seed CSV</a></Button>
        <Button variant={missing ? 'solid' : 'muted'} disabled={!d.seed_set || !missing || busy !== null}
          onClick={() => run('assign', '/api/admin/passwords/assign', {}, (r) => `Assigned ${r.assigned} password${r.assigned === 1 ? '' : 's'}.`)}>
          <KeyRound />{missing ? `Assign ${missing} password${missing === 1 ? '' : 's'}` : 'Everyone has one'}
        </Button>
      </>}>
        Every player and team has a fixed password like <code className="font-mono text-gold-light">mango4821</code>, worked out from their email or team name, so it never changes and can be loaded into CTFd ahead of time with the CTFd seed CSV. Passwords are only emailed to people who have checked in.
      </PageHeader>
      {!d.seed_set && <Notice tone="warn" title="Set PASSWORD_SEED first">Add a long random PASSWORD_SEED to .env (e.g. <code className="font-mono">openssl rand -hex 24</code>) and restart. It fixes every password; never change it after seeding CTFd.</Notice>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Assigned', `${d.assigned}/${d.people.length}`], ['Checked in', d.checked_in], ['Emailed', d.sent], ['Waiting to send', d.to_send]] as const).map(([k, v]) => (
          <Card key={k} className="gap-0 px-4 py-4">
            <p className="eyebrow text-[0.62rem] text-muted-foreground">{k}</p>
            <p className={`num mt-1.5 text-3xl font-bold tracking-tight ${k === 'Waiting to send' && Number(v) > 0 ? 'text-warn' : ''}`}>{v}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-8 flex-row flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <p className="font-medium">{d.sending ? 'Sending passwords…' : d.to_send ? `${d.to_send} checked-in ${d.to_send === 1 ? 'player is' : 'players are'} waiting for their password` : 'Every checked-in player has been sent their password'}</p>
          <p className="text-sm text-muted-foreground">{d.smtp_configured ? 'Emails go only to people who have checked in. Missing passwords are assigned first.' : 'Sending is off because no mail server is set.'}</p>
        </div>
        <Button variant="solid" disabled={!d.seed_set || !d.smtp_configured || !d.to_send || d.sending || busy !== null}
          onClick={() => run('send', '/api/admin/passwords/send', {}, (r) => `Sending ${r.queued} password email${r.queued === 1 ? '' : 's'}. Progress updates below.`,
            `Email passwords to ${d.to_send} checked-in players?`)}>
          <Send />Send to {d.to_send} checked in
        </Button>
      </Card>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-10" type="search" aria-label="Search players" placeholder="Search name, email, team or password" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'Everyone' }, { value: 'in', label: 'Checked in' }, { value: 'unsent', label: 'Waiting to send' }]} />
      </div>

      <Section className="overflow-hidden" aria-label="Passwords">
        {rows.length === 0 ? <Empty>No players match.</Empty> : (
          <div className="overflow-x-auto px-3 py-1">
            <table className="table min-w-[860px]">
              <thead><tr><th>Name</th><th>Team</th><th>Venue</th><th>Password</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id}>
                  <td><p className="font-medium">{p.name}</p><p className="font-mono text-xs text-muted-foreground">{p.email}</p></td>
                  <td><p className="text-muted-foreground">{p.team ?? 'No team'}</p>{p.team_password && <p className="font-mono text-xs text-muted-foreground/80">team: <span className="text-foreground/80">{p.team_password}</span></p>}</td>
                  <td><VenueTag venue={p.venue} /></td>
                  <td>{p.password ? (
                    <span className="inline-flex items-center gap-1.5">
                      <code className="font-mono text-[0.95rem] text-gold-light">{p.password}</code>
                      <Button variant="ghost" size="icon-sm" aria-label={`Copy ${p.name}'s password`} title="Copy" onClick={() => void navigator.clipboard?.writeText(p.password!)}><Copy className="size-3.5" /></Button>
                    </span>) : <span className="text-muted-foreground">Not assigned</span>}</td>
                  <td><Status p={p} /></td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {p.checked_in && (
                        <Button variant={p.password_sent_at ? 'muted' : 'default'} size="sm" disabled={!d.smtp_configured || busy !== null}
                          onClick={() => run(`send${p.id}`, '/api/admin/passwords/send', { id: p.id }, () => `Password emailed to ${p.name}.`)}>
                          <Mail />{busy === `send${p.id}` ? 'Sending…' : p.password_sent_at ? 'Resend' : 'Send'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  )
}
