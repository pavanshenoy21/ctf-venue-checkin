import { closePool } from '../lib/db'
import { migrate } from '../lib/migrate'

migrate()
  .then((applied) => console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.'))
  .catch((e) => { console.error(e.message); process.exitCode = 1 })
  .finally(closePool)
