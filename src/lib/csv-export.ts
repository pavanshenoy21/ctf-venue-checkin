import { config } from './config'

type Cell = string | number | boolean | null | undefined | Date

// Spreadsheet formula injection guard: a cell starting with = + - @ tab or CR is prefixed with '.
export function csvCell(v: Cell): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? fmtDateTime(v) : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// Event-local wall time, e.g. "2026-10-29 10:42:31".
export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return ''
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: config.eventTz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}
