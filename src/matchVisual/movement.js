import { blendPhaseAnchor, clamp, toRelative, toWorld } from './formations.js'
import { POSITIONAL_ZONES, constrainToZone } from './zones.js'
import { distance } from './ballPaths.js'

// Normalized world units/s and units/s². Quintic ease has peak speed 1.875*d/T
// and peak acceleration < 6*d/T². Every segment starts/ends at rest, avoiding
// instantaneous changes of velocity at action boundaries without physics.
export const MOVEMENT_LIMITS = Object.freeze({ maxSpeed: 10, maxAcceleration: 18 })

// Code-unit ordering is independent of the browser/OS locale.
export const compareActorIds = (a, b) => a < b ? -1 : a > b ? 1 : 0

export function formationPositions(entries, phases = { us: 'buildup', opp: 'defensive' }) {
  return Object.fromEntries(entries.map((entry) => [entry.actorId, toWorld(entry.anchors[phases[entry.side]], entry.side)]))
}

function nearest(entries, positions, target) {
  return [...entries].sort((a, b) => distance(positions[a.actorId], target) - distance(positions[b.actorId], target) || compareActorIds(a.actorId, b.actorId))
}

export function movementTargets({ entries, from, attackingSide, phase, ballTarget, carrierId = null, receiverId = null, required = {}, roles = {} }) {
  const targets = {}, relative = {}, anchors = {}, phases = {}
  const byId = Object.fromEntries(entries.map((entry) => [entry.actorId, entry]))
  for (const entry of entries) {
    const ownPhase = entry.side === attackingSide ? phase : 'defensive'
    phases[entry.actorId] = ownPhase
    const anchor = blendPhaseAnchor(entry, ownPhase, ownPhase, 1)
    anchors[entry.actorId] = anchor
    const ball = toRelative(ballTarget, entry.side)
    const vShift = clamp((ball.v - 50) * 0.18, -6, 6)
    const uShift = clamp((ball.u - 50) * 0.12, -4, 4)
    const point = { u: anchor.u + uShift, v: anchor.v + vShift }
    const role = roles[entry.actorId]
    if (entry.side === attackingSide) {
      if (role === 'Inside Forward') point.v += Math.sign(50 - point.v) * 6
      if (/Attacking (Fullback|Wingback)/.test(role || '')) point.u += 3
      if (role === 'Defensive Shield' || role === 'Link-Up Striker') point.u -= 3
    }
    if (entry.position === 'GK') {
      point.u = entry.side === attackingSide ? 8 + clamp(ball.u * 0.09, 0, 7) : 4
      point.v = 50 + clamp((ball.v - 50) * 0.2, -8, 8)
    }
    relative[entry.actorId] = constrainToZone(point, entry, ownPhase, anchor)
  }

  const attackBall = toRelative(ballTarget, attackingSide)
  const carrier = byId[carrierId]
  const preferred = carrier ? POSITIONAL_ZONES[carrier.position].supports : []
  const candidates = nearest(entries.filter((entry) => entry.side === attackingSide && entry.position !== 'GK' && entry.actorId !== carrierId && entry.actorId !== receiverId && !Object.hasOwn(required, entry.actorId)), from, ballTarget)
  const support = [...candidates.filter((entry) => preferred.includes(entry.position)), ...candidates.filter((entry) => !preferred.includes(entry.position))].slice(0, 3)
  const nodes = [{ u: attackBall.u - 10, v: attackBall.v - 8 }, { u: attackBall.u + 8, v: attackBall.v + 12 }, { u: attackBall.u + 10, v: attackBall.v - 12 }]
  support.forEach((entry, i) => { relative[entry.actorId] = constrainToZone(nodes[i], entry, phases[entry.actorId], anchors[entry.actorId]) })

  const defenders = nearest(entries.filter((entry) => entry.side !== attackingSide && entry.position !== 'GK' && !Object.hasOwn(required, entry.actorId)), from, ballTarget)
  const presser = defenders[0], cover = defenders[1]
  if (presser) {
    const b = toRelative(ballTarget, presser.side)
    relative[presser.actorId] = constrainToZone({ u: b.u - 3, v: b.v + 2 }, presser, 'defensive', anchors[presser.actorId], true)
  }
  if (cover) {
    const b = toRelative(ballTarget, cover.side)
    relative[cover.actorId] = constrainToZone({ u: b.u - 9, v: b.v - 5 }, cover, 'defensive', anchors[cover.actorId], true)
  }
  for (const [id, point] of Object.entries(required)) {
    const entry = byId[id]
    if (!entry) throw new TypeError(`Unknown movement actor: ${id}`)
    relative[id] = constrainToZone(toRelative(point, entry.side), entry, phases[id], anchors[id], true)
  }
  for (const entry of entries) targets[entry.actorId] = toWorld(relative[entry.actorId], entry.side)

  // Two bounded separation passes. Required action participants are pinned;
  // ball ownership will be sampled from the resulting owner track, never an
  // independent marker nudge. Nonparticipants remain inside preferred lanes.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j], ap = targets[a.actorId], bp = targets[b.actorId]
        const d = distance(ap, bp)
        if (d >= 3) continue
        const dx = d > 0.001 ? (bp.x - ap.x) / d : (i + j) % 2 ? 1 : -1
        const dy = d > 0.001 ? (bp.y - ap.y) / d : 0
        for (const [entry, sign] of [[a, -1], [b, 1]]) {
          if (Object.hasOwn(required, entry.actorId)) continue
          const p = targets[entry.actorId], push = Math.min(1.2, (3 - d) / 2)
          const exceptional = entry === presser || entry === cover
          targets[entry.actorId] = toWorld(constrainToZone(toRelative({ x: p.x + dx * push * sign, y: p.y + dy * push * sign }, entry.side), entry, phases[entry.actorId], anchors[entry.actorId], exceptional), entry.side)
        }
      }
    }
  }
  return { targets, assignments: { supportIds: support.map((entry) => entry.actorId), presserId: presser?.actorId ?? null, coverId: cover?.actorId ?? null, exceptionalActorIds: Object.keys(required) } }
}

export function movementDuration(from, to, minimumMs = 500) {
  const maximum = Math.max(0, ...Object.keys(to).map((id) => distance(from[id], to[id])))
  const speedMs = maximum * 1.875 / MOVEMENT_LIMITS.maxSpeed * 1000
  const accelerationMs = Math.sqrt(maximum * 6 / MOVEMENT_LIMITS.maxAcceleration) * 1000
  return Math.ceil(Math.max(minimumMs, speedMs, accelerationMs) / 20) * 20
}

export function movementSegments(from, to, startMs, durationMs, sceneId) {
  return Object.keys(to).map((actorId) => ({
    actorId, sceneId, startMs, endMs: startMs + durationMs,
    path: { kind: 'linear', from: { ...from[actorId] }, to: { ...to[actorId] }, easing: 'smooth' },
  }))
}
