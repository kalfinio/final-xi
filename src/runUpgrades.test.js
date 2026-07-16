// Phase 6 test suite — run upgrades.
import { describe, it, expect } from 'vitest'
import baseline from './simBaseline.fixture.json'
import phase3 from './simBaselinePhase3.fixture.json'
import { PLAYERS, OPPONENTS, computeRating, createRunSimulation, makeRng } from './data'
import { buildSquadTacticalProfile, buildOpponentTacticalProfile, resolveTacticalMatchup, DIMENSIONS, TUNING } from './tacticalMatchup'
import { applyTacticalApproach, approachIntents, APPROACH_KEYS, TACTICAL_APPROACHES, INTENT_MIN, INTENT_MAX } from './tacticalApproach'
import {
  UPGRADE_POOL, UPGRADES_BY_ID, buildUpgradeContext, generateUpgradeOffer,
  shouldOfferUpgrade, recordSimAllSkips,
  MAX_UPGRADES_PER_RUN, UPGRADE_DIM_CAP, UPGRADE_INTENT_MIN, UPGRADE_INTENT_MAX,
} from './runUpgrades'
import { buildMatchTimeline } from './matchTimeline'
import { LEGACY_ENGINE_VERSION } from './matchEngineVersions'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const squadFromFixture = (run) => run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))

const NEUTRAL_MC = { approachKey: 'balanced', opponentMeta: { archetype: 'technical' }, kind: 'league', round: null, runRecord: { w: 1, d: 1, l: 1 }, prevResult: 'draw' }

function snapshotRun(result) {
  const all = [...result.leaguePhase.matches, ...(result.playoff ? [result.playoff] : []), ...result.knockouts]
  return {
    exitStage: result.exitStage, champion: result.champion,
    position: result.leaguePhase.position, points: result.leaguePhase.points,
    matches: all.map((m) => ({ kind: m.type, round: m.round || null, opponent: m.opponent, score: m.score, result: m.result })),
  }
}

// Drive a full run through the controller with an upgrade state + pickers.
function runWithUpgrades(run, { pickAt = () => null, approachFor = () => 'balanced', owned = null } = {}) {
  const squad = squadFromFixture(run)
  const { total } = computeRating(squad)
  const state = { owned: owned ? owned.map((o) => ({ ...o })) : [], offers: [] }
  const ctrl = createRunSimulation({
    rating: total, difficulty: run.config.difficulty, squad,
    rng: makeRng(run.seed), runSeed: run.seed,
    engineVersion: LEGACY_ENGINE_VERSION,
    upgradeContextFor: (mc, profile) => buildUpgradeContext(state.owned, mc, profile),
  })
  let i = 0
  while (!ctrl.isDone) {
    const pending = ctrl.prepareNext()
    if (!pending) break
    const m = ctrl.resolveNext(approachFor(pending, i++))
    if (shouldOfferUpgrade(m, ctrl, state.offers.length)) {
      const offerIndex = state.offers.length + 1
      const optionIds = generateUpgradeOffer({ runSeed: run.seed, offerIndex, owned: state.owned })
      const chosen = pickAt(offerIndex, optionIds)
      state.offers.push({ offerIndex, afterMatch: ctrl.resolvedCount, optionIds, chosenId: chosen || 'skipped' })
      if (chosen) {
        const existing = state.owned.find((o) => o.id === chosen)
        if (existing) existing.stacks = Math.min((existing.stacks || 1) + 1, UPGRADES_BY_ID[chosen].stackMax)
        else state.owned.push({ id: chosen, stacks: 1, acquiredAfterMatch: ctrl.resolvedCount })
      }
    }
  }
  return { ctrl, state, result: ctrl.finish(), squad }
}

// ---------------------------------------------------------------------------
describe('pool integrity', () => {
  it('24 upgrades, valid categories/tiers/dimensions/conditions', () => {
    expect(UPGRADE_POOL).toHaveLength(24)
    expect(new Set(UPGRADE_POOL.map((u) => u.id)).size).toBe(24)
    for (const u of UPGRADE_POOL) {
      expect(['mastery', 'structural', 'situational', 'identity']).toContain(u.category)
      expect(['standard', 'gold']).toContain(u.tier)
      expect([1, 2]).toContain(u.stackMax)
      for (const d of Object.keys(u.effect?.profileModifiers || {})) expect(DIMENSIONS).toContain(d)
      if (u.when?.approach) expect(APPROACH_KEYS).toContain(u.when.approach)
    }
  })
})

// ---------------------------------------------------------------------------
describe('buildUpgradeContext', () => {
  const profile = buildSquadTacticalProfile(squadFromFixture(baseline.runs[0]))

  it('is pure/deterministic and empty for no upgrades', () => {
    const c = buildUpgradeContext([], NEUTRAL_MC, profile)
    expect(c.profileModifiers).toEqual({})
    expect(c.intentModifiers).toEqual({})
    expect(c.activeIds).toEqual([])
    const owned = [{ id: 'midfield-triangle', stacks: 2 }, { id: 'press-breakers', stacks: 1 }]
    expect(JSON.stringify(buildUpgradeContext(owned, NEUTRAL_MC, profile)))
      .toBe(JSON.stringify(buildUpgradeContext(owned, NEUTRAL_MC, profile)))
  })

  it('conditions follow the clarified pre-match semantics; activeIds = fired only', () => {
    const owned = ['press-resistance', 'press-breakers', 'bounce-back', 'front-runners', 'big-night-dna', 'midfield-triangle']
      .map((id) => ({ id, stacks: 1 }))
    const mc = (over) => ({ ...NEUTRAL_MC, ...over })
    // situational: archetype must match — regardless of approach
    let c = buildUpgradeContext(owned, mc({ opponentMeta: { archetype: 'pressing' }, approachKey: 'wide' }), profile)
    expect(c.activeIds).toContain('press-breakers')
    expect(c.activeIds).not.toContain('press-resistance') // needs approach=control too
    // mastery: approach AND archetype
    c = buildUpgradeContext(owned, mc({ opponentMeta: { archetype: 'pressing' }, approachKey: 'control' }), profile)
    expect(c.activeIds).toContain('press-resistance')
    // afterLoss keys on prevResult (the immediately previous resolved match)
    c = buildUpgradeContext(owned, mc({ prevResult: 'loss' }), profile)
    expect(c.activeIds).toContain('bounce-back')
    c = buildUpgradeContext(owned, mc({ prevResult: 'win' }), profile)
    expect(c.activeIds).not.toContain('bounce-back')
    // unbeaten keys on the record BEFORE the match
    c = buildUpgradeContext(owned, mc({ runRecord: { w: 3, d: 2, l: 0 } }), profile)
    expect(c.activeIds).toContain('front-runners')
    c = buildUpgradeContext(owned, mc({ runRecord: { w: 5, d: 0, l: 1 } }), profile)
    expect(c.activeIds).not.toContain('front-runners')
    // kind describes the upcoming match
    c = buildUpgradeContext(owned, mc({ kind: 'ko', round: 'Round of 16' }), profile)
    expect(c.activeIds).toContain('big-night-dna')
    // unconditional structural always fires
    expect(c.activeIds).toContain('midfield-triangle')
  })

  it('trust-the-xi uses the NATURAL base profile top-2 (rating-independent)', () => {
    const owned = [{ id: 'trust-the-xi', stacks: 1 }]
    const c = buildUpgradeContext(owned, { ...NEUTRAL_MC, approachKey: 'balanced' }, profile)
    const sorted = [...DIMENSIONS].sort((a, b) => (profile[b] - profile[a]) || (DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b)))
    expect(Object.keys(c.profileModifiers).sort()).toEqual(sorted.slice(0, 2).sort())
    expect(Object.values(c.profileModifiers)).toEqual([3, 3])
    // not active off-balanced
    expect(buildUpgradeContext(owned, { ...NEUTRAL_MC, approachKey: 'wide' }, profile).activeIds).toEqual([])
    // same structure, different-rated players → identical (structure-only base profile)
    const leaders = PLAYERS.filter((p) => p.role === 'Defensive Leader' && p.eligibleSlots.includes('CB'))
    const base = squadFromFixture(baseline.runs[0])
    const cbIdx = base.findIndex((s) => s.slot === 'CB')
    const pA = buildSquadTacticalProfile(base.map((s, i) => (i === cbIdx ? { slot: 'CB', player: leaders[0] } : s)))
    const pB = buildSquadTacticalProfile(base.map((s, i) => (i === cbIdx ? { slot: 'CB', player: leaders[1] } : s)))
    expect(buildUpgradeContext(owned, { ...NEUTRAL_MC, approachKey: 'balanced' }, pA))
      .toEqual(buildUpgradeContext(owned, { ...NEUTRAL_MC, approachKey: 'balanced' }, pB))
  })

  it('versatile-coaching refunds only the selected approach\'s reduced dimensions', () => {
    const owned = [{ id: 'versatile-coaching', stacks: 1 }]
    for (const key of ['control', 'wide', 'counter']) {
      const c = buildUpgradeContext(owned, { ...NEUTRAL_MC, approachKey: key }, profile)
      const reduced = Object.entries(TACTICAL_APPROACHES[key].modifiers).filter(([, v]) => v < 0).map(([d]) => d)
      expect(Object.keys(c.profileModifiers).sort()).toEqual(reduced.sort())
      for (const v of Object.values(c.profileModifiers)) expect(v).toBe(2)
    }
    expect(buildUpgradeContext(owned, { ...NEUTRAL_MC, approachKey: 'balanced' }, profile).activeIds).toEqual([])
  })

  it('caps: everything owned at max stacks stays within ±8/dim and [0.9, 1.1] intents', () => {
    const everything = UPGRADE_POOL.map((u) => ({ id: u.id, stacks: u.stackMax }))
    for (const arch of ['pressing', 'technical', 'defensive', 'attacking', 'physical', 'elite', 'underdog']) {
      for (const key of APPROACH_KEYS) {
        const mc = { approachKey: key, opponentMeta: { archetype: arch }, kind: 'ko', round: 'Final', runRecord: { w: 9, d: 0, l: 0 }, prevResult: 'win' }
        const c = buildUpgradeContext(everything, mc, profile)
        for (const v of Object.values(c.profileModifiers)) expect(Math.abs(v)).toBeLessThanOrEqual(UPGRADE_DIM_CAP)
        for (const v of Object.values(c.intentModifiers)) {
          expect(v).toBeGreaterThanOrEqual(UPGRADE_INTENT_MIN)
          expect(v).toBeLessThanOrEqual(UPGRADE_INTENT_MAX)
        }
        // downstream Phase 4 caps still govern
        const adjusted = applyTacticalApproach(profile, key, c)
        for (const d of DIMENSIONS) { expect(adjusted[d]).toBeGreaterThanOrEqual(0); expect(adjusted[d]).toBeLessThanOrEqual(100) }
        const intents = approachIntents(key, { intentModifiers: c.intentModifiers })
        for (const v of Object.values(intents)) { expect(v).toBeGreaterThanOrEqual(INTENT_MIN); expect(v).toBeLessThanOrEqual(INTENT_MAX) }
        const m = resolveTacticalMatchup(adjusted, buildOpponentTacticalProfile(OPPONENTS.find((o) => o.archetype === arch)))
        expect(Math.abs(m.probabilityDelta)).toBeLessThanOrEqual(TUNING.PROB_CAP)
      }
    }
  })
})

// ---------------------------------------------------------------------------
describe('offer generation + triggers', () => {
  it('offers are deterministic, 3 distinct options, ≥2 categories, gold-gated early', () => {
    for (let offerIndex = 1; offerIndex <= 6; offerIndex++) {
      const a = generateUpgradeOffer({ runSeed: 12345, offerIndex, owned: [] })
      const b = generateUpgradeOffer({ runSeed: 12345, offerIndex, owned: [] })
      expect(a).toEqual(b)
      expect(new Set(a).size).toBe(3)
      expect(new Set(a.map((id) => UPGRADES_BY_ID[id].category)).size).toBeGreaterThanOrEqual(2)
      if (offerIndex <= 2) for (const id of a) expect(UPGRADES_BY_ID[id].tier).toBe('standard')
    }
    // owned set changes the offer stream input deterministically
    const withOwned = generateUpgradeOffer({ runSeed: 12345, offerIndex: 3, owned: [{ id: 'engine-room', stacks: 1 }] })
    expect(withOwned).not.toContain('engine-room') // non-stackable exclusion
  })

  it('stackable upgrades reappear only below their stack ceiling', () => {
    for (let s = 0; s < 40; s++) {
      const atMax = generateUpgradeOffer({ runSeed: s, offerIndex: 4, owned: [{ id: 'midfield-triangle', stacks: 2 }] })
      expect(atMax).not.toContain('midfield-triangle')
    }
  })

  it('shouldOfferUpgrade: schedule triggers + hard 6-offer suppression', () => {
    const ctrl = { isDone: false }
    const league = (n) => ({ type: 'league', matchNo: n, result: 'win' })
    expect(shouldOfferUpgrade(league(3), ctrl, 0)).toBe(true)
    expect(shouldOfferUpgrade(league(6), ctrl, 0)).toBe(true)
    expect(shouldOfferUpgrade(league(8), ctrl, 0)).toBe(true)   // still alive ⇒ qualified
    expect(shouldOfferUpgrade(league(8), { isDone: true }, 0)).toBe(false) // eliminated
    expect(shouldOfferUpgrade(league(4), ctrl, 0)).toBe(false)
    const ko = (round, result) => ({ type: 'ko', round, result })
    expect(shouldOfferUpgrade(ko('Knockout Play-Off', 'win'), ctrl, 0)).toBe(true)
    expect(shouldOfferUpgrade(ko('Quarter-final', 'pens-win'), ctrl, 0)).toBe(true)
    expect(shouldOfferUpgrade(ko('Semi-final', 'loss'), { isDone: true }, 0)).toBe(false)
    expect(shouldOfferUpgrade(ko('Final', 'win'), { isDone: true }, 0)).toBe(false)
    // cap: the trigger is valid but suppressed after 6 offers
    expect(shouldOfferUpgrade(ko('Semi-final', 'win'), ctrl, MAX_UPGRADES_PER_RUN)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('full-run integration', () => {
  it('no-upgrade context (empty owned) is byte-identical to the Phase 3 baseline', () => {
    for (const run of phase3.runs.slice(0, 6)) {
      const { result } = runWithUpgrades(run) // empty owned, all balanced
      expect(snapshotRun(result)).toEqual({
        exitStage: run.expected.exitStage, champion: run.expected.champion,
        position: run.expected.position, points: run.expected.points,
        matches: run.expected.matches.map((m) => ({ kind: m.kind, round: m.round, opponent: m.opponent, score: m.score, result: m.result })),
      })
    }
  })

  it('same seed + approach history + upgrade picks reproduce exactly (Daily-safe)', () => {
    const pickAt = (offerIndex, options) => options[offerIndex % options.length]
    const approachFor = (p, i) => APPROACH_KEYS[i % 4]
    const a = runWithUpgrades(baseline.runs[0], { pickAt, approachFor })
    const b = runWithUpgrades(baseline.runs[0], { pickAt, approachFor })
    expect(JSON.stringify(snapshotRun(a.result))).toBe(JSON.stringify(snapshotRun(b.result)))
    expect(a.state).toEqual(b.state)
    expect(a.ctrl.matches.map((m) => m.activeUpgrades || [])).toEqual(b.ctrl.matches.map((m) => m.activeUpgrades || []))
  })

  it('match.activeUpgrades lists only upgrades that actually fired', () => {
    // own a pressing-only situational from the start; it must appear only vs
    // pressing sides (checked across several runs so the sample surely
    // contains pressing opponents)
    let checked = 0
    for (const run of baseline.runs.slice(0, 5)) {
      const { ctrl } = runWithUpgrades(run, { owned: [{ id: 'press-breakers', stacks: 1 }] })
      for (const m of ctrl.matches) {
        const active = m.activeUpgrades || []
        if (m.opponentMeta.archetype === 'pressing') { expect(active).toContain('press-breakers'); checked++ }
        else expect(active).not.toContain('press-breakers')
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('upgrades never break MatchDetail invariants or timeline budgets', () => {
    const everything = UPGRADE_POOL.map((u) => ({ id: u.id, stacks: u.stackMax }))
    const { ctrl, squad } = runWithUpgrades(baseline.runs[3], { owned: everything, approachFor: (p, i) => APPROACH_KEYS[i % 4] })
    const players = squad.map((s) => s.player)
    for (const m of ctrl.matches) {
      const { home: h, away: a } = m.detail.finalStats
      expect(h.possession + a.possession).toBe(100)
      expect(m.gf).toBeLessThanOrEqual(h.shotsOnTarget)
      expect(h.shotsOnTarget).toBeLessThanOrEqual(h.shots)
      expect(h.saves).toBe(Math.max(0, a.shotsOnTarget - m.ga))
      expect(h.bigChances).toBeLessThanOrEqual(h.shots)
      const tl = buildMatchTimeline(m, players, 'S', 'T', null, squad)
      const shots = (team) => tl.events.filter((e) => e.team === team && e.countsShot).length
      expect(shots('home')).toBeLessThanOrEqual(h.shots)
      expect(shots('away')).toBeLessThanOrEqual(a.shots)
      expect(tl.events.filter((e) => e.type === 'goal' && e.team === 'home').length).toBe(m.gf)
    }
  })

  it('run offer count never exceeds 6 even on deep runs', () => {
    for (const run of baseline.runs) {
      const { state } = runWithUpgrades(run, { pickAt: (i, opts) => opts[0] })
      expect(state.offers.length).toBeLessThanOrEqual(MAX_UPGRADES_PER_RUN)
      expect(state.owned.length).toBeLessThanOrEqual(MAX_UPGRADES_PER_RUN)
    }
  })

  it('Sim All: recordSimAllSkips is deterministic bookkeeping that never touches results', () => {
    const run = baseline.runs[1]
    const squad = squadFromFixture(run)
    const { total } = computeRating(squad)
    const mk = () => {
      const state = { owned: [], offers: [] }
      const ctrl = createRunSimulation({
        rating: total, difficulty: run.config.difficulty, squad,
        rng: makeRng(run.seed), runSeed: run.seed,
        engineVersion: LEGACY_ENGINE_VERSION,
        upgradeContextFor: (mc, p) => buildUpgradeContext(state.owned, mc, p),
      })
      return { state, ctrl }
    }
    const a = mk()
    a.ctrl.prepareNext(); a.ctrl.resolveNext('balanced')
    a.ctrl.finishRemaining('balanced')
    const resA = snapshotRun(a.ctrl.finish())
    recordSimAllSkips(a.state, a.ctrl, 1, run.seed)
    expect(snapshotRun(a.ctrl.finish())).toEqual(resA) // bookkeeping changed nothing
    const b = mk()
    b.ctrl.prepareNext(); b.ctrl.resolveNext('balanced')
    b.ctrl.finishRemaining('balanced')
    recordSimAllSkips(b.state, b.ctrl, 1, run.seed)
    expect(a.state.offers).toEqual(b.state.offers) // deterministic skips
    for (const o of a.state.offers) { expect(o.chosenId).toBe('skipped'); expect(o.viaSimAll).toBe(true) }
    expect(a.state.offers.length).toBeLessThanOrEqual(MAX_UPGRADES_PER_RUN)
  })
})

// ---------------------------------------------------------------------------
describe('calibration: no dominant upgrade', () => {
  it('per-upgrade mean probability-delta contribution when active stays ≤ 0.015', () => {
    const squads = baseline.runs.map(squadFromFixture)
    const report = {}
    for (const u of UPGRADE_POOL) {
      const owned = [{ id: u.id, stacks: u.stackMax }]
      let sum = 0
      let n = 0
      for (const squad of squads) {
        const profile = buildSquadTacticalProfile(squad)
        for (const opp of OPPONENTS) {
          for (const key of APPROACH_KEYS) {
            const mc = { approachKey: key, opponentMeta: opp, kind: 'ko', round: 'Round of 16', runRecord: { w: 4, d: 2, l: 0 }, prevResult: 'win' }
            const c = buildUpgradeContext(owned, mc, profile)
            if (!c.activeIds.length) continue
            const withU = resolveTacticalMatchup(applyTacticalApproach(profile, key, c), buildOpponentTacticalProfile(opp))
            const without = resolveTacticalMatchup(applyTacticalApproach(profile, key, null), buildOpponentTacticalProfile(opp))
            sum += withU.probabilityDelta - without.probabilityDelta
            n++
          }
        }
      }
      const mean = n ? sum / n : 0
      report[u.id] = +mean.toFixed(4)
      expect(Math.abs(mean)).toBeLessThanOrEqual(0.015)
    }
    // eslint-disable-next-line no-console
    console.log('[phase6 upgrade calibration]', JSON.stringify(report))
  })
})
