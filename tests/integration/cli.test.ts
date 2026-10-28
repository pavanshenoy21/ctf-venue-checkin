import { spawnSync } from 'node:child_process'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, one, q } from '@/lib/db'
import { verifyPassword } from '@/lib/security'
import { resetDb } from '../helpers/db'
import { login, PW } from '../helpers/http'

const cli = (args: string[], env: Record<string, string> = {}, input?: string) => {
  const r = spawnSync('npx', ['tsx', 'src/scripts/cli.ts', ...args], { env: { ...process.env, ...env }, input, encoding: 'utf8', timeout: 60_000 })
  return { code: r.status, out: r.stdout + r.stderr }
}

beforeEach(resetDb)
afterAll(closePool)

describe('create-admin command', () => {
  it('creates each kind of account with a hashed password from an env var', async () => {
    expect(cli(['create-admin', '--username', 'root', '--role', 'SUPER_ADMIN', '--password-env', 'PW'], { PW }).code).toBe(0)
    const r = cli(['create-admin', '--username', 'dth', '--role', 'VENUE_OPERATOR', '--venue', 'DTH', '--password-env', 'PW'], { PW })
    expect(r.code).toBe(0)
    expect(r.out).toContain("Created: VENUE_OPERATOR 'dth' DTH")
    expect(r.out).not.toContain(PW)
    const row = await one<{ role: string; venue: string; password_hash: string }>("SELECT role, venue, password_hash FROM admins WHERE username = 'dth'")
    expect(row).toMatchObject({ role: 'VENUE_OPERATOR', venue: 'DTH' })
    expect(await verifyPassword(PW, row!.password_hash)).toBe(true)
  })
  it('reads the password from stdin when no env var is given', async () => {
    expect(cli(['create-admin', '--username', 'ise', '--role', 'VENUE_OPERATOR', '--venue', 'ISE'], {}, `${PW}\n`).code).toBe(0)
    const row = await one<{ password_hash: string }>("SELECT password_hash FROM admins WHERE username = 'ise'")
    expect(await verifyPassword(PW, row!.password_hash)).toBe(true)
  })
  it('refuses bad input', async () => {
    const bad = [
      [['--username', 'op', '--role', 'VENUE_OPERATOR'], /venue/],
      [['--username', 'root', '--role', 'SUPER_ADMIN', '--venue', 'DTH'], /venue/],
      [['--username', 'x', '--role', 'GOD'], /role/],
      [['--username', 'bad name', '--role', 'SUPER_ADMIN'], /username/],
    ] as const
    for (const [args, msg] of bad) {
      const r = cli(['create-admin', ...args, '--password-env', 'PW'], { PW })
      expect(r.code).toBe(1)
      expect(r.out).toMatch(msg)
    }
    const short = cli(['create-admin', '--username', 'root', '--role', 'SUPER_ADMIN', '--password-env', 'PW'], { PW: 'short' })
    expect(short.out).toMatch(/at least 10 characters/)
    expect(await one('SELECT count(*)::int AS n FROM admins')).toEqual({ n: 0 })
  })
  it('re-running for an existing user changes the password and signs them out', async () => {
    cli(['create-admin', '--username', 'dth', '--role', 'VENUE_OPERATOR', '--venue', 'DTH', '--password-env', 'PW'], { PW })
    await login('dth')
    expect(await one('SELECT count(*)::int AS n FROM sessions')).toEqual({ n: 1 })
    const r = cli(['create-admin', '--username', 'dth', '--role', 'VENUE_OPERATOR', '--venue', 'DTH', '--password-env', 'PW'], { PW: 'another-long-password' })
    expect(r.out).toContain('Updated (old sessions signed out)')
    expect(await q('SELECT * FROM sessions')).toEqual([])
  })
  it('prints usage for an unknown command', () => {
    const r = cli(['frobnicate'])
    expect(r.code).toBe(2)
    expect(r.out).toMatch(/usage/)
  })
})
