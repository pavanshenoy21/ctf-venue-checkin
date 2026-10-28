import Emails from '@/components/admin/Emails'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Emails' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Emails />
}
