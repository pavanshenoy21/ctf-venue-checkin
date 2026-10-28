import CheckIns from '@/components/admin/CheckIns'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Check-ins' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <CheckIns />
}
