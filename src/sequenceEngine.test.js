// Phase 2 test suite — participant-based possession sequences.
//
// 1. Sequence determinism (same MatchDetail → byte-identical sequences)
// 2. Participant validity (every reference resolves to the XI / away dots)
// 3. Role-pattern weighting (role-heavy squads prefer fitting patterns)
// 4. Outcome reconciliation (visible sequences never exceed canonical stats,
//    goal sequences exactly equal the score)
// 5. No RNG regression (covered by matchEngine.test.js baseline — re-run)
import { describe, it, expect } from 'vitest'
import baseline from './simBaseline.fixture.json'
import { PLAYERS, FORMATIONS, computeRating, simulate, makeRng, getEligiblePlayers } from './data'
import { buildMatchTimeline } from './matchTimeline'
import { squadPatternWeights, projectHomeDots, layoutAwayDots, SEQ_PATTERNS } from './sequenceEngine'
import { computeStats } from './MatchCenter'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const squadFromFixture = (run) => run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))
const allRunMatches = (r) => [...r.leaguePhase.matches, ...(r.playoff ? [r.playoff] : []), ...r.knockouts]

function simulateRun(run) {
  const squad = squadFromFixture(run)
  const { total } = computeRating(squad)
  const result = simulate({
    rating: total, difficulty: run.config.difficulty, squad,
    rng: makeRng(run.seed), runSeed: run.seed,
  })
  return { squad, result, players: squad.map((s) => s.player) }
}

// Deterministic role-targeted squad builder: for each (slot, wantedRole) pick
// the first eligible player with that role, else the first eligible player.
function squadByRoles(pairs) {
  const used = []
  return pairs.map(([slot, role]) => {
    const elig = getEligiblePlayers(slot, used, 'modern')
    const player = elig.find((p) => p.role === role) || elig[0]
    used.push(player.id)
    return { slot, player }
  })
}

const WIDE_FAMILY = new Set(['wide_overlap', 'cross', 'cutback'])

// ---------------------------------------------------------------------------
describe('1. sequence determinism', () => {
  it('same match + squad → byte-identical sequences (including replays)', () => {
    const run = baseline.runs[0]
    const { squad, result, players } = simulateRun(run)
    for (const m of allRunMatches(result).slice(0, 4)) {
      const t1 = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
      const t2 = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
      expect(JSON.stringify(t1.events.map((e) => e.seq))).toBe(JSON.stringify(t2.events.map((e) => e.seq)))
    }
  })

  it('every shot-like event carries a sequence; no-ball events do not', () => {
    const run = baseline.runs[1]
    const { squad, result, players } = simulateRun(run)
    for (const m of allRunMatches(result)) {
      const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
      for (const e of tl.events) {
        if (['goal', 'save', 'shot', 'chance'].includes(e.type)) {
          expect(e.seq).toBeTruthy()
          expect(e.seq.touches.length).toBeGreaterThanOrEqual(2)
          expect(e.seq.pattern).toBeTruthy()
          expect(e.seq.outcome.description).toBeTruthy()
        } else {
          expect(e.seq).toBeUndefined()
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
describe('2. participant validity', () => {
  it('home participants are real XI players; away references valid away dots', () => {
    const awayNums = new Set(layoutAwayDots().map((d) => d.num))
    for (const run of baseline.runs.slice(0, 5)) {
      const { squad, result, players } = simulateRun(run)
      const squadIds = new Set(squad.map((s) => s.player.id))
      for (const m of allRunMatches(result)) {
        const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
        for (const e of tl.events) {
          if (!e.seq) continue
          for (const t of e.seq.touches) {
            if (e.team === 'home') {
              expect(squadIds.has(t.playerId)).toBe(true)
              expect(typeof t.playerName).toBe('string')
              expect(t.playerName.length).toBeGreaterThan(0)
            } else {
              expect(t.playerId).toBeNull()
              expect(awayNums.has(t.awayNum)).toBe(true)
            }
            expect(t.at.x).toBeGreaterThanOrEqual(0)
            expect(t.at.x).toBeLessThanOrEqual(100)
            expect(t.at.y).toBeGreaterThanOrEqual(0)
            expect(t.at.y).toBeLessThanOrEqual(64)
          }
        }
      }
    }
  })

  it('goal sequences finish with the real scorer, assisted by the real assister', () => {
    for (const run of baseline.runs.slice(0, 6)) {
      const { squad, result, players } = simulateRun(run)
      for (const m of allRunMatches(result)) {
        const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
        for (const e of tl.events) {
          if (e.type !== 'goal' || e.team !== 'home' || !e.seq) continue
          const last = e.seq.touches[e.seq.touches.length - 1]
          expect(last.playerName).toBe(e.scorer)
          if (e.assister) {
            // the assister must appear in the sequence before the finish
            const names = e.seq.touches.slice(0, -1).map((t) => t.playerName)
            expect(names).toContain(e.assister)
          }
        }
      }
    }
  })

  it('projected home dots cover all 11 players inside the home shape', () => {
    const squad = squadFromFixture(baseline.runs[0])
    const dots = projectHomeDots(squad)
    expect(dots).toHaveLength(11)
    const ids = new Set(dots.map((d) => d.id))
    expect(ids.size).toBe(11)
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(3)
      expect(d.x).toBeLessThanOrEqual(49)
      expect(d.possX).toBeGreaterThanOrEqual(3)
      expect(d.y).toBeGreaterThanOrEqual(4)
      expect(d.y).toBeLessThanOrEqual(60)
    }
    expect(dots.filter((d) => d.gk)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
describe('3. role-pattern weighting', () => {
  // Wide XI: attacking fullbacks + touchline wingers + box finisher.
  const wideSquad = squadByRoles([
    ['GK', 'Shot Stopper'], ['RB', 'Attacking Fullback'], ['CB', 'Defensive Leader'], ['CB', 'Defensive Leader'],
    ['LB', 'Attacking Fullback'], ['CM', 'Box-to-Box Engine'], ['CM', 'Ball Winner'], ['CM', 'Box-to-Box Engine'],
    ['RW', 'Touchline Winger'], ['ST', 'Box Finisher'], ['LW', 'Touchline Winger'],
  ])
  // Central XI: tempo controllers + creators, defensive fullbacks, no wingers.
  const centralSquad = squadByRoles([
    ['GK', 'Shot Stopper'], ['RB', 'Defensive Fullback'], ['CB', 'Ball-Playing Defender'], ['CB', 'Defensive Leader'],
    ['LB', 'Defensive Fullback'], ['CDM', 'Defensive Shield'], ['CDM', 'Tempo Controller'], ['CAM', 'Final Passer'],
    ['RW', 'Inside Forward'], ['CAM', 'Creative Magician'], ['ST', 'Link-Up Striker'],
  ])

  it('pattern weights follow the squad role profile', () => {
    const w = squadPatternWeights(wideSquad)
    const c = squadPatternWeights(centralSquad)
    expect(w.cross).toBeGreaterThan(c.cross)
    expect(w.wide_overlap).toBeGreaterThan(c.wide_overlap)
    expect(c.through_ball).toBeGreaterThan(w.through_ball)
    expect(c.central_buildup).toBeGreaterThan(w.central_buildup)
    expect(c.one_two).toBeGreaterThan(w.one_two)
    for (const p of SEQ_PATTERNS) {
      expect(w[p]).toBeGreaterThan(0) // every pattern stays reachable
      expect(c[p]).toBeGreaterThan(0)
    }
  })

  it('across deterministic seed samples, wide squads play wide patterns more often', () => {
    function patternShare(squad, family) {
      const players = squad.map((s) => s.player)
      let inFamily = 0
      let total = 0
      for (let i = 0; i < 120; i++) {
        // vary the match facts → different presentationSeed → seed sample
        const match = {
          type: 'league', opponent: `Sample FC ${i}`, result: 'win', gf: 1, ga: 0,
          events: [{ minute: 20 + (i % 60), side: 'us', scorer: players[9].name, assist: null }],
          stats: { possession: 55, shots: 14, shotsOnTarget: 6, potm: players[9].name },
        }
        const tl = buildMatchTimeline(match, players, 'S', 'Team', null, squad)
        for (const e of tl.events) {
          if (!e.seq || e.team !== 'home') continue
          total++
          if (family.has(e.seq.pattern)) inFamily++
        }
      }
      return inFamily / total
    }
    const wideShare = patternShare(wideSquad, WIDE_FAMILY)
    const centralShare = patternShare(centralSquad, WIDE_FAMILY)
    expect(wideShare).toBeGreaterThan(centralShare * 1.5)
  })
})

// ---------------------------------------------------------------------------
describe('4. outcome reconciliation with canonical MatchDetail', () => {
  it('goal sequences equal the score; visible shot/SOT/save/big-chance sequences never exceed canonical totals', () => {
    for (const run of baseline.runs) {
      const { squad, result, players } = simulateRun(run)
      for (const m of allRunMatches(result)) {
        const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
        const d = m.detail.finalStats
        const seqs = tl.events.filter((e) => e.seq).map((e) => e.seq)
        const sum = (team, key) => seqs.filter((s) => s.team === team).reduce((a, s) => a + s.statImpact[key], 0)
        expect(sum('home', 'goals')).toBe(m.gf)
        expect(sum('away', 'goals')).toBe(m.ga)
        expect(sum('home', 'shots')).toBeLessThanOrEqual(d.home.shots)
        expect(sum('away', 'shots')).toBeLessThanOrEqual(d.away.shots)
        expect(sum('home', 'shotsOnTarget')).toBeLessThanOrEqual(d.home.shotsOnTarget)
        expect(sum('away', 'shotsOnTarget')).toBeLessThanOrEqual(d.away.shotsOnTarget)
        // saves are credited to the defending team
        expect(sum('away', 'saves')).toBeLessThanOrEqual(d.home.saves)
        expect(sum('home', 'saves')).toBeLessThanOrEqual(d.away.saves)
        expect(sum('home', 'bigChances')).toBeLessThanOrEqual(d.home.bigChances)
        expect(sum('away', 'bigChances')).toBeLessThanOrEqual(d.away.bigChances)
        // every goal counts as a big chance
        for (const s of seqs) if (s.statImpact.goals) expect(s.statImpact.bigChances).toBe(1)
      }
    }
  })

  it('Match Center FT stats (with sequence-driven big chances) still equal canonical totals exactly', () => {
    for (const run of baseline.runs.slice(0, 5)) {
      const { squad, result, players } = simulateRun(run)
      for (const m of allRunMatches(result)) {
        const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
        const d = m.detail.finalStats
        const ft = computeStats(tl.events, tl, 1, m.gf, m.ga)
        expect(ft.hShots).toBe(d.home.shots)
        expect(ft.aShots).toBe(d.away.shots)
        expect(ft.hSot).toBe(d.home.shotsOnTarget)
        expect(ft.aSot).toBe(d.away.shotsOnTarget)
        expect(ft.hSaves).toBe(d.home.saves)
        expect(ft.aSaves).toBe(d.away.saves)
        expect(ft.hBig).toBe(d.home.bigChances)
        expect(ft.aBig).toBe(d.away.bigChances)
        expect(ft.hPoss).toBe(d.home.possession)
      }
    }
  })

  it('kickoff still shows zeros (sequences leak nothing early)', () => {
    const run = baseline.runs[2]
    const { squad, result, players } = simulateRun(run)
    const m = result.leaguePhase.matches[0]
    const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
    const kick = computeStats([], tl, 0, 0, 0)
    expect(kick.hShots + kick.aShots + kick.hSot + kick.hSaves + kick.hBig).toBe(0)
    expect(kick.hPoss).toBe(50)
  })
})
