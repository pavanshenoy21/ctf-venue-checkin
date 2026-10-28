import { describe, expect, it } from 'vitest'
import { extractToken, hashPassword, newQrToken, newSessionToken, sha256Hex, TOKEN_RE, verifyPassword } from '@/lib/security'

// Produced by the Python version's hash_password for "correct-horse-battery" (fixed salt).
const PYTHON_HASH = 'scrypt$16384$8$1$00112233445566778899aabbccddeeff$af0a1de7edb4abd51326fa23b423c6df23ed3c0d6af06e1fcc73cba836741e74'

describe('passwords', () => {
  it('verify the right password and reject wrong ones', async () => {
    const h = await hashPassword('correct-horse-battery')
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
    expect(await verifyPassword('correct-horse-battery', h)).toBe(true)
    expect(await verifyPassword('correct-horse-batterY', h)).toBe(false)
    expect(await verifyPassword('', h)).toBe(false)
  })
  it('use a fresh salt every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
  it('accept hashes created by the Python version', async () => {
    expect(await verifyPassword('correct-horse-battery', PYTHON_HASH)).toBe(true)
    expect(await verifyPassword('wrong', PYTHON_HASH)).toBe(false)
  })
  it('reject malformed or tampered hashes without throwing', async () => {
    for (const bad of ['', 'plain', 'bcrypt$x', 'scrypt$16384$8$1$zz$zz', PYTHON_HASH.replace('16384', '1073741824'),
      PYTHON_HASH.replace('$8$', '$999$'), PYTHON_HASH.slice(0, -2)]) {
      expect(await verifyPassword('correct-horse-battery', bad)).toBe(false)
    }
  })
})

describe('tokens', () => {
  it('QR tokens are 32 URL-safe characters (192 bits) and unique', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20000; i++) {
      const t = newQrToken()
      expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
      seen.add(t)
    }
    expect(seen.size).toBe(20000)
  })
  it('QR tokens look random, not sequential', () => {
    const chars = new Map<string, number>()
    for (let i = 0; i < 2000; i++) for (const c of newQrToken()) chars.set(c, (chars.get(c) ?? 0) + 1)
    expect(chars.size).toBe(64)                        // every base64url symbol appears
    const counts = [...chars.values()]
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(1.5)
  })
  it('session tokens are longer and hashed with SHA-256', () => {
    expect(newSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('extractToken', () => {
  const t = newQrToken()
  it('accepts a bare token', () => expect(extractToken(t)).toBe(t))
  it('accepts a full check-in URL, with or without slash, query or fragment', () => {
    for (const u of [`https://ctf.test/checkin/${t}`, `https://ctf.test/checkin/${t}/`, `http://x/checkin/${t}?a=1`, `https://x/checkin/${t}#top`, `  https://x/checkin/${t}  `])
      expect(extractToken(u)).toBe(t)
  })
  it('rejects short, oversized and malformed input', () => {
    for (const bad of ['', '   ', 'short', 'A'.repeat(31), 'A'.repeat(65), '../../etc/passwd', `${t}!`, `https://x/other/${t}x!`,
      `https://x/checkin/${t}/extra`, 'x'.repeat(601), "1' OR '1'='1", `<script>${t}`])
      expect(extractToken(bad)).toBe('')
  })
  it('TOKEN_RE matches the database CHECK constraint', () => {
    expect(TOKEN_RE.source).toBe('^[A-Za-z0-9_-]{32,64}$')
  })
})
