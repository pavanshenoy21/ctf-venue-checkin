import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions): Promise<Buffer> =>
  new Promise((res, rej) => scryptCb(pw, salt, len, opts, (e, k) => (e ? rej(e) : res(k))))

// Same format as the Python version: scrypt$N$r$p$<salt hex>$<key hex>, so hashes are interchangeable.
const N = 2 ** 14, R = 8, P = 1, KEYLEN = 32
const MAXMEM = 64 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const dk = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${dk.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltHex, dkHex] = parts as [string, string, string, string, string, string]
  const [nn, rr, pp] = [Number(n), Number(r), Number(p)]
  // refuse absurd cost parameters from a tampered row instead of burning CPU/memory
  if (![nn, rr, pp].every(Number.isInteger) || nn < 2 || nn > 2 ** 20 || rr < 1 || rr > 32 || pp < 1 || pp > 16) return false
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(dkHex)) return false
  try {
    const calc = await scrypt(password, Buffer.from(saltHex, 'hex'), KEYLEN, { N: nn, r: rr, p: pp, maxmem: MAXMEM })
    return timingSafeEqual(calc, Buffer.from(dkHex, 'hex'))
  } catch {
    return false
  }
}

let dummy: string | undefined
// Used for unknown usernames so a login takes the same time whether or not the account exists.
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= await hashPassword('dummy-password-for-timing')
  await verifyPassword(password, dummy)
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/

// 24 bytes from the OS CSPRNG = 192 bits, rendered as 32 URL-safe characters.
export const newQrToken = (): string => randomBytes(24).toString('base64url')
export const newSessionToken = (): string => randomBytes(32).toString('base64url')
export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')

/**
 * Accepts what a scanner reads: either a bare token or a full ".../checkin/<token>" URL (any host,
 * optional trailing slash, query or fragment). Returns '' for anything else.
 */
export function extractToken(raw: string): string {
  const s = (raw ?? '').trim()
  if (s.length > 600) return ''
  const m = /\/checkin\/([A-Za-z0-9_-]{32,64})\/?(?:[?#].*)?$/.exec(s)
  const tok = m ? m[1]! : s
  return TOKEN_RE.test(tok) ? tok : ''
}
