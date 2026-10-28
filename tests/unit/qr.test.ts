import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { qrFilename, qrPng, qrUrl } from '@/lib/qr'
import { newQrToken } from '@/lib/security'

const decode = (png: Buffer): string | null => {
  const img = PNG.sync.read(png)
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null
}

describe('QR codes', () => {
  it('build the check-in URL from PUBLIC_BASE_URL, without a trailing slash', () => {
    const t = newQrToken()
    expect(qrUrl(t)).toBe(`https://ctf.test/checkin/${t}`)
    const prev = process.env.PUBLIC_BASE_URL
    process.env.PUBLIC_BASE_URL = 'https://event.example.edu///'
    expect(qrUrl(t)).toBe(`https://event.example.edu/checkin/${t}`)
    process.env.PUBLIC_BASE_URL = prev
  })
  it('render a PNG that decodes to exactly the check-in URL and nothing else', async () => {
    const t = newQrToken()
    const png = await qrPng(t)
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(decode(png)).toBe(`https://ctf.test/checkin/${t}`)
  })
  it('give different codes different images', async () => {
    expect((await qrPng(newQrToken())).equals(await qrPng(newQrToken()))).toBe(false)
  })
})

describe('qrFilename', () => {
  it('uses name, team and venue', () => {
    expect(qrFilename('Pavan Shenoy', 'Olympus', 'DTH')).toBe('Pavan_Shenoy_Olympus_DTH.png')
    expect(qrFilename('Ananya Rao', null, 'DTH')).toBe('Ananya_Rao_NoTeam_DTH.png')
  })
  it('makes unsafe characters filesystem-safe', () => {
    expect(qrFilename('../../etc/passwd', 'a/b\\c', 'ISE')).toBe('etc_passwd_a_b_c_ISE.png')
    expect(qrFilename('José Ñúñez', 'Café <script>', 'ISE')).toBe('Jose_Nunez_Cafe_script_ISE.png')
    expect(qrFilename('***', '!!!', null)).toBe('x_x_Unassigned.png')
  })
})
