import { immutableCopy } from './immutable.js'
import { selectVisualEngineVersion, VISUAL_ENGINE_VERSIONS, VISUAL_V2_2 } from './versions.js'
import { visualSeedFor, sceneSeedFor, visualActionRng } from './rng.js'
import { compileFootballProgram } from './eventScenes.js'

const owned = (actorId) => ({ kind: 'owned', actorId })
const dead = () => ({ kind: 'dead', actorId: null })
const loose = () => ({ kind: 'loose', actorId: null })

// Deliberately basic staging, not formation choreography or positional zones.
// Actor indices, not viewport dimensions, determine these world coordinates.
function stagingPoint(actor, index) {
  if (actor.goalkeeper) return { x: actor.side === 'us' ? 6 : 94, y: 32 }
  return { x: actor.side === 'us' ? 24 : 76, y: 6 + (index % 11) * 5 }
}

/** Compile once from an adapter-owned CanonicalMatchView. No app/controller,
 * persistence, gameplay RNG, or probability APIs are accepted or imported.
 * Tracks are sparse linear segments. All outcomes are already resolved.
 */
export function compileVisualProgram(view, { visualEngineVersion: requestedVersion } = {}) {
  const visualEngineVersion = selectVisualEngineVersion(requestedVersion)
  if (view?.kind !== 'CanonicalMatchView' || view.schemaVersion !== 1 || !VISUAL_ENGINE_VERSIONS[visualEngineVersion].matchEngineVersions.includes(view.engineVersion)) {
    throw new TypeError('A supported CanonicalMatchView is required')
  }
  if (visualEngineVersion === VISUAL_V2_2) return compileFootballProgram(view, visualEngineVersion)
  const visualSeed = visualSeedFor(view.seed.value, visualEngineVersion)
  const points = Object.fromEntries(view.actors.map((actor, index) => [actor.id, stagingPoint(actor, index)]))
  const scenes = [], ballTracks = [], revealSchedule = []
  const clockTrack = [{ atMs: 0, period: 1, minute: 0, stoppage: 0, label: '0' }]
  let cursor = 0
  let ball = { position: { x: 50, y: 32 }, ownership: dead() }

  for (const event of view.events) {
    const id = `canonical:${event.id}`
    const sceneSeed = sceneSeedFor(visualSeed, id, event.id)
    const startMs = cursor
    const continuityIn = { ball }
    const actions = []
    const addAction = (kind, actorId, receiverId, duration, to, ownershipAfter) => {
      const action = {
        id: `${id}:action:${actions.length}`, kind, actorId, receiverId,
        startMs: cursor, endMs: cursor + duration,
        path: { kind: 'linear', from: ball.position, to },
        ownershipBefore: ball.ownership, ownershipAfter,
      }
      actions.push(action)
      ballTracks.push({ ...action, sceneId: id })
      cursor = action.endMs
      ball = { position: to, ownership: ownershipAfter }
    }
    const { creator, shooter, defendingKeeper } = event.bindings
    // Setup is explicitly placeholder staging, not an invented canonical pass.
    const setupMs = 700 + Math.floor(visualActionRng(sceneSeed, 0, 'template')() * 3) * 100
    addAction('setup', creator, null, setupMs, points[creator], owned(creator))
    if (event.progression === 'success') {
      addAction(creator === shooter ? 'carry' : 'pass', creator, shooter, 800, points[shooter], owned(shooter))
      const end = event.outcome === 'saved' ? points[defendingKeeper]
        : event.outcome === 'goal' ? { x: event.side === 'us' ? 99 : 1, y: 32 }
          : { x: event.side === 'us' ? 100 : 0, y: 48 }
      addAction('shot', shooter, event.outcome === 'saved' ? defendingKeeper : null, 1000, end, event.outcome === 'saved' ? owned(defendingKeeper) : dead())
    } else {
      const collected = event.outcome === 'keeper_claim'
      const retained = event.outcome === 'possession_recycled'
      const stopped = event.outcome === 'foul_won' || event.outcome === 'cross_blocked'
      addAction('progression', creator, collected ? defendingKeeper : null, 1000,
        collected ? points[defendingKeeper] : points[creator],
        collected ? owned(defendingKeeper) : retained ? owned(creator) : stopped ? dead() : loose())
    }
    scenes.push({
      id, origin: 'canonical', canonicalEventId: event.id, sourceIndex: event.sourceIndex,
      startMs, endMs: cursor, phase: event.progression === 'success' ? 'shot_buildup' : 'progression',
      attackingSide: event.side, route: event.route, requiredOutcome: event.outcome,
      participants: event.bindings, actions, continuityIn, continuityOut: { ball },
    })
    const commentary = event.goal
      ? `${event.goalRecord.scorer} scores${event.goalRecord.assist ? ` — assist ${event.goalRecord.assist}` : ''}`
      : event.outcome === 'saved' ? `${event.shooterName} — saved`
        : event.outcome === 'off_target' ? `${event.shooterName} — off target`
          : `${event.creatorName} — ${event.outcome.replaceAll('_', ' ')}`
    revealSchedule.push({
      id: `reveal:${event.id}`, atMs: cursor, sceneId: id, canonicalEventId: event.id,
      event: event.canonicalEvent, goal: event.goalRecord, commentary,
    })
    clockTrack.push({ atMs: cursor, ...event.clock })
  }

  // Positive terminal hold also gives a zero-event match a finite FT boundary.
  const durationMs = cursor + 1000
  const lastClock = clockTrack[clockTrack.length - 1]
  clockTrack.push({ atMs: durationMs, period: 2, minute: 90, stoppage: lastClock.minute === 90 ? lastClock.stoppage : 0, label: 'FT' })
  const playerTracks = view.actors.map((actor) => ({
    actorId: actor.id,
    segments: [{ startMs: 0, endMs: durationMs, path: { kind: 'linear', from: points[actor.id], to: points[actor.id] } }],
  }))
  return immutableCopy({
    kind: 'VisualProgram', schemaVersion: 1, visualEngineVersion, visualSeed,
    matchKey: view.matchKey, canonicalSignature: view.canonicalSignature, engineVersion: view.engineVersion,
    durationMs, actors: view.actors, scenes, revealSchedule, clockTrack, playerTracks, ballTracks,
    initialBall: { position: { x: 50, y: 32 }, ownership: dead() },
    finalScore: view.finalScore, goals: view.goals, finalStats: view.finalStats,
    result: view.result, penalties: view.penalties,
  })
}
