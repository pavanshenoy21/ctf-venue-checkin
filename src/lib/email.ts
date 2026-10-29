import { config, VENUE_LABEL, type Venue } from './config'
import { qrFilename, qrUrl } from './qr'

export const SUBJECT = 'CTF Venue & Check-in Details'
export const QR_SUBJECT = 'Your CTF Check-in QR'
// Replaced with a cid: reference when sending, or an image URL in previews and mail-merge exports.
export const QR_SRC = '{{QR_SRC}}'
export const LOGO_SRC = '{{LOGO_SRC}}'
// In public/: served for previews and mail-merge exports, attached inline when sending.
export const LOGO_FILE = 'email-logo.png'

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
  // false for the venue email to people without a team: their QR is sent separately, once they report at DTH
  hasQr: boolean
  qrUrl: string
  qrFile: string
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Initials like "D KARTHIKEYAN": greet them by the first real word.
const firstName = (name: string): string => {
  const ws = name.trim().split(/\s+/)
  const w = ws.find((x) => x.length > 2) ?? ws[0] ?? name
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

// "11:00 AM – 12:20 PM" -> "11:00 AM and 12:20 PM" / "12:20 PM"
const RANGE = /\s*[–-]\s*/
const between = (range: string) => range.replace(RANGE, ' and ')
const rangeEnd = (range: string) => range.split(RANGE).pop() ?? range

// Same look as the CTFd site emails: black page, dark card, gold accents, Syne / Space Grotesk / JetBrains
// Mono. Apple Mail loads the web fonts; Gmail and Outlook fall back to the system stacks.
const C = { gold: '#d9b56b', goldLight: '#f1d79c', ink: '#e8dfcc', muted: '#8c826f', rule: '#2a2319', card: '#0d0b08', page: '#000000', edge: '#3a3022' }
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap'
const SANS = "'Space Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const DISPLAY = "'Syne', 'Space Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "'JetBrains Mono', SFMono-Regular, Menlo, Consolas, 'Courier New', monospace"
const VENUE_TITLE: Record<Venue, string> = { DTH: 'DTH', ISE: 'ISE Seminar Hall' }

const para = (html: string, size = 16, margin = '0 0 16px') =>
  `<p style="margin:${margin};font-family:${SANS};font-size:${size}px;line-height:1.6;color:${C.ink};">${html}</p>`
const label = (text: string, margin = '0 0 10px') =>
  `<p style="margin:${margin};font-family:${MONO};font-size:12px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:${C.gold};">${text}</p>`
const strong = (html: string) => `<strong style="color:${C.goldLight};">${html}</strong>`
const ruled = (rows: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.gold};border-bottom:1px solid ${C.rule};margin:0 0 32px;">${rows}</table>`
const details = (pairs: [string, string][]) => ruled(pairs.map(([name, value], i) => {
  const top = i ? `border-top:1px solid ${C.rule};` : ''
  return `<tr><td valign="top" style="${top}padding:12px 12px 12px 0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};white-space:nowrap;">${name}</td>` +
    `<td valign="top" align="right" style="${top}padding:12px 0;font-family:${SANS};font-size:15px;font-weight:600;color:${C.ink};">${value}</td></tr>`
}).join(''))

// What people without a team must do on the day. Shared by the HTML and plain-text emails.
function soloRules(): string[] {
  const window = config.reportTimeSolo
  return [
    `Come to DTH in person between ${between(window)}.`,
    'At the DTH desk, either form a team with other participants who don\'t have one (up to 3 members) or confirm that you are going solo. You must do one of the two, even if you are going solo.',
    'This can only be done in person at DTH. It can\'t be done over WhatsApp, Discord or email.',
    `If you haven't reported at DTH by ${rangeEnd(window)}, you will not be able to take part in the CTF.`,
  ]
}

function rulesHtml(): string {
  const rules = soloRules()
  const rows = rules.map((r, i) => {
    const top = i ? `border-top:1px solid ${C.rule};` : ''
    const last = i === rules.length - 1
    return `<tr><td valign="top" width="28" style="${top}padding:12px 0;font-family:${MONO};font-size:13px;font-weight:500;color:${C.gold};">0${i + 1}</td>` +
      `<td valign="top" style="${top}padding:12px 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${last ? C.goldLight : C.ink};${last ? 'font-weight:600;' : ''}">${esc(r)}</td></tr>`
  }).join('')
  return label('Rules for participants without a team') + ruled(rows)
}

function qrHtml(heading = 'Your check-in QR', caption = 'Scanned once at the desk &middot; one check-in per person'): string {
  return `${label(heading, '0 0 14px')}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;">
              <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;padding:10px;">
                <img src="${QR_SRC}" alt="QR code" width="220" height="220" style="display:block;width:220px;height:220px;border:0;">
              </td></tr>
            </table>
            <p align="center" style="margin:0 0 32px;text-align:center;font-family:${MONO};font-size:12px;line-height:1.6;color:${C.muted};">${caption}</p>`
}

interface Layout {
  first: string
  preheader: string
  intro: string
  venue: Venue | null // null: no venue heading (e.g. the password email)
  rows: [string, string][]
  middle: string // rules and/or the QR block
  closing: string
  link: string | null // QR fallback link, only when the email carries the QR
}

function page(l: Layout): string {
  const event = esc(config.eventName)
  const fallback = l.link ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid ${C.rule};padding-top:20px;">
                <p style="margin:0 0 6px;font-family:${SANS};font-size:13px;color:${C.muted};">QR code not showing? Open this link at the desk:</p>
                <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.5;word-break:break-all;color:${C.muted};"><a href="${esc(l.link)}" target="_blank" style="color:${C.gold};text-decoration:underline;">${esc(l.link)}</a></p>
              </td></tr>
            </table>` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(config.eventName)}</title>
<link href="${FONTS_URL}" rel="stylesheet" type="text/css">
<style>
  @media only screen and (max-width: 600px) {
    .card-pad { padding: 32px 22px !important; }
    .venue { font-size: 30px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${l.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:0 0 24px;">
            <img src="${LOGO_SRC}" width="132" alt="Coding Club &middot; 10 Years" style="display:block;width:132px;max-width:40%;height:auto;border:0;color:${C.gold};font-family:${SANS};font-size:14px;">
          </td>
        </tr>
        <tr>
          <td class="card-pad" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.edge};border-radius:18px;padding:44px 40px;">
            ${label(event, '0 0 20px')}
            ${para(`Hi ${esc(l.first)},`)}
            ${para(l.intro, 16, '0 0 28px')}

            ${l.venue ? `${label('Your venue')}
            <p class="venue" style="margin:0 0 18px;font-family:${DISPLAY};font-size:36px;font-weight:800;line-height:1.15;color:${C.goldLight};">${esc(VENUE_TITLE[l.venue])}</p>` : ''}
            ${details(l.rows)}

            ${l.middle}

            ${para(l.closing, 15)}
            ${para('Thank you,<br>Coding Club RVCE', 15, '0 0 24px')}
${fallback}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 16px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#5f574a;">You&#39;re receiving this because you registered for ${event}, the Coding Club RVCE CTF.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

// One participant's venue email. It mentions nobody else. Team members get their QR here; people without a
// team get the rules instead, and their QR later with renderQrEmail.
export function renderEmail(p: EmailInput): RenderedEmail {
  const first = firstName(p.name)
  const venue = VENUE_LABEL[p.venue]
  const title = esc(VENUE_TITLE[p.venue])
  const link = qrUrl(p.token)
  const files = { qrUrl: link, qrFile: qrFilename(p.name, p.team, p.venue) }

  if (p.team) {
    const time = config.reportTimeTeam
    const html = page({
      first, link, venue: p.venue,
      preheader: `Your venue is ${title}, reporting ${esc(time)}. Keep this QR code ready for check-in.`,
      intro: `Your venue for ${esc(config.eventName)} is confirmed. Please report to ${strong(title)} at ${strong(esc(time))} and show the QR code below at the check-in desk.`,
      rows: [['Team', esc(p.team)], ['Report at', esc(time)], ['Check in at', `${title} desk`]],
      middle: qrHtml(),
      closing: 'Please keep this email handy on your phone during check-in.',
    })
    const text =
      `Hi ${first},\n\nYou have been assigned to:\n\n${venue}\n\nTeam:\n${p.team}\n\n` +
      `Please report to the ${venue} venue for check-in at ${time}.\n\n` +
      'Your QR code is attached below. Please keep this QR code available during check-in.\n' +
      `If the image does not load, open: ${link}\n\nThank you,\nCoding Club RVCE\n`
    return { to: p.email, subject: SUBJECT, text, html, hasQr: true, ...files }
  }

  const window = config.reportTimeSolo
  const later = `Once you have done this at the DTH desk, we will email you your check-in QR. You will use it for entry at ${config.reportTimeTeam}.`
  const html = page({
    first, link: null, venue: p.venue,
    preheader: `You registered without a team. Report in person at ${title} between ${esc(between(window))}.`,
    intro: `You registered without a team, so your venue is ${strong(title)}. You must report there in person between ${strong(esc(between(window)))} to form a team or confirm you are going solo. Please read the rules below.`,
    rows: [['Team', 'No team yet'], ['Report at', esc(window)], ['Report to', `${title} desk`]],
    middle: rulesHtml(),
    closing: esc(later),
  })
  const text =
    `Hi ${first},\n\nYou have been assigned to:\n\n${venue}\n\nYou are participating without a team.\n\n` +
    `Please report to ${venue} in person (${window}).\n\n` +
    `Rules for participants without a team:\n${soloRules().map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` +
    `${later}\n\nThank you,\nCoding Club RVCE\n`
  return { to: p.email, subject: SUBJECT, text, html, hasQr: false, ...files }
}

// Sent one at a time from the admin panel to someone without a team, after they have formed a team or
// confirmed they are going solo at the DTH desk.
export function renderQrEmail(p: EmailInput): RenderedEmail {
  const first = firstName(p.name)
  const venue = VENUE_LABEL[p.venue]
  const title = esc(VENUE_TITLE[p.venue])
  const time = config.reportTimeTeam
  const link = qrUrl(p.token)
  const html = page({
    first, link, venue: p.venue,
    preheader: `You're confirmed. Show this QR at the ${title} desk at ${esc(time)}.`,
    intro: `You have reported at ${title} and your registration is confirmed. Here is your check-in QR: show it at the ${strong(`${title} desk`)} at ${strong(esc(time))} for entry.`,
    rows: [...(p.team ? [['Team', esc(p.team)] as [string, string]] : []), ['Report at', esc(time)], ['Check in at', `${title} desk`]],
    middle: qrHtml(),
    closing: 'Please keep this email handy on your phone during check-in.',
  })
  const text =
    `Hi ${first},\n\nYou have reported at ${venue} and your registration is confirmed.\n\n` +
    (p.team ? `Team:\n${p.team}\n\n` : '') +
    `Please show your check-in QR at the ${venue} desk at ${time} for entry.\n\n` +
    'Your QR code is attached below. Please keep this QR code available during check-in.\n' +
    `If the image does not load, open: ${link}\n\nThank you,\nCoding Club RVCE\n`
  return { to: p.email, subject: QR_SUBJECT, text, html, hasQr: true, qrUrl: link, qrFile: qrFilename(p.name, p.team, p.venue) }
}

export const REENTRY_SUBJECT = 'Your CTF Re-entry QR'

export interface ReentryInput extends EmailInput { reason: string; outAt: Date }

const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: config.eventTz })

// Sent when an organiser records a temporary exit. The QR in it is a separate, one-time code: the person's
// original QR doesn't let them back in while they are out.
export function renderReentryEmail(p: ReentryInput): RenderedEmail {
  const first = firstName(p.name)
  const venue = VENUE_LABEL[p.venue]
  const title = esc(VENUE_TITLE[p.venue])
  const link = qrUrl(p.token)
  const out = clock(p.outAt)
  const html = page({
    first, link, venue: p.venue,
    preheader: `You stepped out of ${title} at ${esc(out)}. Use this QR to come back in.`,
    intro: `You have stepped out of ${title}. To come back in, show the ${strong('re-entry QR below')} at the ${strong(`${title} desk`)}. It works once, and your original QR won&#39;t let you back in while you are out.`,
    rows: [...(p.team ? [['Team', esc(p.team)] as [string, string]] : []), ['Left at', esc(out)], ['Reason', esc(p.reason)], ['Come back via', `${title} desk`]],
    middle: qrHtml('Your re-entry QR', 'One-time re-entry pass &middot; works once'),
    closing: 'Please keep this email handy until you are back inside.',
  })
  const text =
    `Hi ${first},\n\nYou have stepped out of ${venue} at ${out}.\nReason: ${p.reason}\n\n` +
    `To come back in, show the re-entry QR attached below at the ${venue} desk. It works once, and your original QR won't let you back in while you are out.\n\n` +
    `If the image does not load, open: ${link}\n\nThank you,\nCoding Club RVCE\n`
  return { to: p.email, subject: REENTRY_SUBJECT, text, html, hasQr: true, qrUrl: link, qrFile: qrFilename(p.name, p.team, p.venue).replace(/\.png$/, '_reentry.png') }
}

export const PASSWORD_SUBJECT = 'Your CTF password'

// Sent to a player once they have checked in: the password an organiser assigned them.
export function renderPasswordEmail(p: { name: string; email: string; team: string | null; password: string }): Omit<RenderedEmail, 'qrUrl' | 'qrFile'> {
  const first = firstName(p.name)
  const url = config.ctfUrl
  const box = `${label('Your password', '0 0 12px')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
              <tr><td align="center" bgcolor="#000000" style="background:#000000;border:1px solid ${C.edge};border-radius:12px;padding:22px 16px;">
                <span style="font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:3px;color:${C.goldLight};">${esc(p.password)}</span>
              </td></tr>
            </table>`
  const html = page({
    first, link: null, venue: null,
    preheader: 'Your password for the CTF is inside.',
    intro: `You&#39;re checked in. Here is your password for ${esc(config.eventName)}${url ? `. Log in at <a href="${esc(url)}" target="_blank" style="color:${C.gold};">${esc(url.replace(/^https?:\/\//, ''))}</a>` : ''} with your registered email.`,
    rows: [['Email', esc(p.email)], ...(p.team ? [['Team', esc(p.team)] as [string, string]] : [])],
    middle: box,
    closing: 'Keep it to yourself and your team. Good luck!',
  })
  const text =
    `Hi ${first},\n\nYou're checked in. Here is your password for ${config.eventName}:\n\n    ${p.password}\n\n` +
    (url ? `Log in at ${url} with your registered email (${p.email}).\n\n` : `Log in with your registered email (${p.email}).\n\n`) +
    'Keep it to yourself and your team. Good luck!\n\nThank you,\nCoding Club RVCE\n'
  return { to: p.email, subject: PASSWORD_SUBJECT, text, html, hasQr: false }
}
