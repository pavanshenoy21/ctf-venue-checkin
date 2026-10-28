import { test as base, expect, type Page } from '@playwright/test'
import { PW } from './db'

// Every page records CSP violations and uncaught errors in the browser; the test fails if any occurred.
export const test = base.extend<{ problems: string[] }>({
  // auto: runs for every test, even ones that never mention it
  problems: [async ({ page }, use) => {
    const problems: string[] = []
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        const w = window as unknown as { __csp?: string[] }
        ;(w.__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`)
      })
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(`csp: ${m.text()}`) })
    await use(problems)
    const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => [] as string[])
    expect([...problems, ...csp.map((c) => `csp: ${c}`)], 'browser errors or CSP violations').toEqual([])
  }, { auto: true }],
})

export { expect }

export async function signIn(page: Page, username: string, password = PW): Promise<void> {
  await page.goto('/admin/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(username === 'root' ? '/admin' : `/admin/${username}`)
}

// Auto-accepts window.confirm() dialogs (import / confirm / send all ask first).
export function acceptDialogs(page: Page): void {
  page.on('dialog', (d) => void d.accept())
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways').toBe(true)
}
