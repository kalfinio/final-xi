import phase3Fixture from './simBaselinePhase3.fixture.json'
import legacyFixture from './matchEngineLegacy.fixture.json'
import calibrationFixture from './matchCalibration.fixture.json'
import {
  FORMATIONS,
  PLAYERS,
  computeRating,
  createRunSimulation,
  hashString,
  makeRng,
  squadBaseProb,
} from './data'
import { buildMatchTimeline } from './matchTimeline'
import { LEGACY_ENGINE_VERSION } from './matchEngineVersions'

const byId = Object.fromEntries(PLAYERS.map((player) => [player.id, player]))
const round4 = (value) => Math.round(value * 10000) / 10000

export function stableCalibrationSignature(value) {
  return hashString(JSON.stringify(value)).toString(16).padStart(8, '0')
}

export function squadFromPhase3Fixture(fixtureRunIndex) {
  const fixtureRun = phase3Fixture.runs[fixtureRunIndex]
  if (!fixtureRun) throw new RangeError(`Unknown Phase 3 fixture run: ${fixtureRunIndex}`)
  return fixtureRun.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))
}

function executeVersionedRun({ squad, difficulty = 'classic', seed, approach = 'balanced', engineVersion = LEGACY_ENGINE_VERSION }) {
  const ctrl = createRunSimulation({
    rating: computeRating(squad).total,
    difficulty,
    squad,
    rng: makeRng(seed),
    runSeed: seed,
    engineVersion,
  })
  while (!ctrl.isDone) {
    ctrl.prepareNext()
    if (!ctrl.isDone) ctrl.resolveNext(approach)
  }
  return { ctrl, result: ctrl.finish() }
}

export function executeLegacyFixtureRun(fixtureRunIndex) {
  const run = phase3Fixture.runs[fixtureRunIndex]
  const squad = squadFromPhase3Fixture(fixtureRunIndex)
  return {
    fixtureRun: run,
    squad,
    ...executeVersionedRun({ squad, difficulty: run.config.difficulty, seed: run.seed, engineVersion: LEGACY_ENGINE_VERSION }),
  }
}

function eventWithPlayerIds(event, squad) {
  const byName = Object.fromEntries(squad.map(({ player }) => [player.name, player.id]))
  return {
    ...event,
    scorerId: event.side === 'us' ? (byName[event.scorer] || null) : null,
    assisterId: event.assist ? (byName[event.assist] || null) : null,
  }
}

function fullCanonicalMatchFields(match, squad) {
  const events = match.events.map((event) => eventWithPlayerIds(event, squad))
  return {
    type: match.type,
    matchNo: match.matchNo ?? null,
    round: match.round ?? null,
    opponent: match.opponent,
    opponentId: match.opponentMeta?.id || null,
    home: match.home ?? null,
    approach: match.approach,
    result: match.result,
    score: match.score,
    normalScore: match.normalScore ?? null,
    points: match.points ?? null,
    gf: match.gf,
    ga: match.ga,
    pens: match.pens ?? null,
    eliminated: match.eliminated ?? null,
    events,
    stats: match.stats,
    tacticalMetadata: match.matchup,
    detail: match.detail,
  }
}

export function canonicalLegacyMatch(exec, matchIndex) {
  const match = exec.ctrl.matches[matchIndex]
  if (!match) throw new RangeError(`Missing legacy match ${matchIndex}`)
  const fullMatch = fullCanonicalMatchFields(match, exec.squad)
  const timeline = buildMatchTimeline(
    match,
    exec.squad.map(({ player }) => player),
    match.type === 'league' ? 'League Phase' : match.round,
    'Calibration XI',
    null,
    exec.squad,
  )
  const goals = fullMatch.events.map((event) => ({
    minute: event.minute,
    side: event.side,
    scorer: event.scorer,
    scorerId: event.scorerId,
    assist: event.assist ?? null,
    assisterId: event.assisterId,
    label: event.label ?? null,
    assistLabel: event.assistLabel ?? null,
  }))
  return {
    opponent: match.opponent,
    opponentId: match.opponentMeta.id,
    result: match.result,
    score: match.score,
    gf: match.gf,
    ga: match.ga,
    pens: match.pens ?? null,
    goals,
    stats: match.stats,
    tacticalMetadataSignature: stableCalibrationSignature(match.matchup),
    matchDetailSignature: stableCalibrationSignature(match.detail),
    timelineSignature: stableCalibrationSignature(timeline),
    canonicalReplaySignature: stableCalibrationSignature({ match: fullMatch, timeline }),
  }
}

export function canonicalLegacyRun(exec) {
  const { result } = exec
  const matches = exec.ctrl.matches
  return {
    opponentSequence: matches.map((match) => match.opponentMeta.id),
    results: matches.map((match) => match.result),
    scorelines: matches.map((match) => match.score),
    qualification: result.leaguePhase.qualification,
    leagueRecord: result.leaguePhase.record,
    leaguePosition: result.leaguePhase.position,
    knockoutProgression: [
      ...(result.playoff ? [result.playoff.round] : []),
      ...result.knockouts.map((match) => match.round),
    ],
    exitStage: result.exitStage,
    champion: result.champion,
    resolvedCount: matches.length,
    runCheckpoint: `${matches.length}|${result.leaguePhase.qualification}|${result.exitStage}|${result.champion ? 'champion' : 'not-champion'}|${matches.at(-1)?.opponent || 'none'}|${matches.at(-1)?.score || 'none'}`,
    runSignature: stableCalibrationSignature({
      matches: matches.map((match) => ({
        opponent: match.opponent,
        score: match.score,
        result: match.result,
        events: match.events,
        stats: match.stats,
        matchup: match.matchup,
        detail: match.detail,
      })),
      result,
    }),
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function checkLegacyFixedSeedParity() {
  const executions = new Map()
  const getRun = (index) => {
    if (!executions.has(index)) executions.set(index, executeLegacyFixtureRun(index))
    return executions.get(index)
  }
  const failures = []
  const matches = legacyFixture.exactMatches.map((fixture) => {
    const actual = canonicalLegacyMatch(getRun(fixture.fixtureRunIndex), fixture.matchIndex)
    if (!sameJson(actual, fixture.expected)) {
      failures.push(`exact match run=${fixture.fixtureRunIndex} index=${fixture.matchIndex}`)
    }
    return { fixtureRunIndex: fixture.fixtureRunIndex, matchIndex: fixture.matchIndex, actual }
  })
  const runs = legacyFixture.exactRuns.map((fixture) => {
    const actual = canonicalLegacyRun(getRun(fixture.fixtureRunIndex))
    if (!sameJson(actual, fixture.expected)) failures.push(`exact run index=${fixture.fixtureRunIndex}`)
    return { fixtureRunIndex: fixture.fixtureRunIndex, actual }
  })
  return { engineVersion: LEGACY_ENGINE_VERSION, matches, runs, failures }
}

function squadFor(formation, ids) {
  return ids.map((id, index) => ({ slot: FORMATIONS[formation].slots[index], player: byId[id] }))
}

function calibrationSquads() {
  return {
    high: squadFromPhase3Fixture(0),
    medium: squadFromPhase3Fixture(1),
    low: squadFromPhase3Fixture(11),
    balanced: squadFromPhase3Fixture(0),
    no_midfield_holder: squadFor('4-3-3', ['casillas', 'cafu', 'cannavaro', 'maldini', 'robertocarlos', 'pirlo', 'xavi', 'iniesta', 'robben', 'vanbasten', 'ribery']),
    over_creative_midfield: squadFor('4-3-3', ['casillas', 'cafu', 'cannavaro', 'maldini', 'robertocarlos', 'iniesta', 'debruyne', 'platini', 'messi', 'henry', 'ronaldinho']),
    no_natural_width: squadFor('5-3-2', ['casillas', 'lahm', 'cannavaro', 'beckenbauer', 'ramos', 'alaba', 'pirlo', 'gattuso', 'deschamps', 'vanbasten', 'etoo']),
    weak_defensive_structure: squadFor('4-3-3', ['ricardo', 'cafu', 'vandijk', 'ferdinand', 'robertocarlos', 'pirlo', 'xavi', 'iniesta', 'robben', 'torres', 'ribery']),
  }
}

function seedFor(cell, index) {
  return hashString(`m0-calibration|${cell}|${index + 1}`)
}

function emptyRunAggregate() {
  return {
    runs: 0, w: 0, d: 0, l: 0, qualified: 0, penaltiesRuns: 0,
    penaltiesMatches: 0, resolved: 0, champion: 0,
    exit: { 'League Phase': 0, 'Knockout Play-Off': 0, 'Round of 16': 0, 'Quarter-final': 0, 'Semi-final': 0, Final: 0 },
  }
}

function addRunAggregate(aggregate, execution) {
  const { result, ctrl } = execution
  aggregate.runs++
  aggregate.w += result.leaguePhase.record.w
  aggregate.d += result.leaguePhase.record.d
  aggregate.l += result.leaguePhase.record.l
  aggregate.qualified += result.leaguePhase.qualification !== 'eliminated' ? 1 : 0
  const penaltyMatches = ctrl.matches.filter((match) => match.pens).length
  aggregate.penaltiesMatches += penaltyMatches
  aggregate.penaltiesRuns += penaltyMatches > 0 ? 1 : 0
  aggregate.resolved += ctrl.resolvedCount
  aggregate.champion += result.champion ? 1 : 0
  aggregate.exit[result.exitStage]++
}

function finishRunAggregate(aggregate) {
  const rate = (value) => round4(value / aggregate.runs)
  return {
    avgLeagueWins: rate(aggregate.w),
    avgLeagueDraws: rate(aggregate.d),
    avgLeagueLosses: rate(aggregate.l),
    qualificationRate: rate(aggregate.qualified),
    progressionDistribution: Object.fromEntries(
      Object.entries(aggregate.exit).map(([stage, value]) => [stage, rate(value)]),
    ),
    penaltiesRunRate: rate(aggregate.penaltiesRuns),
    penaltiesMatchRate: round4(aggregate.penaltiesMatches / aggregate.resolved),
    championRate: rate(aggregate.champion),
    avgResolvedCount: rate(aggregate.resolved),
  }
}

function runCell({ name, squad, sampleRunsPerCell, difficulty = 'classic', approach = 'balanced', engineVersion }) {
  const aggregate = emptyRunAggregate()
  for (let index = 0; index < sampleRunsPerCell; index++) {
    addRunAggregate(aggregate, executeVersionedRun({
      squad,
      difficulty,
      seed: seedFor(name, index),
      approach,
      engineVersion,
    }))
  }
  return finishRunAggregate(aggregate)
}

function emptyMatchAggregate() {
  return { matches: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, clean: 0, scoreless: 0, failed: 0, one: 0, two: 0 }
}

function addMatchAggregate(aggregate, match) {
  aggregate.matches++
  if (match.result === 'win' || match.result === 'pens-win') aggregate.w++
  else if (match.result === 'loss' || match.result === 'pens-loss') aggregate.l++
  else aggregate.d++
  aggregate.gf += match.gf
  aggregate.ga += match.ga
  aggregate.clean += match.ga === 0 ? 1 : 0
  aggregate.scoreless += match.gf === 0 && match.ga === 0 ? 1 : 0
  aggregate.failed += match.gf === 0 ? 1 : 0
  const margin = Math.abs(match.gf - match.ga)
  aggregate.one += margin === 1 ? 1 : 0
  aggregate.two += margin >= 2 ? 1 : 0
}

function finishMatchAggregate(aggregate) {
  const rate = (value) => round4(value / aggregate.matches)
  return {
    sampleMatches: aggregate.matches,
    winRate: rate(aggregate.w),
    drawRate: rate(aggregate.d),
    lossRate: rate(aggregate.l),
    goalsFor: rate(aggregate.gf),
    goalsAgainst: rate(aggregate.ga),
    cleanSheetRate: rate(aggregate.clean),
    scorelessMatchRate: rate(aggregate.scoreless),
    failedToScoreRate: rate(aggregate.failed),
    oneGoalMarginRate: rate(aggregate.one),
    twoPlusGoalMarginRate: rate(aggregate.two),
  }
}

function matchCell({ name, squad, sampleRunsPerCell, engineVersion }) {
  const bands = { weak: emptyMatchAggregate(), mid: emptyMatchAggregate(), strong: emptyMatchAggregate() }
  for (let index = 0; index < sampleRunsPerCell; index++) {
    const execution = executeVersionedRun({ squad, seed: seedFor(name, index), engineVersion })
    for (const match of execution.ctrl.matches.filter((candidate) => candidate.type === 'league')) {
      const strength = match.opponentMeta.strength
      addMatchAggregate(bands[strength <= 77 ? 'weak' : strength >= 88 ? 'strong' : 'mid'], match)
    }
  }
  return Object.fromEntries(Object.entries(bands).map(([band, aggregate]) => [band, finishMatchAggregate(aggregate)]))
}

// Shared aggregate matrix. M1 is currently rejected by the engine registry,
// but once its resolver is implemented this same function can run the same
// cells under { engineVersion: 'm1' } without changing fixture definitions.
export function runCalibrationSweep({
  sampleRunsPerCell = calibrationFixture.sampleRunsPerCell,
  engineVersion = LEGACY_ENGINE_VERSION,
} = {}) {
  const squads = calibrationSquads()
  const formations = {}
  const formationFixtureIndexes = { '4-3-3': 0, '4-4-2': 3, '4-2-3-1': 6, '3-5-2': 9, '5-3-2': 12 }
  for (const [formation, fixtureRunIndex] of Object.entries(formationFixtureIndexes)) {
    const fixtureRun = phase3Fixture.runs[fixtureRunIndex]
    const squad = squadFromPhase3Fixture(fixtureRunIndex)
    formations[formation] = {
      fixtureRunIndex,
      rating: computeRating(squad).total,
      difficulty: fixtureRun.config.difficulty,
      metrics: runCell({ name: `formation:${formation}`, squad, sampleRunsPerCell, difficulty: fixtureRun.config.difficulty, engineVersion }),
    }
  }

  const roleBalance = {}
  for (const name of ['balanced', 'no_midfield_holder', 'over_creative_midfield', 'no_natural_width', 'weak_defensive_structure']) {
    const squad = squads[name]
    const rating = computeRating(squad)
    roleBalance[name] = {
      rating: rating.total,
      baseWinProbability: round4(squadBaseProb(squad, 'classic')),
      weaknesses: rating.weaknesses.map((weakness) => weakness.name),
      metrics: runCell({ name: `role:${name}`, squad, sampleRunsPerCell, engineVersion }),
    }
  }

  const difficulty = {}
  for (const key of ['casual', 'classic', 'legendary']) {
    difficulty[key] = runCell({ name: `difficulty:${key}`, squad: squads.balanced, sampleRunsPerCell, difficulty: key, engineVersion })
  }

  const matchPlansMonitorOnly = {}
  for (const approach of ['balanced', 'control', 'wide', 'counter']) {
    matchPlansMonitorOnly[approach] = runCell({
      name: `plan:${approach}`,
      squad: squads.medium,
      sampleRunsPerCell,
      approach,
      engineVersion,
    })
  }

  return {
    engineVersion,
    sampleRunsPerCell,
    runLevel: runCell({ name: 'run:balanced-classic', squad: squads.balanced, sampleRunsPerCell, engineVersion }),
    matchLevel: Object.fromEntries(['low', 'medium', 'high'].map((name) => [name, {
      rating: computeRating(squads[name]).total,
      opponentBands: matchCell({ name: `match:${name}`, squad: squads[name], sampleRunsPerCell, engineVersion }),
    }])),
    formations,
    roleBalance,
    difficulty,
    matchPlansMonitorOnly,
  }
}

export function runLegacyCalibrationSweep(options = {}) {
  return runCalibrationSweep({ ...options, engineVersion: LEGACY_ENGINE_VERSION })
}

function toleranceFor(section, key) {
  const tolerance = calibrationFixture.tolerances[section]
  if (key === 'rating' || key === 'fixtureRunIndex') return 0
  if (key === 'baseWinProbability') return 0.0001
  if (key.startsWith('avgLeague')) return tolerance.averageLeagueMatches
  if (key === 'avgResolvedCount') return tolerance.averageResolvedCount
  if (key === 'goalsFor' || key === 'goalsAgainst') return tolerance.goalMeans
  return tolerance.rates
}

function compareExpectedTree({ actual, expected, section, path = section, failures }) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[key]
    const fieldPath = `${path}.${key}`
    if (typeof expectedValue === 'number') {
      const tolerance = toleranceFor(section, key)
      if (typeof actualValue !== 'number' || Math.abs(actualValue - expectedValue) > tolerance + 1e-9) {
        failures.push(`${fieldPath}: expected ${expectedValue} +/- ${tolerance}, got ${String(actualValue)}`)
      }
    } else if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      compareExpectedTree({ actual: actualValue, expected: expectedValue, section, path: fieldPath, failures })
    } else if (!sameJson(actualValue, expectedValue)) {
      failures.push(`${fieldPath}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`)
    }
  }
}

export function checkCalibrationOrderings(actual) {
  const failures = []
  const diffWins = ['casual', 'classic', 'legendary'].map((key) => actual.difficulty[key].avgLeagueWins)
  if (!(diffWins[0] >= diffWins[1] && diffWins[1] > diffWins[2])) failures.push('difficulty win ordering')
  const diffChampions = ['casual', 'classic', 'legendary'].map((key) => actual.difficulty[key].championRate)
  if (!(diffChampions[0] >= diffChampions[1] && diffChampions[1] > diffChampions[2])) failures.push('difficulty champion ordering')

  for (const squadBand of ['low', 'medium', 'high']) {
    const bands = actual.matchLevel[squadBand].opponentBands
    if (!(bands.weak.winRate >= bands.mid.winRate && bands.mid.winRate > bands.strong.winRate)) {
      failures.push(`opponent-strength ordering (${squadBand})`)
    }
  }
  for (const opponentBand of ['weak', 'mid', 'strong']) {
    const low = actual.matchLevel.low.opponentBands[opponentBand].winRate
    const medium = actual.matchLevel.medium.opponentBands[opponentBand].winRate
    const high = actual.matchLevel.high.opponentBands[opponentBand].winRate
    if (!(high > medium && medium > low)) failures.push(`squad-strength ordering (${opponentBand})`)
  }

  const roles = actual.roleBalance
  const roleOrder = ['balanced', 'no_natural_width', 'over_creative_midfield', 'no_midfield_holder', 'weak_defensive_structure']
  for (let index = 1; index < roleOrder.length; index++) {
    if (!(roles[roleOrder[index - 1]].baseWinProbability > roles[roleOrder[index]].baseWinProbability)) {
      failures.push('role-balance base probability ordering')
      break
    }
  }
  for (const weaker of roleOrder.slice(1)) {
    if (!(roles.balanced.metrics.avgLeagueWins > roles[weaker].metrics.avgLeagueWins)) {
      failures.push(`role-balance league ordering (${weaker})`)
    }
  }
  if (!(actual.runLevel.penaltiesRunRate > 0 && actual.runLevel.penaltiesMatchRate > 0)) failures.push('penalties remain possible')
  return failures
}

export function evaluateLegacyCalibration(actual) {
  const failures = []
  const baseline = calibrationFixture.baseline
  compareExpectedTree({ actual: actual.runLevel, expected: baseline.runLevel, section: 'runLevel', failures })
  compareExpectedTree({ actual: actual.matchLevel, expected: baseline.matchLevel, section: 'matchLevel', failures })
  compareExpectedTree({ actual: actual.formations, expected: baseline.formations, section: 'formations', failures })
  compareExpectedTree({ actual: actual.roleBalance, expected: baseline.roleBalance, section: 'roleBalance', failures })
  compareExpectedTree({ actual: actual.difficulty, expected: baseline.difficulty, section: 'difficulty', failures })
  // Match Plan baselines are reported but intentionally excluded from the
  // preservation gate; their exact W/D/L delta is MONITOR ONLY for M1.
  failures.push(...checkCalibrationOrderings(actual))
  return failures
}

export function runMatchCalibration() {
  const exact = checkLegacyFixedSeedParity()
  const aggregate = runLegacyCalibrationSweep()
  const aggregateFailures = evaluateLegacyCalibration(aggregate)
  return {
    engineVersion: LEGACY_ENGINE_VERSION,
    fixtureVersion: calibrationFixture.fixtureVersion,
    exact,
    aggregate,
    aggregateSignature: stableCalibrationSignature(aggregate),
    failures: [...exact.failures, ...aggregateFailures],
    classification: calibrationFixture.classification,
    tolerances: calibrationFixture.tolerances,
  }
}

export { calibrationFixture, legacyFixture, phase3Fixture }
