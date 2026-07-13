import { beforeAll, describe, expect, it } from 'vitest'
import {
  PLAYERS,
  buildSimSeed,
  computeRating,
  createRunSimulation,
  makeRng,
} from './data'
import { activationCatalogVersion } from './data/v2/catalogues'
import {
  ACTIVE_ENGINE_VERSION,
  ENGINE_VERSIONS,
  LEGACY_ENGINE_VERSION,
  M1_ENGINE_VERSION,
  isKnownEngineVersion,
  isRunnableEngineVersion,
  resolveMatchByEngineVersion,
} from './matchEngineVersions'
import {
  calibrationFixture,
  checkCalibrationOrderings,
  checkLegacyFixedSeedParity,
  evaluateLegacyCalibration,
  executeLegacyFixtureRun,
  phase3Fixture,
  runLegacyCalibrationSweep,
  stableCalibrationSignature,
  squadFromPhase3Fixture,
} from './matchCalibration'

function completeController(seed, fixtureRunIndex = 0) {
  const run = phase3Fixture.runs[fixtureRunIndex]
  const squad = squadFromPhase3Fixture(fixtureRunIndex)
  const ctrl = createRunSimulation({
    rating: computeRating(squad).total,
    difficulty: run.config.difficulty,
    squad,
    rng: makeRng(seed),
    runSeed: seed,
    engineVersion: LEGACY_ENGINE_VERSION,
  })
  while (!ctrl.isDone) {
    ctrl.prepareNext()
    if (!ctrl.isDone) ctrl.resolveNext('balanced')
  }
  return { ctrl, result: ctrl.finish(), squad }
}

function historicalRunSnapshot(result) {
  const matches = [
    ...result.leaguePhase.matches,
    ...(result.playoff ? [result.playoff] : []),
    ...result.knockouts,
  ]
  return {
    exitStage: result.exitStage,
    champion: result.champion,
    position: result.leaguePhase.position,
    points: result.leaguePhase.points,
    topScorer: result.topScorer,
    topAssister: result.topAssister,
    matches: matches.map((match) => ({
      kind: match.type,
      round: match.round || null,
      opponent: match.opponent,
      score: match.score,
      result: match.result,
      scorers: match.events.filter((event) => event.side === 'us').map((event) => event.scorer),
      assists: match.events.filter((event) => event.side === 'us' && event.assist).map((event) => event.assist),
      oppGoals: match.events.filter((event) => event.side === 'opp').length,
    })),
  }
}

describe('version registry and frozen legacy dispatch', () => {
  it('keeps legacy_v1 active while registering m1 as explicitly runnable', () => {
    expect(ACTIVE_ENGINE_VERSION).toBe(LEGACY_ENGINE_VERSION)
    expect(Object.keys(ENGINE_VERSIONS).sort()).toEqual([LEGACY_ENGINE_VERSION, M1_ENGINE_VERSION].sort())
    expect(isKnownEngineVersion(LEGACY_ENGINE_VERSION)).toBe(true)
    expect(isRunnableEngineVersion(LEGACY_ENGINE_VERSION)).toBe(true)
    expect(isKnownEngineVersion(M1_ENGINE_VERSION)).toBe(true)
    expect(isRunnableEngineVersion(M1_ENGINE_VERSION)).toBe(true)
  })

  it('dispatches each version only to its explicit resolver', () => {
    const sentinel = { current: 'legacy-result' }
    const m1Sentinel = { current: 'm1-result' }
    let calls = 0
    let m1Calls = 0
    expect(resolveMatchByEngineVersion({
      engineVersion: LEGACY_ENGINE_VERSION,
      legacyResolver: () => { calls++; return sentinel },
    })).toBe(sentinel)
    expect(calls).toBe(1)
    expect(resolveMatchByEngineVersion({
      engineVersion: M1_ENGINE_VERSION,
      legacyResolver: () => sentinel,
      m1Resolver: () => { m1Calls++; return m1Sentinel },
    })).toBe(m1Sentinel)
    expect(calls).toBe(1)
    expect(m1Calls).toBe(1)
    expect(() => resolveMatchByEngineVersion({
      engineVersion: 'unknown_future',
      legacyResolver: () => sentinel,
    })).toThrow(/unknown/i)
  })

  it('runs explicit m1, rejects unknown versions, and never mixes engines', () => {
    const run = phase3Fixture.runs[0]
    const squad = squadFromPhase3Fixture(0)
    const args = { rating: computeRating(squad).total, difficulty: run.config.difficulty, squad, rng: makeRng(run.seed), runSeed: run.seed }
    const m1 = createRunSimulation({ ...args, engineVersion: M1_ENGINE_VERSION })
    expect(m1.engineVersion).toBe(M1_ENGINE_VERSION)
    m1.prepareNext()
    expect(m1.resolveNext('balanced').engineVersion).toBe(M1_ENGINE_VERSION)
    expect(() => createRunSimulation({ ...args, engineVersion: 'future_v99' })).toThrow(/unknown/i)
    const ctrl = createRunSimulation({ ...args, engineVersion: LEGACY_ENGINE_VERSION })
    expect(ctrl.engineVersion).toBe(LEGACY_ENGINE_VERSION)
    expect(() => { ctrl.engineVersion = M1_ENGINE_VERSION }).toThrow()
    expect(ctrl.engineVersion).toBe(LEGACY_ENGINE_VERSION)
    ctrl.prepareNext()
    ctrl.resolveNext('balanced')
    expect(ctrl.engineVersion).toBe(LEGACY_ENGINE_VERSION)
  })
})

describe('M0 exact deterministic calibration freeze', () => {
  it('matches every frozen match/detail/timeline/replay and full-run fixture exactly', () => {
    const parity = checkLegacyFixedSeedParity()
    expect(parity.engineVersion).toBe(LEGACY_ENGINE_VERSION)
    expect(parity.failures).toEqual([])
    expect(parity.matches).toHaveLength(5)
    expect(parity.runs).toHaveLength(4)
  })

  it('preserves all 16 historical fixed-seed run outputs across every formation', () => {
    for (let index = 0; index < phase3Fixture.runs.length; index++) {
      const fixtureRun = phase3Fixture.runs[index]
      const execution = executeLegacyFixtureRun(index)
      expect(execution.ctrl.engineVersion).toBe(LEGACY_ENGINE_VERSION)
      expect(computeRating(execution.squad).total).toBe(fixtureRun.rating)
      expect(historicalRunSnapshot(execution.result)).toEqual(fixtureRun.expected)
      expect(execution.ctrl.resolvedCount).toBe(fixtureRun.expected.matches.length)
      expect(execution.ctrl.isDone).toBe(true)
    }
  })

  it('same seed is byte-identical while controlled different seeds retain diversity', () => {
    const a = completeController(0x1a2b3c4d)
    const b = completeController(0x1a2b3c4d)
    expect(JSON.stringify({ matches: a.ctrl.matches, result: a.result }))
      .toBe(JSON.stringify({ matches: b.ctrl.matches, result: b.result }))

    const results = new Set()
    const scores = new Set()
    for (let seed = 1; seed <= 16; seed++) {
      const run = phase3Fixture.runs[0]
      const squad = squadFromPhase3Fixture(0)
      const ctrl = createRunSimulation({
        rating: computeRating(squad).total,
        difficulty: run.config.difficulty,
        squad,
        rng: makeRng(seed),
        runSeed: seed,
        engineVersion: LEGACY_ENGINE_VERSION,
      })
      ctrl.prepareNext()
      const match = ctrl.resolveNext('balanced')
      results.add(match.result)
      scores.add(match.score)
    }
    expect(results.size).toBeGreaterThan(1)
    expect(scores.size).toBeGreaterThan(1)
  })

  it('keeps Daily inputs, engine, canonical outcomes, and catalogue boundary deterministic', () => {
    const daily = phase3Fixture.runs[15]
    const first = executeLegacyFixtureRun(15)
    const second = executeLegacyFixtureRun(15)
    expect(first.ctrl.engineVersion).toBe(LEGACY_ENGINE_VERSION)
    expect(JSON.stringify({ matches: first.ctrl.matches, result: first.result }))
      .toBe(JSON.stringify({ matches: second.ctrl.matches, result: second.result }))
    const ids = daily.squad.map(({ id }) => id)
    const slots = daily.squad.map(({ slot }) => slot)
    const seedArgs = { dateKey: '2026-07-05', formation: daily.config.formation, ids, slots, difficulty: daily.config.difficulty, pool: daily.config.pool, rerollsUsed: 0 }
    expect(buildSimSeed(seedArgs)).toBe(buildSimSeed(seedArgs))
    expect(activationCatalogVersion({ mode: 'daily', pool: 'modern' })).toBe('legacy_v1')
    expect(activationCatalogVersion({ mode: 'daily', pool: 'legends' })).toBe('legacy_v1')
    expect(activationCatalogVersion({ mode: 'random', pool: 'legends' })).toBe('legacy_v1')
  })

  it('keeps every historical fixture player resolvable and every formation complete', () => {
    const ids = new Set(PLAYERS.map((player) => player.id))
    for (const run of phase3Fixture.runs) {
      expect(run.squad).toHaveLength(11)
      expect(run.squad.every(({ id }) => ids.has(id))).toBe(true)
      expect(run.squad.map(({ slot }) => slot)).toEqual(
        phase3Fixture.runs.find((candidate) => candidate.config.formation === run.config.formation).squad.map(({ slot }) => slot),
      )
    }
  })
})

describe('M0 deterministic aggregate calibration bands', () => {
  let aggregate

  beforeAll(() => {
    aggregate = runLegacyCalibrationSweep()
  })

  it('stays inside every documented preserve band', () => {
    expect(aggregate.engineVersion).toBe(LEGACY_ENGINE_VERSION)
    expect(aggregate.sampleRunsPerCell).toBe(calibrationFixture.sampleRunsPerCell)
    expect(evaluateLegacyCalibration(aggregate)).toEqual([])
  })

  it('preserves difficulty, squad, opponent-strength, and role-balance orderings', () => {
    expect(checkCalibrationOrderings(aggregate)).toEqual([])
    expect(aggregate.roleBalance.no_midfield_holder.weaknesses).toContain('No Defensive Shield')
    expect(aggregate.roleBalance.over_creative_midfield.weaknesses).toContain('Too Many Creators')
    expect(aggregate.roleBalance.no_natural_width.weaknesses).toContain('No Natural Width')
    expect(aggregate.roleBalance.weak_defensive_structure.weaknesses).toContain('Weak Defense')
  })

  it('reports penalties, formation outcomes, match metrics, and Match Plans without hard-freezing plan deltas', () => {
    expect(aggregate.runLevel.penaltiesRunRate).toBeGreaterThan(0)
    expect(Object.keys(aggregate.formations).sort()).toEqual(['3-5-2', '4-2-3-1', '4-3-3', '4-4-2', '5-3-2'].sort())
    for (const squad of Object.values(aggregate.matchLevel)) {
      for (const band of Object.values(squad.opponentBands)) {
        expect(band.winRate + band.drawRate + band.lossRate).toBeCloseTo(1, 3)
        expect(band.sampleMatches).toBeGreaterThan(100)
      }
    }
    expect(Object.keys(aggregate.matchPlansMonitorOnly).sort()).toEqual(['balanced', 'control', 'counter', 'wide'].sort())
    expect(calibrationFixture.classification.monitorOnly).toContain('exact current Match Plan W/D/L delta')
  })

  it('has a stable full-sweep signature and deterministic reduced sweep', () => {
    expect(stableCalibrationSignature(aggregate)).toBe('76273921')
    const a = runLegacyCalibrationSweep({ sampleRunsPerCell: 4 })
    const b = runLegacyCalibrationSweep({ sampleRunsPerCell: 4 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('does not promote known legacy defects into the M1 preserve contract', () => {
    expect(calibrationFixture.classification.intentionallyChangeInM1).toContain('the structural 11-scoreline limit')
    expect(calibrationFixture.classification.intentionallyChangeInM1).toContain('flat uniform goal timing')
    expect(calibrationFixture.classification.intentionallyChangeInM1).toContain('non-causal match events')
    expect(calibrationFixture.classification.preserve).toContain('Daily and Resume canonical equality')
  })
})
