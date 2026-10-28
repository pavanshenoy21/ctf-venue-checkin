import QrCodes from '@/components/admin/QrCodes'
import { requireSuperPage } from '@/lib/page-auth'

export const metadata = { title: 'QR codes' }

export default async function Page() {
  await requireSuperPage() // layouts don't re-run on every navigation, so each page checks too
  return <QrCodes />
}
