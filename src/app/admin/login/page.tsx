import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import { homeFor, pageAdmin } from '@/lib/page-auth'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const me = await pageAdmin()
  if (me) redirect(homeFor(me))
  return <LoginForm />
}
