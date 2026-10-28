import Dashboard from '@/components/admin/Dashboard'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Attendance' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Dashboard />
}
