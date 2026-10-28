/**
 * Operations CLI:  npm run cli -- <command> [options]
 *
 *   create-admin --username root --role SUPER_ADMIN [--password-env VAR]
 *   create-admin --username dth  --role VENUE_OPERATOR --venue DTH [--password-env VAR]
 *   import-csv <file> [--dry-run]     preview (and import) a registration CSV
 *   allocate                           assign venues (draft)
 *   confirm                            make the allocation final
 *   seed-demo [--force]                load DEMO data (example.invalid emails)
 *
 * Without --password-env the password is read from the terminal (hidden) or from stdin.
 */
import { readFile } from 'node:fs/promises'
import { ZodError } from 'zod'
import { upsertAdmin } from '../lib/admins'
import { confirmAllocation, generateAllocation } from '../lib/allocation-service'
import { parseCsv } from '../lib/csv-import'
import { seedDemo } from '../lib/demo'
import { HttpError } from '../lib/http'
import { commitImport } from '../lib/import-service'
import { closePool } from '../lib/db'
import { migrateWithRetry } from '../lib/migrate'

const FLAGS = new Set(['dry-run', 'force'])

function args(argv: string[]): { cmd: string; opts: Record<string, string>; pos: string[] } {
  const [cmd = '', ...rest] = argv
  const opts: Record<string, string> = {}
  const pos: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i]!
    if (!k.startsWith('--')) { pos.push(k); continue }
    if (FLAGS.has(k.slice(2))) { opts[k.slice(2)] = 'true'; continue }
    const v = rest[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`missing value for ${k}`)
    opts[k.slice(2)] = v
    i++
  }
  return { cmd, opts, pos }
}

async function readPassword(): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    let data = ''
    for await (const chunk of stdin) data += chunk
    return data.replace(/\r?\n$/, '')
  }
  process.stdout.write('Password: ')
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let pw = ''
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { done(); return resolve(pw) }
        if (c === '\u0003') { done(); return reject(new Error('cancelled')) }
        if (c === '\u007f' || c === '\b') pw = pw.slice(0, -1)
        else pw += c
      }
    }
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n') }
    stdin.on('data', onData)
  })
}

async function main(): Promise<number> {
  const { cmd, opts, pos } = args(process.argv.slice(2))
  await migrateWithRetry(10, 1000)
  if (cmd === 'create-admin') {
    const password = opts['password-env'] ? process.env[opts['password-env']] ?? '' : await readPassword()
    const res = await upsertAdmin({ username: opts.username ?? '', role: opts.role as never, venue: (opts.venue ?? null) as never, password })
    console.log(`${res.created ? 'Created' : 'Updated (old sessions signed out)'}: ${opts.role} '${opts.username}'${opts.venue ? ` ${opts.venue}` : ''}`)
    return 0
  }
  if (cmd === 'import-csv') {
    if (!pos[0]) throw new Error('usage: import-csv <file> [--dry-run]')
    const parsed = parseCsv(await readFile(pos[0]))
    console.log(JSON.stringify({ summary: parsed.summary, warnings: parsed.warnings, errors: parsed.errors }, null, 2))
    if (parsed.errors.length) return 1
    if (!opts['dry-run']) { await commitImport(parsed); console.log('Imported.') }
    return 0
  }
  if (cmd === 'allocate' || cmd === 'confirm') {
    try {
      const rep = cmd === 'allocate' ? await generateAllocation() : await confirmAllocation()
      for (const v of Object.values(rep.venues))
        console.log(`${v.label}: ${v.participants}/${v.capacity}  3p:${v.teams_3} 2p:${v.teams_2} 1p:${v.teams_1} no-team:${v.no_team}`)
      console.log(`status: ${rep.status}`)
      return 0
    } catch (e) {
      if (!(e instanceof HttpError)) throw e
      console.error(e.message)
      if (Array.isArray(e.detail)) for (const d of e.detail) console.error(`  ${typeof d === 'string' ? d : `${d.name}: ${d.size} participants`}`)
      return 1
    }
  }
  if (cmd === 'seed-demo') {
    const n = await seedDemo(Boolean(opts.force))
    console.log(`DEMO data loaded (${n} participants). Do not use this database for the real event.`)
    return 0
  }
  console.error('usage: npm run cli -- create-admin | import-csv | allocate | confirm | seed-demo   (see src/scripts/cli.ts)')
  return 2
}

main()
  .then((code) => { process.exitCode = code })
  .catch((e) => {
    if (e instanceof ZodError) console.error('Invalid input:\n' + e.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
    else console.error((e as Error).message)
    process.exitCode = 1
  })
  .finally(closePool)
