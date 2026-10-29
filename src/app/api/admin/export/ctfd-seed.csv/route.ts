import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'
import { ctfdSeedCsv } from '@/lib/passwords'

export const dynamic = 'force-dynamic'

// Every player, their team and both passwords, for seeding the CTFd database directly.
export const GET = superRoute('admin.export.ctfd_seed', async () => download(await ctfdSeedCsv(), 'text/csv; charset=utf-8', 'ctfd-seed.csv'))
