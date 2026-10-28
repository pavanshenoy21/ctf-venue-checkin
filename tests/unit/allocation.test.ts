import { describe, expect, it } from 'vitest'
import { planAllocation, type Plan, type TeamIn } from '@/lib/allocation'

const mk = (c3: number, c2: number, c1: number): TeamIn<string>[] => {
  const out: TeamIn<string>[] = []
  for (const [size, n] of [[3, c3], [2, c2], [1, c1]] as const)
    for (let i = 0; i < n; i++) out.push({ key: `${size}-${i}`, name: `T${size}_${String(i).padStart(3, '0')}`, size })
  return out
}
const counts = (p: Plan<string>, teams: TeamIn<string>[]): [number, number, number] => {
  const size = new Map(teams.map((t) => [t.key, t.size]))
  const c = { 3: 0, 2: 0, 1: 0 } as Record<number, number>
  for (const k of p.iseKeys) c[size.get(k)!]!++
  return [c[3]!, c[2]!, c[1]!]
}
function invariants(p: Plan<string>, teams: TeamIn<string>[], noTeam: number, ise = 113, dth = 145) {
  expect(p.ok).toBe(true)
  const size = new Map(teams.map((t) => [t.key, t.size]))
  for (const k of p.iseKeys) expect(p.dthKeys.has(k)).toBe(false)                  // one venue per team
  expect(new Set([...p.iseKeys, ...p.dthKeys])).toEqual(new Set(teams.map((t) => t.key))) // nobody dropped
  const iseUsed = [...p.iseKeys].reduce((a, k) => a + size.get(k)!, 0)
  expect(iseUsed).toBe(p.iseUsed)
  expect(iseUsed).toBeLessThanOrEqual(ise)
  expect([...p.dthKeys].reduce((a, k) => a + size.get(k)!, 0) + noTeam).toBeLessThanOrEqual(dth)
}
// Small deterministic PRNG so the randomised test is repeatable.
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

describe('planAllocation', () => {
  it('seats a lone team of each size in ISE', () => {
    for (const size of [1, 2, 3]) {
      const t = [{ key: 'a', name: 'A', size }]
      const p = planAllocation(t, 0, 113, 145)
      invariants(p, t, 0)
      expect([...p.iseKeys]).toEqual(['a'])
    }
  })

  it('matches the brief example: 3-member teams first, then 2, then 1', () => {
    const t = mk(20, 15, 10)
    const p = planAllocation(t, 20, 113, 145)
    invariants(p, t, 20)
    expect(counts(p, t)).toEqual([20, 15, 10])
    expect(p.iseUsed).toBe(100)
  })

  it('fills ISE with the maximum number of 3-member teams (real event shape)', () => {
    const t = mk(56, 24, 11)
    const p = planAllocation(t, 26, 113, 145)
    invariants(p, t, 26)
    expect(counts(p, t)).toEqual([37, 1, 0])
    expect([p.iseUsed, p.dthUsed]).toEqual([113, 140])
  })

  it('never moves a 3-member team out of ISE just to balance venues', () => {
    const p = planAllocation(mk(30, 0, 0), 0, 113, 145)
    expect(p.iseUsed).toBe(90)
    expect(p.dthUsed).toBe(0)
  })

  it('sends a team that does not fit whole to DTH instead of splitting it', () => {
    const three = mk(38, 0, 0)
    const p3 = planAllocation(three, 0, 113, 145)
    expect(counts(p3, three)[0]).toBe(37)           // 111 used; a 3-team can't fit in the last 2 seats
    expect(p3.iseUsed).toBe(111)
    const pairs = mk(0, 57, 0)
    const p2 = planAllocation(pairs, 0, 113, 145)
    expect(p2.iseUsed).toBe(112)                      // 56 pairs; the 57th pair goes wholly to DTH
    expect(p2.dthKeys.size).toBe(1)
    expect(planAllocation(mk(37, 1, 0), 0, 113, 145).iseUsed).toBe(113)
  })

  it('counts no-team participants toward DTH only', () => {
    const p = planAllocation(mk(1, 0, 0), 144, 113, 145)
    expect(p.ok).toBe(true)
    expect(p.dthUsed).toBe(144)
    expect(planAllocation([], 146, 113, 145).ok).toBe(false)
  })

  it('puts more into ISE when the strict order would overflow DTH', () => {
    const t = mk(0, 0, 150)
    const p = planAllocation(t, 108, 113, 145)        // 258 people = combined capacity
    invariants(p, t, 108)
    expect(p.iseUsed).toBe(113)
  })

  it('reports an impossible allocation with the conflicting teams and assigns nobody', () => {
    const p = planAllocation(mk(80, 0, 0), 30, 113, 145) // 270 people > 258 seats
    expect(p.ok).toBe(false)
    expect(p.error).toMatch(/^ALLOCATION NOT POSSIBLE/)
    expect(p.iseKeys.size + p.dthKeys.size).toBe(0)
    expect(p.conflicts.length).toBeGreaterThan(0)
    expect(p.conflicts.every((c) => c.size === 3 && c.name)).toBe(true)
  })

  it('handles an empty event', () => {
    const p = planAllocation([], 0, 113, 145)
    expect(p.ok).toBe(true)
    expect(p.iseUsed + p.dthUsed).toBe(0)
  })

  it('rejects invalid team sizes and counts', () => {
    expect(() => planAllocation([{ key: 1, name: 'Big', size: 4 }], 0, 113, 145)).toThrow(/invalid size 4/)
    expect(() => planAllocation([{ key: 1, name: 'None', size: 0 }], 0, 113, 145)).toThrow()
    expect(() => planAllocation([], -1, 113, 145)).toThrow()
  })

  it('picks teams of a size by name, regardless of input order (deterministic)', () => {
    const t: TeamIn<number>[] = ['zeus', 'Athena', 'apollo', 'Hermes'].map((name, key) => ({ key, name, size: 3 }))
    const p = planAllocation(t, 0, 6, 145)            // room for two
    expect(new Set([...p.iseKeys].map((k) => t[k]!.name))).toEqual(new Set(['apollo', 'Athena']))
    expect(planAllocation([...t].reverse(), 0, 6, 145).iseKeys).toEqual(p.iseKeys)
  })

  it('equals a brute-force search over every combination', () => {
    const r = rng(7)
    const n = (max: number) => Math.floor(r() * (max + 1))
    for (let run = 0; run < 120; run++) {
      const [c3, c2, c1] = [n(12), n(12), n(12)]
      const noTeam = n(10), ise = 5 + n(35), dth = 10 + n(70)
      const t = mk(c3, c2, c1)
      const p = planAllocation(t, noTeam, ise, dth)
      expect(planAllocation([...t].reverse(), noTeam, ise, dth).iseKeys).toEqual(p.iseKeys)
      const total = noTeam + 3 * c3 + 2 * c2 + c1
      let best: [number, number, number] | null = null
      for (let a = 0; a <= c3; a++) for (let b = 0; b <= c2; b++) for (let c = 0; c <= c1; c++) {
        const used = 3 * a + 2 * b + c
        if (used > ise || total - used > dth) continue
        const cand: [number, number, number] = [a, b, c]
        if (!best || cand[0] > best[0] || (cand[0] === best[0] && (cand[1] > best[1] || (cand[1] === best[1] && cand[2] > best[2])))) best = cand
      }
      if (!best) expect(p.ok).toBe(false)
      else { invariants(p, t, noTeam, ise, dth); expect(counts(p, t)).toEqual(best) }
    }
  })
})
