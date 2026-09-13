import { immutableCopy } from './immutable.js'
import { assertVisualEngineVersion, VISUAL_V2_2 } from './versions.js'
import { samplePath } from './ballPaths.js'

const interpolate = (path, progress) => ({
  x: path.from.x + (path.to.x - path.from.x) * progress,
  y: path.from.y + (path.to.y - path.from.y) * progress,
})
const progressAt = (segment, time) => Math.max(0, Math.min(1, (time - segment.startMs) / (segment.endMs - segment.startMs)))
const latest = (items, time, field = 'startMs') => {
  let found = null
  for (const item of items) { if (item[field] > time) break; found = item }
  return found
}

/** Pure random-access sampling. Seeking IS sampling at another timestamp.
 * Half-open action/scene intervals; reveals use inclusive terminal timestamps.
 * No RNG, callbacks, retained state, wall clock, or accumulated score updates.
 */
export function sampleVisualProgram(program, timestampMs) {
  if (program?.kind !== 'VisualProgram' || program.schemaVersion !== 1) throw new TypeError('A VisualProgram is required')
  assertVisualEngineVersion(program.visualEngineVersion)
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) throw new TypeError('A finite presentation timestamp is required')
  const timeMs = Math.max(0, Math.min(program.durationMs, timestampMs))
  const football = program.visualEngineVersion === VISUAL_V2_2
  const fullTime = timeMs === program.durationMs
  const scene = latest(program.scenes, timeMs)
  const activeScene = scene && timeMs < scene.endMs ? scene : null
  const action = activeScene ? latest(activeScene.actions, timeMs) : null
  const activeAction = action && timeMs < action.endMs ? action : null
  const players = program.playerTracks.map((track) => {
    const segment = latest(track.segments, timeMs)
    return { actorId: track.actorId, position: football ? samplePath(segment.path, progressAt(segment, timeMs)).position : interpolate(segment.path, progressAt(segment, timeMs)) }
  })
  const ballTrack = latest(program.ballTracks, timeMs)
  let ball = { ...program.initialBall, mode: program.initialBall.ownership.kind, ownerId: program.initialBall.ownership.actorId }
  if (ballTrack && football) {
    const progress = progressAt(ballTrack, timeMs)
    const ownership = progress >= 1 ? ballTrack.ownershipAfter : ballTrack.ownershipDuring
    const pathState = samplePath(ballTrack.path, progress)
    const owner = ownership.kind === 'owned' ? players.find((player) => player.actorId === ownership.actorId) : null
    const position = owner ? owner.position : ownership.kind === 'dead' ? ownership.position : pathState.position
    ball = {
      position, ownership, mode: ownership.kind, ownerId: owner?.actorId ?? null,
      fromActorId: ownership.fromActorId ?? null, receiverId: ownership.toActorId ?? ownership.scheduledCollector ?? null,
      height: owner || ownership.kind === 'dead' ? 0 : pathState.height, shadowPosition: { ...position },
    }
  } else if (ballTrack) {
    const progress = progressAt(ballTrack, timeMs)
    const moving = progress < 1 && ballTrack.kind !== 'carry'
    const ownership = moving ? { kind: 'inFlight', actorId: null } : progress >= 1 ? ballTrack.ownershipAfter : ballTrack.ownershipBefore
    ball = { position: interpolate(ballTrack.path, progress), ownership, mode: ownership.kind, ownerId: ownership.actorId, receiverId: moving ? ballTrack.receiverId : null }
  }
  const revealed = program.revealSchedule.filter((item) => item.atMs <= timeMs)
  const revealedCanonicalEvents = revealed.map((item) => item.event)
  const goals = revealed.filter((item) => item.goal).map((item) => item.goal)
  const score = { us: 0, opp: 0 }
  for (const goal of goals) score[goal.side]++
  const shotTotals = { us: { shots: 0, shotsOnTarget: 0, saves: 0, bigChances: 0 }, opp: { shots: 0, shotsOnTarget: 0, saves: 0, bigChances: 0 } }
  for (const event of revealedCanonicalEvents) {
    if (event.progression !== 'success') continue
    const side = event.side, other = side === 'us' ? 'opp' : 'us'
    shotTotals[side].shots++
    if (event.onTarget) shotTotals[side].shotsOnTarget++
    if (event.outcome === 'saved') shotTotals[other].saves++
    if (['high', 'clear'].includes(event.chanceQuality)) shotTotals[side].bigChances++
  }
  const currentReveal = revealed[revealed.length - 1] || null
  return immutableCopy({
    timeMs, activeScene, activeAction, players, ball,
    ...(football ? { actionProgress: activeAction ? progressAt(activeAction, timeMs) : null, scenePhase: activeAction?.phase ?? null } : {}),
    revealedCanonicalEvents, goals, score, shotTotals,
    clock: latest(program.clockTrack, timeMs, 'atMs'),
    currentReveal, commentary: currentReveal?.commentary ?? null, fullTime,
    finalStats: fullTime ? program.finalStats : null,
    result: fullTime ? program.result : null,
    // Only an aggregate summary exists canonically: never generate kick logs.
    penalties: fullTime ? program.penalties : null,
  })
}
