import { expect, signIn, test } from './support/fixtures'
import { resetTo } from './support/db'

test.beforeAll(async () => { await resetTo('confirmed') })

test.describe('sign-in and roles', () => {
  test('wrong password shows an error and stays on sign-in', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel('Username').fill('root')
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    // Next.js adds its own empty role=alert route announcer, so pick ours by text
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid username or password' })).toBeVisible()
    await expect(page).toHaveURL('/admin/login')
  })

  test('the sign-in button stays disabled until both fields are filled', async ({ page }) => {
    await page.goto('/admin/login')
    const btn = page.getByRole('button', { name: 'Sign in' })
    await expect(btn).toBeDisabled()
    await page.getByLabel('Username').fill('root')
    await expect(btn).toBeDisabled()
    await page.getByLabel('Password').fill('x')
    await expect(btn).toBeEnabled()
  })

  test('super admin lands on Attendance and can sign out', async ({ page }) => {
    await signIn(page, 'root')
    await expect(page.getByRole('heading', { name: 'Attendance', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).last().click()
    await expect(page).toHaveURL('/admin/login')
    await page.goto('/admin')
    await expect(page).toHaveURL('/admin/login')                     // the session is really gone
  })

  for (const v of ['dth', 'ise'] as const) {
    test(`${v.toUpperCase()} operator lands on their own desk and is kept there`, async ({ page }) => {
      await signIn(page, v)
      await expect(page.getByRole('button', { name: 'SCAN QR' })).toBeVisible()
      for (const path of ['/admin', '/admin/teams', '/admin/import', `/admin/${v === 'dth' ? 'ise' : 'dth'}`]) {
        await page.goto(path)
        await expect(page).toHaveURL(`/admin/${v}`)
      }
    })
  }

  test('signed-out visitors are sent to sign-in from every protected page', async ({ page }) => {
    for (const path of ['/admin', '/admin/teams', '/admin/participants', '/admin/checkins', '/admin/qr-codes', '/admin/emails', '/admin/import', '/admin/dth', '/admin/ise']) {
      await page.goto(path)
      await expect(page).toHaveURL('/admin/login')
    }
  })

  test('a signed-in user visiting sign-in goes home', async ({ page }) => {
    await signIn(page, 'ise')
    await page.goto('/admin/login')
    await expect(page).toHaveURL('/admin/ise')
  })
})
