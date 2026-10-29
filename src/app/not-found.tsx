import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="eyebrow text-primary">404</p>
      <h1 className="font-display text-4xl font-extrabold">Page not found</h1>
      <Button asChild variant="muted"><Link href="/admin/login">Go to sign-in</Link></Button>
    </main>
  )
}
