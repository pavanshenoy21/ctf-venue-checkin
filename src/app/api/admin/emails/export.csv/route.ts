import { superRoute } from '@/lib/guards'
import { download } from '@/lib/http'
import { emailsCsv } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

export const GET = superRoute('admin.emails.csv', async () => download(await emailsCsv(), 'text/csv; charset=utf-8', 'emails.csv'))
