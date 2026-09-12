// Phase 4 test suite — tactical approaches + staged run resolution.
import { describe, it, expect } from 'vitest'
import baseline from './simBaseline.fixture.json'
import phase3 from './simBaselinePhase3.fixture.json'
import { PLAYERS, OPPONENTS, computeRating, simulate, createRunSimulation, makeRng } from './data'
import { buildSquadTacticalProfile, buildOpponentTacticalProfile, resolveTacticalMatchup, DIMENSIONS, TUNING } from './tacticalMatchup'
import {
  TACTICAL_APPROACHES, APPROACH_KEYS, applyTacticalApproach, approachIntents,
  approachMatchupPreviews, approachTradeoffs, approachFeedback,
  APPROACH_PROFILE_CAP, INTENT_MIN, INTENT_MAX,
} from './tacticalApproach'
import * as tacticalApproachModule from './tacticalApproach'
const approachFit = tacticalApproachModule.approachFit
import { buildMatchTimeline } from './matchTimeline'
import { LEGACY_ENGINE_VERSION } from './matchEngineVersions'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const squadFromFixture = (run) => run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))
const allRunMatches = (r) => [...r.leaguePhase.matches, ...(r.playoff ? [r.playoff] : []), ...r.knockouts]

function snapshotRun(result) {
  return {
    exitStage: result.exitStage,
    champion: result.champion,
    position: result.leaguePhase.position,
    points: result.leaguePhase.points,
    matches: allRunMatches(result).map((m) => ({
      kind: m.type, round: m.round || null, opponent: m.opponent, score: m.score, result: m.result,
      scorers: (m.events || []).filter((e) => e.side === 'us').map((e) => e.scorer),
    })),
  }
}

// Drive a whole run through the staged controller with an approach picker.
function runController(run, approachFor = () => 'balanced') {
  const squad = squadFromFixture(run)
  const { total } = computeRating(squad)
  const ctrl = createRunSimulation({
    rating: total, difficulty: run.config.difficulty, squad,
    rng: makeRng(run.seed), runSeed: run.seed,
    engineVersion: LEGACY_ENGINE_VERSION,
  })
  let i = 0
  while (!ctrl.isDone) {
    const pending = ctrl.prepareNext()
    if (!pending) break
    ctrl.resolveNext(approachFor(pending, i++))
  }
  return { ctrl, result: ctrl.finish(), squad }
}

// ---------------------------------------------------------------------------
describe('A. approach definitions', () => {
  it('all four approaches exist; Balanced is a true no-op; bounds respected', () => {
    expect(APPROACH_KEYS).toEqual(['balanced', 'control', 'wide', 'counter'])
    const profile = buildSquadTacticalProfile(squadFromFixture(baseline.runs[0]))
    expect(applyTacticalApproach(profile, 'balanced')).toEqual(
      Object.fromEntries(DIMENSIONS.map((d) => [d, profile[d]])),
    )
    for (const key of APPROACH_KEYS) {
      const def = TACTICAL_APPROACHES[key]
      for (const v of Object.values(def.modifiers)) expect(Math.abs(v)).toBeLessThanOrEqual(APPROACH_PROFILE_CAP)
      for (const v of Object.values(approachIntents(key))) {
        expect(v).toBeGreaterThanOrEqual(INTENT_MIN)
        expect(v).toBeLessThanOrEqual(INTENT_MAX)
      }
    }
    // no hidden bonus for Balanced: identical resolver output as raw profile
    const opp = OPPONENTS[0]
    const raw = resolveTacticalMatchup(profile, buildOpponentTacticalProfile(opp))
    const bal = approachMatchupPreviews(profile, opp).balanced
    expect(JSON.stringify(bal)).toBe(JSON.stringify(raw))
  })

  it('B. adjusted profiles are deterministic and bounded 0–100', () => {
    for (const run of baseline.runs.slice(0, 6)) {
      const profile = buildSquadTacticalProfile(squadFromFixture(run))
      for (const key of APPROACH_KEYS) {
        const a1 = applyTacticalApproach(profile, key)
        const a2 = applyTacticalApproach(profile, key)
        expect(a1).toEqual(a2)
        for (const d of DIMENSIONS) {
          expect(a1[d]).toBeGreaterThanOrEqual(0)
          expect(a1[d]).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it('C. approach effect is structure-only (rating never enters)', () => {
    // identical role/slot structure, different players → identical adjusted profiles
    const leaders = PLAYERS.filter((p) => p.role === 'Defensive Leader' && p.eligibleSlots.includes('CB'))
    const base = squadFromFixture(baseline.runs[0])
    const cbIdx = base.findIndex((s) => s.slot === 'CB')
    const altA = base.map((s, i) => (i === cbIdx ? { slot: 'CB', player: leaders[0] } : s))
    const altB = base.map((s, i) => (i === cbIdx ? { slot: 'CB', player: leaders[1] } : s))
    for (const key of APPROACH_KEYS) {
      expect(applyTacticalApproach(buildSquadTacticalProfile(altA), key))
        .toEqual(applyTacticalApproach(buildSquadTacticalProfile(altB), key))
    }
  })

  it('Phase 6 hook: upgrade modifiers flow through the same caps', () => {
    const profile = buildSquadTacticalProfile(squadFromFixture(baseline.runs[0]))
    const up = applyTacticalApproach(profile, 'control', { profileModifiers: { width: 99 } })
    expect(up.width - profile.width).toBeLessThanOrEqual(APPROACH_PROFILE_CAP - (TACTICAL_APPROACHES.control.modifiers.width || 0))
    const intents = approachIntents('wide', { intentModifiers: { cross: 3 } })
    expect(intents.cross).toBeLessThanOrEqual(INTENT_MAX)
  })
})

// ---------------------------------------------------------------------------
describe('D+F. fit examples and probability safety', () => {
  const profile = buildSquadTacticalProfile(squadFromFixture(baseline.runs[0]))
  const oppOf = (arch) => OPPONENTS.find((o) => o.archetype === arch)

  it('representative good fits beat Balanced; misfits fall behind it', () => {
    const press = approachMatchupPreviews(profile, oppOf('pressing'))
    expect(press.control.probabilityDelta).toBeGreaterThan(press.balanced.probabilityDelta)
    const block = approachMatchupPreviews(profile, oppOf('defensive'))
    expect(block.wide.probabilityDelta).toBeGreaterThan(block.balanced.probabilityDelta)
    const attack = approachMatchupPreviews(profile, oppOf('attacking'))
    expect(attack.counter.probabilityDelta).toBeGreaterThan(attack.balanced.probabilityDelta)
    // misfits: wide gains little-to-nothing vs technical; counter is not the
    // answer to a deep block
    const tech = approachMatchupPreviews(profile, oppOf('technical'))
    expect(tech.wide.probabilityDelta).toBeLessThan(tech.balanced.probabilityDelta)
    expect(block.counter.probabilityDelta).toBeLessThanOrEqual(block.balanced.probabilityDelta)
  })

  it('approach-vs-Balanced difference stays within calibrated bounds; overall cap holds', () => {
    for (const run of baseline.runs) {
      const p = buildSquadTacticalProfile(squadFromFixture(run))
      for (const opp of OPPONENTS) {
        const previews = approachMatchupPreviews(p, opp)
        for (const key of APPROACH_KEYS) {
          const diff = previews[key].probabilityDelta - previews.balanced.probabilityDelta
          expect(Math.abs(diff)).toBeLessThanOrEqual(0.03)
          expect(Math.abs(previews[key].probabilityDelta)).toBeLessThanOrEqual(TUNING.PROB_CAP)
        }
      }
    }
  })

  it('E. no approach dominates a broad deterministic sample', () => {
    const wins = { balanced: 0, control: 0, wide: 0, counter: 0 }
    let total = 0
    for (const run of baseline.runs) {
      const p = buildSquadTacticalProfile(squadFromFixture(run))
      for (const opp of OPPONENTS) {
        const previews = approachMatchupPreviews(p, opp)
        let best = 'balanced'
        for (const key of APPROACH_KEYS) {
          if (previews[key].probabilityDelta > previews[best].probabilityDelta + 1e-9) best = key
        }
        wins[best]++
        total++
      }
    }
    // eslint-disable-next-line no-console
    console.log('[phase4 best-approach share]', JSON.stringify(Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, +(v / total).toFixed(3)]))))
    for (const key of APPROACH_KEYS) {
      expect(wins[key]).toBeGreaterThan(0)               // each approach is best somewhere
      expect(wins[key] / total).toBeLessThanOrEqual(0.55) // none dominates broadly
    }
  })

  it('keeps tradeoff chips grounded and confirms the legacy fit one-liner is deleted', () => {
    // `approachFit` was deliberately removed in the alignment-wording
    // remediation (its "…fit:" copy is prohibited user-facing wording and the
    // Match Hub renders the Selected Plan Analysis panel instead).
    expect(approachFit).toBeUndefined()
    const { helps, costs } = approachTradeoffs('control')
    expect(helps.length).toBeGreaterThan(0)
    expect(costs.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
describe('staged run controller', () => {
  it('all-Balanced controller reproduces simulate() byte-for-byte (all fixture runs)', () => {
    for (const run of phase3.runs) {
      const squad = squadFromFixture(run)
      const { total } = computeRating(squad)
      const reference = simulate({
        rating: total, difficulty: run.config.difficulty, squad,
        rng: makeRng(run.seed), runSeed: run.seed,
      })
      const { result } = runController(run)
      expect(snapshotRun(result)).toEqual(snapshotRun(reference))
      expect(snapshotRun(result)).toEqual({
        exitStage: run.expected.exitStage,
        champion: run.expected.champion,
        position: run.expected.position,
        points: run.expected.points,
        matches: run.expected.matches.map((m) => ({
          kind: m.kind, round: m.round, opponent: m.opponent, score: m.score, result: m.result, scorers: m.scorers,
        })),
      })
    }
  })

  it('same approach history → identical run; approaches are stored on matches', () => {
    const picker = (pending, i) => APPROACH_KEYS[i % 4]
    const a = runController(baseline.runs[0], picker)
    const b = runController(baseline.runs[0], picker)
    expect(JSON.stringify(snapshotRun(a.result))).toBe(JSON.stringify(snapshotRun(b.result)))
    expect(a.ctrl.matches.map((m) => m.approach)).toEqual(b.ctrl.matches.map((m) => m.approach))
    expect(a.ctrl.matches[1].approach).toBe('control')
    // stored matchup is the approach-adjusted one
    const m = a.ctrl.matches[1]
    const adjusted = applyTacticalApproach(buildSquadTacticalProfile(a.squad), 'control')
    const expected = resolveTacticalMatchup(adjusted, buildOpponentTacticalProfile(m.opponentMeta))
    expect(m.matchup.probabilityDelta).toBe(expected.probabilityDelta)
  })

  it('pending previews exist for all approaches and carry no result information', () => {
    const run = baseline.runs[2]
    const squad = squadFromFixture(run)
    const { total } = computeRating(squad)
    const ctrl = createRunSimulation({ rating: total, difficulty: run.config.difficulty, squad, rng: makeRng(run.seed), runSeed: run.seed, engineVersion: LEGACY_ENGINE_VERSION })
    const pending = ctrl.prepareNext()
    expect(Object.keys(pending.previews).sort()).toEqual([...APPROACH_KEYS].sort())
    expect(pending.result).toBeUndefined()
    expect(pending.score).toBeUndefined()
    expect(pending.gf).toBeUndefined()
    // repeated prepare is idempotent (no rng consumed twice)
    expect(ctrl.prepareNext()).toBe(pending)
    // resolve locks exactly once and advances
    const m1 = ctrl.resolveNext('wide')
    expect(m1.approach).toBe('wide')
    const m2 = ctrl.resolveNext('balanced')
    expect(m2.matchNo).toBe(2) // second call resolved the NEXT match, not a reroll
  })

  it('Sim All (finishRemaining) equals resolving each remaining match with Balanced', () => {
    const run = baseline.runs[1]
    const squad = squadFromFixture(run)
    const { total } = computeRating(squad)
    const mk = () => createRunSimulation({ rating: total, difficulty: run.config.difficulty, squad, rng: makeRng(run.seed), runSeed: run.seed, engineVersion: LEGACY_ENGINE_VERSION })
    const a = mk()
    a.prepareNext(); a.resolveNext('counter')
    a.finishRemaining('balanced')
    const b = mk()
    b.prepareNext(); b.resolveNext('counter')
    while (!b.isDone) { b.prepareNext(); if (b.isDone) break; b.resolveNext('balanced') }
    expect(JSON.stringify(snapshotRun(a.finish()))).toBe(JSON.stringify(snapshotRun(b.finish())))
  })

  it('MatchDetail invariants + timeline budgets hold under every approach', () => {
    const picker = (pending, i) => APPROACH_KEYS[i % 4]
    for (const run of baseline.runs.slice(0, 4)) {
      const { ctrl, squad } = runController(run, picker)
      const players = squad.map((s) => s.player)
      for (const m of ctrl.matches) {
        const { home: h, away: a } = m.detail.finalStats
        expect(h.possession + a.possession).toBe(100)
        expect(m.gf).toBeLessThanOrEqual(h.shotsOnTarget)
        expect(h.shotsOnTarget).toBeLessThanOrEqual(h.shots)
        expect(h.saves).toBe(Math.max(0, a.shotsOnTarget - m.ga))
        expect(a.saves).toBe(Math.max(0, h.shotsOnTarget - m.gf))
        expect(h.bigChances).toBeLessThanOrEqual(h.shots)
        const tl = buildMatchTimeline(m, players, 'S', 'T', null, squad)
        const shots = (team) => tl.events.filter((e) => e.team === team && e.countsShot).length
        expect(shots('home')).toBeLessThanOrEqual(h.shots)
        expect(shots('away')).toBeLessThanOrEqual(a.shots)
        expect(tl.events.filter((e) => e.type === 'goal' && e.team === 'home').length).toBe(m.gf)
      }
    }
  })
})

// ---------------------------------------------------------------------------
describe('I. pattern-family shifts from approach intents', () => {
  const SQUAD = squadFromFixture(baseline.runs[0])
  const PLAYERS11 = SQUAD.map((s) => s.player)
  const FAMILY = {
    control: new Set(['central_buildup', 'one_two', 'switch_of_play', 'through_ball']),
    wide: new Set(['wide_overlap', 'cross', 'cutback', 'switch_of_play']),
    counter: new Set(['counterattack', 'direct_attack', 'pressing_recovery']),
  }
  function familyShare(approach, family) {
    let inFam = 0
    let total = 0
    for (let i = 0; i < 80; i++) {
      const match = {
        type: 'league', opponent: `Cal FC ${i}`, result: 'win', gf: 1, ga: 0, approach,
        events: [{ minute: 20 + (i % 60), side: 'us', scorer: PLAYERS11[9].name, assist: null }],
        stats: { possession: 55, shots: 15, shotsOnTarget: 6, potm: 'X' },
      }
      const tl = buildMatchTimeline(match, PLAYERS11, 'S', 'T', null, SQUAD)
      for (const e of tl.events) {
        if (!e.seq || e.team !== 'home') continue
        total++
        if (family.has(e.seq.pattern)) inFam++
      }
    }
    return inFam / total
  }

  it('each approach raises its own family versus Balanced; role identity persists', () => {
    const shifts = {}
    for (const key of ['control', 'wide', 'counter']) {
      const withApproach = familyShare(key, FAMILY[key])
      const withBalanced = familyShare('balanced', FAMILY[key])
      shifts[key] = { balanced: +withBalanced.toFixed(3), approach: +withApproach.toFixed(3) }
      expect(withApproach).toBeGreaterThan(withBalanced)
    }
    // eslint-disable-next-line no-console
    console.log('[phase4 pattern shifts]', JSON.stringify(shifts))
    // role identity persists: no family becomes all-consuming
    for (const key of ['control', 'wide', 'counter']) expect(shifts[key].approach).toBeLessThan(0.85)
  })
})

// ---------------------------------------------------------------------------
describe('post-match approach feedback', () => {
  it('is deterministic, honest, and defined for every approach/result combo', () => {
    const detailHigh = { finalStats: { home: { possession: 61, shots: 16, bigChances: 4 } } }
    const detailLow = { finalStats: { home: { possession: 44, shots: 6, bigChances: 1 } } }
    for (const approach of APPROACH_KEYS) {
      for (const result of ['win', 'draw', 'loss']) {
        for (const detail of [detailHigh, detailLow]) {
          const s = approachFeedback({ approach, matchup: null, detail, result })
          expect(typeof s).toBe('string')
          expect(s.length).toBeGreaterThan(10)
          expect(s).toBe(approachFeedback({ approach, matchup: null, detail, result }))
        }
      }
    }
    // honesty: control with low possession must not claim it dictated the game
    const s = approachFeedback({ approach: 'control', detail: detailLow, result: 'win' })
    expect(s).toMatch(/never truly dictated/)
  })
})
