import type { ReactNode } from 'react'
import Console from '@/components/admin/Console'
import { requireSuperPage } from '@/lib/page-auth'

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const me = await requireSuperPage()
  return <Console username={me.username}>{children}</Console>
}
