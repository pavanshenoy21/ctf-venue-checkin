// Next.js calls register() once per server process at start-up: bring the schema up to date first.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { migrateWithRetry } = await import('./lib/migrate')
  const applied = await migrateWithRetry()
  if (applied.length) console.log(`database migrations applied: ${applied.join(', ')}`)
}
