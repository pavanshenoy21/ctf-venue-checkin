import { acceptDialogs, expect, noHorizontalScroll, signIn, test } from './support/fixtures'
import { count, person, q, resetTo } from './support/db'
import type { Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { await resetTo('confirmed') })

const result = (page: Page, title: string) => page.getByRole('alertdialog', { name: title })
async function scanManually(page: Page, code: string, expectTitle: string) {
  await page.getByLabel('Manual entry').fill(code)
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(result(page, expectTitle)).toBeVisible()
}

test('DTH desk: wrong venue, success, already checked in, invalid', async ({ page }) => {
  const ise = await person("assigned_venue = 'ISE'")
  const dth = await person("assigned_venue = 'DTH' AND team_id IS NOT NULL")
  await signIn(page, 'dth')
  await expect(page.getByRole('heading', { name: 'DTH', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Venue attendance')).toContainText('0 of 58')
  await page.getByRole('button', { name: 'SCAN QR' }).click()
  await expect(page.getByRole('dialog', { name: 'QR scanner' })).toBeVisible()

  await scanManually(page, `http://localhost:3200/checkin/${ise.qr_token}`, 'WRONG VENUE')
  const wrong = result(page, 'WRONG VENUE')
  await expect(wrong).toContainText(ise.name)
  await expect(wrong).toContainText('ISE SEMINAR HALL')
  await expect(wrong).toContainText('DO NOT CHECK IN')
  await wrong.click()                                                       // tap to skip
  await expect(wrong).toBeHidden()
  expect(await count('check_ins')).toBe(0)

  await scanManually(page, dth.qr_token, 'CHECK-IN SUCCESSFUL')
  await expect(result(page, 'CHECK-IN SUCCESSFUL')).toContainText(dth.name)
  await expect(result(page, 'CHECK-IN SUCCESSFUL')).toContainText(dth.team!)
  await expect(result(page, 'CHECK-IN SUCCESSFUL')).toBeHidden({ timeout: 5000 })   // returns to the scanner by itself
  await expect(page.getByRole('dialog', { name: 'QR scanner' })).toBeVisible()

  await scanManually(page, dth.qr_token, 'ALREADY CHECKED IN')
  await result(page, 'ALREADY CHECKED IN').click()
  await scanManually(page, 'not-a-real-code', 'INVALID QR CODE')
  await expect(result(page, 'INVALID QR CODE')).toContainText('This QR code is not recognized.')
  await result(page, 'INVALID QR CODE').click()

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('Venue attendance')).toContainText('1 of 58')
  await expect(page.getByText(dth.name)).toBeVisible()                        // recent check-ins
  expect(await count('check_ins')).toBe(1)
})

test('ISE desk accepts ISE participants and turns away people without a team', async ({ page }) => {
  const ise = await person("assigned_venue = 'ISE' AND NOT checked_in")
  const solo = await person('team_id IS NULL')
  await signIn(page, 'ise')
  await expect(page.getByRole('heading', { name: 'ISE Seminar Hall', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'SCAN QR' }).click()
  await scanManually(page, ise.qr_token, 'CHECK-IN SUCCESSFUL')
  await result(page, 'CHECK-IN SUCCESSFUL').click()
  await scanManually(page, solo.qr_token, 'WRONG VENUE')
  await expect(result(page, 'WRONG VENUE')).toContainText('Current Venue')
  await expect(result(page, 'WRONG VENUE')).toContainText('DTH')
})

test('two desks scanning the same person at once record one check-in', async ({ browser }) => {
  const p = await person("assigned_venue = 'DTH' AND NOT checked_in")
  const a = await (await browser.newContext()).newPage(), b = await (await browser.newContext()).newPage()
  await signIn(a, 'dth'); await signIn(b, 'dth')
  for (const pg of [a, b]) { await pg.getByRole('button', { name: 'SCAN QR' }).click(); await pg.getByLabel('Manual entry').fill(p.qr_token) }
  await Promise.all([a, b].map((pg) => pg.getByRole('button', { name: 'Check', exact: true }).click()))
  const titles = await Promise.all([a, b].map(async (pg) => pg.getByRole('alertdialog').getAttribute('aria-label')))
  expect(titles.sort()).toEqual(['ALREADY CHECKED IN', 'CHECK-IN SUCCESSFUL'])
  expect(await count(`check_ins WHERE participant_id = ${p.id}`)).toBe(1)
})

test('an expired session is reported on scan instead of failing silently', async ({ page }) => {
  const p = await person("assigned_venue = 'DTH' AND NOT checked_in")
  await signIn(page, 'dth')
  await page.getByRole('button', { name: 'SCAN QR' }).click()
  await q("DELETE FROM sessions")
  await scanManually(page, p.qr_token, 'ERROR')
  await expect(result(page, 'ERROR')).toContainText('Session expired. Sign in again.')
  expect(await count(`check_ins WHERE participant_id = ${p.id}`)).toBe(0)
})

test('the desk fits a phone screen and the super admin sees desk check-ins live', async ({ page, browser }) => {
  acceptDialogs(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'dth')
  await noHorizontalScroll(page)
  const admin = await (await browser.newContext()).newPage()
  await signIn(admin, 'root')
  const before = await count('check_ins')
  await expect(admin.locator('section').first()).toContainText(`${before} / 171`)
  const p = await person("assigned_venue = 'DTH' AND NOT checked_in")
  await page.getByRole('button', { name: 'SCAN QR' }).click()
  await scanManually(page, p.qr_token, 'CHECK-IN SUCCESSFUL')
  await expect(admin.locator('section').first()).toContainText(`${before + 1} / 171`, { timeout: 15_000 })
  await expect(admin.getByText(p.name)).toBeVisible()
})
