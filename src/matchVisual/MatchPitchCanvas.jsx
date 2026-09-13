import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { mountPitch } from './render/mountPitch.js'

/** Canvas is imperative; React receives only changed broadcast/control data. */
export const MatchPitchCanvas = forwardRef(function MatchPitchCanvas({ program, onBroadcast, selectedId, onSelect }, ref) {
  const canvasRef = useRef(null), runtimeRef = useRef(null), selectionRef = useRef(selectedId)
  selectionRef.current = selectedId
  useImperativeHandle(ref, () => Object.fromEntries(
    ['play', 'pause', 'setSpeed', 'nextHighlight', 'fullTime', 'replay', 'seek', 'getState'].map((method) => [method, (...args) => runtimeRef.current?.controller[method](...args)])
      .concat([['getDiagnostics', () => runtimeRef.current ? { ...runtimeRef.current.metrics } : null]]),
  ), [])

  useEffect(() => {
    const runtime = mountPitch(canvasRef.current, program, { onBroadcast, selectedId: () => selectionRef.current })
    runtimeRef.current = runtime
    return () => {
      runtime.destroy(); runtimeRef.current = null
    }
  }, [program, onBroadcast])

  useEffect(() => { runtimeRef.current?.draw() }, [selectedId])
  const select = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    onSelect(runtimeRef.current?.pick({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }) ?? null)
  }
  return <canvas ref={canvasRef} className="mv-pitch" role="img" aria-label="Full football pitch. Your team uses circles; opponents use squares; goalkeepers use diamonds. Match information and actor selection are available below."
    onPointerMove={(event) => { if (event.pointerType === 'mouse') select(event) }} onPointerLeave={() => onSelect(null)} onClick={select}>
    Football animation. Use the score, commentary and controls below for an accessible match summary.
  </canvas>
})
