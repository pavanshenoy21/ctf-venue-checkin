import Teams from '@/components/admin/Teams'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Teams' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Teams />
}
