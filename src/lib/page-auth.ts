import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE, sessionAdmin, type Admin, type Operator } from './auth'
import type { Venue } from './config'

// Server-side guards for pages: the check happens before anything renders, so nobody sees a flash of a
// page they can't use. The APIs behind each page enforce the same rules independently.
export async function pageAdmin(): Promise<Admin | null> {
  return sessionAdmin((await cookies()).get(COOKIE)?.value ?? null)
}

export const homeFor = (a: Admin): string => (a.role === 'SUPER_ADMIN' ? '/admin' : `/admin/${a.venue!.toLowerCase()}`)

export async function requireSuperPage(): Promise<Admin> {
  const a = await pageAdmin()
  if (!a) redirect('/admin/login')
  if (a.role !== 'SUPER_ADMIN') redirect(homeFor(a))
  return a
}

export async function requireOperatorPage(venue: Venue): Promise<Operator> {
  const a = await pageAdmin()
  if (!a) redirect('/admin/login')
  if (a.role !== 'VENUE_OPERATOR' || a.venue !== venue) redirect(homeFor(a))
  return a as Operator
}
