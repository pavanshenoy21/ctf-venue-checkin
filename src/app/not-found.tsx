import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl">Page not found</h1>
      <Link className="btn-quiet" href="/admin/login">Go to sign-in</Link>
    </main>
  )
}
