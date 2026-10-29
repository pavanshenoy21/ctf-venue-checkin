import Passwords from '@/components/admin/Passwords'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'Passwords' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <Passwords />
}
