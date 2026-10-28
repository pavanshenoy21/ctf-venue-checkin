import { defineConfig, devices } from '@playwright/test'

// Browser tests run against the PRODUCTION build (`next build` first, see npm run test:e2e) with its own
// database and a local SMTP server, one test at a time because they share that database.
export const PORT = 3200
export const SMTP_PORT = 2526
export const BASE = `http://localhost:${PORT}`
export const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://ctf@127.0.0.1:55432/ctfv1_e2e_test'
export const MAILBOX = 'test-results/mailbox'
process.env.DATABASE_URL = E2E_DB
process.env.PUBLIC_BASE_URL = BASE

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/support/global-setup.ts',
  use: { baseURL: BASE, trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    // the real production artifact: the standalone server (what Docker runs), with its static files copied in
    command: 'npm run start',
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT), HOSTNAME: '127.0.0.1',
      DATABASE_URL: E2E_DB,
      PUBLIC_BASE_URL: BASE,
      COOKIE_SECURE: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_FROM: 'ctf@organizers.test', SMTP_SECURITY: 'none',
      // every request comes from 127.0.0.1 here, so the per-address login limit is raised for the suite;
      // the limits themselves are covered by the integration tests
      RATE_LOGIN_PER_MIN: '1000',
    },
  },
})
