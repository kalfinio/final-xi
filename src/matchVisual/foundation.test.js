import { describe, expect, it, vi } from 'vitest'
import { OPPONENTS } from '../data'
import m1Fixtures from '../matchEngineM1.fixture.json'
import { squadFromPhase3Fixture } from '../matchCalibration'
import { controlledM1Match } from '../matchEngineM1Calibration'
import { deriveM1EventMetrics } from '../matchEngineM1'
import { buildMatchDetail } from '../matchEngine'
import { canonicalMatchSignature } from '../runPersistence'
import { createCanonicalMatchView } from './adapter.js'
import { compileVisualProgram } from './compile.js'
import { sampleVisualProgram } from './sample.js'
import { immutableCopy } from './immutable.js'
import { VISUAL_V2_1, VISUAL_ENGINE_VERSIONS, selectVisualEngineVersion, isVisualEngineVersion } from './versions.js'
import { visualSeedFor, sceneSeedFor, actionSeedFor, visualActionRng, VISUAL_RNG_PURPOSES } from './rng.js'

const squad = squadFromPhase3Fixture(m1Fixtures.squadFixtureRunIndex)
const gk = squad.find(({ player }) => player.posType === 'GK').player
const cb = squad.find(({ slot }) => slot === 'CB').player
const st = squad.find(({ slot }) => slot === 'ST').player
const midfielder = squad.find(({ slot }) => slot === 'CM').player
const realMatch = (seed = 2) => controlledM1Match({ seed, squad, approach: 'wide', opponent: OPPONENTS.find(({ id }) => id === 'paris-tower') })
const adapt = (match, extra = {}) => createCanonicalMatchView({ match, squad, formation: '4-3-3', canonicalSignature: canonicalMatchSignature(match, 0), ...extra })

// Synthetic canonical boundary cases, generated ONLY in tests. Metrics/detail
// use the existing canonical reducers; no frozen historical fixture is edited.
function edgeMatch(specs = [], { penalties = null } = {}) {
  const match = structuredClone(realMatch())
  let score = { us: 0, opp: 0 }
  match.causalEvents = specs.map((spec, index) => {
    const side = spec.side || 'us'
    const outcome = spec.outcome || 'goal'
    const shot = ['goal', 'saved', 'off_target'].includes(outcome)
    const creator = spec.creator || midfielder
    const shooter = spec.shooter || st
    const scoreBefore = { ...score }
    if (outcome === 'goal') score[side]++
    const minute = spec.minute ?? 20 + index
    const stoppage = spec.stoppage ?? null
    return {
      id: spec.id || `edge-${index}`, minute, minuteLabel: stoppage ? `${minute}+${stoppage}` : String(minute), stoppage,
      side, window: spec.window ?? (minute <= 45 ? 2 : 4), phase: 'middle', route: spec.route || 'central_buildup',
      progression: shot ? 'success' : 'failed', chanceQuality: shot ? 'high' : null, xg: shot ? 0.2 : 0,
      creatorId: side === 'us' ? creator.id : null,
      creatorName: side === 'us' ? creator.name : spec.creatorName || 'Opponent Playmaker',
      shooterId: shot && side === 'us' ? shooter.id : null,
      shooterName: !shot ? null : side === 'us' ? shooter.name : spec.shooterName || 'Opponent Forward',
      defenderId: side === 'opp' ? cb.id : null, keeperId: gk.id,
      outcome, goal: outcome === 'goal', onTarget: outcome === 'goal' || outcome === 'saved',
      cornerWon: outcome === 'cross_blocked', foulWon: outcome === 'foul_won',
      createsTransition: false, dangerousTransition: false, highTurnover: false, controlWeight: 1,
      scoreBefore, scoreAfter: { ...score }, causes: { plan: [], roles: [], signatures: [], opponent: [] },
    }
  })
  match.events = match.causalEvents.filter((event) => event.goal).map((event) => ({
    minute: event.minute, side: event.side, scorer: event.shooterName,
    assist: event.creatorName !== event.shooterName ? event.creatorName : null,
    label: null, causalEventId: event.id, route: event.route, chanceQuality: event.chanceQuality,
  }))
  match.goals = match.events
  match.eventMetrics = deriveM1EventMetrics(match.causalEvents)
  match.gf = score.us; match.ga = score.opp
  match.pens = penalties
  match.result = penalties ? (penalties.won ? 'pens-win' : 'pens-loss') : score.us > score.opp ? 'win' : score.us < score.opp ? 'loss' : 'draw'
  match.score = `${score.us}-${score.opp}`
  match.detail = buildMatchDetail({ match, matchNumber: 1 })
  return match
}

describe('visual compiler version and RNG contracts', () => {
  it('selects only an implemented visual version without an active-viewer setting', () => {
    expect(selectVisualEngineVersion()).toBe(VISUAL_V2_1)
    expect(selectVisualEngineVersion('visual_v2_1')).toBe(VISUAL_V2_1)
    expect(Object.isFrozen(VISUAL_ENGINE_VERSIONS[VISUAL_V2_1].matchEngineVersions)).toBe(true)
    for (const version of ['m1', 'legacy_v1', 'future', null, '__proto__']) {
      expect(isVisualEngineVersion(version)).toBe(false)
      expect(() => selectVisualEngineVersion(version)).toThrow()
    }
    expect(() => compileVisualProgram(adapt(realMatch()), { visualEngineVersion: 'future' })).toThrow()
  })

  it('isolates scenes, action indexes and purpose streams', () => {
    const seed = visualSeedFor(1234, VISUAL_V2_1)
    const sceneA = sceneSeedFor(seed, 'scene:a', 'event:a')
    const sceneB = sceneSeedFor(seed, 'scene:b', 'event:b')
    const readB = () => Array.from({ length: 5 }, (() => {
      const rng = visualActionRng(sceneB, 0, 'template')
      return () => rng()
    })())
    const before = readB()
    const unrelated = visualActionRng(sceneA, 0, 'template')
    for (let i = 0; i < 10000; i++) unrelated()
    expect(readB()).toEqual(before)
    expect(new Set(VISUAL_RNG_PURPOSES.map((purpose) => actionSeedFor(sceneA, 0, purpose))).size).toBe(VISUAL_RNG_PURPOSES.length)
    expect(actionSeedFor(sceneA, 0, 'template')).not.toBe(actionSeedFor(sceneA, 1, 'template'))
    expect(sceneSeedFor(seed, 'a|b', 'c')).not.toBe(sceneSeedFor(seed, 'a', 'b|c'))
    expect(() => visualActionRng(sceneA, -1, 'template')).toThrow()
    expect(() => visualActionRng(sceneA, 0, 'gameplay')).toThrow()
    for (const badSeed of [undefined, -1, 1.2, 0x100000000]) expect(() => visualSeedFor(badSeed, VISUAL_V2_1)).toThrow()
  })
})

describe('canonical adapter and stable actors', () => {
  it.each([true, false, undefined])('normalizes player-team stats independently of venue %s', (home) => {
    const match = { ...realMatch(), home }
    const view = adapt(match)
    expect(view.finalStats.us).toEqual(match.detail.finalStats.home)
    expect(view.finalStats.opp).toEqual(match.detail.finalStats.away)
    expect(view.venue).toEqual({
      playerTeam: home === true ? 'home' : home === false ? 'away' : 'unknown',
      homeSide: home === true ? 'us' : home === false ? 'opp' : null,
      awaySide: home === true ? 'opp' : home === false ? 'us' : null,
    })
  })

  it('copies the exact supplied XI and keeps anonymous actor identity independent of names and display options', () => {
    const match = realMatch()
    const view = adapt(match, { catalogVersion: 'frozen-test-catalogue', dbVersion: 'v2' })
    expect(view.squad).toEqual(squad)
    expect(view.squad).not.toBe(squad)
    expect(view.squad[0].player).not.toBe(squad[0].player)
    expect(view.catalogVersion).toBe('frozen-test-catalogue')
    expect(view.actors).toHaveLength(22)
    expect(new Set(view.actors.map(({ id }) => id)).size).toBe(22)
    expect(view.actors.filter(({ side }) => side === 'opp').every((actor) => actor.anonymous && actor.name === null && actor.playerId === null)).toBe(true)
    const other = adapt(structuredClone(match), { viewport: { width: 375, height: 812 }, speed: 4 })
    expect(other.actors).toEqual(view.actors)
    expect(other.matchKey).toBe(view.matchKey)
  })

  it('binds a defender scorer, goalkeeper creator, unassisted goal and the correct defending keepers', () => {
    const match = edgeMatch([
      { creator: gk, shooter: cb, route: 'direct_attack' },
      { creator: midfielder, shooter: midfielder, route: 'long_range' },
      { side: 'opp', outcome: 'saved', creatorName: 'Opponent Midfielder', shooterName: 'Opponent Centre-Back', route: 'set_piece' },
      { side: 'opp', creatorName: 'Opponent Midfielder', shooterName: 'Opponent Midfielder', route: 'long_range' },
    ])
    const view = adapt(match)
    expect(view.events[0].bindings).toMatchObject({ creator: `us:${gk.id}`, shooter: `us:${cb.id}`, assister: `us:${gk.id}`, defendingKeeper: 'opp:gk' })
    expect(view.events[1].bindings.assister).toBeNull()
    expect(view.events[2].bindings).toMatchObject({ shooter: 'opp:cb-right', defendingKeeper: `us:${gk.id}`, defender: `us:${cb.id}` })
    expect(view.events[3].bindings.creator).toBe(view.events[3].bindings.shooter)
    expect(view.events[3].bindings.assister).toBeNull()
    expect(sampleVisualProgram(compileVisualProgram(view), 1e6).goals).toEqual(match.events)
  })

  it('rejects unsupported engines, unknown participants, outcome contradictions and false canonical totals', () => {
    expect(() => adapt({ ...realMatch(), engineVersion: 'legacy_v1' })).toThrow(/only resolved M1/)
    expect(() => adapt({ ...realMatch(), detail: null })).toThrow(/MatchDetail/)
    for (const mutate of [
      (m) => { m.causalEvents[0].creatorId = 'not-in-xi' },
      (m) => { m.causalEvents[0].outcome = 'blocked_shot' },
      (m) => { m.causalEvents[0].onTarget = false },
      (m) => { m.gf++ },
      (m) => { m.detail.finalStats.home.shots++ },
      (m) => { m.events[0].assist = 'Imaginary player' },
      (m) => { m.detail.scorers = ['Imaginary scorer'] },
      (m) => { m.detail.assists = ['Imaginary assister'] },
      (m) => { m.causalEvents[0].route = 'unknown' },
      (m) => { m.causalEvents[0].scoreBefore.us++ },
    ]) {
      const match = edgeMatch([{}]); mutate(match)
      expect(() => adapt(match)).toThrow(/Invalid canonical visual input/)
    }
    const unknownOpponent = edgeMatch([{ side: 'opp', creatorName: 'Invented Name' }])
    expect(() => adapt(unknownOpponent)).toThrow(/anonymous opponent label/)
    const wrongKeeper = edgeMatch([{ side: 'opp', outcome: 'saved' }])
    wrongKeeper.causalEvents[0].keeperId = cb.id
    expect(() => adapt(wrongKeeper)).toThrow(/goalkeeper/)
  })

  it('supports canonical seed fallback and an absent signature without computing a replacement signature', () => {
    const match = realMatch()
    const view = adapt(match, { canonicalSignature: null })
    expect(view.canonicalSignature).toBeNull()
    expect(view.seed).toEqual({ value: match.simulationSeed, source: 'simulationSeed' })
    delete match.simulationSeed
    expect(adapt(match).seed).toEqual({ value: match.presentationSeed, source: 'presentationSeed' })
    delete match.presentationSeed
    expect(adapt(match).seed.source).toBe('detail.presentationSeed')
    delete match.detail.presentationSeed
    expect(() => adapt(match)).toThrow(/seed/)
  })
})

describe('immutable deterministic VisualProgram', () => {
  it('recompiles byte-identically, without unseeded randomness or freezing source objects', () => {
    const match = realMatch()
    const sourceBefore = JSON.stringify(match)
    const view = adapt(match)
    expect(Object.isFrozen(match)).toBe(false)
    expect(Object.isFrozen(match.detail)).toBe(false)
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Unseeded RNG') })
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Wall clock') })
    try {
      const a = compileVisualProgram(view)
      const b = compileVisualProgram(adapt(immutableCopy(match)))
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      expect(Object.isFrozen(a.scenes[0].actions[0].path.from)).toBe(true)
      expect(() => { a.scenes[0].requiredOutcome = 'goal' }).toThrow()
      expect(() => { view.events[0].canonicalEvent.scoreAfter.us++ }).toThrow()
      expect(JSON.stringify(match)).toBe(sourceBefore)
      sampleVisualProgram(a, 500)
      expect(random).not.toHaveBeenCalled()
      expect(now).not.toHaveBeenCalled()
    } finally { random.mockRestore(); now.mockRestore() }
  })

  it('preserves every event, exact routes/outcomes and sparse continuous track timing', () => {
    const match = realMatch()
    const program = compileVisualProgram(adapt(match))
    expect(program.scenes.map((scene) => scene.canonicalEventId)).toEqual(match.causalEvents.map((event) => event.id))
    expect(program.revealSchedule.map((item) => item.event)).toEqual(match.causalEvents)
    for (let index = 0; index < program.scenes.length; index++) {
      const scene = program.scenes[index], event = match.causalEvents[index]
      expect(scene).toMatchObject({ origin: 'canonical', attackingSide: event.side, route: event.route, requiredOutcome: event.outcome, sourceIndex: index })
      expect(scene.startMs).toBe(index ? program.scenes[index - 1].endMs : 0)
      if (index) expect(scene.continuityIn).toEqual(program.scenes[index - 1].continuityOut)
      expect(program.revealSchedule[index].atMs).toBe(scene.endMs)
      expect(scene.actions[0].startMs).toBe(scene.startMs)
      expect(scene.actions.at(-1).endMs).toBe(scene.endMs)
      for (const [actionIndex, action] of scene.actions.entries()) {
        expect(action.endMs).toBeGreaterThan(action.startMs)
        if (actionIndex) expect(action.path.from).toEqual(scene.actions[actionIndex - 1].path.to)
      }
    }
    expect(program.playerTracks.every((track) => track.segments.length === 1)).toBe(true)
    expect(program.ballTracks.length).toBeLessThanOrEqual(match.causalEvents.length * 3)
  })
})

describe('pure time sampling and terminal event reveals', () => {
  it('samples repeated and nonchronological timestamps identically, including a serialized program', () => {
    const program = compileVisualProgram(adapt(realMatch()))
    const times = [50000, 10000, 40000, 20000, 25000, -10, program.durationMs, program.durationMs + 1000]
    const expected = new Map([...times].sort((a, b) => a - b).map((time) => [time, sampleVisualProgram(program, time)]))
    const restored = JSON.parse(JSON.stringify(program))
    expect(() => sampleVisualProgram({ ...restored, visualEngineVersion: 'future' }, 0)).toThrow(/visual engine version/)
    for (const time of times) expect(sampleVisualProgram(restored, time)).toEqual(expected.get(time))
    for (let i = 0; i < 100; i++) expect(sampleVisualProgram(program, 25000)).toEqual(expected.get(25000))
    expect(sampleVisualProgram(program, -10).timeMs).toBe(0)
    for (const time of [NaN, Infinity, -Infinity, '25000']) expect(() => sampleVisualProgram(program, time)).toThrow(/finite/)
  })

  it('reveals each goal once only at its terminal timestamp, with exact scorer/assist and score progression', () => {
    const match = edgeMatch([{ shooter: cb }, { side: 'opp' }, { creator: midfielder, shooter: midfielder, route: 'long_range' }])
    const program = compileVisualProgram(adapt(match))
    let expectedScore = { us: 0, opp: 0 }
    for (const item of program.revealSchedule) {
      const before = sampleVisualProgram(program, item.atMs - 0.001)
      expect(before.score).toEqual(expectedScore)
      expect(before.goals.some((goal) => goal.causalEventId === item.canonicalEventId)).toBe(false)
      expectedScore = { ...item.event.scoreAfter }
      const at = sampleVisualProgram(program, item.atMs)
      expect(at.score).toEqual(expectedScore)
      expect(at.goals.at(-1)).toEqual(item.goal)
      expect(at.currentReveal.canonicalEventId).toBe(item.canonicalEventId)
      expect(sampleVisualProgram(program, item.atMs).score).toEqual(expectedScore)
    }
    expect(sampleVisualProgram(program, program.durationMs).goals).toEqual(match.events)
  })

  it('keeps saved/off-target endings and failed deliveries distinct, with exact FT shot totals', () => {
    const match = edgeMatch([
      { outcome: 'saved' }, { side: 'opp', outcome: 'saved' }, { outcome: 'off_target' },
      { outcome: 'cross_blocked', route: 'cross' }, { outcome: 'keeper_claim', route: 'set_piece' },
      { outcome: 'possession_recycled' },
    ])
    const program = compileVisualProgram(adapt(match))
    expect(program.scenes.map(({ requiredOutcome }) => requiredOutcome)).toEqual(match.causalEvents.map(({ outcome }) => outcome))
    const saved = program.scenes[0].actions.at(-1)
    expect(saved.ownershipAfter).toEqual({ kind: 'owned', actorId: 'opp:gk' })
    const incoming = sampleVisualProgram(program, (saved.startMs + saved.endMs) / 2)
    expect(incoming.ball.mode).toBe('inFlight')
    expect(incoming.ball.ownerId).toBeNull()
    expect(incoming.ball.position).not.toEqual(saved.path.from)
    expect(incoming.ball.position).not.toEqual(saved.path.to)
    expect(program.scenes[1].actions.at(-1).ownershipAfter.actorId).toBe(`us:${gk.id}`)
    expect(program.scenes[3].actions.some(({ kind }) => kind === 'shot')).toBe(false)
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(ft.score).toEqual({ us: 0, opp: 0 })
    for (const [side, canonicalSide] of [['us', 'home'], ['opp', 'away']]) {
      expect(match.detail.finalStats[canonicalSide]).toMatchObject(ft.shotTotals[side])
      expect(ft.finalStats[side]).toEqual(match.detail.finalStats[canonicalSide])
    }
    expect(ft.revealedCanonicalEvents).toEqual(match.causalEvents)
    expect(ft.result).toBe(match.result)
  })

  it('preserves same-minute source order and period-aware stoppage labels without sorting by IDs', () => {
    const match = edgeMatch([
      { id: 'z-first', minute: 45, window: 3 },
      { id: 'a-second', minute: 45, window: 3 },
      { id: 'stoppage', minute: 45, stoppage: 4, window: 3 },
      { id: 'next-half', minute: 46, window: 4 },
      { id: 'last', minute: 90, stoppage: 6, window: 6 },
    ])
    const program = compileVisualProgram(adapt(match))
    expect(program.scenes.map(({ canonicalEventId }) => canonicalEventId)).toEqual(['z-first', 'a-second', 'stoppage', 'next-half', 'last'])
    expect(program.revealSchedule.map((item) => sampleVisualProgram(program, item.atMs).clock.label)).toEqual(['45', '45', '45+4', '46', '90+6'])
    expect(sampleVisualProgram(program, program.durationMs).clock).toMatchObject({ label: 'FT', period: 2, minute: 90, stoppage: 6 })
    const wrong = structuredClone(match)
    const earlier = wrong.causalEvents[2]
    wrong.causalEvents[2] = wrong.causalEvents[3]
    wrong.causalEvents[3] = earlier
    expect(() => adapt(wrong)).toThrow()
  })

  it.each([
    ['cross_blocked', 'cross'], ['delivery_cleared', 'cross'], ['possession_recycled', 'central_buildup'],
    ['counter_halted', 'counterattack'], ['foul_won', 'counterattack'], ['turnover_created', 'counterattack'],
    ['heavy_touch_turnover', 'pressing_recovery'], ['set_piece_cleared', 'set_piece'],
    ['keeper_claim', 'set_piece'], ['pass_intercepted', 'through_ball'], ['buildup_stopped', 'central_buildup'],
  ])('preserves failure %s without inventing any shot or save', (outcome, route) => {
    const match = edgeMatch([{ outcome, route }])
    const program = compileVisualProgram(adapt(match))
    expect(program.scenes[0].requiredOutcome).toBe(outcome)
    expect(program.scenes[0].route).toBe(route)
    expect(program.scenes[0].actions.some(({ kind }) => kind === 'shot')).toBe(false)
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(ft.revealedCanonicalEvents).toEqual(match.causalEvents)
    for (const side of ['us', 'opp']) expect(ft.shotTotals[side]).toEqual({ shots: 0, shotsOnTarget: 0, saves: 0, bigChances: 0 })
    expect(ft.goals).toEqual([])
    if (outcome === 'keeper_claim') expect(ft.ball.ownerId).toBe('opp:gk')
    if (outcome === 'possession_recycled') expect(ft.ball.ownerId).toBe(`us:${midfielder.id}`)
  })

  it('samples immutable world states across exact action boundaries and clamps only presentation time', () => {
    const match = edgeMatch([{ outcome: 'saved' }])
    const program = compileVisualProgram(adapt(match))
    const before = JSON.stringify(program)
    const actions = program.scenes[0].actions
    for (const action of actions) {
      const start = sampleVisualProgram(program, action.startMs)
      expect(start.activeAction.id).toBe(action.id)
      expect(start.ball.position).toEqual(action.path.from)
      expect(start.revealedCanonicalEvents).toEqual([])
    }
    const terminal = sampleVisualProgram(program, actions.at(-1).endMs)
    expect(terminal.activeAction).toBeNull()
    expect(terminal.ball.ownerId).toBe('opp:gk')
    const keeper = terminal.players.find(({ actorId }) => actorId === terminal.ball.ownerId)
    expect(terminal.ball.position).toEqual(keeper.position)
    expect(Object.isFrozen(terminal.ball.position)).toBe(true)
    expect(() => { terminal.revealedCanonicalEvents[0].outcome = 'goal' }).toThrow()
    expect(JSON.stringify(program)).toBe(before)
  })

  it.each([{ specs: [] }, { specs: [{ outcome: 'possession_recycled' }] }])('safely finishes an empty or no-shot match: $specs', ({ specs }) => {
    const match = edgeMatch(specs)
    const program = compileVisualProgram(adapt(match))
    const initial = sampleVisualProgram(program, 0)
    expect(initial.fullTime).toBe(false)
    expect(initial.result).toBeNull()
    expect(initial.score).toEqual({ us: 0, opp: 0 })
    expect(initial.revealedCanonicalEvents).toEqual([])
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(ft.fullTime).toBe(true)
    expect(ft.activeScene).toBeNull()
    expect(ft.activeAction).toBeNull()
    expect(ft.goals).toEqual([])
    expect(ft.result).toBe('draw')
    expect(ft.players).toHaveLength(22)
  })

  it('reveals only the canonical aggregate penalty summary at Full Time', () => {
    const pens = { won: true, score: '5-3', hero: 'GK save in the shootout' }
    const match = edgeMatch([], { penalties: pens })
    const program = compileVisualProgram(adapt(match))
    expect(sampleVisualProgram(program, program.durationMs - 1).penalties).toBeNull()
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(ft.penalties).toEqual(pens)
    expect(ft.result).toBe('pens-win')
    expect(ft.score).toEqual({ us: 0, opp: 0 })
    expect(program.scenes).toHaveLength(0)
    expect(program.revealSchedule).toHaveLength(0)
  })
})
