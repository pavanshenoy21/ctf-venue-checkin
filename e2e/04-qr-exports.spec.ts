import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { expect, signIn, test } from './support/fixtures'
import { q, resetTo } from './support/db'

const decode = (png: Buffer) => { const i = PNG.sync.read(png); return jsQR(new Uint8ClampedArray(i.data), i.width, i.height)?.data }

test.describe.configure({ mode: 'serial' })

test('QR codes and exports wait for confirmed venues', async ({ page }) => {
  await resetTo('imported')
  await signIn(page, 'root')
  await page.goto('/admin/qr-codes')
  await expect(page.getByText('Confirm venues first')).toBeVisible()
  await expect(page.getByRole('link', { name: /Generate all QR codes/ })).toHaveCount(0)
  await page.goto('/admin/emails')
  await expect(page.getByText('Confirm venues first')).toBeVisible()
})

test('preview a participant QR and download it', async ({ page }) => {
  await resetTo('confirmed')
  await signIn(page, 'root')
  await page.goto('/admin/qr-codes')
  await page.getByLabel('Find a participant').fill('Demo Person 165')
  await page.getByRole('button', { name: 'Demo Person 165' }).click()
  const img = page.getByRole('img', { name: 'QR code for Demo Person 165' })
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(200) // waits for the load
  const dl = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download PNG' }).click()
  const d = await dl
  expect(d.suggestedFilename()).toBe('Demo_Person_165_NoTeam_DTH.png')
  const [p] = await q<{ qr_token: string }>("SELECT qr_token FROM participants WHERE name = 'Demo Person 165'")
  expect(decode(readFileSync(await d.path()))).toBe(`http://localhost:3200/checkin/${p!.qr_token}`)
})

test('download every QR code as a ZIP', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/qr-codes')
  const dl = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Generate all QR codes (ZIP)' }).click()
  const d = await dl
  expect(d.suggestedFilename()).toBe('qr_codes.zip')
  const zip = await JSZip.loadAsync(readFileSync(await d.path()))
  const names = Object.keys(zip.files)
  expect(names).toHaveLength(171)
  expect(names.filter((n) => n.endsWith('_ISE.png'))).toHaveLength(113)
  expect(decode(await zip.file(names[0]!)!.async('nodebuffer'))).toMatch(/^http:\/\/localhost:3200\/checkin\/[A-Za-z0-9_-]{32}$/)
})

test('export check-ins and the full participant list as CSV', async ({ page }) => {
  await q("INSERT INTO check_ins (participant_id, venue) SELECT id, assigned_venue FROM participants ORDER BY id LIMIT 3")
  await signIn(page, 'root')
  await page.goto('/admin/checkins')
  for (const [link, file, rows, header] of [
    ['Export check-ins', 'checkins.csv', 4, 'Name,Email,Team,Venue,Check-in time'],
    ['Export full participant list', 'allocation.csv', 172, 'Name,Email,Team,Venue,QR URL,Check-in status,Check-in time'],
  ] as const) {
    const dl = page.waitForEvent('download')
    await page.getByRole('link', { name: link }).click()
    const d = await dl
    expect(d.suggestedFilename()).toBe(file)
    const lines = readFileSync(await d.path(), 'utf8').trim().split('\r\n')
    expect(lines[0]).toBe(header)
    expect(lines).toHaveLength(rows)
  }
})
