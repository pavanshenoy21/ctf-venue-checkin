import QRCode from 'qrcode'
import { config, type Venue } from './config'

// The QR holds only this URL: an opaque token, never names, venues or IDs.
export const qrUrl = (token: string): string => `${config.publicBaseUrl}/checkin/${token}`

export function qrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(qrUrl(token), { errorCorrectionLevel: 'M', type: 'png', margin: 4, scale: 10, color: { dark: '#000000', light: '#ffffff' } })
}

// Decompose accents (é -> e + ◌́), drop the combining marks, then collapse anything else to "_".
const safe = (s: string): string =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x'

// e.g. Pavan_Shenoy_Olympus_DTH.png / Ananya_Rao_NoTeam_DTH.png
export function qrFilename(name: string, team: string | null, venue: Venue | null): string {
  return `${safe(name)}_${team ? safe(team) : 'NoTeam'}_${venue ?? 'Unassigned'}.png`
}
