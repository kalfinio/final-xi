import {
  OPPONENTS,
  computeRating,
  createRunSimulation,
  hashString,
  makeRng,
  playerPoints,
  squadBaseProb,
} from './data'
import { buildMatchDetail } from './matchEngine'
import { resolveM1Match, signaturesForM1Player } from './matchEngineM1'
import { M1_ENGINE_VERSION } from './matchEngineVersions'
import { checkCalibrationOrderings, runCalibrationSweep, squadFromPhase3Fixture, stableCalibrationSignature } from './matchCalibration'
import { applyTacticalApproach } from './tacticalApproach'
import { buildOpponentTacticalProfile, buildSquadTacticalProfile, resolveTacticalMatchup } from './tacticalMatchup'

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
const round4 = (value) => Math.round(value * 10000) / 10000
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const variance = (values) => {
  const average = mean(values)
  return mean(values.map((value) => (value - average) ** 2))
}

export const M1_ARCHETYPE_KEYS = Object.freeze(['pressing', 'technical', 'defensive', 'attacking', 'physical', 'elite', 'underdog'])
export const M1_PLAN_KEYS = Object.freeze(['balanced', 'control', 'wide', 'counter'])

export const REPRESENTATIVE_OPPONENTS = Object.freeze(Object.fromEntries(
  M1_ARCHETYPE_KEYS.map((archetype) => [archetype, OPPONENTS.find((opponent) => opponent.archetype === archetype)]),
))

function opponentDelta(opponent) {
  return clamp((80 - opponent.strength) * 0.006, -0.08, 0.08)
}

export function controlledM1Match({
  seed,
  squad = squadFromPhase3Fixture(0),
  opponent = REPRESENTATIVE_OPPONENTS.elite,
  approach = 'balanced',
  difficulty = 'classic',
  kind = 'league',
  round = null,
  qualityProbability = null,
}) {
  const baseProfile = buildSquadTacticalProfile(squad)
  const adjustedProfile = applyTacticalApproach(baseProfile, approach)
  const matchup = resolveTacticalMatchup(adjustedProfile, buildOpponentTacticalProfile(opponent))
  const roundPressure = { 'Knockout Play-Off': 0, 'Round of 16': 0.03, 'Quarter-final': 0.06, 'Semi-final': 0.1, Final: 0.14 }[round] || 0
  const probability = qualityProbability ?? clamp(squadBaseProb(squad, difficulty) + opponentDelta(opponent) - roundPressure, 0.05, 0.84)
  const match = resolveM1Match({
    runSeed: seed,
    matchNumber: 1,
    matchNonce: hashString(`m1-calibration|nonce|${seed}`),
    kind,
    round,
    opponent,
    home: true,
    approach,
    squad,
    adjustedProfile,
    matchup,
    qualityProbability: probability,
    playerQualityById: Object.fromEntries(squad.map(({ player }) => [player.id, playerPoints(player)])),
  })
  match.detail = buildMatchDetail({ match, runSeed: seed, matchNumber: 1 })
  return match
}

function runM1Controller({ seed, squad, difficulty = 'classic', approach = 'balanced' }) {
  const ctrl = createRunSimulation({
    rating: computeRating(squad).total,
    difficulty,
    squad,
    rng: makeRng(seed),
    runSeed: seed,
    engineVersion: M1_ENGINE_VERSION,
  })
  while (!ctrl.isDone) {
    ctrl.prepareNext()
    if (!ctrl.isDone) ctrl.resolveNext(approach)
  }
  return { ctrl, result: ctrl.finish() }
}

function aggregateOutcomes(matches) {
  const counts = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, cleanSheets: 0, scoreless: 0, oneGoalMargins: 0, twoPlusMargins: 0, fourPlusSide: 0, highDraws: 0, penalties: 0 }
  const scorelines = new Set()
  let maxTeamGoals = 0
  for (const match of matches) {
    if (match.result === 'win' || match.result === 'pens-win') counts.wins++
    else if (match.result === 'loss' || match.result === 'pens-loss') counts.losses++
    else counts.draws++
    counts.gf += match.gf
    counts.ga += match.ga
    counts.cleanSheets += match.ga === 0 ? 1 : 0
    counts.scoreless += match.gf === 0 && match.ga === 0 ? 1 : 0
    const margin = Math.abs(match.gf - match.ga)
    counts.oneGoalMargins += margin === 1 ? 1 : 0
    counts.twoPlusMargins += margin >= 2 ? 1 : 0
    counts.fourPlusSide += Math.max(match.gf, match.ga) >= 4 ? 1 : 0
    counts.highDraws += match.gf === match.ga && match.gf >= 2 ? 1 : 0
    counts.penalties += match.pens ? 1 : 0
    scorelines.add(`${match.gf}-${match.ga}`)
    maxTeamGoals = Math.max(maxTeamGoals, match.gf, match.ga)
  }
  const n = matches.length || 1
  return {
    sampleMatches: matches.length,
    winRate: round4(counts.wins / n),
    drawRate: round4(counts.draws / n),
    lossRate: round4(counts.losses / n),
    goalsFor: round4(counts.gf / n),
    goalsAgainst: round4(counts.ga / n),
    totalGoals: round4((counts.gf + counts.ga) / n),
    cleanSheetRate: round4(counts.cleanSheets / n),
    scorelessRate: round4(counts.scoreless / n),
    oneGoalMarginRate: round4(counts.oneGoalMargins / n),
    twoPlusMarginRate: round4(counts.twoPlusMargins / n),
    fourPlusSideRate: round4(counts.fourPlusSide / n),
    highDrawRate: round4(counts.highDraws / n),
    penaltyRate: round4(counts.penalties / n),
    uniqueScorelines: scorelines.size,
    maxTeamGoals,
  }
}

function aggregateShape(matches) {
  const opportunities = []
  const chances = []
  const totalGoals = []
  const firstGoals = []
  const quality = { low: 0, medium: 0, high: 0, clear: 0 }
  const routes = { home: {}, away: {} }
  const goalBands = [0, 0, 0, 0, 0, 0]
  const halftime = {}
  const scorerPositions = { GK: 0, DEF: 0, MID: 0, ATT: 0 }
  let comebacks = 0
  let leadChanges = 0
  let lateGoals = 0
  let goalCount = 0
  for (const match of matches) {
    const metrics = match.eventMetrics
    opportunities.push(metrics.home.opportunities + metrics.away.opportunities)
    chances.push(metrics.home.chances + metrics.away.chances)
    totalGoals.push(match.gf + match.ga)
    if (metrics.firstGoalMinute != null) firstGoals.push(metrics.firstGoalMinute)
    for (const key of Object.keys(quality)) quality[key] += metrics.chanceQuality[key]
    for (const side of ['home', 'away']) for (const [route, count] of Object.entries(metrics.routeDistribution[side])) routes[side][route] = (routes[side][route] || 0) + count
    metrics.goalBands.forEach((count, index) => { goalBands[index] += count })
    const halftimeKey = `${metrics.halftime.us}-${metrics.halftime.opp}`
    halftime[halftimeKey] = (halftime[halftimeKey] || 0) + 1
    leadChanges += metrics.leadChanges > 0 ? 1 : 0
    const goalEvents = match.causalEvents.filter((event) => event.goal)
    let usTrailed = false
    let oppTrailed = false
    for (const event of goalEvents) {
      if (event.scoreAfter.us < event.scoreAfter.opp) usTrailed = true
      if (event.scoreAfter.opp < event.scoreAfter.us) oppTrailed = true
      if (event.minute >= 76) lateGoals++
      goalCount++
      if (event.side === 'us' && event.shooterId) {
        const player = matches._squadById?.[event.shooterId]
        if (player?.posType) scorerPositions[player.posType]++
      }
    }
    if ((match.gf > match.ga && usTrailed) || (match.ga > match.gf && oppTrailed)) comebacks++
  }
  const chanceTotal = Object.values(quality).reduce((sum, count) => sum + count, 0) || 1
  const routeShares = (distribution) => {
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0) || 1
    return Object.fromEntries(Object.entries(distribution).map(([route, count]) => [route, round4(count / total)]))
  }
  return {
    opportunitiesPerMatch: round4(mean(opportunities)),
    chancesPerMatch: round4(mean(chances)),
    chanceQuality: Object.fromEntries(Object.entries(quality).map(([key, count]) => [key, round4(count / chanceTotal)])),
    routes: { home: routeShares(routes.home), away: routeShares(routes.away) },
    goalsByBand: goalBands.map((count) => round4(count / (goalCount || 1))),
    averageFirstGoalMinute: round4(mean(firstGoals)),
    halftimeDistribution: Object.fromEntries(Object.entries(halftime).map(([key, count]) => [key, round4(count / matches.length)])),
    comebackRate: round4(comebacks / (matches.length || 1)),
    leadChangeRate: round4(leadChanges / (matches.length || 1)),
    lateGoalRate: round4(lateGoals / (goalCount || 1)),
    scorerPositions,
    goalVolatility: round4(variance(totalGoals)),
  }
}

function aggregateTacticalMatches(matches) {
  const outcomes = aggregateOutcomes(matches)
  const shape = aggregateShape(matches)
  const ownOpps = mean(matches.map((match) => match.eventMetrics.home.opportunities))
  const oppOpps = mean(matches.map((match) => match.eventMetrics.away.opportunities))
  const ownChances = mean(matches.map((match) => match.eventMetrics.home.chances))
  const oppChances = mean(matches.map((match) => match.eventMetrics.away.chances))
  const ownXg = mean(matches.map((match) => match.eventMetrics.home.xg))
  const oppXg = mean(matches.map((match) => match.eventMetrics.away.xg))
  const possession = mean(matches.map((match) => match.eventMetrics.home.possession))
  const dangerousTransitions = mean(matches.map((match) => match.eventMetrics.home.dangerousTransitions))
  const highTurnovers = mean(matches.map((match) => match.eventMetrics.home.highTurnovers))
  const concessionExposure = mean(matches.map((match) => match.eventMetrics.away.dangerousTransitions))
  const downsides = mean(matches.map((match) => match.causalSummary.plan.downsideMetric))
  const homeFailures = mean(matches.map((match) => match.causalEvents.filter((event) => event.side === 'us' && event.progression !== 'success').length))
  return {
    ...outcomes,
    pointsPerMatch: round4(mean(matches.map((match) => match.result === 'win' ? 3 : match.result === 'draw' ? 1 : 0))),
    ownOpportunities: round4(ownOpps),
    opponentOpportunities: round4(oppOpps),
    ownChances: round4(ownChances),
    opponentChances: round4(oppChances),
    ownXg: round4(ownXg),
    opponentXg: round4(oppXg),
    possession: round4(possession),
    dangerousTransitions: round4(dangerousTransitions),
    highTurnovers: round4(highTurnovers),
    concessionExposure: round4(concessionExposure),
    routes: shape.routes.home,
    opponentRoutes: shape.routes.away,
    chanceQuality: shape.chanceQuality,
    volatility: shape.goalVolatility,
    rawDownsideMetric: round4(downsides),
    homeProgressionFailures: round4(homeFailures),
  }
}

export function planMetrics({ squad, samplesPerCell }) {
  const raw = {}
  for (const approach of M1_PLAN_KEYS) {
    const matches = []
    for (const archetype of M1_ARCHETYPE_KEYS) {
      for (let index = 0; index < samplesPerCell; index++) {
        matches.push(controlledM1Match({ seed: hashString(`m1-plan|${archetype}|${index + 1}`), squad, opponent: REPRESENTATIVE_OPPONENTS[archetype], approach }))
      }
    }
    raw[approach] = aggregateTacticalMatches(matches)
  }
  const balanced = raw.balanced
  raw.balanced.explicitDownside = 0
  raw.control.explicitDownside = round4(
    ((balanced.routes.counterattack || 0) + (balanced.routes.direct_attack || 0)) -
    ((raw.control.routes.counterattack || 0) + (raw.control.routes.direct_attack || 0)),
  )
  raw.wide.explicitDownside = round4(raw.wide.opponentOpportunities - balanced.opponentOpportunities)
  raw.counter.explicitDownside = round4(balanced.ownOpportunities - raw.counter.ownOpportunities)
  return raw
}

export const M1_PLAN_AUDIT_NOISE_PPM = 0.04

function routeFamilyShare(metrics, routes) {
  return round4(routes.reduce((sum, route) => sum + (metrics.routes[route] || 0), 0))
}

function planAuditCell({ strength, squad, archetype, samplesPerCell }) {
  const metrics = {}
  for (const approach of M1_PLAN_KEYS) {
    const matches = Array.from({ length: samplesPerCell }, (_, index) => controlledM1Match({
      seed: hashString(`m1-plan-audit|${strength}|${archetype}|${index + 1}`),
      squad,
      opponent: REPRESENTATIVE_OPPONENTS[archetype],
      approach,
    }))
    metrics[approach] = aggregateTacticalMatches(matches)
  }
  const ranking = [...M1_PLAN_KEYS]
    .sort((left, right) => metrics[right].pointsPerMatch - metrics[left].pointsPerMatch || left.localeCompare(right))
  const bestPoints = metrics[ranking[0]].pointsPerMatch
  const viable = ranking.filter((approach) => bestPoints - metrics[approach].pointsPerMatch <= M1_PLAN_AUDIT_NOISE_PPM)
  return { metrics, ranking, best: ranking[0], viable, bestPoints }
}

export function evaluateM1PlanAudit(report) {
  const failures = []
  const cells = Object.values(report.cells).flatMap((byArchetype) => Object.values(byArchetype))
  const viableCount = Object.fromEntries(M1_PLAN_KEYS.map((approach) => [approach, cells.filter((cell) => cell.viable.includes(approach)).length]))
  const bestCount = Object.fromEntries(M1_PLAN_KEYS.map((approach) => [approach, cells.filter((cell) => cell.best === approach).length]))
  for (const approach of M1_PLAN_KEYS) {
    if (viableCount[approach] === 0) failures.push(`${approach} is never best or within ${M1_PLAN_AUDIT_NOISE_PPM.toFixed(2)} PPM of best`)
    if (bestCount[approach] === cells.length) failures.push(`${approach} is universally optimal`)
  }
  const favorableCounter = Object.values(report.cells).some((byArchetype) =>
    ['pressing', 'attacking', 'elite'].some((archetype) => byArchetype[archetype].viable.includes('counter')),
  )
  if (!favorableCounter) failures.push('Counter is not viable against any exposed opponent context')
  const weakCounter = Object.values(report.cells).some((byArchetype) =>
    ['defensive', 'underdog'].some((archetype) => !byArchetype[archetype].viable.includes('counter')),
  )
  if (!weakCounter) failures.push('Counter retains no low-block downside')
  const viableWideBlock = Object.values(report.cells).some((byArchetype) =>
    ['defensive', 'underdog'].some((archetype) => byArchetype[archetype].viable.includes('wide')),
  )
  if (!viableWideBlock) failures.push('Wide is not viable against a compact opponent')
  if (bestCount.control >= Math.ceil(cells.length / 2)) failures.push(`Control dominates ${bestCount.control}/${cells.length} cells`)

  const aggregate = report.aggregate
  const transitionRoutes = ['counterattack', 'direct_attack', 'pressing_recovery']
  const controlledRoutes = ['central_buildup', 'one_two', 'switch_of_play']
  const wideRoutes = ['wide_overlap', 'cross', 'cutback']
  if (!(aggregate.counter.possession < aggregate.control.possession - 8)) failures.push('Counter possession identity collapsed')
  if (!(routeFamilyShare(aggregate.counter, transitionRoutes) > routeFamilyShare(aggregate.balanced, transitionRoutes) + 0.12)) failures.push('Counter transition/direct identity collapsed')
  if (!(routeFamilyShare(aggregate.wide, wideRoutes) > routeFamilyShare(aggregate.balanced, wideRoutes) + 0.12)) failures.push('Wide route identity collapsed')
  if (!(routeFamilyShare(aggregate.control, controlledRoutes) > routeFamilyShare(aggregate.balanced, controlledRoutes) + 0.12)) failures.push('Control settled-route identity collapsed')
  if (!(aggregate.control.volatility < aggregate.counter.volatility)) failures.push('Control is not less volatile than Counter')
  if (!(aggregate.counter.ownOpportunities < aggregate.balanced.ownOpportunities)) failures.push('Counter lost its lower-volume downside')
  if (!(aggregate.wide.opponentOpportunities > aggregate.balanced.opponentOpportunities)) failures.push('Wide lost its concession downside')

  const lowBlockCells = Object.values(report.cells).flatMap((byArchetype) => [byArchetype.defensive, byArchetype.underdog])
  if (!lowBlockCells.some((cell) => cell.metrics.control.ownXg < cell.metrics.balanced.ownXg)) failures.push('Control has no sterile-possession evidence against low blocks')
  return failures
}

export function runM1PlanAudit({ samplesPerCell = 1000 } = {}) {
  const squads = {
    low: squadFromPhase3Fixture(11),
    medium: squadFromPhase3Fixture(1),
    high: squadFromPhase3Fixture(0),
  }
  const cells = {}
  for (const [strength, squad] of Object.entries(squads)) {
    cells[strength] = {}
    for (const archetype of M1_ARCHETYPE_KEYS) {
      const cell = planAuditCell({ strength, squad, archetype, samplesPerCell })
      cells[strength][archetype] = cell
    }
  }
  const allCells = Object.values(cells).flatMap((byArchetype) => Object.values(byArchetype))
  const aggregate = Object.fromEntries(M1_PLAN_KEYS.map((approach) => {
    const metrics = allCells.map((cell) => cell.metrics[approach])
    const numericKeys = [
      'winRate', 'drawRate', 'lossRate', 'pointsPerMatch', 'goalsFor', 'goalsAgainst',
      'ownOpportunities', 'opponentOpportunities', 'ownChances', 'opponentChances',
      'ownXg', 'opponentXg', 'possession', 'volatility', 'dangerousTransitions',
      'highTurnovers', 'concessionExposure', 'rawDownsideMetric', 'homeProgressionFailures',
    ]
    const averaged = Object.fromEntries(numericKeys.map((key) => [key, round4(mean(metrics.map((value) => value[key])))]))
    const nestedAverage = (key) => {
      const names = new Set(metrics.flatMap((value) => Object.keys(value[key] || {})))
      return Object.fromEntries([...names].map((name) => [name, round4(mean(metrics.map((value) => value[key]?.[name] || 0)))]))
    }
    return [approach, { ...averaged, routes: nestedAverage('routes'), chanceQuality: nestedAverage('chanceQuality') }]
  }))
  const report = {
    engineVersion: M1_ENGINE_VERSION,
    samplesPerCell,
    pairedMatches: samplesPerCell * Object.keys(squads).length * M1_ARCHETYPE_KEYS.length * M1_PLAN_KEYS.length,
    noiseTolerancePpm: M1_PLAN_AUDIT_NOISE_PPM,
    cells,
    aggregate,
  }
  report.bestCounts = Object.fromEntries(M1_PLAN_KEYS.map((approach) => [approach,
    Object.values(cells).flatMap((byArchetype) => Object.values(byArchetype)).filter((cell) => cell.best === approach).length,
  ]))
  report.viableCounts = Object.fromEntries(M1_PLAN_KEYS.map((approach) => [approach,
    Object.values(cells).flatMap((byArchetype) => Object.values(byArchetype)).filter((cell) => cell.viable.includes(approach)).length,
  ]))
  report.failures = evaluateM1PlanAudit(report)
  report.signature = stableCalibrationSignature({ ...report, failures: undefined, signature: undefined })
  return report
}

export function opponentMetrics({ squad, samplesPerCell }) {
  const result = {}
  for (const archetype of M1_ARCHETYPE_KEYS) {
    const matches = Array.from({ length: samplesPerCell }, (_, index) => controlledM1Match({
      seed: hashString(`m1-opponent|${archetype}|${index + 1}`),
      squad,
      opponent: REPRESENTATIVE_OPPONENTS[archetype],
      approach: 'balanced',
    }))
    const aggregate = aggregateTacticalMatches(matches)
    result[archetype] = {
      routeMix: aggregate.opponentRoutes,
      opponentOpportunities: aggregate.opponentOpportunities,
      homeProgressionFailureRate: round4(aggregate.homeProgressionFailures / (aggregate.ownOpportunities || 1)),
      homeXg: aggregate.ownXg,
      opponentXg: aggregate.opponentXg,
      chanceSource: aggregate.chanceQuality,
      volatility: aggregate.volatility,
    }
  }
  return result
}

function patchPlayer(squad, playerId, patch) {
  return squad.map((entry) => entry.player.id === playerId
    ? { ...entry, player: { ...entry.player, ...patch } }
    : entry)
}

function setPlayerRole(squad, playerId, role) {
  return patchPlayer(squad, playerId, { role, secondaryRole: null })
}

function setOnlySignature(squad, playerId, signature = null) {
  return patchPlayer(squad, playerId, { signatures: signature ? [signature] : [] })
}

function hookMatches({ squad, label, samples, approach = 'balanced', opponent = REPRESENTATIVE_OPPONENTS.elite }) {
  return Array.from({ length: samples }, (_, index) => controlledM1Match({
    seed: hashString(`m1-hook|${label}|${index + 1}`),
    squad,
    opponent,
    approach,
    // Isolate event hooks from the existing Role weakness economics. Tactical
    // profile changes remain visible, while both variants keep one macro axis.
    qualityProbability: 0.72,
  }))
}

function selectedEvents(matches, predicate) {
  return matches.flatMap((match) => match.causalEvents.filter(predicate))
}

function perMatch(matches, events) {
  return round4(events.length / (matches.length || 1))
}

function routeShare(matches, routes, side = 'us') {
  const all = selectedEvents(matches, (event) => event.side === side)
  const relevant = all.filter((event) => routes.includes(event.route))
  return round4(relevant.length / (all.length || 1))
}

function progressionRate(events) {
  return round4(events.filter((event) => event.progression === 'success').length / (events.length || 1))
}

function conversionRate(events) {
  return round4(events.filter((event) => event.goal).length / (events.length || 1))
}

function causeRate(matches, field, prefix) {
  const causes = selectedEvents(matches, (event) => event.causes[field].some((cause) => cause.startsWith(prefix)))
  return perMatch(matches, causes)
}

function signatureVariant(squad, { playerId, signature, role = null }) {
  const roleSquad = role ? setPlayerRole(squad, playerId, role) : squad
  return {
    active: setOnlySignature(roleSquad, playerId, signature),
    removed: setOnlySignature(roleSquad, playerId, null),
  }
}

export function roleAndSignatureMetrics({ squad = squadFromPhase3Fixture(0), samplesPerPair = 192 } = {}) {
  const pair = (label, activeSquad, baselineSquad, options = {}) => ({
    active: hookMatches({ squad: activeSquad, label, samples: samplesPerPair, ...options }),
    baseline: hookMatches({ squad: baselineSquad, label, samples: samplesPerPair, ...options }),
  })

  const shield = pair(
    'role-defensive-shield',
    setPlayerRole(squad, 'deschamps', 'Defensive Shield'),
    setPlayerRole(squad, 'deschamps', 'Box-to-Box Engine'),
    { opponent: REPRESENTATIVE_OPPONENTS.attacking },
  )
  const shieldRoutes = ['central_buildup', 'counterattack', 'cutback']
  const shieldActiveDanger = selectedEvents(shield.active, (event) => event.side === 'opp' && shieldRoutes.includes(event.route))
  const shieldBaseDanger = selectedEvents(shield.baseline, (event) => event.side === 'opp' && shieldRoutes.includes(event.route))

  const tempo = pair(
    'role-tempo-controller',
    setPlayerRole(squad, 'pirlo', 'Tempo Controller'),
    setPlayerRole(squad, 'pirlo', 'Box-to-Box Engine'),
    { approach: 'control' },
  )
  const tempoRoutes = ['central_buildup', 'switch_of_play', 'one_two']
  const tempoActiveEvents = selectedEvents(tempo.active, (event) => event.side === 'us' && tempoRoutes.includes(event.route))
  const tempoBaseEvents = selectedEvents(tempo.baseline, (event) => event.side === 'us' && tempoRoutes.includes(event.route))

  const touchline = pair(
    'role-touchline-winger',
    setPlayerRole(squad, 'robben', 'Touchline Winger'),
    setPlayerRole(squad, 'robben', 'Inside Forward'),
    { approach: 'wide' },
  )
  const wideRoutes = ['wide_overlap', 'cross', 'cutback']

  const finisher = pair(
    'role-box-finisher',
    setOnlySignature(setPlayerRole(squad, 'ronaldo', 'Box Finisher'), 'ronaldo', null),
    setOnlySignature(setPlayerRole(squad, 'ronaldo', 'Complete Striker'), 'ronaldo', null),
  )
  const boxRoutes = ['central_buildup', 'cross', 'cutback', 'through_ball', 'set_piece']
  const finisherActiveShots = selectedEvents(finisher.active, (event) => event.side === 'us' && event.progression === 'success' && event.shooterId === 'ronaldo' && boxRoutes.includes(event.route))
  const finisherBaseShots = selectedEvents(finisher.baseline, (event) => event.side === 'us' && event.progression === 'success' && event.shooterId === 'ronaldo' && boxRoutes.includes(event.route))

  const sweeper = pair(
    'role-sweeper-keeper',
    setPlayerRole(squad, 'casillas', 'Sweeper Keeper'),
    setPlayerRole(squad, 'casillas', 'Big Match Keeper'),
    { opponent: REPRESENTATIVE_OPPONENTS.attacking },
  )
  const sweeperRoutes = ['through_ball', 'counterattack', 'direct_attack']
  const sweeperActiveEvents = selectedEvents(sweeper.active, (event) => event.side === 'opp' && sweeperRoutes.includes(event.route))
  const sweeperBaseEvents = selectedEvents(sweeper.baseline, (event) => event.side === 'opp' && sweeperRoutes.includes(event.route))

  const stopper = pair(
    'role-shot-stopper',
    setPlayerRole(squad, 'casillas', 'Shot Stopper'),
    setPlayerRole(squad, 'casillas', 'Big Match Keeper'),
    { opponent: REPRESENTATIVE_OPPONENTS.attacking },
  )
  const stopperActiveShots = selectedEvents(stopper.active, (event) => event.side === 'opp' && event.progression === 'success')
  const stopperBaseShots = selectedEvents(stopper.baseline, (event) => event.side === 'opp' && event.progression === 'success')

  const recoverySquads = signatureVariant(squad, { playerId: 'cafu', signature: 'Recovery Pace', role: 'Defensive Fullback' })
  const recovery = pair('signature-recovery-pace', recoverySquads.active, recoverySquads.removed, { opponent: REPRESENTATIVE_OPPONENTS.attacking })
  const recoveryActiveEvents = selectedEvents(recovery.active, (event) => event.side === 'opp' && sweeperRoutes.includes(event.route))
  const recoveryBaseEvents = selectedEvents(recovery.baseline, (event) => event.side === 'opp' && sweeperRoutes.includes(event.route))

  const aerialSquads = signatureVariant(squad, { playerId: 'ronaldo', signature: 'Aerial Target', role: 'Complete Striker' })
  const aerial = pair('signature-aerial-target', aerialSquads.active, aerialSquads.removed, { approach: 'wide' })
  const aerialRoutes = ['cross', 'set_piece', 'direct_attack']
  const aerialActiveShots = selectedEvents(aerial.active, (event) => event.side === 'us' && event.progression === 'success' && event.shooterId === 'ronaldo' && aerialRoutes.includes(event.route))
  const aerialBaseShots = selectedEvents(aerial.baseline, (event) => event.side === 'us' && event.progression === 'success' && event.shooterId === 'ronaldo' && aerialRoutes.includes(event.route))

  const distanceSquads = signatureVariant(squad, { playerId: 'pirlo', signature: 'Distance Threat', role: 'Box-to-Box Engine' })
  const distance = pair('signature-distance-threat', distanceSquads.active, distanceSquads.removed)
  const distanceActiveShots = selectedEvents(distance.active, (event) => event.side === 'us' && event.route === 'long_range' && event.progression === 'success' && event.shooterId === 'pirlo')
  const distanceBaseShots = selectedEvents(distance.baseline, (event) => event.side === 'us' && event.route === 'long_range' && event.progression === 'success' && event.shooterId === 'pirlo')

  const finalBallSquads = signatureVariant(squad, { playerId: 'pirlo', signature: 'Final Ball', role: 'Final Passer' })
  const finalBall = pair('signature-final-ball', finalBallSquads.active, finalBallSquads.removed, { approach: 'control' })
  const finalBallRoutes = ['through_ball', 'cutback', 'central_buildup']
  const finalBallActiveEvents = selectedEvents(finalBall.active, (event) => event.side === 'us' && event.progression === 'success' && event.creatorId === 'pirlo' && finalBallRoutes.includes(event.route))
  const finalBallBaseEvents = selectedEvents(finalBall.baseline, (event) => event.side === 'us' && event.progression === 'success' && event.creatorId === 'pirlo' && finalBallRoutes.includes(event.route))

  const xgPerMatch = (matches, events) => round4(events.reduce((sum, event) => sum + event.xg, 0) / (matches.length || 1))
  return {
    roles: {
      defensiveShield: {
        activeDangerProgressionRate: progressionRate(shieldActiveDanger),
        baselineDangerProgressionRate: progressionRate(shieldBaseDanger),
        activeDangerXgPerMatch: xgPerMatch(shield.active, shieldActiveDanger),
        baselineDangerXgPerMatch: xgPerMatch(shield.baseline, shieldBaseDanger),
        evidencePerMatch: causeRate(shield.active, 'roles', 'Defensive Shield:'),
      },
      tempoController: {
        activeControlledRouteShare: routeShare(tempo.active, tempoRoutes),
        baselineControlledRouteShare: routeShare(tempo.baseline, tempoRoutes),
        activeProgressionRate: progressionRate(tempoActiveEvents),
        baselineProgressionRate: progressionRate(tempoBaseEvents),
        evidencePerMatch: causeRate(tempo.active, 'roles', 'Tempo Controller:'),
      },
      touchlineWinger: {
        activeWideRouteShare: routeShare(touchline.active, wideRoutes),
        baselineWideRouteShare: routeShare(touchline.baseline, wideRoutes),
        activeCreatorInvolvement: perMatch(touchline.active, selectedEvents(touchline.active, (event) => event.side === 'us' && event.creatorId === 'robben' && wideRoutes.includes(event.route))),
        baselineCreatorInvolvement: perMatch(touchline.baseline, selectedEvents(touchline.baseline, (event) => event.side === 'us' && event.creatorId === 'robben' && wideRoutes.includes(event.route))),
        evidencePerMatch: causeRate(touchline.active, 'roles', 'Touchline Winger:'),
      },
      boxFinisher: {
        activeBoxShotInvolvement: perMatch(finisher.active, finisherActiveShots),
        baselineBoxShotInvolvement: perMatch(finisher.baseline, finisherBaseShots),
        activeBoxConversionRate: conversionRate(finisherActiveShots),
        baselineBoxConversionRate: conversionRate(finisherBaseShots),
        evidencePerMatch: causeRate(finisher.active, 'roles', 'Box Finisher:'),
      },
      sweeperKeeper: {
        activeTransitionProgressionRate: progressionRate(sweeperActiveEvents),
        baselineTransitionProgressionRate: progressionRate(sweeperBaseEvents),
        evidencePerMatch: causeRate(sweeper.active, 'roles', 'Sweeper Keeper:'),
      },
      shotStopper: {
        activeOpponentConversionRate: conversionRate(stopperActiveShots),
        baselineOpponentConversionRate: conversionRate(stopperBaseShots),
        evidencePerMatch: causeRate(stopper.active, 'roles', 'Shot Stopper:'),
      },
    },
    signatures: {
      recoveryPace: {
        activeTransitionProgressionRate: progressionRate(recoveryActiveEvents),
        removedTransitionProgressionRate: progressionRate(recoveryBaseEvents),
        evidencePerMatch: causeRate(recovery.active, 'signatures', 'Recovery Pace:'),
      },
      aerialTarget: {
        activeAerialRouteShare: routeShare(aerial.active, aerialRoutes),
        removedAerialRouteShare: routeShare(aerial.baseline, aerialRoutes),
        activeAerialShotInvolvement: perMatch(aerial.active, aerialActiveShots),
        removedAerialShotInvolvement: perMatch(aerial.baseline, aerialBaseShots),
        evidencePerMatch: causeRate(aerial.active, 'signatures', 'Aerial Target:'),
      },
      distanceThreat: {
        activeLongRangeShare: routeShare(distance.active, ['long_range']),
        removedLongRangeShare: routeShare(distance.baseline, ['long_range']),
        activePlayerShotsPerMatch: perMatch(distance.active, distanceActiveShots),
        removedPlayerShotsPerMatch: perMatch(distance.baseline, distanceBaseShots),
        evidencePerMatch: causeRate(distance.active, 'signatures', 'Distance Threat:'),
      },
      finalBall: {
        activeCreationXgPerMatch: xgPerMatch(finalBall.active, finalBallActiveEvents),
        removedCreationXgPerMatch: xgPerMatch(finalBall.baseline, finalBallBaseEvents),
        activeCreationsPerMatch: perMatch(finalBall.active, finalBallActiveEvents),
        removedCreationsPerMatch: perMatch(finalBall.baseline, finalBallBaseEvents),
        evidencePerMatch: causeRate(finalBall.active, 'signatures', 'Final Ball:'),
      },
    },
  }
}

function runLevelMetrics({ squad, sampleRuns }) {
  const executions = Array.from({ length: sampleRuns }, (_, index) => runM1Controller({
    seed: hashString(`m1-run|${index + 1}`),
    squad,
  }))
  const leagueMatches = executions.flatMap((execution) => execution.result.leaguePhase.matches)
  const penalties = executions.reduce((sum, execution) => sum + execution.ctrl.matches.filter((match) => match.pens).length, 0)
  return {
    averageLeagueWins: round4(mean(executions.map((execution) => execution.result.leaguePhase.record.w))),
    averageLeagueDraws: round4(mean(executions.map((execution) => execution.result.leaguePhase.record.d))),
    averageLeagueLosses: round4(mean(executions.map((execution) => execution.result.leaguePhase.record.l))),
    qualificationRate: round4(executions.filter((execution) => execution.result.leaguePhase.qualification !== 'eliminated').length / sampleRuns),
    championRate: round4(executions.filter((execution) => execution.result.champion).length / sampleRuns),
    penaltyMatchRate: round4(penalties / executions.reduce((sum, execution) => sum + execution.ctrl.resolvedCount, 0)),
    averageResolvedCount: round4(mean(executions.map((execution) => execution.ctrl.resolvedCount))),
    leagueOutcomes: aggregateOutcomes(leagueMatches),
  }
}

export function evaluateM1Calibration(report) {
  const failures = []
  const outcomes = report.outcomes
  const shape = report.matchShape
  const run = report.runLevel
  if (outcomes.uniqueScorelines <= 11) failures.push('scoreline support must exceed legacy 11-scoreline space')
  if (outcomes.scorelessRate <= 0) failures.push('0-0 must remain possible')
  if (outcomes.highDrawRate <= 0) failures.push('2-2 or higher draws must be possible')
  if (outcomes.fourPlusSideRate <= 0) failures.push('four-plus goals by one side must be possible')
  if (outcomes.fourPlusSideRate > 0.09) failures.push('four-plus score tail is too frequent')
  if (outcomes.maxTeamGoals > 8) failures.push('score explosion bound exceeded')
  if (shape.opportunitiesPerMatch < 8 || shape.opportunitiesPerMatch > 20) failures.push('opportunity volume outside 8-20 target')
  if (shape.chancesPerMatch < 5 || shape.chancesPerMatch > 15) failures.push('chance volume outside 5-15 target')
  if (outcomes.totalGoals < 1.55 || outcomes.totalGoals > 3.05) failures.push('total-goal mean outside broad playable band')
  if (outcomes.lossRate <= 0) failures.push('losses must remain possible')
  if (run.championRate < 0.2 || run.championRate > 0.5) failures.push('champion rate outside initial 20%-50% safety band')
  if (run.qualificationRate < 0.72) failures.push('qualification rate too low for representative balanced squad')
  if (run.penaltyMatchRate <= 0) failures.push('penalties must remain possible')
  const plans = report.matchPlans
  const wideShare = (plan) => (plan.routes.wide_overlap || 0) + (plan.routes.cross || 0) + (plan.routes.cutback || 0)
  const counterShare = (plan) => (plan.routes.counterattack || 0) + (plan.routes.direct_attack || 0) + (plan.routes.pressing_recovery || 0)
  if (!(wideShare(plans.wide) > wideShare(plans.balanced) + 0.08)) failures.push('Wide route-mix shift too small')
  if (!(counterShare(plans.counter) > counterShare(plans.balanced) + 0.08)) failures.push('Counter route-mix shift too small')
  if (!(plans.control.volatility < plans.counter.volatility)) failures.push('Control must reduce volatility relative to Counter')
  for (const key of ['control', 'wide', 'counter']) if (!(plans[key].explicitDownside > 0)) failures.push(`${key} has no measurable downside`)
  const opponents = report.opponents
  if (!((opponents.pressing.routeMix.pressing_recovery || 0) > (opponents.elite.routeMix.pressing_recovery || 0))) failures.push('Pressing archetype route identity missing')
  if (!((opponents.physical.routeMix.direct_attack || 0) > (opponents.elite.routeMix.direct_attack || 0))) failures.push('Physical archetype route identity missing')
  if (!((opponents.defensive.routeMix.counterattack || 0) > (opponents.technical.routeMix.counterattack || 0))) failures.push('Defensive archetype counter identity missing')
  if (!(opponents.attacking.opponentOpportunities > opponents.defensive.opponentOpportunities)) failures.push('Attacking/defensive volatility ordering missing')
  const hooks = report.roleSignatureEffects
  if (!(hooks.roles.defensiveShield.activeDangerXgPerMatch < hooks.roles.defensiveShield.baselineDangerXgPerMatch)) failures.push('Defensive Shield danger suppression missing')
  if (!(hooks.roles.tempoController.activeProgressionRate > hooks.roles.tempoController.baselineProgressionRate)) failures.push('Tempo Controller progression effect missing')
  if (!(hooks.roles.touchlineWinger.activeWideRouteShare > hooks.roles.touchlineWinger.baselineWideRouteShare)) failures.push('Touchline Winger route effect missing')
  if (!(hooks.roles.boxFinisher.activeBoxConversionRate > hooks.roles.boxFinisher.baselineBoxConversionRate)) failures.push('Box Finisher conversion effect missing')
  if (!(hooks.roles.sweeperKeeper.activeTransitionProgressionRate < hooks.roles.sweeperKeeper.baselineTransitionProgressionRate)) failures.push('Sweeper Keeper transition effect missing')
  if (!(hooks.roles.shotStopper.activeOpponentConversionRate < hooks.roles.shotStopper.baselineOpponentConversionRate)) failures.push('Shot Stopper conversion prevention missing')
  if (!(hooks.signatures.recoveryPace.activeTransitionProgressionRate < hooks.signatures.recoveryPace.removedTransitionProgressionRate)) failures.push('Recovery Pace context effect missing')
  if (!(hooks.signatures.aerialTarget.activeAerialShotInvolvement > hooks.signatures.aerialTarget.removedAerialShotInvolvement)) failures.push('Aerial Target involvement effect missing')
  if (!(hooks.signatures.distanceThreat.activePlayerShotsPerMatch > hooks.signatures.distanceThreat.removedPlayerShotsPerMatch)) failures.push('Distance Threat eligibility effect missing')
  if (!(hooks.signatures.finalBall.activeCreationXgPerMatch > hooks.signatures.finalBall.removedCreationXgPerMatch)) failures.push('Final Ball creation effect missing')
  failures.push(...checkCalibrationOrderings(report.preserveMatrix).map((failure) => `preserve ordering: ${failure}`))
  return failures
}

export function runM1Calibration({ sampleMatches = 1400, sampleRuns = 128, tacticSamplesPerCell = 48, orderingRunsPerCell = 128, hookSamplesPerPair = 192 } = {}) {
  const squad = squadFromPhase3Fixture(0)
  const matches = Array.from({ length: sampleMatches }, (_, index) => controlledM1Match({
    seed: hashString(`m1-shape|${index + 1}`),
    squad,
    opponent: OPPONENTS[index % OPPONENTS.length],
    approach: 'balanced',
  }))
  matches._squadById = Object.fromEntries(squad.map(({ player }) => [player.id, player]))
  const report = {
    engineVersion: M1_ENGINE_VERSION,
    samples: { sampleMatches, sampleRuns, tacticSamplesPerCell, orderingRunsPerCell, hookSamplesPerPair },
    outcomes: aggregateOutcomes(matches),
    matchShape: aggregateShape(matches),
    runLevel: runLevelMetrics({ squad, sampleRuns }),
    matchPlans: planMetrics({ squad, samplesPerCell: tacticSamplesPerCell }),
    opponents: opponentMetrics({ squad, samplesPerCell: tacticSamplesPerCell * 2 }),
    roleSignatureEffects: roleAndSignatureMetrics({ squad, samplesPerPair: hookSamplesPerPair }),
    preserveMatrix: runCalibrationSweep({ sampleRunsPerCell: orderingRunsPerCell, engineVersion: M1_ENGINE_VERSION }),
  }
  report.signature = stableCalibrationSignature(report)
  report.failures = evaluateM1Calibration(report)
  return report
}
