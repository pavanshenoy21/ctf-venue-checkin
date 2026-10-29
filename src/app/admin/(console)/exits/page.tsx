import Exits from '@/components/admin/Exits'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Temporary exits' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Exits />
}
