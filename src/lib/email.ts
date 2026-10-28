import { config, VENUE_LABEL, type Venue } from './config'
import { qrFilename, qrUrl } from './qr'

export const SUBJECT = 'CTF Venue & Check-in Details'
// Replaced with a cid: reference when sending, or an image URL in previews and mail-merge exports.
export const QR_SRC = '{{QR_SRC}}'

export interface EmailInput {
  name: string
  email: string
  team: string | null
  venue: Venue
  token: string
}

export interface RenderedEmail {
  to: string
  subject: string
  text: string
  html: string
  qrUrl: string
  qrFile: string
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const firstName = (name: string): string => {
  const w = name.trim().split(/\s+/)[0] ?? name
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

// One participant's email. It mentions nobody else.
export function renderEmail(p: EmailInput): RenderedEmail {
  const first = firstName(p.name)
  const venue = VENUE_LABEL[p.venue]
  const link = qrUrl(p.token)
  const teamText = p.team ? `Team:\n${p.team}\n\n` : 'You are participating without a team.\n\n'
  const report = p.team ? `Please report to the ${venue} venue for check-in.` : `Please report to ${venue} for check-in.`
  const text =
    `Hello ${first},\n\nYou have been assigned to:\n\n${venue}\n\n${teamText}${report}\n\n` +
    'Your QR code is attached below. Please keep this QR code available during check-in.\n' +
    `If the image does not load, open: ${link}\n\n- ${config.eventName} organizers\n`
  const teamHtml = p.team ? `<p><b>Team:</b><br>${esc(p.team)}</p>` : '<p>You are participating without a team.</p>'
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:480px">` +
    `<h2>${esc(config.eventName)}</h2><p>Hello ${esc(first)},</p>` +
    `<p>You have been assigned to:</p><h1 style="margin:4px 0">${esc(venue)}</h1>${teamHtml}` +
    `<p>${esc(report)}</p><p>Your QR code is below. Please keep it available during check-in.</p>` +
    `<img src="${QR_SRC}" alt="QR code" width="260" height="260">` +
    `<p style="font-size:12px;color:#555">If the image does not load, open: <a href="${esc(link)}">${esc(link)}</a></p></div>`
  return { to: p.email, subject: SUBJECT, text, html, qrUrl: link, qrFile: qrFilename(p.name, p.team, p.venue) }
}
