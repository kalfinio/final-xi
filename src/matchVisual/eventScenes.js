import { immutableCopy } from './immutable.js'
import { formationContext, clamp, toRelative, toWorld } from './formations.js'
import { formationPositions, movementTargets, movementDuration, movementSegments, compareActorIds } from './movement.js'
import { dead, owned, inFlight, loose, makeBallPath, passKind, distance, shotDestination, goalCrossingProgress } from './ballPaths.js'
import { sceneSeedFor, visualActionRng, visualSeedFor } from './rng.js'

// Route-specific staging only. These express canonical routes; they are NOT
// Match Plan multipliers or opponent archetype profiles.
const ROUTES = {
  central_buildup: { creatorU: 67, receiverU: 87, delivery: 'pass', phase: 'settled' },
  wide_overlap: { creatorU: 83, receiverU: 87, delivery: 'cross', wide: true, phase: 'attacking' },
  switch_of_play: { creatorU: 75, receiverU: 87, delivery: 'cross', wide: true, phase: 'settled' },
  through_ball: { creatorU: 68, receiverU: 90, delivery: 'through_ball', phase: 'settled' },
  one_two: { creatorU: 74, receiverU: 87, delivery: 'pass', phase: 'settled' },
  counterattack: { creatorU: 60, receiverU: 87, delivery: 'through_ball', recovery: true, phase: 'transition' },
  cross: { creatorU: 87, receiverU: 87, delivery: 'cross', wide: true, phase: 'attacking' },
  cutback: { creatorU: 93, receiverU: 80, delivery: 'cutback', wide: true, phase: 'attacking' },
  pressing_recovery: { creatorU: 75, receiverU: 88, delivery: 'through_ball', recovery: true, phase: 'transition' },
  direct_attack: { creatorU: 34, receiverU: 87, delivery: 'long_pass', phase: 'buildup' },
  set_piece: { creatorU: 65, receiverU: 87, delivery: 'long_pass', restart: true, phase: 'attacking' },
  long_range: { creatorU: 64, receiverU: 73, delivery: 'pass', phase: 'settled' },
}
const SIDES = ['us', 'opp']
const otherSide = (side) => side === 'us' ? 'opp' : 'us'
const point = (u, v, side) => toWorld({ u, v }, side)
const minimumFlight = (from, to, speed = 30) => Math.max(450, distance(from, to) / speed * 1000)

function commentaryFor(event) {
  if (event.goal) return `${event.goalRecord.scorer} scores${event.goalRecord.assist ? ` — assist ${event.goalRecord.assist}` : ''}`
  if (event.outcome === 'saved') return `${event.shooterName} — saved`
  if (event.outcome === 'off_target') return `${event.shooterName} — off target`
  return `${event.creatorName} — ${event.outcome.replaceAll('_', ' ')}`
}

export function compileCanonicalScene(view, event, entries, visualSeed, startMs) {
  const id = `canonical:${event.id}`
  const seed = sceneSeedFor(visualSeed, id, event.id)
  const route = ROUTES[event.route]
  if (!route) throw new RangeError(`Unsupported scene route: ${event.route}`)
  const side = event.side, defendingSide = otherSide(side)
  const byId = Object.fromEntries(entries.map((entry) => [entry.actorId, entry]))
  const roles = Object.fromEntries(view.squad.map(({ player }) => [`us:${encodeURIComponent(player.id)}`, player.role]))
  const { creator, shooter, defendingKeeper } = event.bindings
  const creatorEntry = byId[creator]
  const flank = creatorEntry.anchors.buildup.v < 42 ? 15 : creatorEntry.anchors.buildup.v > 58 ? 85 : visualActionRng(seed, 0, 'flank')() < 0.5 ? 15 : 85
  const centralV = 46 + Math.floor(visualActionRng(seed, 0, 'path-variation')() * 9)
  const creatorTarget = point(creatorEntry.position === 'GK' ? 16 : route.creatorU, route.wide ? (creatorEntry.position === 'GK' ? (flank < 50 ? 25 : 75) : flank) : centralV, side)
  const finishTarget = point(route.receiverU, centralV, side)
  const earlyRun = point(route.receiverU - 7, centralV + 3, side)
  const phases = Object.fromEntries(SIDES.map((team) => [team, team === side ? (route.recovery ? 'defensive' : 'buildup') : 'defensive']))
  let positions = formationPositions(entries, phases)
  const nearestActor = (team, target, excluded = [], predicate = () => true) => entries
    .filter((entry) => entry.side === team && entry.position !== 'GK' && !excluded.includes(entry.actorId) && predicate(entry))
    .sort((a, b) => distance(positions[a.actorId], target) - distance(positions[b.actorId], target) || compareActorIds(a.actorId, b.actorId))[0]?.actorId
  const support = nearestActor(side, positions[creator], [creator, shooter], (entry) => ['CB', 'DM', 'CM', 'LB', 'RB', 'LWB', 'RWB'].includes(entry.position))
    || nearestActor(side, positions[creator], [creator, shooter])
  const recoveryOpponent = nearestActor(defendingSide, positions[creator])
  const initialOwner = route.recovery ? recoveryOpponent : route.restart || event.goal && !event.goalRecord.assist || creator === shooter ? creator : support
  let ball = { position: positions[initialOwner], ownership: owned(initialOwner) }
  if (route.restart) ball = { position: creatorTarget, ownership: dead(creatorTarget) }
  const initialPositions = positions
  const initialBall = ball
  let cursor = startMs
  const actions = [], playerSegments = [], ballTracks = []

  function add({ kind, actorId, receiverId = null, phase = route.phase, formationPhase = phase, required = {}, end = null, pathKind = null, transport = 'owned', after = null, minMs = 500, freezeOthers = false, marker = null }) {
    const predictedBall = end || required[receiverId] || required[actorId] || positions[actorId] || ball.position
    const movement = freezeOthers
      ? { targets: { ...positions, ...required }, assignments: { supportIds: [], presserId: null, coverId: null, exceptionalActorIds: Object.keys(required) } }
      : movementTargets({ entries, from: positions, attackingSide: side, phase: formationPhase, ballTarget: predictedBall, carrierId: actorId, receiverId, required, roles })
    const duration = movementDuration(positions, movement.targets, minMs)
    const destination = end || (receiverId ? movement.targets[receiverId] : movement.targets[actorId]) || ball.position
    const from = transport === 'owned' ? positions[actorId] : ball.position
    const semantic = pathKind || (kind === 'pass' ? passKind(from, destination) : kind === 'carry' || kind === 'receive' ? 'carry' : 'short_pass')
    const bend = ['cross', 'switch', 'long_pass'].includes(semantic) ? (flank < 50 ? -1 : 1) * 4 : 0
    const path = makeBallPath(semantic, from, destination, { bend })
    const ownershipAfter = after || owned(receiverId || actorId)
    const ownershipDuring = transport === 'owned' ? owned(actorId)
      : transport === 'flight' ? inFlight(actorId, receiverId, path)
        : transport === 'loose' ? loose(path, receiverId)
          : dead(ball.position)
    const action = {
      id: `${id}:action:${actions.length}`, kind, actorId, receiverId, phase,
      startMs: cursor, endMs: cursor + duration, path, ownershipBefore: ball.ownership, ownershipDuring, ownershipAfter,
      assignments: movement.assignments, marker,
    }
    actions.push(action)
    playerSegments.push(...movementSegments(positions, movement.targets, cursor, duration, id))
    ballTracks.push({ ...action, sceneId: id })
    positions = movement.targets
    cursor = action.endMs
    ball = { position: ownershipAfter.kind === 'owned' ? positions[ownershipAfter.actorId] : destination, ownership: ownershipAfter }
    return action
  }
  const hold = (actorId, kind = 'receive', phase = route.phase, minMs = 350) => add({ kind, actorId, phase, formationPhase: route.phase, minMs, freezeOthers: true })
  function deliver(actorId, receiverId, target, kind = 'pass', marker = null) {
    const pathKind = kind === 'pass' ? passKind(positions[actorId], target) : kind
    add({ kind: pathKind === 'long_pass' && kind === 'pass' ? 'long_pass' : kind, actorId, receiverId, end: target, pathKind, transport: 'flight',
      required: { [actorId]: positions[actorId], [receiverId]: target }, freezeOthers: true,
      minMs: minimumFlight(positions[actorId], target, kind === 'cross' ? 24 : 30), marker })
    hold(receiverId)
  }

  if (route.restart) {
    // Generic restart only: no assertion of penalty, corner or free kick type.
    add({ kind: 'dead_ball', actorId: creator, phase: 'set_piece', formationPhase: 'attacking', required: { [creator]: creatorTarget, ...(shooter ? { [shooter]: earlyRun } : {}) }, end: creatorTarget, transport: 'dead', after: dead(creatorTarget), minMs: 900 })
    hold(creator, 'receive', 'set_piece')
  } else if (route.recovery) {
    const recoveryPoint = creatorEntry.position === 'GK' ? point(16, centralV, side)
      : event.route === 'pressing_recovery' ? point(68, centralV, side) : positions[recoveryOpponent]
    add({ kind: 'carry', actorId: recoveryOpponent, phase: 'defensive', formationPhase: 'defensive', required: { [recoveryOpponent]: recoveryPoint, [creator]: point(toRelative(recoveryPoint, side).u - 3, centralV, side) }, minMs: 700 })
    add({ kind: 'turnover', actorId: recoveryOpponent, receiverId: creator, phase: 'recovery', formationPhase: 'transition', end: recoveryPoint, required: { [creator]: recoveryPoint, [recoveryOpponent]: positions[recoveryOpponent] }, transport: 'loose', freezeOthers: true, minMs: 600 })
    hold(creator, 'receive', 'transition')
  } else if (initialOwner !== creator) {
    // These supporting touches precede the credited final action.
    add({ kind: 'carry', actorId: support, phase: 'buildup', required: { [support]: positions[support] }, minMs: 600 })
    const entryTarget = creatorEntry.position === 'GK' ? positions[creator]
      : point(event.route === 'switch_of_play' ? 53 : 47, route.wide ? flank : centralV, side)
    deliver(support, creator, entryTarget, event.route === 'switch_of_play' ? 'switch' : 'pass')
  } else hold(creator, 'receive', 'buildup')

  if (event.route === 'one_two' && creator !== shooter) {
    deliver(creator, support, point(64, centralV - 12, side))
    deliver(support, creator, point(72, centralV, side))
  }

  const selfCreated = creator === shooter
  const carryTarget = selfCreated ? finishTarget : creatorTarget
  // The canonical finisher starts running BEFORE the final delivery. A CB
  // finisher can leave their usual envelope; duration expands to fit the run.
  add({ kind: 'carry', actorId: creator, phase: route.recovery ? 'counterattack' : route.wide ? 'wing_progression' : route.restart ? 'set_piece' : route.phase,
    formationPhase: route.phase, required: { [creator]: carryTarget, ...(shooter && !selfCreated ? { [shooter]: earlyRun } : {}) }, minMs: route.recovery ? 800 : 1000 })

  let goalCrossingMs = null
  if (event.progression === 'success') {
    if (!selfCreated) deliver(creator, shooter, finishTarget, route.delivery, 'canonical_final_delivery')
    const keeperTarget = point(5, 50 + clamp((centralV - 50) * 0.15, -4, 4), defendingSide)
    const destination = shotDestination(event.outcome, side, keeperTarget, centralV)
    const shot = add({ kind: 'shoot', actorId: shooter, receiverId: event.outcome === 'saved' ? defendingKeeper : null,
      phase: 'shot', formationPhase: 'attacking', pathKind: event.outcome === 'off_target' ? 'miss' : event.outcome === 'goal' ? 'goal' : 'shoot',
      transport: 'flight', end: destination, required: { [shooter]: positions[shooter], [defendingKeeper]: keeperTarget }, freezeOthers: true,
      after: event.outcome === 'saved' ? owned(defendingKeeper) : dead(destination), minMs: minimumFlight(positions[shooter], destination, 34), marker: 'canonical_shot' })
    if (event.goal) {
      goalCrossingMs = shot.startMs + goalCrossingProgress(shot.path, side) * (shot.endMs - shot.startMs)
      add({ kind: 'dead_ball', actorId: shooter, phase: 'goal', formationPhase: 'attacking', transport: 'dead', end: destination, after: dead(destination), freezeOthers: true, minMs: 400 })
    } else if (event.outcome === 'saved') {
      hold(defendingKeeper, 'save', 'save', 400)
      hold(defendingKeeper, 'keeper_collect', 'save', 400)
    } else add({ kind: 'dead_ball', actorId: shooter, phase: 'miss', formationPhase: 'attacking', transport: 'dead', end: destination, after: dead(destination), freezeOthers: true, minMs: 350 })
  } else {
    const defender = event.bindings.defender || nearestActor(defendingSide, positions[creator])
    if (event.outcome === 'foul_won') {
      add({ kind: 'dead_ball', actorId: creator, phase: 'stoppage', formationPhase: route.phase, transport: 'dead', end: ball.position, after: dead(ball.position), freezeOthers: true })
    } else if (event.outcome === 'possession_recycled') {
      const b = toRelative(positions[creator], side)
      const recycleTarget = point(Math.max(18, b.u - 13), clamp(b.v + (b.v > 50 ? -12 : 12), 15, 85), side)
      deliver(creator, support, recycleTarget)
    } else if (event.outcome === 'keeper_claim') {
      deliver(creator, defendingKeeper, positions[defendingKeeper], route.wide ? 'cross' : 'long_pass')
      hold(defendingKeeper, 'keeper_collect', 'keeper_claim', 600)
    } else if (['delivery_cleared', 'set_piece_cleared', 'cross_blocked'].includes(event.outcome)) {
      const contact = point(event.outcome === 'cross_blocked' ? Math.min(95, toRelative(positions[creator], side).u + 3) : 88, event.outcome === 'cross_blocked' ? flank : centralV, side)
      if (event.outcome === 'cross_blocked') {
        add({ kind: 'cross', actorId: creator, receiverId: null, phase: 'delivery_blocked', formationPhase: route.phase,
          pathKind: 'cross', transport: 'flight', end: contact, required: { [creator]: positions[creator], [defender]: contact }, freezeOthers: true,
          after: loose(makeBallPath('cross', positions[creator], contact), null), minMs: minimumFlight(positions[creator], contact) })
        const out = point(100, flank, side)
        add({ kind: 'dead_ball', actorId: defender, phase: 'delivery_blocked', formationPhase: 'attacking', transport: 'loose', end: out, after: dead(out), freezeOthers: true, minMs: 700 })
      } else {
        deliver(creator, defender, contact, route.wide ? 'cross' : 'long_pass')
        const collector = nearestActor(defendingSide, point(52, 28, side), [defender])
        const target = point(52, 28, side)
        add({ kind: 'clearance', actorId: defender, receiverId: collector, phase: 'clearance', formationPhase: 'defensive', pathKind: 'clearance', transport: 'loose', end: target,
          required: { [defender]: positions[defender], [collector]: target }, freezeOthers: true, minMs: minimumFlight(positions[defender], target, 25) })
        hold(collector, 'receive', 'turnover')
      }
    } else {
      // Includes buildup_stopped: a failed attack ends with defending control,
      // without inventing a shot, card, additional canonical event or stat.
      const b = toRelative(positions[creator], side)
      const target = point(Math.min(94, b.u + 4), clamp(b.v + 3, 5, 95), side)
      add({ kind: 'turnover', actorId: creator, receiverId: defender, phase: 'turnover', formationPhase: route.phase, transport: 'loose', end: target,
        required: { [creator]: positions[creator], [defender]: target }, freezeOthers: true, minMs: 700 })
      hold(defender, 'receive', 'turnover')
    }
  }
  return {
    scene: {
      id, origin: 'canonical', canonicalEventId: event.id, sourceIndex: event.sourceIndex,
      startMs, endMs: cursor, phase: actions[0].phase, attackingSide: side, route: event.route,
      requiredOutcome: event.outcome, participants: event.bindings, actions, goalCrossingMs,
      continuityIn: { mode: 'cut', players: initialPositions, ball: initialBall },
      continuityOut: { players: positions, ball },
    },
    playerSegments, ballTracks,
    reveal: { id: `reveal:${event.id}`, atMs: cursor, sceneId: id, canonicalEventId: event.id, event: event.canonicalEvent, goal: event.goalRecord, commentary: commentaryFor(event) },
  }
}

export function compileFootballProgram(view, visualEngineVersion) {
  const entries = formationContext(view)
  const visualSeed = visualSeedFor(view.seed.value, visualEngineVersion)
  const playerTracks = view.actors.map((actor) => ({ actorId: actor.id, segments: [] }))
  const trackById = Object.fromEntries(playerTracks.map((track) => [track.actorId, track]))
  const scenes = [], ballTracks = [], revealSchedule = []
  const clockTrack = [{ atMs: 0, period: 1, minute: 0, stoppage: 0, label: '0' }]
  let cursor = 0
  let finalPositions = formationPositions(entries)
  for (const event of view.events) {
    const result = compileCanonicalScene(view, event, entries, visualSeed, cursor)
    scenes.push(result.scene)
    ballTracks.push(...result.ballTracks)
    revealSchedule.push(result.reveal)
    for (const segment of result.playerSegments) trackById[segment.actorId].segments.push(segment)
    cursor = result.scene.endMs
    finalPositions = result.scene.continuityOut.players
    clockTrack.push({ atMs: cursor, ...event.clock })
  }
  const durationMs = cursor + 1000
  for (const segment of movementSegments(finalPositions, finalPositions, cursor, 1000, null)) trackById[segment.actorId].segments.push(segment)
  const lastClock = clockTrack[clockTrack.length - 1]
  clockTrack.push({ atMs: durationMs, period: 2, minute: 90, stoppage: lastClock.minute === 90 ? lastClock.stoppage : 0, label: 'FT' })
  return immutableCopy({
    kind: 'VisualProgram', schemaVersion: 1, visualEngineVersion, visualSeed,
    matchKey: view.matchKey, canonicalSignature: view.canonicalSignature, engineVersion: view.engineVersion,
    coordinateSystem: { longitudinal: [0, 100], lateral: [0, 100], goalPlanes: [2, 98], goalMouth: [44, 56] },
    durationMs, actors: view.actors, scenes, revealSchedule, clockTrack, playerTracks, ballTracks,
    initialBall: scenes[0]?.continuityIn.ball || { position: { x: 50, y: 50 }, ownership: dead({ x: 50, y: 50 }) },
    finalScore: view.finalScore, goals: view.goals, finalStats: view.finalStats, result: view.result, penalties: view.penalties,
  })
}
