import { clamp, toWorld } from './formations.js'

export const GOAL_PLANE = 98
export const GOAL_MOUTH = Object.freeze([44, 56])
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
export const smoothProgress = (t) => t * t * t * (10 + t * (-15 + 6 * t))
export const owned = (actorId) => ({ kind: 'owned', actorId })
export const inFlight = (fromActorId, toActorId, path) => ({ kind: 'inFlight', actorId: null, fromActorId, toActorId, path })
export const loose = (path, scheduledCollector) => ({ kind: 'loose', actorId: null, path, scheduledCollector })
export const dead = (position) => ({ kind: 'dead', actorId: null, position })

const ARC_HEIGHT = { short_pass: 0, medium_pass: 0.5, long_pass: 8, through_ball: 0, switch: 9, cross: 7, cutback: 0, carry: 0, shoot: 0.5, save: 0, miss: 0.5, goal: 0.5, clearance: 10 }

export function makeBallPath(kind, from, to, { bend = 0 } = {}) {
  if (!Object.hasOwn(ARC_HEIGHT, kind)) throw new RangeError(`Unsupported ball path: ${kind}`)
  const d = distance(from, to) || 1
  const offset = clamp(bend, -8, 8)
  return {
    kind: 'quadratic', semantic: kind, from: { ...from }, to: { ...to },
    control: { x: clamp((from.x + to.x) / 2 - (to.y - from.y) / d * offset, 0, 100), y: clamp((from.y + to.y) / 2 + (to.x - from.x) / d * offset, 0, 100) },
    height: ARC_HEIGHT[kind], easing: kind === 'carry' ? 'smooth' : 'linear',
  }
}

export function samplePath(path, progress) {
  const raw = clamp(progress, 0, 1)
  const t = path.easing === 'smooth' ? smoothProgress(raw) : raw
  const s = 1 - t
  const position = path.kind === 'quadratic'
    ? { x: s * s * path.from.x + 2 * s * t * path.control.x + t * t * path.to.x, y: s * s * path.from.y + 2 * s * t * path.control.y + t * t * path.to.y }
    : { x: path.from.x + (path.to.x - path.from.x) * t, y: path.from.y + (path.to.y - path.from.y) * t }
  return { position, height: (path.height || 0) * 4 * raw * (1 - raw), shadowPosition: { ...position } }
}

export function passKind(from, to) {
  const length = distance(from, to)
  return length < 18 ? 'short_pass' : length < 35 ? 'medium_pass' : 'long_pass'
}

export function shotDestination(outcome, side, keeperPoint, lateral = 50) {
  if (outcome === 'saved') return { ...keeperPoint }
  if (outcome === 'goal') return toWorld({ u: 99.5, v: clamp(lateral, 46, 54) }, side)
  if (outcome === 'off_target') return toWorld({ u: 100, v: lateral < 50 ? 34 : 66 }, side)
  throw new RangeError(`Unsupported shot outcome: ${outcome}`)
}

// No collision decides the goal. This only locates the already-required
// crossing in a compiled path, for reveal-timing assertions and future UI.
export function goalCrossingProgress(path, side) {
  const reached = (t) => {
    const { x } = samplePath(path, t).position
    return side === 'us' ? x >= GOAL_PLANE : x <= 100 - GOAL_PLANE
  }
  if (!reached(1)) return null
  let low = 0, high = 1
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (reached(mid)) high = mid; else low = mid }
  return high
}
