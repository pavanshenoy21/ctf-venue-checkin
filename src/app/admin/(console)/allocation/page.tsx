import { redirect } from 'next/navigation'

// The old Allocation tab now lives inside Setup.
export default function Page() {
  redirect('/admin/import')
}
