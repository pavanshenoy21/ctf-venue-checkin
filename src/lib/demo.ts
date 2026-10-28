// DEMO data only. Emails use the reserved .invalid TLD so nothing real can ever be mailed.
import { parseCsv } from './csv-import'
import { one } from './db'
import { commitImport } from './import-service'

export function demoCsv(): Uint8Array {
  const lines = ['Team,Team Size,Member #,Full Name,Email,Phone,SAP ID / Admission No.,Year,Branch,Registered At']
  let n = 0
  const add = (team: string, size: number, k: number) => { n++; lines.push(`${team},${size},${k},Demo Person ${n},demo${n}@example.invalid,,,,,`) }
  for (let i = 0; i < 45; i++) for (const k of [1, 2, 3]) add(`Demo Trio ${String(i).padStart(2, '0')}`, 3, k) // more trios than ISE holds
  for (let i = 0; i < 10; i++) for (const k of [1, 2]) add(`Demo Duo ${String(i).padStart(2, '0')}`, 2, k)
  for (let i = 0; i < 6; i++) add(`Demo Solo ${String(i).padStart(2, '0')}`, 1, 1)
  for (let i = 0; i < 10; i++) add('(No team)', 10, i + 1)
  return new TextEncoder().encode(lines.join('\n'))
}

export async function seedDemo(force = false): Promise<number> {
  const existing = (await one<{ n: number }>('SELECT count(*)::int AS n FROM participants'))!.n
  if (existing && !force) throw new Error('Database already has participants. Refusing (use --force to REPLACE them).')
  return (await commitImport(parseCsv(demoCsv()))).participants
}
