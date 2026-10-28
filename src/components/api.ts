'use client'

export interface ApiResult<T = any> { ok: boolean; status: number; data: T } // eslint-disable-line @typescript-eslint/no-explicit-any

// Same-origin JSON calls. The CSRF header is required by the server on every state-changing request.
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<ApiResult<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const init: RequestInit = { method: opts.method ?? 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'ctf-app' }, cache: 'no-store' }
  if (opts.form) init.body = opts.form
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  let res: Response
  try { res = await fetch(path, init) } catch { return { ok: false, status: 0, data: null as T } }
  let data: T = null as T
  try { data = await res.json() } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, data }
}

// Readable error text, including the backend's validation detail lists.
export function errorText(r: ApiResult): string {
  if (r.status === 0) return 'Cannot reach the server. Check the connection and try again.'
  if (r.status === 401) return 'Your session has ended. Sign in again.'
  const d = r.data as { error?: string; detail?: unknown } | null
  const lines = [d?.error ?? `Request failed (${r.status}).`]
  if (Array.isArray(d?.detail)) for (const x of d.detail) lines.push(typeof x === 'string' ? x : `${x.name}: ${x.size} participants`)
  return lines.join('\n')
}

export const fmtTime = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
export const fmtDateTime = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''

export type Venue = 'DTH' | 'ISE'
export const VENUE: Record<Venue, string> = { DTH: 'DTH', ISE: 'ISE Seminar Hall' }
export const VENUE_CAPS: Record<Venue, string> = { DTH: 'DTH', ISE: 'ISE SEMINAR HALL' }
