import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import m1Fixture from './matchEngineM1.fixture.json'
import {
  OPPONENTS,
  ROLE_GUIDE,
  computeRating,
  createRunSimulation,
  makeRng,
} from './data'
import { developmentMatchEngineVersion } from './App'
import { V2_PLAYERS } from './data/v2'
import { SIGNATURES } from './data/v2/schema'
import { buildMatchTimeline } from './matchTimeline'
import { canonicalMatchSignature } from './runPersistence'
import {
  ACTIVE_ENGINE_VERSION,
  LEGACY_ENGINE_VERSION,
  M1_ENGINE_VERSION,
} from './matchEngineVersions'
import {
  M1_ROLE_HOOKS,
  M1_RNG_CONTRACT,
  M1_SIGNATURE_HOOKS,
  M1_WINDOWS,
  deriveM1EventMetrics,
  m1ScoreStateOpportunityMultiplier,
} from './matchEngineM1'
import { squadFromPhase3Fixture } from './matchCalibration'
import {
  M1_ARCHETYPE_KEYS,
  M1_PLAN_KEYS,
  REPRESENTATIVE_OPPONENTS,
  controlledM1Match,
  opponentMetrics,
  planMetrics,
  roleAndSignatureMetrics,
} from './matchEngineM1Calibration'

const opponentById = Object.fromEntries(OPPONENTS.map((opponent) => [opponent.id, opponent]))
const baseSquad = squadFromPhase3Fixture(m1Fixture.squadFixtureRunIndex)
const playerById = Object.fromEntries(baseSquad.map(({ player }) => [player.id, player]))
let sweepCache = null

function controlledSweep(count = 800) {
  if (sweepCache?.length === count) return sweepCache
  sweepCache = Array.from({ length: count }, (_, index) => controlledM1Match({
    seed: index + 1,
    squad: baseSquad,
    opponent: OPPONENTS[index % OPPONENTS.length],
    approach: M1_PLAN_KEYS[index % M1_PLAN_KEYS.length],
  }))
  return sweepCache
}

function rate(matches, predicate) {
  return matches.filter(predicate).length / matches.length
}

function routeShare(metrics, routes) {
  return routes.reduce((sum, route) => sum + (metrics.routes[route] || 0), 0)
}

function firstM1(seed = 1, approach = 'balanced', squad = squadFromPhase3Fixture(0), difficulty = 'classic') {
  const ctrl = createRunSimulation({
    rating: computeRating(squad).total,
    difficulty,
    squad,
    rng: makeRng(seed),
    runSeed: seed,
    engineVersion: M1_ENGINE_VERSION,
  })
  const pending = ctrl.prepareNext()
  const match = ctrl.resolveNext(approach)
  return { ctrl, pending, match, squad }
}

describe('M1 causal core invariants', () => {
  it('is explicitly runnable without public activation', () => {
    const { ctrl, match } = firstM1(0x10101010)
    expect(ACTIVE_ENGINE_VERSION).toBe(LEGACY_ENGINE_VERSION)
    expect(ctrl.engineVersion).toBe(M1_ENGINE_VERSION)
    expect(match.engineVersion).toBe(M1_ENGINE_VERSION)
    expect(match.rngContract).toBe(M1_RNG_CONTRACT)
  })

  it('is byte-identical for the same seed and diverse for different seeds', () => {
    const a = firstM1(0x20202020).match
    const b = firstM1(0x20202020).match
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const signatures = new Set(Array.from({ length: 12 }, (_, index) => canonicalMatchSignature(firstM1(index + 1).match, 0)))
    expect(signatures.size).toBeGreaterThan(5)
  })

  it('contains no unseeded random call in the M1 module', () => {
    const source = readFileSync(new URL('./matchEngineM1.js', import.meta.url), 'utf8')
    expect(source).not.toContain('Math.random')
  })

  it('derives score and legacy goal events only from canonical scoring events', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const { match } = firstM1(seed)
      const goals = match.causalEvents.filter((event) => event.goal)
      const gf = goals.filter((event) => event.side === 'us').length
      const ga = goals.filter((event) => event.side === 'opp').length
      expect([match.gf, match.ga]).toEqual([gf, ga])
      expect(match.events).toHaveLength(goals.length)
      expect(match.goals).toEqual(match.events)
      expect(match.events.map((event) => event.causalEventId)).toEqual(goals.map((event) => event.id))
    }
  })

  it('keeps causal events chronological with honest before/after state', () => {
    const { match } = firstM1(0x30303030)
    let us = 0
    let opp = 0
    for (let index = 0; index < match.causalEvents.length; index++) {
      const event = match.causalEvents[index]
      if (index) expect(event.minute).toBeGreaterThanOrEqual(match.causalEvents[index - 1].minute)
      expect(event.scoreBefore).toEqual({ us, opp })
      if (event.goal) event.side === 'us' ? us++ : opp++
      expect(event.scoreAfter).toEqual({ us, opp })
    }
  })

  it('derives every hard statistic from the event reducer', () => {
    for (let seed = 90; seed < 110; seed++) {
      const { match } = firstM1(seed)
      const reduced = deriveM1EventMetrics(match.causalEvents)
      expect(match.eventMetrics).toEqual(reduced)
      expect(match.detail.finalStats.home).toMatchObject({
        possession: reduced.home.possession,
        shots: reduced.home.shots,
        shotsOnTarget: reduced.home.shotsOnTarget,
        saves: reduced.home.saves,
        bigChances: reduced.home.bigChances,
      })
      expect(match.detail.finalStats.away).toMatchObject({
        possession: reduced.away.possession,
        shots: reduced.away.shots,
        shotsOnTarget: reduced.away.shotsOnTarget,
        saves: reduced.away.saves,
        bigChances: reduced.away.bigChances,
      })
    }
  })

  it('adapts MatchDetail and timeline without inventing goals or routes', () => {
    const { match, squad } = firstM1(0x40404040, 'wide')
    const timeline = buildMatchTimeline(match, squad.map((entry) => entry.player), 'League Phase', 'M1 XI', null, squad)
    const timelineGoals = timeline.events.filter((event) => event.type === 'goal')
    expect(timelineGoals.map((event) => event.causalEventId)).toEqual(match.causalEvents.filter((event) => event.goal).map((event) => event.id))
    for (const event of timeline.events) {
      const causal = match.causalEvents.find((candidate) => candidate.id === event.causalEventId)
      expect(causal).toBeTruthy()
      expect(event.route).toBe(causal.route)
      expect(event.seq.pattern).toBe(causal.route)
    }
    expect(timeline.finalStats.home.shots).toBe(match.eventMetrics.home.shots)
    expect(timeline.finalStats.away.sot).toBe(match.eventMetrics.away.shotsOnTarget)
  })

  it('keeps the development override isolated from production and Daily', () => {
    expect(developmentMatchEngineVersion({ mode: 'random' }, '?engine=m1', true)).toBe(M1_ENGINE_VERSION)
    expect(developmentMatchEngineVersion({ mode: 'daily' }, '?engine=m1', true)).toBe(LEGACY_ENGINE_VERSION)
    expect(developmentMatchEngineVersion({ mode: 'random' }, '?engine=m1', false)).toBe(LEGACY_ENGINE_VERSION)
    expect(developmentMatchEngineVersion({ mode: 'random' }, '', true)).toBe(LEGACY_ENGINE_VERSION)
  })
})

describe('M1 exact causal fixtures', () => {
  for (const fixture of m1Fixture.fixtures) {
    it(fixture.name, () => {
      const match = controlledM1Match({
        seed: fixture.seed,
        squad: baseSquad,
        opponent: opponentById[fixture.opponentId],
        approach: fixture.approach,
        kind: fixture.kind,
        round: fixture.round,
      })
      expect(match.score).toBe(fixture.score)
      expect(match.result).toBe(fixture.result)
      expect(canonicalMatchSignature(match, 0)).toBe(fixture.signature)
      if (fixture.expectedRoute) expect(match.causalEvents.some((event) => event.route === fixture.expectedRoute)).toBe(true)
      if (fixture.expectedSignature) {
        expect(match.causalEvents.some((event) => event.goal && event.causes.signatures.includes(fixture.expectedSignature))).toBe(true)
      }
      if (fixture.name.includes('comeback')) {
        expect(match.causalEvents.some((event) => event.scoreAfter.us < event.scoreAfter.opp)).toBe(true)
      }
      if (fixture.kind === 'ko') {
        expect(match.gf).toBe(match.ga)
        expect(match.pens).toBeTruthy()
      }
    })
  }
})

describe('M1 outcome-space and timing properties', () => {
  it('expands scorelines while keeping rare tails bounded', () => {
    const matches = controlledSweep()
    const scorelines = new Set(matches.map((match) => `${match.gf}-${match.ga}`))
    expect(scorelines.size).toBeGreaterThan(11)
    expect(matches.some((match) => match.gf === 0 && match.ga === 0)).toBe(true)
    expect(matches.some((match) => match.gf === match.ga && match.gf >= 2)).toBe(true)
    expect(matches.some((match) => Math.max(match.gf, match.ga) >= 4)).toBe(true)
    expect(matches.some((match) => match.result === 'loss')).toBe(true)
    expect(Math.max(...matches.flatMap((match) => [match.gf, match.ga]))).toBeLessThanOrEqual(8)
    expect(rate(matches, (match) => Math.max(match.gf, match.ga) >= 4)).toBeLessThan(0.1)
  })

  it('allows midfielders and defenders to score without displacing forwards', () => {
    const goals = controlledSweep().flatMap((match) => match.causalEvents.filter((event) => event.side === 'us' && event.goal && event.shooterId))
    const byPosition = { DEF: 0, MID: 0, ATT: 0 }
    const scorers = new Set()
    for (const goal of goals) {
      scorers.add(goal.shooterId)
      byPosition[playerById[goal.shooterId]?.posType]++
    }
    const frontThree = new Set(baseSquad.filter(({ slot }) => ['RW', 'ST', 'LW'].includes(slot)).map(({ player }) => player.id))
    expect(scorers.size).toBeGreaterThan(6)
    expect(byPosition.DEF).toBeGreaterThan(0)
    expect(byPosition.MID).toBeGreaterThan(0)
    expect(byPosition.ATT).toBeGreaterThan(byPosition.MID)
    expect(goals.filter((goal) => !frontThree.has(goal.shooterId)).length / goals.length).toBeGreaterThan(0.2)
  })

  it('uses six non-flat windows and never scripts a comeback or late winner', () => {
    expect(M1_WINDOWS.map((window) => [window.start, window.end])).toEqual([[1, 15], [16, 30], [31, 45], [46, 60], [61, 75], [76, 90]])
    expect(new Set(M1_WINDOWS.map((window) => window.tempo)).size).toBeGreaterThan(3)
    expect(m1ScoreStateOpportunityMultiplier({ us: 0, opp: 2, side: 'us', phase: 'late' }))
      .toBeGreaterThan(m1ScoreStateOpportunityMultiplier({ us: 0, opp: 1, side: 'us', phase: 'late' }))
    expect(m1ScoreStateOpportunityMultiplier({ us: 0, opp: 1, side: 'us', phase: 'late' })).toBeGreaterThan(1)
    expect(m1ScoreStateOpportunityMultiplier({ us: 2, opp: 0, side: 'us', phase: 'late' })).toBeLessThan(1)

    const matches = controlledSweep()
    const goalBands = Array(6).fill(0)
    for (const match of matches) match.eventMetrics.goalBands.forEach((value, index) => { goalBands[index] += value })
    expect(goalBands.every((count) => count > 0)).toBe(true)
    expect(new Set(goalBands).size).toBeGreaterThan(2)
    expect(matches.some((match) => {
      const half = match.causalEvents.filter((event) => event.goal && event.minute <= 45).at(-1)?.scoreAfter
      return half?.us < half?.opp && match.result !== 'win'
    })).toBe(true)
    expect(matches.some((match) => match.result === 'draw' && match.causalEvents.some((event) => event.minute >= 76 && event.scoreBefore.us === event.scoreBefore.opp))).toBe(true)
  })

  it('orders difficulty and both quality axes in paired deterministic sweeps', () => {
    const seeds = Array.from({ length: 320 }, (_, index) => index + 10000)
    const difficultyRates = Object.fromEntries(['casual', 'classic', 'legendary'].map((difficulty) => [difficulty, rate(
      seeds.map((seed) => controlledM1Match({ seed, squad: baseSquad, opponent: REPRESENTATIVE_OPPONENTS.elite, difficulty })),
      (match) => match.result === 'win',
    )]))
    expect(difficultyRates.casual).toBeGreaterThan(difficultyRates.classic)
    expect(difficultyRates.classic).toBeGreaterThan(difficultyRates.legendary)

    const qualityRates = [0.52, 0.67, 0.82].map((qualityProbability) => rate(
      seeds.map((seed) => controlledM1Match({ seed, squad: baseSquad, opponent: REPRESENTATIVE_OPPONENTS.elite, qualityProbability })),
      (match) => match.result === 'win',
    ))
    expect(qualityRates[2]).toBeGreaterThan(qualityRates[1])
    expect(qualityRates[1]).toBeGreaterThan(qualityRates[0])

    const strengths = [72, 82, 92]
    const opponentWinRates = strengths.map((strength) => rate(
      seeds.map((seed) => controlledM1Match({ seed, squad: baseSquad, opponent: { ...REPRESENTATIVE_OPPONENTS.elite, strength } })),
      (match) => match.result === 'win',
    ))
    expect(opponentWinRates[0]).toBeGreaterThan(opponentWinRates[1])
    expect(opponentWinRates[1]).toBeGreaterThan(opponentWinRates[2])
  })
})

describe('M1 plans, archetypes, Roles and Signatures', () => {
  it('makes every Match Plan measurably causal with an explicit specialized downside', () => {
    const plans = planMetrics({ squad: baseSquad, samplesPerCell: 40 })
    const balanced = plans.balanced
    for (const key of ['control', 'wide', 'counter']) {
      const variation = new Set([...Object.keys(balanced.routes), ...Object.keys(plans[key].routes)])
      const routeDistance = [...variation].reduce((sum, route) => sum + Math.abs((balanced.routes[route] || 0) - (plans[key].routes[route] || 0)), 0)
      expect(routeDistance).toBeGreaterThan(0.12)
      expect(plans[key].explicitDownside).toBeGreaterThan(0)
      expect([plans[key].winRate, plans[key].drawRate, plans[key].lossRate]).not.toEqual([balanced.winRate, balanced.drawRate, balanced.lossRate])
    }
    expect(routeShare(plans.wide, ['wide_overlap', 'cross', 'cutback'])).toBeGreaterThan(routeShare(balanced, ['wide_overlap', 'cross', 'cutback']) + 0.08)
    expect(routeShare(plans.counter, ['counterattack', 'direct_attack', 'pressing_recovery'])).toBeGreaterThan(routeShare(balanced, ['counterattack', 'direct_attack', 'pressing_recovery']) + 0.08)
    expect(plans.control.volatility).toBeLessThan(plans.counter.volatility)
  })

  it('gives all seven opponent archetypes distinct route and pressure profiles', () => {
    const opponents = opponentMetrics({ squad: baseSquad, samplesPerCell: 96 })
    expect(Object.keys(opponents).sort()).toEqual([...M1_ARCHETYPE_KEYS].sort())
    expect(opponents.pressing.routeMix.pressing_recovery).toBeGreaterThan(opponents.elite.routeMix.pressing_recovery)
    expect(opponents.physical.routeMix.direct_attack).toBeGreaterThan(opponents.elite.routeMix.direct_attack)
    expect(opponents.defensive.routeMix.counterattack).toBeGreaterThan(opponents.technical.routeMix.counterattack)
    expect(opponents.attacking.opponentOpportunities).toBeGreaterThan(opponents.defensive.opponentOpportunities)
    expect(new Set(Object.values(opponents).map((metrics) => JSON.stringify(metrics.routeMix))).size).toBe(M1_ARCHETYPE_KEYS.length)
  })

  it('covers the full Role and Signature vocabularies without fallthrough', () => {
    expect(Object.keys(M1_ROLE_HOOKS).sort()).toEqual(ROLE_GUIDE.map(({ role }) => role).sort())
    expect(Object.keys(M1_SIGNATURE_HOOKS).sort()).toEqual([...SIGNATURES].sort())
    const activeSignatures = new Set(V2_PLAYERS.flatMap((player) => player.signatures || []))
    expect([...activeSignatures].filter((signature) => !M1_SIGNATURE_HOOKS[signature])).toEqual([])
  })

  it('shows bounded, context-specific Role and Signature effects', () => {
    const effects = roleAndSignatureMetrics({ squad: baseSquad, samplesPerPair: 192 })
    expect(effects.roles.defensiveShield.activeDangerXgPerMatch).toBeLessThan(effects.roles.defensiveShield.baselineDangerXgPerMatch)
    expect(effects.roles.tempoController.activeProgressionRate).toBeGreaterThan(effects.roles.tempoController.baselineProgressionRate)
    expect(effects.roles.touchlineWinger.activeWideRouteShare).toBeGreaterThan(effects.roles.touchlineWinger.baselineWideRouteShare)
    expect(effects.roles.boxFinisher.activeBoxConversionRate).toBeGreaterThan(effects.roles.boxFinisher.baselineBoxConversionRate)
    expect(effects.roles.boxFinisher.activeBoxConversionRate - effects.roles.boxFinisher.baselineBoxConversionRate).toBeLessThan(0.08)
    expect(effects.roles.sweeperKeeper.activeTransitionProgressionRate).toBeLessThan(effects.roles.sweeperKeeper.baselineTransitionProgressionRate)
    expect(effects.roles.shotStopper.activeOpponentConversionRate).toBeLessThan(effects.roles.shotStopper.baselineOpponentConversionRate)
    expect(effects.signatures.recoveryPace.activeTransitionProgressionRate).toBeLessThan(effects.signatures.recoveryPace.removedTransitionProgressionRate)
    expect(effects.signatures.aerialTarget.activeAerialShotInvolvement).toBeGreaterThan(effects.signatures.aerialTarget.removedAerialShotInvolvement)
    expect(effects.signatures.distanceThreat.activePlayerShotsPerMatch).toBeGreaterThan(effects.signatures.distanceThreat.removedPlayerShotsPerMatch)
    expect(effects.signatures.finalBall.activeCreationXgPerMatch).toBeGreaterThan(effects.signatures.finalBall.removedCreationXgPerMatch)
    for (const group of Object.values(effects)) for (const hook of Object.values(group)) expect(hook.evidencePerMatch).toBeGreaterThan(0)
  })
})

describe('M1 substream isolation', () => {
  it('keeps penalties and outcomes independent from presentation consumption', () => {
    const fixture = m1Fixture.fixtures.find((candidate) => candidate.kind === 'ko')
    const create = () => controlledM1Match({
      seed: fixture.seed,
      squad: baseSquad,
      opponent: opponentById[fixture.opponentId],
      approach: fixture.approach,
      kind: fixture.kind,
      round: fixture.round,
    })
    const before = create()
    const presentation = makeRng(before.presentationSeed)
    for (let index = 0; index < 500; index++) presentation()
    const after = create()
    expect(after.pens).toEqual(before.pens)
    expect(after.score).toBe(before.score)
    expect(after.causalEvents).toEqual(before.causalEvents)
  })

  it('lets commentary inputs vary without changing canonical match outcome', () => {
    const { match, squad } = firstM1(0x51515151, 'counter')
    const signature = canonicalMatchSignature(match, 0)
    const a = buildMatchTimeline(match, squad.map(({ player }) => player), 'League Phase', 'Alpha XI', null, squad)
    const b = buildMatchTimeline(match, squad.map(({ player }) => player), 'League Phase', 'Beta XI', null, squad)
    expect(canonicalMatchSignature(match, 0)).toBe(signature)
    expect(a.events.map((event) => event.causalEventId)).toEqual(b.events.map((event) => event.causalEventId))
    expect(a.finalStats).toEqual(b.finalStats)
  })
})
