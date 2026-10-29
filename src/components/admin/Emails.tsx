'use client'

import { ChevronLeft, ChevronRight, Download, Send, TestTube2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { api, errorText } from '../api'
import { Bar, Loading, Notice, PageHeader, Section, usePoll } from '../kit'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import type { Emails as EmailsData } from './types'

const PAGE = 10

export default function Emails() {
  const [off, setOff] = useState(0)
  const [d, err, reload] = usePoll<EmailsData>(() => api(`/api/admin/emails?offset=${off}&limit=${PAGE}`), 6000, [off])
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [test, setTest] = useState('')
  const send = async (body: object, ask?: string) => {
    if (ask && !confirm(ask)) return
    const r = await api<{ queued: number }>('/api/admin/emails/send', { method: 'POST', body })
    setMsg(r.ok ? { tone: 'ok', text: `Sending ${r.data.queued} email${r.data.queued === 1 ? '' : 's'}. Progress updates below.` } : { tone: 'bad', text: errorText(r) })
    void reload()
  }
  if (!d) {
    if (err?.status === 409) return (<><PageHeader eyebrow="Mail" title="Emails" /><Notice tone="warn" title="Confirm venues first">Emails include each person&apos;s venue, so they are prepared after the allocation is final. <Link className="underline" href="/admin/import">Go to Setup</Link></Notice></>)
    return err ? <Notice title="Could not load emails">{errorText(err)}</Notice> : <Loading>Loading emails…</Loading>
  }
  const unsent = d.total - d.sent
  return (
    <>
      <PageHeader eyebrow="Mail" title="Emails" actions={<Button asChild variant="muted"><a href="/api/admin/emails/export.csv"><Download />Mail-merge CSV</a></Button>}>
        Team members get their venue, team and QR code. People without a team get the rules instead, and their QR from the <Link className="text-gold-light hover:underline" href="/admin/walk-ins">Walk-ins</Link> page once they report at DTH. Nobody&apos;s email mentions anyone else.
      </PageHeader>

      <Section className="mb-8" eyebrow="Delivery" title={<span className="num">{d.sent} <span className="text-muted-foreground">of {d.total} sent</span></span>}
        aria-label="Delivery" aside={d.failed > 0 ? <Badge variant="bad">{d.failed} failed</Badge> : d.sent === d.total && d.total > 0 ? <Badge variant="ok">All sent</Badge> : undefined}>
        <div className="px-5 pb-6 pt-4 sm:px-6">
          <Bar value={d.sent} max={d.total} color="#5fd08a" height="h-2.5" label="Emails sent" />
          {d.smtp_configured ? (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Input className="min-w-[16rem] flex-1" type="email" aria-label="Test email address" placeholder="Participant email to send a test to" value={test} onChange={(e) => setTest(e.target.value)} />
              <Button variant="muted" disabled={!test.trim()} onClick={() => send({ only_email: test.trim(), resend: true })}><TestTube2 />Send test</Button>
              <Button variant="solid" disabled={unsent === 0} onClick={() => send({}, `Send emails to ${unsent} participants who haven't received one?`)}>
                <Send />{unsent === 0 ? 'Everyone sent' : `Send to ${unsent} unsent`}
              </Button>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">Direct sending is off because no mail server is set. Add the SMTP settings to <code className="font-mono text-gold-light">.env</code> and restart the app, or use the mail-merge export.</p>
          )}
          {d.smtp_configured && <p className="mt-4 text-sm text-muted-foreground">{d.smtp_backups > 0
            ? `${d.smtp_backups} backup mail ${d.smtp_backups === 1 ? 'account' : 'accounts'} set: if the main account hits its sending limit or goes down, sending carries on from the backup.`
            : 'No backup mail account set. Add SMTP2_* settings to .env so sending carries on if the main account hits its daily limit.'}</p>}
          {d.failed > 0 && <p className="mt-4 text-sm text-muted-foreground">Failed emails are retried the next time you send to unsent participants.</p>}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </div>
      </Section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow mb-1 text-muted-foreground">Preview</p>
          <h2 className="font-display text-xl font-bold">Each person&apos;s email</h2>
        </div>
        <div className="num flex items-center gap-2 font-mono text-xs text-muted-foreground">
          {d.total ? off + 1 : 0}–{Math.min(off + PAGE, d.total)} of {d.total}
          <Button variant="outline" size="icon-sm" aria-label="Previous" disabled={off === 0} onClick={() => setOff(Math.max(0, off - PAGE))}><ChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" disabled={off + PAGE >= d.total} onClick={() => setOff(off + PAGE)}><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {d.items.map((m) => (
          <Card key={m.id} className="gap-0 overflow-hidden py-0">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-sm">
              <span className="truncate font-mono text-xs text-muted-foreground">To {m.to}</span>
              {m.sent_at ? <Badge variant="ok">Sent</Badge> : m.error ? <Badge variant="bad" title={m.error}>Failed</Badge> : <Badge variant="muted">Not sent</Badge>}
            </header>
            {/* Server-rendered HTML: every participant-supplied value in it is HTML-escaped (see src/lib/email.ts). */}
            <div className="bg-black" dangerouslySetInnerHTML={{ __html: m.html }} />
          </Card>
        ))}
      </div>
    </>
  )
}
