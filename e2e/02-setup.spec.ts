import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { demoCsv } from '@/lib/demo'
import { acceptDialogs, expect, signIn, test } from './support/fixtures'
import { count, resetTo } from './support/db'

const dir = mkdtempSync(path.join(tmpdir(), 'ctf-e2e-'))
const file = (name: string, body: string | Uint8Array) => { const p = path.join(dir, name); writeFileSync(p, body); return p }

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { await resetTo('empty') })

test('an empty event points the organizer to Setup', async ({ page }) => {
  await signIn(page, 'root')
  await expect(page.getByText('No participants yet')).toBeVisible()
  await expect(page.getByText('Venues are not confirmed yet')).toBeVisible()
  await expect(page.getByText('Setup not started')).toBeVisible()
})

test('a CSV with errors is previewed but cannot be imported', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/import')
  await page.getByLabel('Registration CSV').setInputFiles(file('bad.csv', 'Team,Full Name,Email\n' + [1, 2, 3, 4].map((i) => `Big,P${i},p${i}@x.io`).join('\n') + '\nX,,x@x.io\n'))
  await expect(page.getByText('Fix these problems in the CSV')).toBeVisible()
  await expect(page.getByText("Team 'Big' has 4 participants (maximum is 3).")).toBeVisible()
  await expect(page.getByText('Line 6: missing name.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import \d+ participants$/ })).toHaveCount(0)
  expect(await count('participants')).toBe(0)
})

test('import, assign and confirm through the Setup page', async ({ page }) => {
  acceptDialogs(page)
  await signIn(page, 'root')
  await page.goto('/admin/import')
  const step = (n: number) => page.getByRole('region', { name: new RegExp(`^Step ${n}:`) })

  // 1. preview then import
  await page.getByLabel('Registration CSV').setInputFiles(file('demo.csv', demoCsv()))
  await expect(step(1).getByText('171 participants in 61 teams, plus 10 without a team.')).toBeVisible()
  await expect(step(1).locator('dl')).toContainText('3-member teams45')
  await step(1).getByRole('button', { name: 'Import 171 participants' }).click()
  await expect(page.getByText('Imported 171 participants.')).toBeVisible()
  await expect(step(1).getByText('171 participants are loaded.')).toBeVisible()

  // 2. assign: ISE takes 37 trios + 1 duo, DTH the rest
  await step(2).getByRole('button', { name: 'Assign venues' }).click()
  await expect(page.getByText('Venues assigned. Review them, then confirm.')).toBeVisible()
  await expect(step(2)).toContainText('113 / 113')
  await expect(step(2)).toContainText('58 / 145')
  await expect(step(2).getByRole('button', { name: 'Assign venues again' })).toBeVisible()

  // 3. confirm, which locks everything
  await step(3).getByRole('button', { name: 'Confirm venues' }).click()
  await expect(page.getByText('Venues confirmed.')).toBeVisible()
  await expect(step(3)).toContainText('Venues are final.')
  await expect(step(1)).toContainText("Participants can't be re-imported once venues are confirmed.")
  await expect(step(2).getByRole('button', { name: /Assign venues/ })).toHaveCount(0)
  await page.goto('/admin')
  await expect(page.getByText('Venues confirmed')).toBeVisible()
  expect(await count("participants WHERE assigned_venue = 'ISE'")).toBe(113)
})

test('the old Allocation address opens Setup', async ({ page }) => {
  await signIn(page, 'root')
  await page.goto('/admin/allocation')
  await expect(page).toHaveURL('/admin/import')
})
