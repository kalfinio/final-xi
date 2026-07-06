// Phase 1 test suite — canonical MatchDetail layer.
//
// A. MatchDetail determinism
// B. Statistical invariant fuzzing (1,000 deterministic mock matches)
// C. Pre/post simulation baseline (fixture captured BEFORE the refactor)
// D. Timeline reconciliation (event accounting vs canonical totals)
// E. Cross-view consistency (timeline / Match Center FT / report source)
// F. finalsReached regression (lost final)
// G. Player DB validation
import { describe, it, expect } from 'vitest'
import baseline from './simBaseline.fixture.json' // historical Phase ≤2.1 capture (evidence, do not overwrite)
import phase3 from './simBaselinePhase3.fixture.json' // Phase 3 deterministic baseline (same runs/seeds)
import {
  PLAYERS, FORMATIONS, computeRating, simulate, makeRng, buildSimSeed,
  getEligiblePlayers, recordGame, validatePlayerDB,
} from './data'
import { buildMatchDetail, presentationSeedFor, matchVerdict } from './matchEngine'
import { buildMatchTimeline } from './matchTimeline'
import { computeStats } from './MatchCenter'
import { TUNING } from './tacticalMatchup'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))

// Rebuild a squad exactly as the baseline capture script did.
function squadFromFixture(run) {
  return run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))
}

function allRunMatches(result) {
  return [
    ...result.leaguePhase.matches,
    ...(result.playoff ? [result.playoff] : []),
    ...result.knockouts,
  ]
}

// Same canonical-result snapshot shape the pre-refactor capture used.
function snapshotRun(result) {
  return {
    exitStage: result.exitStage,
    champion: result.champion,
    position: result.leaguePhase.position,
    points: result.leaguePhase.points,
    topScorer: result.topScorer,
    topAssister: result.topAssister,
    matches: allRunMatches(result).map((m) => ({
      kind: m.type,
      round: m.round || null,
      opponent: m.opponent,
      score: m.score,
      result: m.result,
      scorers: (m.events || []).filter((e) => e.side === 'us').map((e) => e.scorer),
      assists: (m.events || []).filter((e) => e.side === 'us' && e.assist).map((e) => e.assist),
      oppGoals: (m.events || []).filter((e) => e.side === 'opp').length,
    })),
  }
}

function assertDetailInvariants(d) {
  const { home: h, away: a } = d.finalStats
  expect(h.possession + a.possession).toBe(100)
  expect(d.homeGoals).toBeLessThanOrEqual(h.shotsOnTarget)
  expect(h.shotsOnTarget).toBeLessThanOrEqual(h.shots)
  expect(d.awayGoals).toBeLessThanOrEqual(a.shotsOnTarget)
  expect(a.shotsOnTarget).toBeLessThanOrEqual(a.shots)
  expect(h.saves).toBe(Math.max(0, a.shotsOnTarget - d.awayGoals))
  expect(a.saves).toBe(Math.max(0, h.shotsOnTarget - d.homeGoals))
  expect(h.bigChances).toBeLessThanOrEqual(h.shots)
  expect(a.bigChances).toBeLessThanOrEqual(a.shots)
  expect(h.bigChances).toBeGreaterThanOrEqual(d.homeGoals)
  expect(a.bigChances).toBeGreaterThanOrEqual(d.awayGoals)
  expect(h.xg).toBeGreaterThan(0)
  expect(a.xg).toBeGreaterThanOrEqual(0)
  expect(h.fouls).toBeGreaterThanOrEqual(6)
  expect(h.fouls).toBeLessThanOrEqual(14)
  expect(a.fouls).toBeGreaterThanOrEqual(6)
  expect(a.fouls).toBeLessThanOrEqual(14)
}

// Deterministic mock match generator for fuzzing (includes degenerate inputs
// like SOT > shots or missing stats, which the engine must clamp).
function mockMatch(i) {
  const r = makeRng(0xbeef ^ i)
  const gf = Math.floor(r() * 5)
  const ga = Math.floor(r() * 4)
  const noStats = r() < 0.08
  const shots = Math.max(gf, 3 + Math.floor(r() * 15))
  const sot = Math.floor(r() * (shots + 4)) // may exceed shots → engine clamps
  const match = {
    type: r() < 0.6 ? 'league' : 'ko',
    round: 'Quarter-final',
    opponent: `Opp ${i % 13}`,
    opponentMeta: r() < 0.8 ? { strength: 72 + Math.floor(r() * 20), style: 'pressing' } : null,
    result: gf > ga ? 'win' : gf < ga ? 'loss' : 'draw',
    gf, ga,
    events: [],
    stats: noStats ? undefined : {
      possession: 28 + Math.floor(r() * 46),
      shots,
      shotsOnTarget: sot,
      potm: 'Someone',
    },
  }
  return match
}

// ---------------------------------------------------------------------------
describe('A. MatchDetail determinism', () => {
  it('same inputs → byte-equivalent MatchDetail', () => {
    for (let i = 0; i < 50; i++) {
      const m1 = mockMatch(i)
      const m2 = mockMatch(i)
      const d1 = buildMatchDetail({ match: m1, runSeed: 123, matchNumber: i + 1 })
      const d2 = buildMatchDetail({ match: m2, runSeed: 123, matchNumber: i + 1 })
      expect(JSON.stringify(d1)).toBe(JSON.stringify(d2))
    }
  })

  it('presentation seed separates rematch-style collisions', () => {
    const base = { runSeed: 9, stage: 'Final', opponent: 'Chamartín FC', gf: 2, ga: 1 }
    const s1 = presentationSeedFor({ ...base, matchNumber: 3 })
    const s2 = presentationSeedFor({ ...base, matchNumber: 11 })
    expect(s1).not.toBe(s2)
  })

  it('seed does not depend on UI state — rebuilding from the stored match is stable', () => {
    const squad = squadFromFixture(baseline.runs[0])
    const { total } = computeRating(squad)
    const res = simulate({ rating: total, difficulty: 'classic', squad, rng: makeRng(42), runSeed: 42 })
    const m = res.leaguePhase.matches[2]
    const rebuilt = buildMatchDetail({ match: m, runSeed: 42, matchNumber: 3 })
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(m.detail))
  })
})

// ---------------------------------------------------------------------------
describe('B. statistical invariant fuzzing', () => {
  it('1,000 deterministic mock matches satisfy every hard invariant', () => {
    for (let i = 0; i < 1000; i++) {
      const d = buildMatchDetail({ match: mockMatch(i), runSeed: 777, matchNumber: i + 1 })
      assertDetailInvariants(d)
    }
  })
})

// ---------------------------------------------------------------------------
describe('C. simulation baselines (Phase 3)', () => {
  // Phase 3 intentionally changes some results via the capped tactical delta.
  // Proof that NOTHING ELSE changed: with the tactical probability scale set
  // to zero, every run is byte-identical to the historical Phase ≤2.1 capture
  // — same RNG stream, same opponents, same scores, same scorers/assists.
  it('with PROB_SCALE = 0, results are identical to the Phase ≤2.1 fixture', () => {
    const saved = TUNING.PROB_SCALE
    try {
      TUNING.PROB_SCALE = 0
      for (const run of baseline.runs) {
        const squad = squadFromFixture(run)
        const { total } = computeRating(squad)
        const result = simulate({
          rating: total, difficulty: run.config.difficulty, squad,
          rng: makeRng(run.seed), runSeed: run.seed,
        })
        expect(snapshotRun(result)).toEqual(run.expected)
      }
    } finally {
      TUNING.PROB_SCALE = saved
    }
  })

  it('Phase 3 vs Phase ≤2.1 diff is small and threshold-shaped (report)', () => {
    let changedRuns = 0
    let changedMatches = 0
    let championFlips = 0
    for (let i = 0; i < baseline.runs.length; i++) {
      const oldSnap = baseline.runs[i].expected
      const newSnap = phase3.runs[i].expected
      let runChanged = false
      const n = Math.max(oldSnap.matches.length, newSnap.matches.length)
      for (let k = 0; k < n; k++) {
        const a = oldSnap.matches[k]
        const b = newSnap.matches[k]
        if (!a || !b || a.score !== b.score || a.result !== b.result || a.opponent !== b.opponent) { changedMatches++; runChanged = true }
      }
      if (runChanged) changedRuns++
      if (oldSnap.champion !== newSnap.champion) championFlips++
    }
    // eslint-disable-next-line no-console
    console.log(`[phase3 diff] changedRuns=${changedRuns}/16 changedMatches=${changedMatches}/172 championFlips=${championFlips}`)
    expect(changedRuns).toBeLessThanOrEqual(6) // small, threshold-origin drift only
    expect(championFlips).toBeLessThanOrEqual(2)
  })

  it.each(phase3.runs.map((r, i) => [i, r]))(
    'run %#: Phase 3 engine reproduces the Phase 3 baseline exactly',
    (_, run) => {
      const squad = squadFromFixture(run)
      const { total } = computeRating(squad)
      expect(total).toBe(run.rating)
      const result = simulate({
        rating: total, difficulty: run.config.difficulty, squad,
        rng: makeRng(run.seed), runSeed: run.seed,
      })
      expect(snapshotRun(result)).toEqual(run.expected)
    },
  )

  it('runSeed influences only presentation, never results', () => {
    const run = baseline.runs[0]
    const squad = squadFromFixture(run)
    const { total } = computeRating(squad)
    const a = simulate({ rating: total, difficulty: 'classic', squad, rng: makeRng(run.seed), runSeed: 1 })
    const b = simulate({ rating: total, difficulty: 'classic', squad, rng: makeRng(run.seed), runSeed: 999999 })
    expect(snapshotRun(a)).toEqual(snapshotRun(b))
    // …while the presentation layer legitimately differs
    expect(a.leaguePhase.matches[0].detail.presentationSeed)
      .not.toBe(b.leaguePhase.matches[0].detail.presentationSeed)
  })

  it('every played match carries a canonical detail (league, play-off, KO rounds)', () => {
    let sawPlayoff = false
    let sawFinal = false
    for (const run of baseline.runs) {
      const squad = squadFromFixture(run)
      const { total } = computeRating(squad)
      const result = simulate({
        rating: total, difficulty: run.config.difficulty, squad,
        rng: makeRng(run.seed), runSeed: run.seed,
      })
      if (result.playoff) sawPlayoff = true
      for (const m of allRunMatches(result)) {
        if (m.round === 'Final') sawFinal = true
        expect(m.detail).toBeTruthy()
        expect(m.detail.homeGoals).toBe(m.gf)
        expect(m.detail.awayGoals).toBe(m.ga)
        expect(m.detail.keyPlayer).toBe(m.stats.potm)
        expect(m.detail.verdict).toBe(matchVerdict({ gf: m.gf, ga: m.ga, result: m.result, pens: m.pens || null }))
        assertDetailInvariants(m.detail)
      }
    }
    expect(sawPlayoff).toBe(true) // fixture covers the play-off path
    expect(sawFinal).toBe(true)   // fixture covers a run reaching the Final
  })
})

// ---------------------------------------------------------------------------
describe('D. timeline reconciliation with MatchDetail', () => {
  function timelinesForRun(run) {
    const squad = squadFromFixture(run)
    const players = squad.map((s) => s.player)
    const { total } = computeRating(squad)
    const result = simulate({
      rating: total, difficulty: run.config.difficulty, squad,
      rng: makeRng(run.seed), runSeed: run.seed,
    })
    return allRunMatches(result).map((m) => ({ m, tl: buildMatchTimeline(m, players, 'Stage', 'Test XI', null) }))
  }

  it('goal events equal the canonical score; shot/SOT/save event counts never exceed canonical totals', () => {
    for (const run of baseline.runs) {
      for (const { m, tl } of timelinesForRun(run)) {
        const d = m.detail.finalStats
        const goals = (team) => tl.events.filter((e) => e.team === team && e.type === 'goal').length
        expect(goals('home')).toBe(m.gf)
        expect(goals('away')).toBe(m.ga)
        const shots = (team) => tl.events.filter((e) => e.team === team && e.countsShot).length
        const sot = (team) => tl.events.filter((e) => e.team === team && e.countsShot && e.onTarget).length
        const savesBy = (team) => tl.events.filter((e) => e.team !== team && e.countsShot && e.onTarget && e.type !== 'goal').length
        expect(shots('home')).toBeLessThanOrEqual(d.home.shots)
        expect(shots('away')).toBeLessThanOrEqual(d.away.shots)
        expect(sot('home')).toBeLessThanOrEqual(d.home.shotsOnTarget)
        expect(sot('away')).toBeLessThanOrEqual(d.away.shotsOnTarget)
        expect(savesBy('home')).toBeLessThanOrEqual(d.home.saves)
        expect(savesBy('away')).toBeLessThanOrEqual(d.away.saves)
      }
    }
  })

  it('timeline is deterministic on replay', () => {
    const run = baseline.runs[3]
    const squad = squadFromFixture(run)
    const players = squad.map((s) => s.player)
    const { total } = computeRating(squad)
    const result = simulate({
      rating: total, difficulty: run.config.difficulty, squad,
      rng: makeRng(run.seed), runSeed: run.seed,
    })
    const m = result.leaguePhase.matches[0]
    const t1 = buildMatchTimeline(m, players, 'S', 'T', null)
    const t2 = buildMatchTimeline(m, players, 'S', 'T', null)
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2))
  })
})

// ---------------------------------------------------------------------------
describe('E. cross-view consistency (one canonical source)', () => {
  it('timeline finalStats mirror MatchDetail exactly, and Match Center FT stats equal them', () => {
    for (const run of baseline.runs.slice(0, 6)) {
      const squad = squadFromFixture(run)
      const players = squad.map((s) => s.player)
      const { total } = computeRating(squad)
      const result = simulate({
        rating: total, difficulty: run.config.difficulty, squad,
        rng: makeRng(run.seed), runSeed: run.seed,
      })
      for (const m of allRunMatches(result)) {
        const tl = buildMatchTimeline(m, players, 'Stage', 'Test XI', null)
        const d = m.detail.finalStats
        // Post Match Card + Match Center read tl.finalStats — must be the detail values.
        expect(tl.finalStats.home).toEqual({
          shots: d.home.shots, sot: d.home.shotsOnTarget, possession: d.home.possession,
          saves: d.home.saves, bigChances: d.home.bigChances, xg: d.home.xg, fouls: d.home.fouls,
        })
        expect(tl.finalStats.away).toEqual({
          shots: d.away.shots, sot: d.away.shotsOnTarget, possession: d.away.possession,
          saves: d.away.saves, bigChances: d.away.bigChances, xg: d.away.xg, fouls: d.away.fouls,
        })
        // key player + verdict: one source everywhere.
        expect(tl.potm).toBe(m.detail.keyPlayer)
        expect(tl.verdict).toBe(m.detail.verdict)
        // Match Center at full time (prog = 1, all events resolved) = canonical totals.
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
        expect(ft.aPoss).toBe(d.away.possession)
      }
    }
  })

  it('live stats are progressive: kickoff shows zeros, mid-match stays within canonical totals', () => {
    const run = baseline.runs[0]
    const squad = squadFromFixture(run)
    const players = squad.map((s) => s.player)
    const { total } = computeRating(squad)
    const result = simulate({
      rating: total, difficulty: run.config.difficulty, squad,
      rng: makeRng(run.seed), runSeed: run.seed,
    })
    for (const m of allRunMatches(result)) {
      const tl = buildMatchTimeline(m, players, 'Stage', 'Test XI', null)
      const d = m.detail.finalStats
      // kickoff: nothing resolved, prog 0 → no final totals leaked
      const kick = computeStats([], tl, 0, 0, 0)
      expect(kick.hShots).toBe(0)
      expect(kick.aShots).toBe(0)
      expect(kick.hSot).toBe(0)
      expect(kick.hSaves).toBe(0)
      expect(kick.hBig).toBe(0)
      expect(kick.hPoss).toBe(50)
      // mid-match: monotone-safe and never above canonical
      const half = tl.events.filter((e) => e.minute <= 45)
      const hg = half.filter((e) => e.type === 'goal' && e.team === 'home').length
      const ag = half.filter((e) => e.type === 'goal' && e.team === 'away').length
      const mid = computeStats(half, tl, 45 / 90, hg, ag)
      expect(mid.hShots).toBeLessThanOrEqual(d.home.shots)
      expect(mid.aShots).toBeLessThanOrEqual(d.away.shots)
      expect(mid.hSot).toBeLessThanOrEqual(d.home.shotsOnTarget)
      expect(mid.hSaves).toBeLessThanOrEqual(d.home.saves)
      expect(mid.hBig).toBeLessThanOrEqual(d.home.bigChances)
    }
  })
})

// ---------------------------------------------------------------------------
describe('F. finalsReached regression', () => {
  it('a lost final increments finalsReached', () => {
    const squad = squadFromFixture(baseline.runs[0])
    const before = recordGame({
      result: { champion: false, exitStage: 'Semi-final' },
      squad, formation: '4-3-3',
    })
    const lostFinal = recordGame({
      result: { champion: false, exitStage: 'Final' },
      squad, formation: '4-3-3',
    })
    // localStorage is unavailable in node, so each call starts from defaults —
    // the delta below isolates the exitStage === 'Final' branch.
    expect(before.finalsReached).toBe(0)
    expect(lostFinal.finalsReached).toBe(1)
    expect(lostFinal.trophies).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('G. player DB validation', () => {
  it('validatePlayerDB reports no problems', () => {
    expect(validatePlayerDB()).toEqual([])
  })

  it('every formation slot still drafts (sanity)', () => {
    for (const f of Object.values(FORMATIONS)) {
      for (const slot of new Set(f.slots)) {
        expect(getEligiblePlayers(slot, [], 'legends').length).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
