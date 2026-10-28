import Participants from '@/components/admin/Participants'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Participants' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Participants />
}
