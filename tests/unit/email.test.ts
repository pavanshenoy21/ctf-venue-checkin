import { describe, expect, it } from 'vitest'
import { QR_SRC, renderEmail, SUBJECT } from '@/lib/email'

const tok = 'T'.repeat(32)

describe('renderEmail', () => {
  it('tells a team member their venue and team', () => {
    const m = renderEmail({ name: 'PAVAN SHENOY', email: 'p@x.io', team: 'Olympus', venue: 'DTH', token: tok })
    expect(m.subject).toBe(SUBJECT)
    expect(m.to).toBe('p@x.io')
    expect(m.text).toContain('Hello Pavan,')
    expect(m.text).toContain('You have been assigned to:\n\nDTH')
    expect(m.text).toContain('Team:\nOlympus')
    expect(m.text).toContain('Please report to the DTH venue for check-in.')
    expect(m.text).toContain(`https://ctf.test/checkin/${tok}`)
    expect(m.qrFile).toBe('PAVAN_SHENOY_Olympus_DTH.png')
  })
  it('uses the full ISE label', () => {
    const m = renderEmail({ name: 'Ana', email: 'a@x.io', team: 'Apollo', venue: 'ISE', token: tok })
    expect(m.text).toContain('ISE SEMINAR HALL')
    expect(m.html).toContain('<h1 style="margin:4px 0">ISE SEMINAR HALL</h1>')
  })
  it('tells a participant without a team they are solo, in DTH', () => {
    const m = renderEmail({ name: 'Ananya Rao', email: 'a@x.io', team: null, venue: 'DTH', token: tok })
    expect(m.text).toContain('You are participating without a team.')
    expect(m.text).toContain('Please report to DTH for check-in.')
    expect(m.text).not.toContain('Team:')
    expect(m.qrFile).toBe('Ananya_Rao_NoTeam_DTH.png')
  })
  it('escapes HTML in names and team names', () => {
    const m = renderEmail({ name: '<img src=x onerror=alert(1)>', email: 'a@x.io', team: '"><script>alert(1)</script>', venue: 'DTH', token: tok })
    expect(m.html).not.toMatch(/<script>|<img src=x/)
    expect(m.html).toContain('&lt;script&gt;')
  })
  it('has exactly one QR image placeholder', () => {
    const m = renderEmail({ name: 'A', email: 'a@x.io', team: null, venue: 'DTH', token: tok })
    expect(m.html.split(QR_SRC)).toHaveLength(2)
  })
  it('mentions nobody else', () => {
    const a = renderEmail({ name: 'Alice', email: 'alice@x.io', team: 'Owls', venue: 'ISE', token: 'A'.repeat(32) })
    for (const other of ['Bob', 'bob@x.io', 'B'.repeat(32)]) expect(a.text + a.html).not.toContain(other)
  })
})
