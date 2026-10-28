import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, one } from '@/lib/db'
import { demoCsv } from '@/lib/demo'
import { resetDb } from '../helpers/db'

const cli = (...args: string[]) => {
  const r = spawnSync('npx', ['tsx', 'src/scripts/cli.ts', ...args], { env: process.env, encoding: 'utf8', timeout: 60_000 })
  return { code: r.status, out: r.stdout + r.stderr }
}
const dir = mkdtempSync(path.join(tmpdir(), 'ctf-cli-'))
const file = (name: string, body: string | Uint8Array) => { const p = path.join(dir, name); writeFileSync(p, body); return p }
const status = async () => (await one<{ s: string }>('SELECT allocation_status AS s FROM event_state'))!.s
const people = async () => (await one<{ n: number }>('SELECT count(*)::int AS n FROM participants'))!.n

beforeEach(resetDb)
afterAll(closePool)

describe('operations CLI', () => {
  it('import-csv --dry-run previews without importing; import-csv imports', async () => {
    const f = file('demo.csv', demoCsv())
    const dry = cli('import-csv', f, '--dry-run')
    expect(dry.code).toBe(0)
    expect(dry.out).toContain('"participants": 171')
    expect(await people()).toBe(0)
    expect(cli('import-csv', f).out).toContain('Imported.')
    expect(await people()).toBe(171)
  })
  it('import-csv refuses a file with errors', async () => {
    const r = cli('import-csv', file('bad.csv', 'Team,Full Name,Email\nA,,a@x.io\n'))
    expect(r.code).toBe(1)
    expect(r.out).toContain('missing name')
    expect(await people()).toBe(0)
  })
  it('allocate then confirm, and confirm is final', async () => {
    cli('import-csv', file('demo.csv', demoCsv()))
    const a = cli('allocate')
    expect(a.code).toBe(0)
    expect(a.out).toContain('ISE SEMINAR HALL: 113/113  3p:37 2p:1 1p:0 no-team:0')
    expect(a.out).toContain('status: DRAFT')
    expect(cli('confirm').out).toContain('status: CONFIRMED')
    const again = cli('allocate')
    expect([again.code, again.out]).toEqual([1, expect.stringContaining('already confirmed')])
    expect(await status()).toBe('CONFIRMED')
  })
  it('allocate explains an impossible allocation', async () => {
    cli('import-csv', file('many.csv', 'Team,Full Name,Email\n' + Array.from({ length: 150 }, (_, i) => `,N${i},n${i}@x.io`).join('\n')))
    const r = cli('allocate')
    expect(r.code).toBe(1)
    expect(r.out).toContain('ALLOCATION NOT POSSIBLE')
  })
  it('seed-demo loads demo data but refuses to overwrite without --force', async () => {
    expect(cli('seed-demo').out).toContain('DEMO data loaded (171 participants)')
    const again = cli('seed-demo')
    expect(again.code).toBe(1)
    expect(again.out).toContain('Refusing')
    expect(cli('seed-demo', '--force').code).toBe(0)
    expect(await one("SELECT count(*)::int AS n FROM participants WHERE email NOT LIKE '%@example.invalid'")).toEqual({ n: 0 })
  })
})
