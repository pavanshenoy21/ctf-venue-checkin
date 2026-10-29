'use client'

import { CameraOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

// Full-screen camera scanner. qr-scanner is loaded only in the browser (it needs DOM + camera APIs).
export default function Scanner({ onToken, paused, onClose, venueLabel }: { onToken: (raw: string, manual?: boolean) => void; paused: boolean; onClose: () => void; venueLabel: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const cb = useRef(onToken)
  cb.current = onToken
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [err, setErr] = useState('')
  const [live, setLive] = useState(false)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let scanner: { stop(): void; destroy(): void } | null = null
    let cancelled = false
    void (async () => {
      try {
        const { default: QrScanner } = await import('qr-scanner')
        if (cancelled || !video.current) return
        const s = new QrScanner(video.current, (r) => { if (!pausedRef.current) cb.current(r.data) },
          { preferredCamera: 'environment', maxScansPerSecond: 12, returnDetailedScanResult: true })
        scanner = s
        await s.start()
        if (!cancelled) setLive(true)
      } catch {
        if (!cancelled) setErr(window.isSecureContext ? 'Camera unavailable or permission denied. Type the code below instead.' : 'The camera needs HTTPS. Open this page over https://, or type the code below.')
      }
    })()
    return () => { cancelled = true; scanner?.stop(); scanner?.destroy() }
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black" role="dialog" aria-label="QR scanner">
      <video ref={video} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_34vmin,rgb(0_0_0/0.72)_36vmin)]" aria-hidden />

      <header className="relative flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="eyebrow flex items-center gap-2 text-primary">
            <span className={`size-2 rounded-full ${live ? 'animate-pulse bg-ok' : 'bg-muted-foreground'}`} />{err ? 'Camera off' : live ? 'Scanning' : 'Starting camera'}
          </p>
          <p className="mt-1 font-display text-xl font-extrabold">{venueLabel}</p>
        </div>
        <Button variant="muted" size="sm" onClick={onClose}><X />Close</Button>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative [--reticle:min(68vmin,22rem)] size-[var(--reticle)]" aria-hidden>
          {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map((c) => (
            <span key={c} className={`absolute size-12 border-primary drop-shadow-[0_0_10px_rgb(217_181_107/0.6)] ${c}`} />
          ))}
          {live && !paused && <span className="animate-sweep absolute inset-x-4 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-gold-light to-transparent shadow-[0_0_14px_var(--gold-light)]" />}
          {err && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <CameraOff className="size-10 text-muted-foreground" />
              <p role="alert" className="text-sm text-foreground/85">{err}</p>
            </div>
          )}
        </div>
        {!err && <p className="absolute bottom-6 text-sm text-foreground/70">Hold the QR code inside the frame</p>}
      </div>

      <form className="relative border-t bg-black/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md"
        onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onToken(manual.trim(), true); setManual('') } }}>
        <div className="mx-auto flex max-w-lg gap-3">
          <Input aria-label="Manual entry" placeholder="Or paste the QR link / code" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button size="default" className="shrink-0">Check</Button>
        </div>
      </form>
    </div>
  )
}
