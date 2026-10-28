import { expect, test } from './support/fixtures'
import { count, person, resetTo } from './support/db'

test.describe.configure({ mode: 'serial' })

test('before confirmation the page says the venue is not assigned yet', async ({ page }) => {
  await resetTo('imported')
  const p = await person('true')
  await page.goto(`/checkin/${p.qr_token}`)
  await expect(page.getByRole('heading', { name: 'VENUE NOT ASSIGNED YET' })).toBeVisible()
  await expect(page.getByText(`Hello ${p.name}.`)).toBeVisible()
})

test('ISE, DTH and no-team participants see their venue; viewing is not a check-in', async ({ page }) => {
  await resetTo('confirmed')
  const cases = [
    [await person("assigned_venue = 'ISE'"), 'ISE SEMINAR HALL', /Please report to the ISE SEMINAR HALL venue for check-in\./],
    [await person("assigned_venue = 'DTH' AND team_id IS NOT NULL"), 'DTH', /Please report to the DTH venue for check-in\./],
    [await person('team_id IS NULL'), 'DTH', /Please report to DTH for check-in\./],
  ] as const
  for (const [p, venue, report] of cases) {
    await page.goto(`/checkin/${p.qr_token}`)
    await expect(page.getByText('YOUR VENUE')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(venue)
    await expect(page.locator('main')).toContainText(p.team ?? 'You are participating without a team.')
    await expect(page.locator('main')).toContainText(report)
    await expect(page.locator('main')).not.toContainText(p.email)
  }
  expect(await count('check_ins')).toBe(0)
})

test('an unknown code shows the invalid page', async ({ page }) => {
  await page.goto(`/checkin/${'A'.repeat(32)}`)
  await expect(page.getByRole('heading', { name: 'INVALID QR CODE' })).toBeVisible()
  await expect(page.getByText('Please contact the organizers.')).toBeVisible()
})

test('works with JavaScript turned off (rendered on the server)', async ({ browser }) => {
  const p = await person("assigned_venue = 'ISE'")
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto(`/checkin/${p.qr_token}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ISE SEMINAR HALL')
  await ctx.close()
})
