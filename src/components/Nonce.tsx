'use client'

import { setNonce } from 'get-nonce'

// Radix dialogs lock page scroll with a <style> tag they inject at runtime. Under this app's CSP a style tag
// needs the nonce of the CSP the document was loaded with, so hand it to the library that writes it. Only the
// first value counts: client-side navigations re-render the layout with a fresh nonce from a new request, but
// the document keeps its original policy.
let done = false
export default function Nonce({ nonce }: { nonce: string }) {
  if (typeof window !== 'undefined' && nonce && !done) { setNonce(nonce); done = true }
  return null
}
