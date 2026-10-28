import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { simpleParser } from 'mailparser'
import { SMTPServer } from 'smtp-server'
import { MAILBOX, SMTP_PORT } from '../../playwright.config'

// Local SMTP server for the whole run. Every message it receives is saved as JSON in MAILBOX, so specs
// (which run in a different process) can read what the app actually sent.
export default async function globalSetup(): Promise<() => Promise<void>> {
  rmSync(MAILBOX, { recursive: true, force: true })
  mkdirSync(MAILBOX, { recursive: true })
  let n = 0
  const server = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onData(stream, _session, cb) {
      simpleParser(stream, { keepCidLinks: true }).then((m) => {
        const to = m.to && 'text' in m.to ? m.to.text : ''
        writeFileSync(path.join(MAILBOX, `${String(++n).padStart(5, '0')}.json`), JSON.stringify({
          to, subject: m.subject, text: m.text, html: m.html,
          attachments: m.attachments.map((a) => ({ cid: a.cid, contentType: a.contentType, filename: a.filename, base64: a.content.toString('base64') })),
        }))
        cb()
      }, cb)
    },
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(SMTP_PORT, '127.0.0.1', () => resolve()) })
  return () => new Promise<void>((r) => server.close(() => r()))
}
