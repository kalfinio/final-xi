import { immutableCopy } from './immutable.js'

// Vocabulary belongs to this M1 adapter contract. Unsupported future outcomes
// must be adapted explicitly, never silently reinterpreted as a miss or goal.
const SHOT_OUTCOMES = new Set(['goal', 'saved', 'off_target'])
const FAILURE_OUTCOMES = new Set([
  'cross_blocked', 'delivery_cleared', 'possession_recycled', 'counter_halted',
  'foul_won', 'turnover_created', 'heavy_touch_turnover', 'set_piece_cleared',
  'keeper_claim', 'pass_intercepted', 'buildup_stopped',
])
const ROUTES = new Set([
  'central_buildup', 'wide_overlap', 'switch_of_play', 'through_ball', 'one_two',
  'counterattack', 'cross', 'cutback', 'pressing_recovery', 'direct_attack', 'set_piece', 'long_range',
])
const OPPONENT_SLOTS = [
  ['gk', 'GK'], ['rb', 'RB'], ['cb-right', 'CB'], ['cb-left', 'CB'], ['lb', 'LB'],
  ['cm-right', 'CM'], ['cm-center', 'CM'], ['cm-left', 'CM'], ['rw', 'RW'], ['st', 'ST'], ['lw', 'LW'],
]
// Positional stand-ins, NOT an assertion of an actual opponent formation/XI.
const OPPONENT_LABELS = {
  'Opponent Winger': 'opp:rw',
  'Opponent Striker': 'opp:st',
  'Opponent Midfielder': 'opp:cm-center',
  'Opponent Centre-Back': 'opp:cb-right',
  'Opponent Playmaker': 'opp:cm-left',
  'Opponent Forward': 'opp:st',
}
const requireFact = (condition, message) => { if (!condition) throw new TypeError(`Invalid canonical visual input: ${message}`) }
const uint32 = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff
const ownActorId = (id) => `us:${encodeURIComponent(id)}`

function canonicalClock(event) {
  requireFact(Number.isInteger(event.window) && event.window >= 1 && event.window <= 6, 'event window')
  const period = event.window <= 3 ? 1 : 2
  const stoppage = event.stoppage ?? 0
  requireFact(Number.isInteger(event.minute) && event.minute >= (period === 1 ? 1 : 46) && event.minute <= (period === 1 ? 45 : 90), 'event minute')
  requireFact(Number.isInteger(stoppage) && stoppage >= 0 && (!stoppage || event.minute === (period === 1 ? 45 : 90)), 'stoppage time')
  return { period, minute: event.minute, stoppage, label: event.minuteLabel ?? (stoppage ? `${event.minute}+${stoppage}` : String(event.minute)) }
}

/** Read-only M1 adapter. The caller supplies the already version-resolved XI.
 * canonicalSignature is optional, supplied by the existing signature boundary
 * using its real run index. This module neither imports nor duplicates it.
 */
export function createCanonicalMatchView({ match, squad, formation, catalogVersion = null, dbVersion = null, canonicalSignature = null }) {
  requireFact(match?.engineVersion === 'm1', 'only resolved M1 matches are supported')
  requireFact(Array.isArray(match.causalEvents) && Array.isArray(match.events) && match.detail?.finalStats, 'resolved events and MatchDetail are required')
  requireFact(['win', 'draw', 'loss', 'pens-win', 'pens-loss'].includes(match.result), 'resolved result is required')
  requireFact(['balanced', 'control', 'wide', 'counter'].includes(match.approach), 'canonical Match Plan is required')
  requireFact(typeof formation === 'string' && formation.length > 0, 'formation context is required')
  requireFact(Array.isArray(squad) && squad.length === 11, 'exact versioned XI is required')
  requireFact(canonicalSignature === null || (typeof canonicalSignature === 'string' && /^[0-9a-f]{8}$/.test(canonicalSignature)), 'canonical signature')
  const players = new Map()
  for (const entry of squad) {
    requireFact(typeof entry?.player?.id === 'string' && entry.player.id.length > 0 && typeof entry.slot === 'string', 'squad entry')
    requireFact(!players.has(entry.player.id), 'duplicate squad player')
    players.set(entry.player.id, entry)
  }
  const keepers = squad.filter(({ player }) => player.posType === 'GK')
  requireFact(keepers.length === 1, 'one player-team goalkeeper is required')
  const actors = [
    ...squad.map(({ slot, player }) => ({ id: ownActorId(player.id), side: 'us', playerId: player.id, slot, name: player.name, anonymous: false, goalkeeper: player.posType === 'GK' })),
    ...OPPONENT_SLOTS.map(([key, slot]) => ({ id: `opp:${key}`, side: 'opp', playerId: null, slot, name: null, anonymous: true, goalkeeper: slot === 'GK' })),
  ]
  const playerActor = (id, name) => {
    const entry = players.get(id)
    requireFact(!!entry, `unknown player participant ${String(id)}`)
    if (name != null) requireFact(entry.player.name === name, `participant name does not match versioned XI: ${id}`)
    return ownActorId(id)
  }
  const opponentActor = (name) => {
    requireFact(Object.hasOwn(OPPONENT_LABELS, name), `unsupported anonymous opponent label: ${name}`)
    return OPPONENT_LABELS[name]
  }
  const goalsById = new Map()
  for (const goal of match.events) {
    requireFact(typeof goal.causalEventId === 'string' && !goalsById.has(goal.causalEventId), 'duplicate or missing goal event ID')
    goalsById.set(goal.causalEventId, goal)
  }
  const score = { us: 0, opp: 0 }
  const totals = { us: { shots: 0, shotsOnTarget: 0, saves: 0, bigChances: 0 }, opp: { shots: 0, shotsOnTarget: 0, saves: 0, bigChances: 0 } }
  const ids = new Set()
  let previousClock = null
  const events = match.causalEvents.map((event, index) => {
    requireFact(typeof event.id === 'string' && event.id.length > 0 && !ids.has(event.id), 'duplicate or missing causal event ID')
    ids.add(event.id)
    requireFact(event.side === 'us' || event.side === 'opp', 'attacking side')
    requireFact(ROUTES.has(event.route), `unsupported route: ${event.route}`)
    const shot = event.progression === 'success'
    requireFact(shot ? SHOT_OUTCOMES.has(event.outcome) : event.progression === 'failed' && FAILURE_OUTCOMES.has(event.outcome), `unsupported outcome: ${event.outcome}`)
    requireFact(event.goal === (event.outcome === 'goal') && event.onTarget === (event.outcome === 'goal' || event.outcome === 'saved'), 'goal/on-target flags contradict outcome')
    const clock = canonicalClock(event)
    if (previousClock) {
      const a = previousClock, b = clock
      requireFact(b.period > a.period || (b.period === a.period && (b.minute > a.minute || (b.minute === a.minute && b.stoppage >= a.stoppage))), 'events are not in canonical chronological order')
    }
    previousClock = clock
    requireFact(event.scoreBefore?.us === score.us && event.scoreBefore?.opp === score.opp, 'scoreBefore')
    if (event.goal) score[event.side]++
    requireFact(event.scoreAfter?.us === score.us && event.scoreAfter?.opp === score.opp, 'scoreAfter')
    const other = event.side === 'us' ? 'opp' : 'us'
    if (shot) {
      totals[event.side].shots++
      if (event.onTarget) totals[event.side].shotsOnTarget++
      if (event.outcome === 'saved') totals[other].saves++
      if (['high', 'clear'].includes(event.chanceQuality)) totals[event.side].bigChances++
    }
    const creator = event.side === 'us' ? playerActor(event.creatorId, event.creatorName) : opponentActor(event.creatorName)
    const shooter = !shot ? null : event.side === 'us' ? playerActor(event.shooterId, event.shooterName) : opponentActor(event.shooterName)
    // M1's keeperId is always the player's keeper, including during us attacks.
    const defendingKeeper = event.side === 'us' ? 'opp:gk' : playerActor(event.keeperId)
    requireFact(event.side === 'us' || event.keeperId === keepers[0].player.id, 'defending keeper is not the player-team goalkeeper')
    const defender = event.side === 'opp' && event.defenderId != null ? playerActor(event.defenderId) : null
    const goalRecord = goalsById.get(event.id) || null
    requireFact(!!goalRecord === event.goal, 'goal projection disagrees with causal event')
    if (goalRecord) {
      requireFact(goalRecord.side === event.side && goalRecord.scorer === event.shooterName && goalRecord.minute === event.minute, 'goal attribution')
      const expectedAssist = event.creatorName && event.creatorName !== event.shooterName ? event.creatorName : null
      requireFact(goalRecord.assist === expectedAssist, 'assist attribution')
    }
    return {
      ...event, canonicalEvent: event, sourceIndex: index, clock,
      bindings: { creator, shooter, defender, defendingKeeper, assister: goalRecord?.assist ? creator : null },
      goalRecord,
    }
  })
  requireFact(goalsById.size === events.filter((event) => event.goal).length, 'unmatched goal projection')
  requireFact(match.gf === score.us && match.ga === score.opp && match.detail.homeGoals === score.us && match.detail.awayGoals === score.opp, 'final score disagrees with goals')
  const goals = events.filter((event) => event.goal).map((event) => event.goalRecord)
  requireFact(JSON.stringify(goals) === JSON.stringify(match.events), 'goal projection order')
  const ownGoals = goals.filter((goal) => goal.side === 'us')
  requireFact(JSON.stringify(match.detail.scorers) === JSON.stringify(ownGoals.map((goal) => goal.scorer)), 'MatchDetail scorers disagree with goals')
  requireFact(JSON.stringify(match.detail.assists) === JSON.stringify(ownGoals.filter((goal) => goal.assist).map((goal) => goal.assist)), 'MatchDetail assists disagree with goals')
  const finalStats = { us: match.detail.finalStats.home, opp: match.detail.finalStats.away }
  for (const side of ['us', 'opp']) {
    for (const key of Object.keys(totals[side])) requireFact(finalStats[side]?.[key] === totals[side][key], `final ${side} ${key} disagrees with events`)
  }
  requireFact(match.detail.result === match.result, 'result disagrees with MatchDetail')
  requireFact(JSON.stringify(match.detail.pens ?? null) === JSON.stringify(match.pens ?? null), 'penalties disagree with MatchDetail')
  const seedSource = uint32(match.simulationSeed) ? 'simulationSeed' : uint32(match.presentationSeed) ? 'presentationSeed' : 'detail.presentationSeed'
  const stableMatchSeed = seedSource === 'simulationSeed' ? match.simulationSeed : seedSource === 'presentationSeed' ? match.presentationSeed : match.detail.presentationSeed
  requireFact(uint32(stableMatchSeed), 'canonical deterministic seed is required')
  const matchNumber = match.detail.metadata?.matchNumber ?? match.matchNo ?? null
  const homeSide = match.home === true ? 'us' : match.home === false ? 'opp' : null
  return immutableCopy({
    kind: 'CanonicalMatchView', schemaVersion: 1,
    matchKey: JSON.stringify(['m1', stableMatchSeed, matchNumber, match.type, match.round ?? null, match.opponentMeta?.id ?? match.opponent]),
    engineVersion: match.engineVersion, canonicalSignature,
    seed: { value: stableMatchSeed, source: seedSource },
    formation, catalogVersion, dbVersion, squad, actors,
    approach: match.approach, opponent: match.opponent, opponentMeta: match.opponentMeta ?? null,
    venue: { playerTeam: homeSide === 'us' ? 'home' : homeSide === 'opp' ? 'away' : 'unknown', homeSide, awaySide: homeSide === 'us' ? 'opp' : homeSide === 'opp' ? 'us' : null },
    events, goals, finalScore: { ...score }, finalStats,
    penalties: match.pens ?? null, result: match.result,
  })
}
