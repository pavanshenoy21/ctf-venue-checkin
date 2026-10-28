import { upsertAdmin } from '@/lib/admins'

export const PW = 'correct-horse-battery'

type Handler = (req: Request, ctx: never) => Promise<Response>
export interface Opts { body?: unknown; cookie?: string; headers?: Record<string, string>; csrf?: boolean; params?: Record<string, string> }

export function makeReq(method: string, path: string, o: Opts = {}): Request {
  const headers: Record<string, string> = { ...(o.csrf === false ? {} : { 'x-requested-with': 'ctf-app' }), ...o.headers }
  let body: string | FormData | undefined
  if (o.body instanceof FormData) body = o.body // fetch sets the multipart boundary itself
  else if (o.body !== undefined) { body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body); headers['content-type'] ??= 'application/json' }
  if (o.cookie) headers.cookie = o.cookie
  return new Request(`http://localhost${path}`, { method, headers, body })
}

export async function call(handler: Handler, method: string, path: string, o: Opts = {}) {
  const res = await handler(makeReq(method, path, o), { params: Promise.resolve(o.params ?? {}) } as never)
  const type = res.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await res.json() : type.startsWith('text/') ? await res.text() : Buffer.from(await res.arrayBuffer())
  return { status: res.status, headers: res.headers, body: body as any } // eslint-disable-line @typescript-eslint/no-explicit-any
}

// "ctf_session=<token>" from a Set-Cookie header, ready to send back as a Cookie header.
export const cookieOf = (h: Headers): string => (h.get('set-cookie') ?? '').split(';')[0]!

export async function seedAdmins(): Promise<void> {
  await upsertAdmin({ username: 'root', role: 'SUPER_ADMIN', venue: null, password: PW })
  await upsertAdmin({ username: 'dth', role: 'VENUE_OPERATOR', venue: 'DTH', password: PW })
  await upsertAdmin({ username: 'ise', role: 'VENUE_OPERATOR', venue: 'ISE', password: PW })
}

export async function login(username: string, headers: Record<string, string> = {}): Promise<string> {
  const { POST } = await import('@/app/api/auth/login/route')
  const r = await call(POST, 'POST', '/api/auth/login', { body: { username, password: PW }, headers })
  if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status}`)
  return cookieOf(r.headers)
}

export function csvForm(csv: string | Uint8Array, name = 'participants.csv'): FormData {
  const f = new FormData()
  f.append('file', new File([typeof csv === 'string' ? csv : new Uint8Array(csv)], name, { type: 'text/csv' }))
  return f
}
