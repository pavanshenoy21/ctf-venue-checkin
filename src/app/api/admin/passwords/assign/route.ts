import { superRoute } from '@/lib/guards'
import { json } from '@/lib/http'
import { assignMissing } from '@/lib/passwords'

export const dynamic = 'force-dynamic'

// Gives everyone without a password one; existing passwords are kept.
export const POST = superRoute('admin.passwords.assign', async () => json(await assignMissing()))
