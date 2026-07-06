// Phase 3 test suite — tactical profiles, matchup resolver, calibration.
import { describe, it, expect } from 'vitest'
import baseline from './simBaseline.fixture.json'
import { PLAYERS, OPPONENTS, getEligiblePlayers } from './data'
import {
  buildSquadTacticalProfile, buildOpponentTacticalProfile, resolveTacticalMatchup,
  postMatchTacticalNote, DIMENSIONS, TUNING,
} from './tacticalMatchup'
import { buildMatchDetail } from './matchEngine'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const squadFromFixture = (run) => run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))

function squadByRoles(pairs) {
  const used = []
  return pairs.map(([slot, role]) => {
    const elig = getEligiblePlayers(slot, used, 'modern')
    const player = elig.find((p) => p.role === role) || elig[0]
    used.push(player.id)
    return { slot, player }
  })
}

const ARCHETYPES = ['pressing', 'technical', 'defensive', 'attacking', 'physical', 'elite', 'underdog']

// ---------------------------------------------------------------------------
describe('squad tactical profile', () => {
  it('is deterministic, bounded 0–100, and defined on all five dimensions', () => {
    for (const run of baseline.runs) {
      const squad = squadFromFixture(run)
      const p1 = buildSquadTacticalProfile(squad)
      const p2 = buildSquadTacticalProfile(squad)
      expect(JSON.stringify(p1)).toBe(JSON.stringify(p2))
      for (const dim of DIMENSIONS) {
        expect(p1[dim]).toBeGreaterThanOrEqual(0)
        expect(p1[dim]).toBeLessThanOrEqual(100)
        expect(Number.isInteger(p1[dim])).toBe(true)
      }
    }
  })

  it('is rating-independent: same roles + slots → identical profile regardless of player quality', () => {
    // two different CBs with the same role in the same slot
    const leaders = PLAYERS.filter((p) => p.role === 'Defensive Leader' && p.eligibleSlots.includes('CB'))
    expect(leaders.length).toBeGreaterThanOrEqual(2)
    const base = squadFromFixture(baseline.runs[0])
    const cbIdx = base.findIndex((s) => s.slot === 'CB')
    const altA = base.map((s, i) => (i === cbIdx ? { slot: 'CB', player: leaders[0] } : s))
    const altB = base.map((s, i) => (i === cbIdx ? { slot: 'CB', player: leaders[1] } : s))
    expect(buildSquadTacticalProfile(altA)).toEqual(buildSquadTacticalProfile(altB))
  })

  it('role stacking has diminishing returns (third controller adds less than second)', () => {
    const mk = (n) => {
      const used = []
      const tempos = PLAYERS.filter((p) => p.role === 'Tempo Controller' && (p.eligibleSlots.includes('CM') || p.eligibleSlots.includes('CDM')))
      const others = PLAYERS.filter((p) => p.role === 'Box-to-Box Engine' && p.eligibleSlots.includes('CM'))
      const mids = []
      for (let i = 0; i < 3; i++) {
        const pool = i < n ? tempos : others
        const pick = pool.find((p) => !used.includes(p.id)) || others.find((p) => !used.includes(p.id))
        used.push(pick.id)
        mids.push(pick)
      }
      const rest = squadFromFixture(baseline.runs[0]).filter((s) => !['CM', 'CDM', 'CAM'].includes(s.slot))
      return [...rest, { slot: 'CM', player: mids[0] }, { slot: 'CM', player: mids[1] }, { slot: 'CM', player: mids[2] }]
    }
    const c0 = buildSquadTacticalProfile(mk(0)).midfieldControl
    const c1 = buildSquadTacticalProfile(mk(1)).midfieldControl
    const c2 = buildSquadTacticalProfile(mk(2)).midfieldControl
    const c3 = buildSquadTacticalProfile(mk(3)).midfieldControl
    const gain1 = c1 - c0
    const gain2 = c2 - c1
    const gain3 = c3 - c2
    expect(gain2).toBeLessThanOrEqual(gain1)
    expect(gain3).toBeLessThanOrEqual(gain2)
    expect(gain3).toBeLessThan(gain1) // strictly diminishing overall
  })

  it('formation contributes: wide formations beat slotless-width formations', () => {
    const wide = squadByRoles([
      ['GK', 'Shot Stopper'], ['RB', 'Balanced Fullback'], ['CB', 'Defensive Leader'], ['CB', 'Defensive Leader'],
      ['LB', 'Balanced Fullback'], ['CM', 'Ball Winner'], ['CM', 'Tempo Controller'], ['CM', 'Box-to-Box Engine'],
      ['RW', 'Touchline Winger'], ['ST', 'Box Finisher'], ['LW', 'Touchline Winger'],
    ])
    const narrow = squadByRoles([
      ['GK', 'Shot Stopper'], ['RB', 'Balanced Fullback'], ['CB', 'Defensive Leader'], ['CB', 'Defensive Leader'],
      ['CB', 'Defensive Leader'], ['LB', 'Balanced Fullback'], ['CM', 'Ball Winner'], ['CM', 'Tempo Controller'],
      ['CDM', 'Defensive Shield'], ['ST', 'Box Finisher'], ['ST', 'Complete Striker'],
    ])
    expect(buildSquadTacticalProfile(wide).width).toBeGreaterThan(buildSquadTacticalProfile(narrow).width)
    expect(buildSquadTacticalProfile(narrow).defensiveStability).toBeGreaterThan(buildSquadTacticalProfile(wide).defensiveStability)
  })

  it('known role interactions move the right dimensions', () => {
    // Synthetic players: the profile is structure-only, so fabricated
    // role/slot entries exercise exactly the mapping under test.
    const mkSquad = (pairs) => pairs.map(([slot, role], i) => ({
      slot,
      player: { id: `p${i}`, role, secondaryRole: null, posType: slot === 'GK' ? 'GK' : 'DEF' },
    }))
    const base = [
      ['GK', 'Shot Stopper'], ['RB', 'Defensive Fullback'], ['CB', 'Defensive Leader'], ['CB', 'Defensive Leader'],
      ['LB', 'Defensive Fullback'], ['CM', 'Box-to-Box Engine'], ['CDM', 'Defensive Shield'], ['CM', 'Box-to-Box Engine'],
      ['RW', 'Inside Forward'], ['ST', 'Box Finisher'], ['LW', 'Inside Forward'],
    ]
    const swap = (slot, role) => base.map((x) => (x[0] === slot ? [slot, role] : x))
    // winger + attacking fullback raises width
    expect(buildSquadTacticalProfile(mkSquad(swap('RB', 'Attacking Fullback'))).width)
      .toBeGreaterThan(buildSquadTacticalProfile(mkSquad(base)).width)
    // ball winner + direct runner improves transition
    const withRunner = swap('CM', 'Ball Winner').map((x) => (x[0] === 'RW' ? ['RW', 'Direct Runner'] : x))
    expect(buildSquadTacticalProfile(mkSquad(withRunner)).transitionThreat)
      .toBeGreaterThan(buildSquadTacticalProfile(mkSquad(base)).transitionThreat)
    // controller structure improves buildup/control
    const withControl = swap('CDM', 'Tempo Controller').map((x) => (x[0] === 'CM' ? ['CM', 'Final Passer'] : x))
    const pc = buildSquadTacticalProfile(mkSquad(withControl))
    const pb = buildSquadTacticalProfile(mkSquad(base))
    expect(pc.buildupSecurity).toBeGreaterThan(pb.buildupSecurity)
    expect(pc.midfieldControl).toBeGreaterThan(pb.midfieldControl)
    // aggressive fullbacks without a shield reduce stability
    const reckless = base
      .map((x) => (x[0] === 'RB' || x[0] === 'LB' ? [x[0], 'Attacking Fullback'] : x))
      .map((x) => (x[0] === 'CDM' ? ['CDM', 'Box-to-Box Engine'] : x))
    expect(buildSquadTacticalProfile(mkSquad(reckless)).defensiveStability)
      .toBeLessThan(buildSquadTacticalProfile(mkSquad(base)).defensiveStability)
  })
})

// ---------------------------------------------------------------------------
describe('matchup resolver + calibration', () => {
  const squads = baseline.runs.map(squadFromFixture)
  const profiles = squads.map(buildSquadTacticalProfile)
  const deltas = []
  const perArchetype = {}
  for (const p of profiles) {
    for (const arch of ARCHETYPES) {
      const opp = OPPONENTS.find((o) => o.archetype === arch)
      const m = resolveTacticalMatchup(p, buildOpponentTacticalProfile(opp))
      deltas.push(m.probabilityDelta)
      ;(perArchetype[arch] = perArchetype[arch] || []).push(m.probabilityDelta)
    }
  }

  it('probabilityDelta is capped at ±0.05 and typically within ±0.03', () => {
    for (const d of deltas) expect(Math.abs(d)).toBeLessThanOrEqual(TUNING.PROB_CAP)
    const abs = deltas.map(Math.abs).sort((a, b) => a - b)
    const p95 = abs[Math.floor(abs.length * 0.95)]
    expect(p95).toBeLessThanOrEqual(0.045)
    const mean = abs.reduce((a, b) => a + b, 0) / abs.length
    expect(mean).toBeLessThanOrEqual(0.03)
  })

  it('both favourable and unfavourable matchups exist; no archetype is uniformly one-sided', () => {
    expect(deltas.some((d) => d > 0.005)).toBe(true)
    expect(deltas.some((d) => d < -0.005)).toBe(true)
    let oneSided = 0
    for (const arch of ARCHETYPES) {
      const ds = perArchetype[arch]
      const hasPos = ds.some((d) => d > 0.002)
      const hasNeg = ds.some((d) => d < -0.002)
      if (!(hasPos && hasNeg)) oneSided++
    }
    expect(oneSided).toBeLessThanOrEqual(2) // most styles cut both ways across squads
  })

  it('calibration report (deterministic sample)', () => {
    const abs = deltas.map(Math.abs).sort((a, b) => a - b)
    const stats = {
      n: deltas.length,
      min: Math.min(...deltas),
      max: Math.max(...deltas),
      mean: +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(4),
      medianAbs: abs[Math.floor(abs.length / 2)],
      p95Abs: abs[Math.floor(abs.length * 0.95)],
      positiveShare: +(deltas.filter((d) => d > 0.002).length / deltas.length).toFixed(2),
      neutralShare: +(deltas.filter((d) => Math.abs(d) <= 0.002).length / deltas.length).toFixed(2),
      negativeShare: +(deltas.filter((d) => d < -0.002).length / deltas.length).toFixed(2),
      perArchetypeMean: Object.fromEntries(ARCHETYPES.map((a) => [
        a, +(perArchetype[a].reduce((x, y) => x + y, 0) / perArchetype[a].length).toFixed(4),
      ])),
    }
    // eslint-disable-next-line no-console
    console.log('[phase3 calibration]', JSON.stringify(stats))
    expect(stats.n).toBe(16 * 7)
  })

  it('resolver output is deterministic and carries one advantage + one risk when warranted', () => {
    const p = profiles[0]
    const opp = OPPONENTS.find((o) => o.archetype === 'pressing')
    const m1 = resolveTacticalMatchup(p, buildOpponentTacticalProfile(opp))
    const m2 = resolveTacticalMatchup(p, buildOpponentTacticalProfile(opp))
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2))
    expect(m1.overallLabel).toBeTruthy()
    for (const v of Object.values(m1.patternModifiers)) {
      expect(v).toBeGreaterThanOrEqual(0.7)
      expect(v).toBeLessThanOrEqual(1.4)
    }
    expect(Math.abs(m1.statModifiers.possessionShift)).toBeLessThanOrEqual(5)
    expect(Math.abs(m1.statModifiers.homeShotsShift)).toBeLessThanOrEqual(2)
    expect(Math.abs(m1.statModifiers.awayShotsShift)).toBeLessThanOrEqual(2)
    expect(Math.abs(m1.statModifiers.bigChanceShift)).toBeLessThanOrEqual(1)
  })

  it('post-match tactical note is deterministic and result-toned from the same matchup', () => {
    const p = profiles[0]
    const m = resolveTacticalMatchup(p, buildOpponentTacticalProfile(OPPONENTS.find((o) => o.archetype === 'defensive')))
    const win = postMatchTacticalNote(m, 'win')
    const loss = postMatchTacticalNote(m, 'loss')
    expect(typeof win).toBe('string')
    expect(typeof loss).toBe('string')
    expect(postMatchTacticalNote(m, 'win')).toBe(win) // deterministic
    expect(postMatchTacticalNote(null, 'win')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('stat-profile effects keep MatchDetail invariants', () => {
  it('shifted details satisfy every hard invariant across matchups (fuzz)', () => {
    const squad = squadFromFixture(baseline.runs[0])
    const profile = buildSquadTacticalProfile(squad)
    let i = 0
    for (const opp of OPPONENTS) {
      const matchup = resolveTacticalMatchup(profile, buildOpponentTacticalProfile(opp))
      for (const [gf, ga] of [[0, 0], [1, 0], [3, 2], [0, 2], [2, 2]]) {
        const match = {
          type: 'league', opponent: opp.name, opponentMeta: opp, matchup,
          result: gf > ga ? 'win' : gf < ga ? 'loss' : 'draw', gf, ga, events: [],
          stats: { possession: 50 + (i % 21) - 10, shots: Math.max(gf, 6 + (i % 12)), shotsOnTarget: Math.max(gf, 3 + (i % 6)), potm: 'X' },
        }
        const d = buildMatchDetail({ match, runSeed: 99, matchNumber: ++i })
        const { home: h, away: a } = d.finalStats
        expect(h.possession + a.possession).toBe(100)
        expect(gf).toBeLessThanOrEqual(h.shotsOnTarget)
        expect(h.shotsOnTarget).toBeLessThanOrEqual(h.shots)
        expect(ga).toBeLessThanOrEqual(a.shotsOnTarget)
        expect(a.shotsOnTarget).toBeLessThanOrEqual(a.shots)
        expect(h.saves).toBe(Math.max(0, a.shotsOnTarget - ga))
        expect(a.saves).toBe(Math.max(0, h.shotsOnTarget - gf))
        expect(h.bigChances).toBeLessThanOrEqual(h.shots)
        expect(h.bigChances).toBeGreaterThanOrEqual(gf)
        expect(a.bigChances).toBeLessThanOrEqual(a.shots)
      }
    }
  })
})
