import { describe, expect, it, vi } from 'vitest'
import { VISUAL_FORMATIONS, FORMATION_PHASES, formationContext, formationEntries, blendPhaseAnchor, toRelative, toWorld } from './formations.js'
import { POSITIONAL_ZONES } from './zones.js'
import { formationPositions, movementTargets, MOVEMENT_LIMITS, compareActorIds } from './movement.js'
import { samplePath, makeBallPath, goalCrossingProgress, distance, passKind } from './ballPaths.js'
import { sampleVisualProgram } from './sample.js'
import { fixtureView, footballProgram } from './testSupport/fixtures.js'

const pos = (state, id) => state.players.find((player) => player.actorId === id).position
const actionsOf = (program) => program.scenes.flatMap((scene) => scene.actions)

describe('five ordered formations and preferred zones', () => {
  it.each(Object.keys(VISUAL_FORMATIONS))('compiles distinct phase shapes for %s', (formation) => {
    const view = fixtureView([{}], { formation })
    const entries = formationContext(view).filter((entry) => entry.side === 'us')
    expect(entries).toHaveLength(11)
    for (const phase of FORMATION_PHASES) {
      expect(new Set(entries.map((entry) => JSON.stringify(entry.anchors[phase]))).size).toBe(11)
      for (const entry of entries) {
        expect(POSITIONAL_ZONES[entry.position]).toBeTruthy()
        expect(entry.anchors[phase].u).toBeGreaterThanOrEqual(0)
        expect(entry.anchors[phase].v).toBeLessThanOrEqual(100)
      }
    }
    for (const slot of ['CB', 'CM', 'ST']) {
      const duplicates = entries.filter((entry) => entry.slot === slot)
      expect(new Set(duplicates.map((entry) => entry.key)).size).toBe(duplicates.length)
      expect(new Set(duplicates.map((entry) => entry.anchors.buildup.v)).size).toBe(duplicates.length)
    }
    const outfield = entries.filter((entry) => entry.position !== 'GK')
    for (const entry of outfield) {
      expect(entry.anchors.attacking.u).toBeGreaterThan(entry.anchors.buildup.u)
      const mid = blendPhaseAnchor(entry, 'defensive', 'attacking', 0.5)
      expect(mid.u).toBe((entry.anchors.defensive.u + entry.anchors.attacking.u) / 2)
    }
    const program = footballProgram(view)
    for (const track of program.playerTracks) for (const segment of track.segments) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const { x, y } = samplePath(segment.path, t).position
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100)
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100)
      }
    }
  })

  it('expresses two banks in 4-4-2, two pivots/CAM in 4-2-3-1, and higher 3-5-2 wingbacks', () => {
    const four = VISUAL_FORMATIONS['4-4-2'].slots
    expect(four.filter((entry) => entry.anchors.defensive.u === 22)).toHaveLength(4)
    expect(four.filter((entry) => entry.anchors.defensive.u === 40)).toHaveLength(4)
    expect(four.filter((entry) => entry.anchors.defensive.u === 61)).toHaveLength(2)
    const pivots = VISUAL_FORMATIONS['4-2-3-1'].slots.filter((entry) => entry.position === 'DM')
    const am = VISUAL_FORMATIONS['4-2-3-1'].slots.find((entry) => entry.position === 'AM')
    expect(pivots).toHaveLength(2)
    expect(am.anchors.settled.u).toBeGreaterThan(Math.max(...pivots.map((entry) => entry.anchors.settled.u)))
    for (const phase of ['defensive', 'buildup', 'settled', 'attacking', 'transition']) {
      const wingbacks = VISUAL_FORMATIONS['3-5-2'].slots.filter((entry) => /WB/.test(entry.slot))
      const wideDefenders = VISUAL_FORMATIONS['5-3-2'].slots.filter((entry) => ['LB', 'RB'].includes(entry.slot))
      expect(Math.min(...wingbacks.map((entry) => entry.anchors[phase].u))).toBeGreaterThan(Math.max(...wideDefenders.map((entry) => entry.anchors[phase].u)))
    }
  })

  it('rejects a mislabeled formation instead of silently moving the wrong ordered slots', () => {
    const view = fixtureView()
    expect(() => formationEntries('3-5-2', view.actors.filter((actor) => actor.side === 'us'))).toThrow(/ordered/)
  })
})

describe('sparse off-ball and unit movement', () => {
  it('compiles without locale-sensitive actor selection', () => {
    const view = fixtureView([{ route: 'counterattack' }, { route: 'cross' }])
    const expected = JSON.stringify(footballProgram(view))
    const locale = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => { throw new Error('Device locale must not select actors') })
    try {
      expect(JSON.stringify(footballProgram(view))).toBe(expected)
      expect(['us:z', 'us:A', 'us:a'].sort(compareActorIds)).toEqual(['us:A', 'us:a', 'us:z'])
    } finally { locale.mockRestore() }
  })

  it('shifts defensive and midfield lines together with deterministic primary pressure and cover', () => {
    const entries = formationContext(fixtureView())
    const from = formationPositions(entries)
    const run = (y) => movementTargets({ entries, from, attackingSide: 'us', phase: 'settled', ballTarget: { x: 58, y } })
    const center = run(50), wide = run(80)
    expect(run(80)).toEqual(wide)
    const excluded = [center.assignments.presserId, center.assignments.coverId, wide.assignments.presserId, wide.assignments.coverId]
    const line = entries.filter((entry) => entry.side === 'opp' && entry.position === 'CB' && !excluded.includes(entry.actorId))
    expect(line.length).toBeGreaterThan(0)
    for (const entry of line) expect(wide.targets[entry.actorId].y).toBeGreaterThan(center.targets[entry.actorId].y)
    const midfield = entries.filter((entry) => entry.side === 'opp' && entry.position === 'CM' && !excluded.includes(entry.actorId))
    for (const entry of midfield) expect(wide.targets[entry.actorId].y).toBeGreaterThan(center.targets[entry.actorId].y)
    const candidates = entries.filter((entry) => entry.side === 'opp' && entry.position !== 'GK')
      .sort((a, b) => distance(from[a.actorId], { x: 58, y: 80 }) - distance(from[b.actorId], { x: 58, y: 80 }) || compareActorIds(a.actorId, b.actorId))
    expect(wide.assignments.presserId).toBe(candidates[0].actorId)
    const presser = toRelative(wide.targets[wide.assignments.presserId], 'opp')
    const cover = toRelative(wide.targets[wide.assignments.coverId], 'opp')
    expect(cover.u).toBeLessThan(presser.u)
  })

  it('keeps ordinary support in preferred lanes and gives carriers nearby options', () => {
    const entries = formationContext(fixtureView())
    const from = formationPositions(entries)
    const carrier = entries.find((entry) => entry.side === 'us' && entry.position === 'CM')
    const target = movementTargets({ entries, from, attackingSide: 'us', phase: 'settled', carrierId: carrier.actorId, ballTarget: { x: 57, y: 50 }, required: { [carrier.actorId]: { x: 57, y: 50 } } })
    expect(target.assignments.supportIds).toHaveLength(3)
    expect(target.assignments.supportIds.some((id) => distance(target.targets[id], target.targets[carrier.actorId]) < 20)).toBe(true)
    for (const id of target.assignments.supportIds) {
      const entry = entries.find((candidate) => candidate.actorId === id), zone = POSITIONAL_ZONES[entry.position]
      const p = toRelative(target.targets[id], entry.side)
      expect(p.v).toBeGreaterThanOrEqual(zone.lateral[0]); expect(p.v).toBeLessThanOrEqual(zone.lateral[1])
    }
  })

  it('bounds speed and acceleration, including a canonical CB finisher running early', () => {
    const view = fixtureView([{ creator: 'GK', shooter: 'CB', route: 'direct_attack' }])
    const program = footballProgram(view), scene = program.scenes[0]
    const finalDelivery = scene.actions.find((action) => action.marker === 'canonical_final_delivery')
    const earlier = sampleVisualProgram(program, finalDelivery.startMs)
    const scorer = view.events[0].bindings.shooter
    expect(toRelative(pos(earlier, scorer), 'us').u).toBeGreaterThan(70)
    expect(scene.actions.some((action) => action.endMs - action.startMs > 3000)).toBe(true)
    for (const track of program.playerTracks) {
      for (const segment of track.segments) {
        const d = distance(segment.path.from, segment.path.to), seconds = (segment.endMs - segment.startMs) / 1000
        expect(1.875 * d / seconds).toBeLessThanOrEqual(MOVEMENT_LIMITS.maxSpeed + 1e-8)
        expect(6 * d / seconds ** 2).toBeLessThanOrEqual(MOVEMENT_LIMITS.maxAcceleration + 1e-8)
      }
      for (let i = 1; i < track.segments.length; i++) {
        const a = track.segments[i - 1], b = track.segments[i]
        if (a.sceneId === b.sceneId) expect(a.path.to).toEqual(b.path.from)
      }
    }
    expect(JSON.stringify(footballProgram(view))).toBe(JSON.stringify(program))
  })

  it.each(['central_buildup', 'cross', 'counterattack', 'set_piece'])('keeps unusual GK creators inside their envelope for %s', (route) => {
    const view = fixtureView([{ creator: 'GK', shooter: 'CB', route }]), program = footballProgram(view)
    for (const actor of program.actors.filter((actor) => actor.goalkeeper)) {
      const track = program.playerTracks.find((track) => track.actorId === actor.id)
      for (const segment of track.segments) for (const progress of [0, 0.5, 1]) {
        const p = toRelative(samplePath(segment.path, progress).position, actor.side)
        expect(p.u).toBeGreaterThanOrEqual(2); expect(p.u).toBeLessThanOrEqual(18)
        expect(p.v).toBeGreaterThanOrEqual(25); expect(p.v).toBeLessThanOrEqual(75)
      }
    }
  })
})

describe('semantic ball paths and exact ownership', () => {
  it.each(['short_pass', 'medium_pass', 'long_pass', 'through_ball', 'switch', 'cross', 'cutback', 'carry', 'shoot', 'save', 'miss', 'goal', 'clearance'])('supports deterministic %s path endpoints and cosmetic height', (kind) => {
    const from = { x: 30, y: 20 }, to = { x: 85, y: 50 }
    const path = makeBallPath(kind, from, to, { bend: 4 })
    expect(samplePath(path, 0).position).toEqual(from)
    expect(samplePath(path, 1).position).toEqual(to)
    expect(samplePath(path, 0.5)).toEqual(samplePath(path, 0.5))
    expect(samplePath(path, 0.5).shadowPosition).toEqual(samplePath(path, 0.5).position)
    if (['cross', 'switch', 'long_pass', 'clearance'].includes(kind)) expect(samplePath(path, 0.5).height).toBeGreaterThan(0)
    expect(samplePath(path, 1).height).toBe(0)
  })

  it('selects short, medium and long pass lengths', () => {
    expect(passKind({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe('short_pass')
    expect(passKind({ x: 0, y: 0 }, { x: 25, y: 0 })).toBe('medium_pass')
    expect(passKind({ x: 0, y: 0 }, { x: 50, y: 0 })).toBe('long_pass')
  })

  it.each(['central_buildup', 'through_ball', 'cross', 'switch_of_play', 'counterattack', 'cutback'])('keeps the ball attached to owners and transfers on reception for %s', (route) => {
    const view = fixtureView([{ route, creator: route === 'cross' ? 'RW' : 'CM' }]), program = footballProgram(view)
    for (const action of actionsOf(program)) {
      for (const ratio of [0, 0.25, 0.5, 0.999]) {
        const sample = sampleVisualProgram(program, action.startMs + (action.endMs - action.startMs) * ratio)
        if (sample.ball.mode === 'owned') expect(sample.ball.position).toEqual(pos(sample, sample.ball.ownerId))
        if (action.kind === 'carry') expect(sample.ball.ownerId).toBe(action.actorId)
        expect(sample.actionProgress).toBeCloseTo(ratio, 7)
        expect(sample.scenePhase).toBe(action.phase)
      }
      if (action.ownershipDuring.kind === 'inFlight' && action.receiverId) {
        const completion = sampleVisualProgram(program, action.endMs)
        expect(completion.ball.ownerId).toBe(action.receiverId)
        expect(completion.ball.position).toEqual(action.path.to)
      }
    }
    if (route === 'through_ball') {
      const action = actionsOf(program).find((action) => action.kind === 'through_ball')
      expect(action.path.to.x).toBeGreaterThan(pos(sampleVisualProgram(program, action.startMs), action.receiverId).x)
      expect(action.path.to).toEqual(pos(sampleVisualProgram(program, action.endMs), action.receiverId))
    }
    for (const action of actionsOf(program).filter((action) => action.kind === 'cross')) {
      const a = toRelative(action.path.from, 'us'), b = toRelative(action.path.to, 'us')
      expect(a.v <= 25 || a.v >= 75).toBe(true)
      expect(b.u).toBeGreaterThan(75)
      expect(b.v).toBeGreaterThan(35); expect(b.v).toBeLessThan(65)
    }
  })

  it.each(['us', 'opp'])('gives goals, saves and misses distinct trajectories for %s', (side) => {
    for (const outcome of ['goal', 'saved', 'off_target']) {
      const view = fixtureView([{ side, outcome, route: 'long_range' }]), program = footballProgram(view)
      const scene = program.scenes[0], shot = scene.actions.find((action) => action.kind === 'shoot')
      expect(distance(shot.path.from, shot.path.to)).toBeGreaterThan(15)
      const end = toRelative(shot.path.to, side)
      if (outcome === 'goal') {
        expect(end.u).toBeGreaterThan(98)
        expect(end.v).toBeGreaterThanOrEqual(44); expect(end.v).toBeLessThanOrEqual(56)
        expect(scene.goalCrossingMs).toBeLessThan(scene.endMs)
        expect(sampleVisualProgram(program, scene.goalCrossingMs - 0.001).score).toEqual({ us: 0, opp: 0 })
        expect(sampleVisualProgram(program, scene.endMs).score[side]).toBe(1)
      } else if (outcome === 'saved') {
        expect(end.u).toBeLessThan(98)
        expect(goalCrossingProgress(shot.path, side)).toBeNull()
        expect(sampleVisualProgram(program, shot.endMs).ball.ownerId).toBe(view.events[0].bindings.defendingKeeper)
        expect(scene.actions.filter((action) => action.kind === 'save')).toHaveLength(1)
      } else {
        expect(end.u).toBe(100)
        expect(end.v < 44 || end.v > 56).toBe(true)
        expect(sampleVisualProgram(program, scene.endMs).ball.mode).toBe('dead')
      }
    }
  })
})

describe('canonical route and outcome reconstruction', () => {
  it.each(['central_buildup', 'wide_overlap', 'switch_of_play', 'through_ball', 'one_two', 'counterattack', 'cross', 'cutback', 'pressing_recovery', 'direct_attack', 'set_piece', 'long_range'])('retains canonical final actor and assist for %s', (route) => {
    const view = fixtureView([{ route, creator: 'CM', shooter: 'CB' }]), program = footballProgram(view)
    const scene = program.scenes[0], event = view.events[0]
    expect(scene.route).toBe(route)
    expect(scene.participants).toEqual(event.bindings)
    const shotIndex = scene.actions.findIndex((action) => action.kind === 'shoot')
    const shot = scene.actions[shotIndex]
    expect(shot.actorId).toBe(event.bindings.shooter)
    const final = scene.actions.find((action) => action.marker === 'canonical_final_delivery')
    expect(final.actorId).toBe(event.bindings.assister)
    expect(final.receiverId).toBe(event.bindings.shooter)
    expect(scene.actions.filter((action) => action.startMs >= final.endMs && action.endMs <= shot.startMs).every((action) => action.actorId === event.bindings.shooter)).toBe(true)
    expect(sampleVisualProgram(program, program.durationMs).goals).toEqual(view.goals)
    if (route === 'counterattack' || route === 'pressing_recovery') expect(scene.actions.some((action) => action.kind === 'turnover' && action.receiverId === event.bindings.creator)).toBe(true)
    if (route === 'set_piece') {
      expect(scene.actions[0].kind).toBe('dead_ball')
      expect(JSON.stringify(scene)).not.toMatch(/penalty|corner|free_kick/)
    }
    if (route === 'one_two') expect(scene.actions.filter((action) => ['pass', 'long_pass'].includes(action.kind)).length).toBeGreaterThanOrEqual(4)
  })

  it('uses self-created shooting without a false final assist', () => {
    const view = fixtureView([{ creator: 'CM', shooter: 'CM', route: 'long_range' }]), program = footballProgram(view)
    expect(program.scenes[0].actions.some((action) => action.marker === 'canonical_final_delivery')).toBe(false)
    expect(program.scenes[0].actions.every((action) => action.actorId === view.events[0].bindings.shooter)).toBe(true)
    expect(sampleVisualProgram(program, program.durationMs).goals[0].assist).toBeNull()
  })

  it.each([
    ['cross_blocked', 'cross', 'dead', null], ['delivery_cleared', 'cross', 'owned', 'opp'],
    ['keeper_claim', 'set_piece', 'owned', 'opp'], ['set_piece_cleared', 'set_piece', 'owned', 'opp'],
    ['possession_recycled', 'central_buildup', 'owned', 'us'], ['pass_intercepted', 'through_ball', 'owned', 'opp'],
    ['buildup_stopped', 'central_buildup', 'owned', 'opp'], ['turnover_created', 'counterattack', 'owned', 'opp'],
    ['counter_halted', 'counterattack', 'owned', 'opp'], ['heavy_touch_turnover', 'pressing_recovery', 'owned', 'opp'],
    ['foul_won', 'central_buildup', 'dead', null],
  ])('ends %s coherently without adding a shot', (outcome, route, mode, ownerSide) => {
    const view = fixtureView([{ outcome, route }]), program = footballProgram(view)
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(program.scenes[0].requiredOutcome).toBe(outcome)
    expect(actionsOf(program).some((action) => action.kind === 'shoot' || action.kind === 'save')).toBe(false)
    expect(ft.ball.mode).toBe(mode)
    if (ownerSide) expect(program.actors.find((actor) => actor.id === ft.ball.ownerId).side).toBe(ownerSide)
    expect(ft.shotTotals.us.shots + ft.shotTotals.opp.shots).toBe(0)
    expect(ft.shotTotals.us.saves + ft.shotTotals.opp.saves).toBe(0)
    expect(ft.goals).toEqual([])
  })

  it('declares inter-scene cuts, preserves canonical clock order, and remains pure under seeking', () => {
    const view = fixtureView([
      { id: 'z', minute: 45, route: 'cross' }, { id: 'a', minute: 45 },
      { minute: 45, stoppage: 4, outcome: 'saved' }, { minute: 46, side: 'opp' }, { minute: 90, stoppage: 6 },
    ])
    const program = footballProgram(view)
    expect(program.scenes.map((scene) => scene.canonicalEventId)).toEqual(view.events.map((event) => event.id))
    expect(program.scenes.every((scene) => scene.continuityIn.mode === 'cut')).toBe(true)
    for (const item of program.revealSchedule) {
      expect(sampleVisualProgram(program, item.atMs - 0.001).score).toEqual(item.event.scoreBefore)
      expect(sampleVisualProgram(program, item.atMs).score).toEqual(item.event.scoreAfter)
    }
    expect(program.revealSchedule.map((item) => sampleVisualProgram(program, item.atMs).clock.label)).toEqual(['45', '45', '45+4', '46', '90+6'])
    const chronological = new Map([10000, 20000, 40000, 50000].map((time) => [time, sampleVisualProgram(program, time)]))
    for (const time of [40000, 10000, 50000, 20000]) expect(sampleVisualProgram(JSON.parse(JSON.stringify(program)), time)).toEqual(chronological.get(time))
  })

  it('finishes an empty match with only the canonical shootout summary', () => {
    const penalties = { won: false, score: '3-5', hero: null }
    const program = footballProgram(fixtureView([], { penalties }))
    expect(program.scenes).toEqual([])
    expect(sampleVisualProgram(program, 0).penalties).toBeNull()
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(ft.fullTime).toBe(true)
    expect(ft.penalties).toEqual(penalties)
    expect(ft.result).toBe('pens-loss')
    expect(ft.goals).toEqual([])
    expect(ft.players).toHaveLength(22)
  })
})
