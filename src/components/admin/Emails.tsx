'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, errorText } from '../api'
import { Bar, Notice, PageHeader, usePoll } from '../ui'
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
    if (err?.status === 409) return (<><PageHeader title="Emails" /><Notice tone="warn" title="Confirm venues first">Emails include each person&apos;s venue, so they are prepared after the allocation is final. <Link className="underline" href="/admin/import">Go to Setup</Link></Notice></>)
    return err ? <Notice title="Could not load emails">{errorText(err)}</Notice> : <p className="text-mist">Loading emails…</p>
  }
  const unsent = d.total - d.sent
  return (
    <>
      <PageHeader title="Emails" actions={<a className="btn-quiet" href="/api/admin/emails/export.csv">Export for mail merge (CSV)</a>}>
        Each participant gets their own venue, team and QR code. Nobody&apos;s email mentions anyone else.
      </PageHeader>

      <section className="panel mb-6 p-5" aria-label="Delivery">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">Delivery</h2>
          <p className="num text-mist">{d.sent} of {d.total} sent{d.failed > 0 && <span className="text-bad">, {d.failed} failed</span>}</p>
        </div>
        <div className="mt-3"><Bar value={d.sent} max={d.total} color="#86B86F" label="Emails sent" /></div>
        {d.smtp_configured ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <input className="field min-w-[16rem] flex-1" type="email" aria-label="Test email address" placeholder="Participant email to send a test to" value={test} onChange={(e) => setTest(e.target.value)} />
            <button className="btn-quiet" disabled={!test.trim()} onClick={() => send({ only_email: test.trim(), resend: true })}>Send test</button>
            <button className="btn-primary" disabled={unsent === 0} onClick={() => send({}, `Send emails to ${unsent} participants who haven't received one?`)}>
              {unsent === 0 ? 'Everyone has been sent' : `Send to ${unsent} unsent`}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-mist">Direct sending is off because no mail server is set. Add the SMTP settings to <code>.env</code> and restart the app, or use the mail-merge export.</p>
        )}
        {d.failed > 0 && <p className="mt-3 text-sm text-mist">Failed emails are retried the next time you send to unsent participants.</p>}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl">Preview</h2>
        <div className="num flex items-center gap-2 text-sm text-mist">
          {d.total ? off + 1 : 0}–{Math.min(off + PAGE, d.total)} of {d.total}
          <button className="btn-quiet px-3 py-1" disabled={off === 0} onClick={() => setOff(Math.max(0, off - PAGE))}>Previous</button>
          <button className="btn-quiet px-3 py-1" disabled={off + PAGE >= d.total} onClick={() => setOff(off + PAGE)}>Next</button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {d.items.map((m) => (
          <article key={m.id} className="panel overflow-hidden">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sea-700 px-4 py-2 text-sm">
              <span className="truncate text-mist">To {m.to}</span>
              {m.sent_at ? <span className="text-ok">Sent</span> : m.error ? <span className="text-bad" title={m.error}>Failed</span> : <span className="text-mist">Not sent</span>}
            </header>
            {/* Server-rendered HTML: every participant-supplied value in it is HTML-escaped (see src/lib/email.ts). */}
            <div className="bg-white p-4 text-black" dangerouslySetInnerHTML={{ __html: m.html }} />
          </article>
        ))}
      </div>
    </>
  )
}
