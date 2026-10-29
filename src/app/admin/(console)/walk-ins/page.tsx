import WalkIns from '@/components/admin/WalkIns'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Walk-ins' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <WalkIns />
}
