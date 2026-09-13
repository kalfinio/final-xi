import { sampleVisualProgram } from '../sample.js'

/** One presentation cursor. The host supplies RAF; no gameplay dependency. */
export function createPlaybackController(program, { requestFrame, cancelFrame, onFrame = () => {}, sample = sampleVisualProgram }) {
  let cursorMs = 0, playing = false, speed = 1, hidden = false, disposed = false
  let pending = null, previousStamp = null, generation = 0
  const state = () => ({ cursorMs, playing, speed, finished: cursorMs === program.durationMs, hidden })
  const emit = () => { if (!disposed) onFrame(sample(program, cursorMs), state()) }
  function cancel() {
    generation++
    if (pending !== null) cancelFrame(pending)
    pending = null
    previousStamp = null
  }
  function schedule() {
    if (disposed || hidden || !playing || pending !== null) return
    const token = generation
    pending = requestFrame((stamp) => {
      if (disposed || token !== generation) return
      pending = null
      const elapsed = previousStamp === null ? 0 : Math.max(0, stamp - previousStamp)
      previousStamp = stamp
      cursorMs = Math.min(program.durationMs, cursorMs + elapsed * speed)
      if (cursorMs === program.durationMs) playing = false
      emit()
      schedule()
    })
  }
  return {
    getState: state,
    render: emit,
    play() { if (disposed || cursorMs === program.durationMs || playing) return; playing = true; previousStamp = null; emit(); schedule() },
    pause() { playing = false; cancel(); emit() },
    setSpeed(value) {
      if (![1, 2, 4].includes(value)) throw new RangeError('Playback speed must be 1, 2 or 4')
      speed = value; cancel(); emit(); schedule()
    },
    seek(value) {
      if (!Number.isFinite(value)) throw new TypeError('A finite cursor is required')
      cursorMs = Math.max(0, Math.min(program.durationMs, value))
      if (cursorMs === program.durationMs) playing = false
      cancel(); emit(); schedule()
    },
    nextHighlight() {
      const next = program.scenes.find((scene) => scene.origin === 'canonical' && scene.startMs > cursorMs)
      if (next) this.seek(next.startMs)
    },
    fullTime() { this.seek(program.durationMs) },
    replay() { playing = false; this.seek(0) },
    setHidden(value) { hidden = Boolean(value); cancel(); emit(); schedule() },
    destroy() { disposed = true; playing = false; cancel() },
  }
}

// Kept separate so StrictMode/remount and visibility behavior are testable
// without relying on a React timer or an independently ticking DOM clock.
export function bindPlaybackVisibility(controller, documentTarget) {
  const change = () => controller.setHidden(documentTarget.hidden)
  documentTarget.addEventListener('visibilitychange', change)
  change()
  return () => documentTarget.removeEventListener('visibilitychange', change)
}
