import { describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './controller.js'
import { broadcastState, actorLabel } from './broadcast.js'
import { fixtureView, footballProgram } from '../testSupport/fixtures.js'
import { sampleVisualProgram } from '../sample.js'
import { createProjection, hitActor } from '../render/projection.js'
import { drawPitch } from '../render/drawPitch.js'
import { mountPitch } from '../render/mountPitch.js'

function scheduler() {
  let sequence = 0
  const jobs = new Map()
  return {
    jobs, requestFrame: (fn) => { jobs.set(++sequence, fn); return sequence }, cancelFrame: (id) => jobs.delete(id),
    tick(stamp) { const current = [...jobs.values()]; jobs.clear(); current.forEach((fn) => fn(stamp)) },
  }
}
const example = () => footballProgram(fixtureView([{ route: 'cross' }, { outcome: 'saved' }, { side: 'opp', outcome: 'off_target', route: 'long_range' }, { side: 'opp' }]))
const controls = (program, onFrame = () => {}) => {
  const raf = scheduler()
  return { raf, controller: createPlaybackController(program, { ...raf, onFrame }) }
}

describe('one RAF presentation clock', () => {
  it.each([1, 2, 4])('advances by elapsed time at %sx independently of frame count', (speed) => {
    const program = example(), a = controls(program), b = controls(program)
    for (const { controller } of [a, b]) { controller.setSpeed(speed); controller.play(); controller.play() }
    a.raf.tick(1000); a.raf.tick(2000)
    b.raf.tick(1000)
    for (const stamp of [1100, 1230, 1400, 1500, 1980, 2000]) b.raf.tick(stamp)
    expect(a.controller.getState().cursorMs).toBe(1000 * speed)
    expect(b.controller.getState()).toEqual(a.controller.getState())
    expect(a.raf.jobs.size).toBe(1)
  })

  it('freezes a mid-pass world, reveals and score on pause, without work or catch-up', () => {
    const program = example(), samples = []
    const { controller: c, raf } = controls(program, (sample) => samples.push(sample))
    const pass = program.scenes[0].actions.find((action) => action.ownershipDuring.kind === 'inFlight')
    c.seek((pass.startMs + pass.endMs) / 2); c.play(); raf.tick(1000); c.pause()
    const frozen = samples.at(-1), count = samples.length
    raf.tick(50000); raf.tick(90000)
    expect(samples).toHaveLength(count)
    expect(raf.jobs.size).toBe(0)
    expect(sampleVisualProgram(program, c.getState().cursorMs)).toEqual(frozen)
    c.play(); raf.tick(100000)
    expect(samples.at(-1)).toEqual(frozen)
    raf.tick(100100)
    expect(c.getState().cursorMs).toBe(frozen.timeMs + 100)
  })

  it('rebases speed changes and visibility suspension without advancing hidden time', () => {
    const { controller: c, raf } = controls(example())
    c.play(); raf.tick(0); raf.tick(1000); c.setSpeed(2); raf.tick(1100); raf.tick(1600)
    expect(c.getState().cursorMs).toBe(2000)
    const stale = [...raf.jobs.values()][0]
    c.setHidden(true); stale(100000); raf.tick(200000)
    expect(c.getState().cursorMs).toBe(2000); expect(raf.jobs.size).toBe(0)
    c.setHidden(false); raf.tick(300000); raf.tick(300500)
    expect(c.getState().cursorMs).toBe(3000)
    c.pause(); c.setHidden(true); c.setHidden(false)
    expect(raf.jobs.size).toBe(0)
  })

  it('seeks to canonical starts, reconciles backwards, finishes exactly, and replays without compiling', () => {
    const program = example(), { controller: c, raf } = controls(program)
    const bytes = JSON.stringify(program)
    c.nextHighlight(); expect(c.getState().cursorMs).toBe(program.scenes[1].startMs)
    expect(sampleVisualProgram(program, c.getState().cursorMs).score.us).toBe(1)
    c.seek(program.scenes[1].startMs - 1)
    expect(sampleVisualProgram(program, c.getState().cursorMs).score.us).toBe(0)
    c.fullTime(); expect(c.getState()).toMatchObject({ cursorMs: program.durationMs, finished: true, playing: false })
    expect(sampleVisualProgram(program, c.getState().cursorMs).score).toEqual(program.finalScore)
    c.play(); expect(raf.jobs.size).toBe(0)
    for (let i = 0; i < 5; i++) { c.replay(); c.play(); expect(raf.jobs.size).toBe(1) }
    expect(c.getState().cursorMs).toBe(0)
    expect(JSON.stringify(program)).toBe(bytes)
    c.destroy(); expect(raf.jobs.size).toBe(0); c.play(); expect(raf.jobs.size).toBe(0)
  })

  it('handles no highlights, overshoot and invalid controls', () => {
    const program = footballProgram(fixtureView([])), { controller: c, raf } = controls(program)
    c.nextHighlight(); expect(c.getState().cursorMs).toBe(0)
    c.play(); raf.tick(10); raf.tick(100000)
    expect(c.getState()).toMatchObject({ cursorMs: program.durationMs, finished: true, playing: false })
    expect(raf.jobs.size).toBe(0)
    c.seek(-10); expect(c.getState().cursorMs).toBe(0)
    expect(() => c.seek(NaN)).toThrow(); expect(() => c.setSpeed(3)).toThrow()
  })

  it('invalidates queued frames during playing seeks, Full Time, replay and disposal', () => {
    const program = example(), onFrame = vi.fn(), { controller: c, raf } = controls(program, onFrame)
    c.play(); raf.tick(0); raf.tick(100)
    for (const transport of [() => c.nextHighlight(), () => c.seek(10), () => c.fullTime(), () => c.replay()]) {
      c.play()
      const stale = [...raf.jobs.values()][0]
      transport()
      const state = c.getState(), samples = onFrame.mock.calls.length
      stale?.(900000)
      expect(c.getState()).toEqual(state)
      expect(onFrame).toHaveBeenCalledTimes(samples)
      expect(raf.jobs.size).toBe(state.playing ? 1 : 0)
    }
    c.play()
    const stale = [...raf.jobs.values()][0]
    c.destroy(); const samples = onFrame.mock.calls.length
    stale(999999)
    expect(onFrame).toHaveBeenCalledTimes(samples)
    expect(raf.jobs.size).toBe(0)
  })
})

describe('broadcast reveal boundary', () => {
  it('describes the final hold without announcing another kickoff', () => {
    const program = example(), sample = sampleVisualProgram(program, program.durationMs - 1)
    expect(sample.fullTime).toBe(false)
    expect(broadcastState(program, sample, {}).actionLine).toBe('Awaiting Full Time')
  })
  it.each(['goal', 'saved', 'off_target'])('withholds %s commentary until the canonical terminal reveal', (outcome) => {
    const program = footballProgram(fixtureView([{ outcome }])), scene = program.scenes[0]
    const ui = (time) => broadcastState(program, sampleVisualProgram(program, time), { playing: false, speed: 1, hidden: false })
    for (const action of scene.actions) {
      const state = ui(action.startMs)
      expect(state.feed).toEqual([]); expect(state.commentary).toBeNull()
      expect(state.actionLine).not.toMatch(/goal|save|assist|off target/i)
      expect(state.score).toEqual({ us: 0, opp: 0 })
    }
    if (outcome === 'goal') {
      expect(scene.goalCrossingMs).toBeLessThan(scene.endMs)
      expect(ui(scene.goalCrossingMs).score.us).toBe(0)
    }
    expect(ui(scene.endMs - .001).feed).toEqual([])
    expect(ui(scene.endMs).feed).toHaveLength(1)
    expect(ui(scene.endMs).commentary).toBe(program.revealSchedule[0].commentary)
    expect(ui(scene.endMs).score.us).toBe(outcome === 'goal' ? 1 : 0)
    expect(ui(program.durationMs).score).toEqual(program.finalScore)
    expect(ui(program.durationMs).result).toBe(program.result)
    expect(ui(0).feed).toEqual([])
  })

  it('preserves stoppage labels and uses anonymous positional labels', () => {
    const program = footballProgram(fixtureView([{ minute: 45, stoppage: 3 }, { minute: 90, stoppage: 4 }]))
    for (const [index, clock] of ['45+3', '90+4'].entries()) {
      const s = sampleVisualProgram(program, program.scenes[index].endMs)
      expect(broadcastState(program, s, {}).clock).toBe(clock)
    }
    for (const actor of program.actors.filter((item) => item.anonymous)) expect(actorLabel(actor)).toBe(`Opponent ${actor.slot}`)
  })

  it('shares immutable program records while keeping mutable reconstruction sampling equivalent', () => {
    const program = example(), state = sampleVisualProgram(program, 100)
    expect(state.activeScene).toBe(program.scenes[0])
    expect(Object.isFrozen(state.players[0].position)).toBe(true)
    expect(sampleVisualProgram(JSON.parse(JSON.stringify(program)), 100)).toEqual(state)
  })
})

function canvasHost() {
  const raf = scheduler(), context = new Proxy({ measureText: (text) => ({ width: text.length * 6 }) }, {
    get(target, key) { if (!(key in target)) target[key] = vi.fn(); return target[key] },
  })
  let width = 1000, height = 650, resize, listeners = new Set(), observed = 0
  const documentTarget = { hidden: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  const host = {
    requestAnimationFrame: raf.requestFrame, cancelAnimationFrame: raf.cancelFrame, devicePixelRatio: 3, performance: { now: () => 0 },
    ResizeObserver: class { constructor(fn) { resize = fn } observe() { observed++ } disconnect() { observed-- } },
  }
  const canvas = { getContext: () => context, getBoundingClientRect: () => ({ width, height }) }
  return { raf, canvas, host, context, documentTarget,
    resize(w, h) { width = w; height = h; resize() },
    visibility(hidden) { documentTarget.hidden = hidden; listeners.forEach((fn) => fn()) },
    subscriptions: () => ({ listeners: listeners.size, observed }),
  }
}

describe('Canvas projection and actual mount lifecycle', () => {
  it.each([[1440, 900], [375, 812], [390, 844]])('projects inside a %s × %s viewport without changing football', (width, height) => {
    const program = example(), bytes = JSON.stringify(program), p = createProjection(width - 40, (width - 40) / 1.54)
    expect(p.markerRadius * 2).toBeGreaterThanOrEqual(13)
    for (const scene of program.scenes) for (const action of scene.actions) {
      const s = sampleVisualProgram(program, (action.startMs + action.endMs) / 2)
      for (const { position } of [...s.players, s.ball]) {
        const pixel = p.project(position)
        expect(pixel.x).toBeGreaterThanOrEqual(0); expect(pixel.x).toBeLessThanOrEqual(width)
        expect(pixel.y).toBeGreaterThanOrEqual(0); expect(pixel.y).toBeLessThan(height)
      }
      const { context } = canvasHost()
      drawPitch(context, p, program, s)
      expect(context.arc).toHaveBeenCalled()
      expect(context.strokeRect).toHaveBeenCalled()
    }
    const start = sampleVisualProgram(program, 0), actor = start.players[0]
    expect(hitActor(start, p, p.project(actor.position))).toBe(actor.actorId)
    expect(JSON.stringify(program)).toBe(bytes)
  })

  it('cleans every RAF, resize observer and visibility listener across remount/replay cycles', () => {
    const program = example(), env = canvasHost()
    for (let i = 0; i < 5; i++) {
      const runtime = mountPitch(env.canvas, program, { ...env, onBroadcast: vi.fn() })
      expect(env.subscriptions()).toEqual({ listeners: 1, observed: 1 })
      expect(env.raf.jobs.size).toBe(0)
      runtime.controller.play(); env.raf.tick(0); env.raf.tick(100)
      runtime.controller.replay(); runtime.controller.play()
      expect(env.raf.jobs.size).toBe(1)
      runtime.destroy()
      expect(env.raf.jobs.size).toBe(0); expect(env.subscriptions()).toEqual({ listeners: 0, observed: 0 })
    }
  })

  it('does not prelabel a future scorer or assister during buildup', () => {
    const view = fixtureView([{ creator: 'CM', shooter: 'CB' }]), program = footballProgram(view)
    const sample = sampleVisualProgram(program, 0), { context } = canvasHost()
    drawPitch(context, createProjection(375, 260), program, sample)
    const labels = context.fillText.mock.calls.map(([text]) => text)
    const carrier = sample.ball.ownerId
    for (const id of [view.events[0].bindings.shooter, view.events[0].bindings.assister]) {
      if (id !== carrier) expect(labels).not.toContain(actorLabel(program.actors.find((actor) => actor.id === id)))
    }
  })

  it('draws without per-frame React updates, pauses hidden work, and resizes without resampling', () => {
    const program = example(), env = canvasHost(), onBroadcast = vi.fn()
    const runtime = mountPitch(env.canvas, program, { ...env, onBroadcast })
    runtime.controller.play()
    for (let i = 0; i <= 60; i++) env.raf.tick(i * 10)
    expect(runtime.metrics.frames).toBeGreaterThan(60)
    expect(onBroadcast.mock.calls.length).toBeLessThan(5)
    const before = runtime.metrics.frames, cursor = runtime.controller.getState().cursorMs
    env.resize(335, 235)
    expect(env.canvas.width).toBe(670) // DPR capped at 2; CSS projection unchanged
    expect(runtime.metrics.frames).toBe(before)
    env.visibility(true)
    const hiddenFrames = runtime.metrics.frames
    env.raf.tick(100000)
    expect(runtime.metrics.frames).toBe(hiddenFrames)
    expect(runtime.controller.getState().cursorMs).toBe(cursor)
    env.visibility(false); env.raf.tick(200000)
    expect(runtime.controller.getState().cursorMs).toBe(cursor)
    runtime.controller.pause()
    const pausedFrames = runtime.metrics.frames
    env.raf.tick(300000)
    expect(runtime.metrics.frames).toBe(pausedFrames)
    runtime.destroy()
  })
})
