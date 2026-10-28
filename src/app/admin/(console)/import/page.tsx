import Setup from '@/components/admin/Setup'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Setup' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Setup />
}
