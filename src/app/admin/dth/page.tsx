import Desk from '@/components/desk/Desk'
import { requireOperatorPage } from '@/lib/page-auth'

export const metadata = { title: 'DTH check-in' }

export default async function Page() {
  const me = await requireOperatorPage('DTH')
  return <Desk venue="DTH" username={me.username} />
}
