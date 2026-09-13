import { createPlaybackController, bindPlaybackVisibility } from '../playback/controller.js'
import { broadcastState } from '../playback/broadcast.js'
import { sampleVisualProgram } from '../sample.js'
import { createProjection, hitActor } from './projection.js'
import { drawPitch } from './drawPitch.js'

/** Imperative lifecycle shared by the React mount and host-level tests. */
export function mountPitch(canvas, program, { onBroadcast, selectedId = () => null, host = window, documentTarget = document }) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This prototype requires Canvas 2D support')
  let projection, lastSample, broadcastKey = null
  const metrics = { frames: 0, sampleMs: 0, drawMs: 0, domUpdates: 0 }
  const draw = () => {
    if (!lastSample || !projection) return
    const start = host.performance.now()
    drawPitch(context, projection, program, lastSample, selectedId())
    metrics.drawMs += host.performance.now() - start
  }
  const controller = createPlaybackController(program, {
    requestFrame: (callback) => host.requestAnimationFrame(callback),
    cancelFrame: (id) => host.cancelAnimationFrame(id),
    sample: (source, time) => {
      const start = host.performance.now(), snapshot = sampleVisualProgram(source, time)
      metrics.sampleMs += host.performance.now() - start
      return snapshot
    },
    onFrame: (snapshot, playback) => {
      lastSample = snapshot; metrics.frames++; draw()
      const next = broadcastState(program, snapshot, playback), key = JSON.stringify(next)
      if (key !== broadcastKey) { broadcastKey = key; metrics.domUpdates++; onBroadcast(next) }
    },
  })
  const resize = () => {
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(host.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * ratio))
    canvas.height = Math.max(1, Math.round(bounds.height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    projection = createProjection(bounds.width, bounds.height)
    draw()
  }
  const observer = new host.ResizeObserver(resize)
  observer.observe(canvas); resize()
  const unbindVisibility = bindPlaybackVisibility(controller, documentTarget)
  return {
    controller, metrics, draw,
    pick: (pointer) => lastSample && projection ? hitActor(lastSample, projection, pointer) : null,
    destroy() { unbindVisibility(); controller.destroy(); observer.disconnect() },
  }
}
