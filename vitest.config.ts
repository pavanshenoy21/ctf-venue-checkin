import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB tests share one database and reset it per test, so files must not run in parallel
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://ctf@127.0.0.1:55432/ctfv1_test',
      COOKIE_SECURE: 'false',
      PUBLIC_BASE_URL: 'https://ctf.test',
    },
  },
})
