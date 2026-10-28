'use client'

import { useEffect, useRef, useState } from 'react'

// Full-screen camera scanner. qr-scanner is loaded only in the browser (it needs DOM + camera APIs).
export default function Scanner({ onToken, paused, onClose }: { onToken: (raw: string, manual?: boolean) => void; paused: boolean; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const cb = useRef(onToken)
  cb.current = onToken
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let scanner: { stop(): void; destroy(): void } | null = null
    let cancelled = false
    void (async () => {
      try {
        const { default: QrScanner } = await import('qr-scanner')
        if (cancelled || !video.current) return
        const s = new QrScanner(video.current, (r) => { if (!pausedRef.current) cb.current(r.data) },
          { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 12, returnDetailedScanResult: true })
        scanner = s
        await s.start()
      } catch {
        if (!cancelled) setErr(window.isSecureContext ? 'Camera unavailable or permission denied. Use manual entry below.' : 'The camera needs HTTPS. Open this page over https://, or use manual entry below.')
      }
    })()
    return () => { cancelled = true; scanner?.stop(); scanner?.destroy() }
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black" role="dialog" aria-label="QR scanner">
      <div className="flex items-center justify-between bg-sea-900 p-3"><b>{err ? 'Scanner' : 'Scanning…'}</b><button className="btn-quiet" onClick={onClose}>Close</button></div>
      <video ref={video} className="min-h-0 w-full flex-1 object-cover" playsInline muted />
      {err && <p role="alert" className="p-3 text-center text-red-300">{err}</p>}
      <form className="flex gap-2 bg-sea-900 p-3" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onToken(manual.trim(), true); setManual('') } }}>
        <input className="field" aria-label="Manual entry" placeholder="Manual entry: paste QR link or token" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn-primary">Check</button>
      </form>
    </div>
  )
}
