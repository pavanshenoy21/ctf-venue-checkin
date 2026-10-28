import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { acceptDialogs, expect, signIn, test } from './support/fixtures'
import { mailbox, person, resetTo } from './support/db'

const decode = (b64: string) => { const i = PNG.sync.read(Buffer.from(b64, 'base64')); return jsQR(new Uint8ClampedArray(i.data), i.width, i.height)?.data }

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { await resetTo('confirmed') })

test('preview shows each personalised email with its QR', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/emails')
  await expect(page.getByText('0 of 171 sent')).toBeVisible()
  const first = page.locator('article').first()
  await expect(first).toContainText('Hello Demo,')
  await expect(first).toContainText('ISE SEMINAR HALL')
  await expect.poll(() => first.getByRole('img', { name: 'QR code' }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(200)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('11–20 of 171')).toBeVisible()
})

test('a test email arrives with the QR attached inline', async ({ page }) => {
  const before = mailbox().length
  const p = await person("assigned_venue = 'DTH' AND team_id IS NULL")
  await signIn(page, 'root')
  await page.goto('/admin/emails')
  await page.getByLabel('Test email address').fill(p.email)
  await page.getByRole('button', { name: 'Send test' }).click()
  await expect(page.getByText('Sending 1 email.')).toBeVisible()
  await expect.poll(() => mailbox().length).toBe(before + 1)
  const m = mailbox().at(-1)!
  expect(m.to).toBe(p.email)
  expect(m.subject).toBe('CTF Venue & Check-in Details')
  expect(m.text).toContain('You are participating without a team.')
  expect(m.html).toContain(`cid:${m.attachments[0]!.cid}`)
  expect(decode(m.attachments[0]!.base64)).toBe(`http://localhost:3200/checkin/${p.qr_token}`)
})

test('send to everyone unsent; the page tracks progress to the end', async ({ page }) => {
  acceptDialogs(page)
  const before = mailbox().length
  await signIn(page, 'root')
  await page.goto('/admin/emails')
  await expect(page.getByText('1 of 171 sent')).toBeVisible()
  await page.getByRole('button', { name: 'Send to 170 unsent' }).click()
  await expect(page.getByText('Sending 170 emails.')).toBeVisible()
  await expect(page.getByText('171 of 171 sent')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Everyone has been sent' })).toBeDisabled()
  expect(mailbox().length - before).toBe(170)
  await expect(page.locator('article').first().getByText('Sent', { exact: true })).toBeVisible()
})
