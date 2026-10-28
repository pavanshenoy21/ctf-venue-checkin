import { expect, noHorizontalScroll, signIn, test } from './support/fixtures'
import { person, q, resetTo } from './support/db'

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  await resetTo('confirmed')
  // a full ISE trio, one member of a DTH trio, one solo walk-in
  await q("INSERT INTO check_ins (participant_id, venue) SELECT p.id, p.assigned_venue FROM participants p JOIN teams t ON t.id = p.team_id WHERE t.name = 'Demo Trio 00'")
  await q("INSERT INTO check_ins (participant_id, venue) SELECT id, assigned_venue FROM participants WHERE team_id = (SELECT id FROM teams WHERE name = 'Demo Trio 44') ORDER BY id LIMIT 1")
  await q("INSERT INTO check_ins (participant_id, venue) SELECT id, assigned_venue FROM participants WHERE team_id IS NULL ORDER BY id LIMIT 1")
})

test('Attendance shows overall, per-venue and per-team-size numbers', async ({ page }) => {
  await signIn(page, 'root')
  const hero = page.locator('section').first()
  await expect(hero).toContainText('Checked in overall')
  await expect(hero).toContainText('5 / 171')
  await expect(hero).toContainText('3 of 113 checked in')
  await expect(hero).toContainText('2 of 58 checked in')
  const row = (label: string) => page.getByRole('row').filter({ hasText: label })
  await expect(row('3-member teams')).toContainText('4/135')
  await expect(row('3-member teams').getByRole('cell').nth(4)).toHaveText('1')        // all present
  await expect(row('3-member teams').getByRole('cell').nth(5)).toHaveText('1')        // partly here
  await expect(row('3-member teams').getByRole('cell').nth(6)).toHaveText('43')       // not arrived
  await expect(row('No team')).toContainText('1/10')
  await expect(page.getByRole('heading', { name: 'Latest check-ins' })).toBeVisible()
  await expect(page.locator('li')).toHaveCount(5)
})

test('Attendance updates live when someone checks in', async ({ page }) => {
  await signIn(page, 'root')
  await expect(page.locator('section').first()).toContainText('5 / 171')
  await q("INSERT INTO check_ins (participant_id, venue) SELECT id, assigned_venue FROM participants WHERE NOT checked_in AND assigned_venue = 'ISE' ORDER BY id LIMIT 1")
  await expect(page.locator('section').first()).toContainText('6 / 171', { timeout: 15_000 })
})

test('Teams are listed largest first and can be filtered', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/teams')
  await expect(page.locator('section h2')).toHaveText([/^3-member teams\s*45$/, /^2-member teams\s*10$/, /^1-member teams\s*6$/, /^No team\s*10$/])
  const trio = page.getByRole('row').filter({ hasText: 'Demo Trio 00' })
  await expect(trio.getByText('All present')).toBeVisible()
  await expect(trio.getByRole('img', { name: 'Checked in' })).toHaveCount(3)

  // partly here: one member of Demo Trio 44, plus Demo Trio 01 from the live-update test above
  await page.getByRole('radio', { name: /Partly here/ }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('row').filter({ hasText: 'Demo Trio 44' }).getByText('1 of 3 here')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Demo Trio 01' }).getByText('1 of 3 here')).toBeVisible()

  await page.getByRole('radio', { name: /Any attendance/ }).click()
  await page.getByRole('radio', { name: /^2-member/ }).click()
  await expect(page.locator('section h2')).toHaveText([/^2-member teams/])
  await page.getByRole('radio', { name: /^No team/ }).click()
  await expect(page.locator('section h2')).toHaveText([/^No team\s*10$/])

  await page.getByRole('radio', { name: /^All\s*\d+$/ }).click()   // "All 81", not "All present"
  await page.getByLabel('Venue').selectOption('ISE')
  await expect(page.locator('section h2')).toHaveText([/^3-member teams\s*37$/, /^2-member teams\s*1$/])
  await page.getByLabel('Search team or member').fill('Demo Person 4')
  await expect(page.locator('tbody tr').first()).toContainText('Demo Person 4')
})

test('Participants can be searched by name, email, team and ID, and filtered', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/participants')
  const total = page.locator('[aria-live=polite]')
  await expect(total).toHaveText('171 participants')
  const search = page.getByLabel('Search participants')
  await search.fill('Demo Person 99'); await expect(total).toHaveText('1 participant')
  await search.fill('demo7@example.invalid'); await expect(total).toHaveText('1 participant')
  await search.fill('Demo Duo 03'); await expect(total).toHaveText('2 participants')
  const p = await person("name = 'Demo Person 150'")
  await search.fill(String(p.id)); await expect(page.locator('tbody tr').first()).toContainText('Demo Person 150')
  await search.fill('%'); await expect(total).toHaveText('0 participants')
  await search.fill('')
  await page.getByRole('radio', { name: 'Checked in' }).click(); await expect(total).toHaveText('6 participants')
  await page.getByRole('radio', { name: 'Everyone' }).click()
  await page.getByLabel('Venue').selectOption('DTH'); await expect(total).toHaveText('58 participants')
})

test('Check-ins lists every check-in and filters by venue', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/checkins')
  await expect(page.locator('tbody tr')).toHaveCount(6)
  await page.getByRole('radio', { name: 'DTH' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
})

test('the console works at phone width without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'root')
  for (const path of ['/admin', '/admin/teams', '/admin/participants', '/admin/import', '/admin/emails']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await noHorizontalScroll(page)
  }
})
