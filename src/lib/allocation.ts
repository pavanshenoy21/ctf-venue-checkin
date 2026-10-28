/**
 * Deterministic, constraint-aware lexicographic venue allocation.
 *
 * Teams are atomic and only sizes 1-3 exist, so teams of one size are interchangeable and the problem
 * reduces to choosing counts (n3, n2, n1) of teams sent to ISE:
 *
 *   maximise n3, then n2, then n1   (=> ISE utilisation is maximal given that order)
 *   subject to  3*n3 + 2*n2 + n1 <= ISE capacity
 *               total - ISE used   <= DTH capacity   (no-team people always count toward DTH)
 *
 * Scanning n3 high->low and n2 high->low with n1 as large as fits, the first feasible triple is the
 * lexicographic optimum. Which concrete teams of a size go to ISE is decided by sorted name.
 */

export interface TeamIn<K = number> {
  key: K
  name: string
  size: number
}

export interface Plan<K = number> {
  ok: boolean
  iseKeys: Set<K>
  dthKeys: Set<K>
  iseUsed: number
  dthUsed: number
  error?: string
  conflicts: { name: string; size: number }[]
}

// Same ordering as the Python version: case-folded name, then exact name, then key.
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const byName = <K>(a: TeamIn<K>, b: TeamIn<K>): number =>
  cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.name, b.name) || cmp(String(a.key), String(b.key))

export function planAllocation<K>(teams: TeamIn<K>[], noTeam: number, iseCap: number, dthCap: number): Plan<K> {
  for (const t of teams) {
    if (![1, 2, 3].includes(t.size)) throw new Error(`team "${t.name}" has invalid size ${t.size}`)
  }
  if (!Number.isInteger(noTeam) || noTeam < 0) throw new Error('noTeam must be a non-negative integer')
  const by: Record<1 | 2 | 3, TeamIn<K>[]> = { 1: [], 2: [], 3: [] }
  for (const t of teams) by[t.size as 1 | 2 | 3].push(t)
  for (const s of [1, 2, 3] as const) by[s].sort(byName)
  const [c1, c2, c3] = [by[1].length, by[2].length, by[3].length]
  const total = noTeam + teams.reduce((a, t) => a + t.size, 0)
  const allKeys = teams.map((t) => t.key)

  const build = (n3: number, n2: number, n1: number): Plan<K> => {
    const chosen = [...by[3].slice(0, n3), ...by[2].slice(0, n2), ...by[1].slice(0, n1)]
    const ise = new Set(chosen.map((t) => t.key))
    const used = 3 * n3 + 2 * n2 + n1
    return { ok: true, iseKeys: ise, dthKeys: new Set(allKeys.filter((k) => !ise.has(k))), iseUsed: used, dthUsed: total - used, conflicts: [] }
  }

  let bestFail: { used: number; triple: [number, number, number] } | null = null
  for (let n3 = Math.min(c3, Math.floor(iseCap / 3)); n3 >= 0; n3--) {
    for (let n2 = Math.min(c2, Math.floor((iseCap - 3 * n3) / 2)); n2 >= 0; n2--) {
      const n1 = Math.min(c1, iseCap - 3 * n3 - 2 * n2)
      const used = 3 * n3 + 2 * n2 + n1
      if (total - used <= dthCap) return build(n3, n2, n1)
      if (!bestFail || used > bestFail.used) bestFail = { used, triple: [n3, n2, n1] }
    }
  }

  // Infeasible: report against the arrangement that gets closest (most people in ISE).
  const near = bestFail ? build(...bestFail.triple) : build(0, 0, 0)
  const byKey = new Map(teams.map((t) => [t.key, t]))
  const conflicts = [...near.dthKeys].map((k) => byKey.get(k)!).sort((a, b) => b.size - a.size || byName(a, b))
  return {
    ok: false, iseKeys: new Set(), dthKeys: new Set(), iseUsed: near.iseUsed, dthUsed: near.dthUsed,
    conflicts: conflicts.map((t) => ({ name: t.name, size: t.size })),
    error:
      'ALLOCATION NOT POSSIBLE\n\nThe current venue capacities cannot accommodate all participants while keeping teams together. ' +
      `Total participants: ${total}; ISE capacity ${iseCap}, DTH capacity ${dthCap}; ${noTeam} no-team participants must be in DTH. ` +
      `Even filling ISE as far as possible (${near.iseUsed}), DTH would need ${near.dthUsed}.\n\nConflicting teams (would not fit in ISE):`,
  }
}
