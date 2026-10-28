import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closePool } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'

// Every route.ts under src/app/api/admin, found on disk, so a newly added route can't slip past this test.
const ROOT = path.resolve(import.meta.dirname, '../../src/app/api/admin')
const routeFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f)
  return statSync(p).isDirectory() ? routeFiles(p) : f === 'route.ts' ? [p] : []
})
const urlOf = (file: string) => '/api/admin/' + path.relative(ROOT, path.dirname(file)).replace('[file]', '1.png')

let cookies: Record<string, string> = {}
beforeAll(async () => {
  await resetDb(); resetRateLimits(); await seedAdmins()
  cookies = { dth: await login('dth'), ise: await login('ise'), root: await login('root') }
})
afterAll(closePool)

describe('every admin route is super-admin only', async () => {
  const files = routeFiles(ROOT)
  it('finds the admin routes', () => expect(files.length).toBeGreaterThanOrEqual(18))
  for (const file of files) {
    const mod = await import(file)
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => typeof mod[m] === 'function')) {
      it(`${method} ${urlOf(file)}`, async () => {
        const hit = (cookie?: string) => call(mod[method], method, urlOf(file), { cookie, params: { file: '1.png' } }).then((r) => r.status)
        expect(await hit()).toBe(401)
        expect(await hit(cookies.dth)).toBe(403)
        expect(await hit(cookies.ise)).toBe(403)
        expect(await hit(cookies.root)).not.toBe(401)
        expect(await hit(cookies.root)).not.toBe(403)
      })
    }
  }
})
