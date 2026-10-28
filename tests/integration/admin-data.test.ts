import JSZip from 'jszip'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as checkinsGET } from '@/app/api/admin/checkins/route'
import { GET as exportAllocGET } from '@/app/api/admin/export/allocation.csv/route'
import { GET as exportCheckinsGET } from '@/app/api/admin/export/checkins.csv/route'
import { GET as participantsGET } from '@/app/api/admin/participants/route'
import { GET as qrOneGET } from '@/app/api/admin/qr/[file]/route'
import { GET as qrZipGET } from '@/app/api/admin/qr/all.zip/route'
import { GET as qrCsvGET } from '@/app/api/admin/qr/export.csv/route'
import { GET as qrListGET } from '@/app/api/admin/qr/route'
import { GET as statsGET } from '@/app/api/admin/stats/route'
import { GET as teamsGET } from '@/app/api/admin/teams/route'
import { closePool, q } from '@/lib/db'
import { resetRateLimits } from '@/lib/ratelimit'
import { resetDb } from '../helpers/db'
import { call, login, seedAdmins } from '../helpers/http'
import { checkIn, confirmedDemo, importDemo, participant } from '../helpers/world'

let root = ''
beforeEach(async () => { await resetDb(); resetRateLimits(); await seedAdmins(); root = await login('root') })
afterAll(closePool)
const get = (h: (r: Request, c: never) => Promise<Response>, path: string, params: Record<string, string> = {}) => call(h, 'GET', path, { cookie: root, params })
const decode = (png: Buffer) => { const i = PNG.sync.read(png); return jsQR(new Uint8ClampedArray(i.data), i.width, i.height)?.data }

describe('attendance stats', () => {
  it('break attendance down by team size, venue and team completeness', async () => {
    await confirmedDemo()
    const trio = await q<{ id: number }>("SELECT p.id FROM participants p JOIN teams t ON t.id = p.team_id WHERE t.name = 'Demo Trio 00' ORDER BY p.id")
    for (const p of trio) await checkIn(p.id)                                  // a full ISE trio
    await checkIn(trio.length ? (await participant("team_id = (SELECT id FROM teams WHERE name = 'Demo Trio 44')")).id : 0) // 1 of a DTH trio
    await checkIn((await participant('team_id IS NULL')).id)                   // one solo walk-in
    const s = (await get(statsGET, '/api/admin/stats')).body
    expect(s).toMatchObject({ status: 'CONFIRMED', total_participants: 171, total_teams: 61, checked_in: 5, not_checked_in: 166, capacity_total: 258 })
    const b = Object.fromEntries(s.breakdown.map((r: { key: string }) => [r.key, r]))
    expect(s.breakdown.map((r: { key: string }) => r.key)).toEqual(['3', '2', '1', 'none'])
    expect(b['3']).toMatchObject({ teams: 45, participants: 135, present: 4, teams_full: 1, teams_partial: 1, teams_absent: 43 })
    expect(b['3'].venues).toEqual({ DTH: { participants: 24, present: 1 }, ISE: { participants: 111, present: 3 } })
    expect(b.none).toMatchObject({ teams: null, participants: 10, present: 1 })
    expect(b.none.venues.ISE).toEqual({ participants: 0, present: 0 })
    expect(b.none.teams_full).toBeUndefined()
    expect(s.per_venue.ISE).toMatchObject({ assigned: 113, checked_in: 3, remaining: 110, percent: 2.7 })
    expect(s.recent).toHaveLength(5)
    expect(s.recent[0]).toMatchObject({ venue: 'DTH', team: null })
  })
  it('work on an empty event', async () => {
    const s = (await get(statsGET, '/api/admin/stats')).body
    expect(s).toMatchObject({ status: 'NONE', total_participants: 0, checked_in: 0, percent: 0, recent: [] })
  })
})

describe('teams list', () => {
  it('is sorted largest team first, with member presence and the no-team list', async () => {
    await confirmedDemo()
    await checkIn((await participant("team_id = (SELECT id FROM teams WHERE name = 'Demo Duo 03')")).id)
    const { teams, no_team } = (await get(teamsGET, '/api/admin/teams')).body
    const sizes = teams.map((t: { size: number }) => t.size)
    expect(sizes).toEqual([...sizes].sort((a: number, b: number) => b - a))
    expect(teams[0].name).toBe('Demo Trio 00')
    const duo = teams.find((t: { name: string }) => t.name === 'Demo Duo 03')
    expect(duo).toMatchObject({ size: 2, present: 1, venue: 'DTH' })
    expect(duo.members.map((m: { checked_in: boolean }) => m.checked_in)).toEqual([true, false])
    expect(no_team).toHaveLength(10)
    expect(no_team.every((p: { venue: string }) => p.venue === 'DTH')).toBe(true)
  })
})

describe('participant search', () => {
  const search = (params: string) => get(participantsGET, `/api/admin/participants?${params}`)
  beforeEach(importDemo)
  it('finds by name, email, team and id', async () => {
    expect((await search('q=Demo+Person+99')).body.total).toBe(1)     // no 990-999 in a 171-person event
    expect((await search('q=DEMO5%40example.invalid')).body.total).toBe(1)
    expect((await search('q=Demo+Trio+07')).body.total).toBe(3)
    const id = (await participant('true')).id
    expect((await search(`q=${id}`)).body.items.some((p: { id: number }) => p.id === id)).toBe(true)
  })
  it('treats % _ and \\ literally and survives SQL-looking input', async () => {
    for (const s of ['%25', '_', '%5C', "'%3B+DROP+TABLE+participants%3B--"]) {
      const r = await search(`q=${s}`)
      expect([r.status, r.body.total]).toEqual([200, 0])
    }
  })
  it('filters by venue and check-in status and pages results', async () => {
    const all = (await search('limit=1000')).body
    expect([all.total, all.items.length]).toEqual([171, 171])
    const page = (await search('limit=10&offset=170')).body
    expect(page.items).toHaveLength(1)
    expect((await search('checked=true')).body.total).toBe(0)
    expect(all.items[0]).toHaveProperty('team_size')
  })
  it('rejects bad paging and filters', async () => {
    for (const p of ['offset=-1', 'limit=0', 'limit=5000', 'venue=GYM', 'checked=maybe', `q=${'a'.repeat(101)}`]) expect((await search(p)).status).toBe(422)
  })
})

describe('check-ins and exports', () => {
  it('list check-ins newest first, filterable by venue', async () => {
    await confirmedDemo()
    const ise = await participant("assigned_venue = 'ISE'"), dth = await participant("assigned_venue = 'DTH'")
    await checkIn(ise.id); await checkIn(dth.id)
    const all = (await get(checkinsGET, '/api/admin/checkins')).body
    expect(all.map((c: { name: string }) => c.name)).toEqual([dth.name, ise.name])
    expect((await get(checkinsGET, '/api/admin/checkins?venue=ISE')).body).toHaveLength(1)
    const csv = (await get(exportCheckinsGET, '/api/admin/export/checkins.csv')).body as string
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Team,Venue,Check-in time')
    expect(csv).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  })
  it('export the full allocation only after confirmation, with formula cells neutralised', async () => {
    await importDemo()
    expect((await get(exportAllocGET, '/api/admin/export/allocation.csv')).status).toBe(409)
    await q("UPDATE participants SET name = '=HYPERLINK(\"x\")' WHERE id = (SELECT min(id) FROM participants)")
    const { generateAllocation, confirmAllocation } = await import('@/lib/allocation-service')
    await generateAllocation(); await confirmAllocation()
    const r = await get(exportAllocGET, '/api/admin/export/allocation.csv')
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="allocation.csv"')
    const lines = (r.body as string).trim().split('\r\n')
    expect(lines[0]).toBe('Name,Email,Team,Venue,QR URL,Check-in status,Check-in time')
    expect(lines).toHaveLength(172)
    expect(lines[1]).toMatch(/^"'=HYPERLINK/)
    expect(lines[1]).toContain('https://ctf.test/checkin/')
  })
})

describe('QR codes', () => {
  it('are only issued after confirmation', async () => {
    await importDemo()
    for (const [h, p] of [[qrListGET, '/api/admin/qr'], [qrZipGET, '/api/admin/qr/all.zip'], [qrCsvGET, '/api/admin/qr/export.csv']] as const)
      expect((await get(h, p)).status).toBe(409)
  })
  it('ZIP has one decodable PNG per participant with unique, venue-tagged names', async () => {
    await confirmedDemo()
    const r = await get(qrZipGET, '/api/admin/qr/all.zip')
    expect(r.headers.get('content-type')).toBe('application/zip')
    const zip = await JSZip.loadAsync(r.body as Buffer)
    const names = Object.keys(zip.files)
    expect(names).toHaveLength(171)
    expect(names.filter((n) => /_NoTeam_DTH\.png$/.test(n))).toHaveLength(10)
    expect(names.filter((n) => /_ISE\.png$/.test(n))).toHaveLength(113)
    const tokens = new Map((await q<{ name: string; qr_token: string }>('SELECT name, qr_token FROM participants')).map((p) => [p.name.replace(/ /g, '_'), p.qr_token]))
    for (const n of names.slice(0, 5)) {
      const url = decode(await zip.file(n)!.async('nodebuffer'))
      expect(url).toBe(`https://ctf.test/checkin/${tokens.get(n.split('_').slice(0, 3).join('_'))}`)
    }
  })
  it('list and CSV agree with the participants', async () => {
    await confirmedDemo()
    const list = (await get(qrListGET, '/api/admin/qr')).body
    expect(list).toHaveLength(171)
    expect(list[0]).toMatchObject({ file: 'Demo_Person_1_Demo_Trio_00_ISE.png' })
    const csv = (await get(qrCsvGET, '/api/admin/qr/export.csv')).body as string
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Team,Venue,QR URL,QR file')
  })
  it('single PNG by participant id; anything else is 404', async () => {
    await confirmedDemo()
    const p = await participant('true')
    const r = await get(qrOneGET, `/api/admin/qr/${p.id}.png`, { file: `${p.id}.png` })
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(decode(r.body as Buffer)).toBe(`https://ctf.test/checkin/${p.qr_token}`)
    for (const f of ['999999.png', 'abc.png', `${p.id}`, `${p.id}.jpg`, '../1.png', '1.png.png'])
      expect((await get(qrOneGET, `/api/admin/qr/${f}`, { file: f })).status).toBe(404)
  })
})
