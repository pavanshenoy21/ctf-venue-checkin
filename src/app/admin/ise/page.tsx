import Desk from '@/components/desk/Desk'
import { requireOperatorPage } from '@/lib/page-auth'

export const metadata = { title: 'ISE check-in' }

export default async function Page() {
  const me = await requireOperatorPage('ISE')
  return <Desk venue="ISE" username={me.username} />
}
