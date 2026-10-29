import { describe, expect, it } from 'vitest'
import { LOGO_SRC, QR_SRC, QR_SUBJECT, renderEmail, renderQrEmail, SUBJECT } from '@/lib/email'

const tok = 'T'.repeat(32)

describe('renderEmail', () => {
  it('tells a team member their venue and team', () => {
    const m = renderEmail({ name: 'PAVAN SHENOY', email: 'p@x.io', team: 'Olympus', venue: 'DTH', token: tok })
    expect(m.subject).toBe(SUBJECT)
    expect(m.to).toBe('p@x.io')
    expect(m.text).toContain('Hi Pavan,')
    expect(m.text).toContain('You have been assigned to:\n\nDTH')
    expect(m.text).toContain('Team:\nOlympus')
    expect(m.text + m.html).not.toContain('Rules for participants without a team')
    expect(m.text).toContain('Please report to the DTH venue for check-in at 12:30 PM.')
    expect(m.text).toContain(`https://ctf.test/checkin/${tok}`)
    expect(m.qrFile).toBe('PAVAN_SHENOY_Olympus_DTH.png')
  })
  it('uses the full ISE label', () => {
    const m = renderEmail({ name: 'Ana', email: 'a@x.io', team: 'Apollo', venue: 'ISE', token: tok })
    expect(m.text).toContain('ISE SEMINAR HALL')
    expect(m.html).toContain('>ISE Seminar Hall</p>')
  })
  it('gives a participant without a team the DTH rules and no QR', () => {
    const m = renderEmail({ name: 'Ananya Rao', email: 'a@x.io', team: null, venue: 'DTH', token: tok })
    expect(m.hasQr).toBe(false)
    expect(m.html).not.toContain(QR_SRC)
    expect(m.text + m.html).not.toContain(tok)
    expect(m.text).toContain('You are participating without a team.')
    expect(m.text).toContain('Please report to DTH in person (11:00 AM – 12:20 PM).')
    expect(m.text).toContain('we will email you your check-in QR. You will use it for entry at 12:30 PM.')
    expect(m.text).not.toContain('Team:')
    expect(m.text).toContain('1. Come to DTH in person between 11:00 AM and 12:20 PM.')
    expect(m.text).toContain('This can only be done in person at DTH.')
    expect(m.text).toContain('by 12:20 PM, you will not be able to take part')
    expect(m.html).toContain('Rules for participants without a team')
    expect(m.qrFile).toBe('Ananya_Rao_NoTeam_DTH.png')
  })
  it('escapes HTML in names and team names', () => {
    const m = renderEmail({ name: '<img src=x onerror=alert(1)>', email: 'a@x.io', team: '"><script>alert(1)</script>', venue: 'DTH', token: tok })
    expect(m.html).not.toMatch(/<script>|<img src=x/)
    expect(m.html).toContain('&lt;script&gt;')
  })
  it('greets people with initials by their first real name', () => {
    expect(renderEmail({ name: 'D KARTHIKEYAN', email: 'k@x.io', team: null, venue: 'DTH', token: tok }).text).toContain('Hi Karthikeyan,')
  })
  it('team emails have exactly one QR image and one logo placeholder', () => {
    const m = renderEmail({ name: 'A', email: 'a@x.io', team: 'Owls', venue: 'DTH', token: tok })
    expect(m.hasQr).toBe(true)
    expect(m.html.split(QR_SRC)).toHaveLength(2)
    expect(m.html.split(LOGO_SRC)).toHaveLength(2)
  })
  it('mentions nobody else', () => {
    const a = renderEmail({ name: 'Alice', email: 'alice@x.io', team: 'Owls', venue: 'ISE', token: 'A'.repeat(32) })
    for (const other of ['Bob', 'bob@x.io', 'B'.repeat(32)]) expect(a.text + a.html).not.toContain(other)
  })
})

describe('renderQrEmail', () => {
  it('sends someone without a team their check-in QR for 12:30 entry', () => {
    const m = renderQrEmail({ name: 'Ananya Rao', email: 'a@x.io', team: null, venue: 'DTH', token: tok })
    expect(m.subject).toBe(QR_SUBJECT)
    expect(m.hasQr).toBe(true)
    expect(m.html.split(QR_SRC)).toHaveLength(2)
    expect(m.text).toContain('Hi Ananya,')
    expect(m.text).toContain('Please show your check-in QR at the DTH desk at 12:30 PM for entry.')
    expect(m.text).toContain(`https://ctf.test/checkin/${tok}`)
    expect(m.text + m.html).not.toContain('Rules for participants without a team')
  })
})
