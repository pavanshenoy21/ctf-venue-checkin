import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer'
import { config } from './config'

// Mail servers in order: SMTP_* first, then backups SMTP2_* … SMTP5_* (same keys with the number). When a
// server refuses because it's out of quota, rate-limited, can't log in or can't be reached, sending moves to the
// next one and stays there; a refusal of one recipient's address is that address's problem and is not retried.

export interface SmtpServer { label: string; host: string; port: number; user: string; password: string; from: string; security: 'starttls' | 'ssl' | 'none' }

export function smtpServers(): SmtpServer[] {
  const out: SmtpServer[] = []
  const s = config.smtp
  if (s.host && s.from) out.push({ label: 'primary', host: s.host, port: s.port, user: s.user, password: s.password, from: s.from, security: s.security })
  for (let n = 2; n <= 5; n++) {
    const e = (k: string) => process.env[`SMTP${n}_${k}`] ?? ''
    if (!e('HOST') || !e('FROM')) continue
    out.push({ label: `backup ${n - 1}`, host: e('HOST'), port: Number.parseInt(e('PORT'), 10) || 587, user: e('USER'), password: e('PASSWORD'), from: e('FROM'), security: (e('SECURITY') || 'starttls') as SmtpServer['security'] })
  }
  return out
}

export const smtpConfigured = (): boolean => smtpServers().length > 0

const transportFor = (s: SmtpServer) => nodemailer.createTransport({
  host: s.host, port: s.port,
  secure: s.security === 'ssl', requireTLS: s.security === 'starttls', ignoreTLS: s.security === 'none',
  auth: s.user ? { user: s.user, pass: s.password } : undefined,
  // one reused connection, messages in order: fast, and gentle on provider rate limits
  pool: true, maxConnections: 1, maxMessages: 500,
  connectionTimeout: 15_000, socketTimeout: 30_000,
})

type SmtpError = Error & { code?: string; responseCode?: number; command?: string; response?: string }

// Is this the server's problem (move on to the next server) rather than this recipient's?
export function serverProblem(e: SmtpError): boolean {
  if (e.command === 'RCPT TO' || e.code === 'EENVELOPE' && /recipient/i.test(e.message)) return false
  if (['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(e.code ?? '')) return true
  if ([421, 450, 451, 452, 454].includes(e.responseCode ?? 0)) return true
  return /quota|limit|exceeded|rate|too many|try again later/i.test(`${e.message} ${e.response ?? ''}`)
}

// A server that ran out (e.g. Gmail's daily quota) is skipped by later sends for a while, not retried each time.
const resting = new Map<string, number>()
const REST_MS = 30 * 60_000
const keyOf = (s: SmtpServer) => `${s.host}|${s.user}|${s.from}`
export const resetSmtpRests = () => resting.clear()

export interface Sender { send(msg: Omit<SendMailOptions, 'from'>): Promise<{ via: string }>; close(): void }

export function createSender(): Sender {
  const servers = smtpServers()
  const transports = new Map<number, Transporter>()
  let active = 0
  return {
    async send(msg) {
      let last: SmtpError | null = null
      for (let i = active; i < servers.length; i++) {
        const s = servers[i]!
        if ((resting.get(keyOf(s)) ?? 0) > Date.now() && i < servers.length - 1) continue
        if (!transports.has(i)) transports.set(i, transportFor(s))
        try {
          await transports.get(i)!.sendMail({ ...msg, from: s.from })
          active = i
          return { via: s.label }
        } catch (e) {
          last = e as SmtpError
          if (!serverProblem(last)) throw last
          resting.set(keyOf(s), Date.now() + REST_MS)
          console.warn(`[smtp] ${s.label} failed (${last.code ?? last.responseCode ?? last.name}); trying the next server`)
        }
      }
      throw last ?? new Error('No mail server is configured.')
    },
    close() { for (const t of transports.values()) t.close() },
  }
}
