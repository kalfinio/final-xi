import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MatchPitchCanvas } from '../matchVisual/MatchPitchCanvas.jsx'
import { actorLabel } from '../matchVisual/playback/broadcast.js'
import { getVisualDemo } from './matchVisualDemo.js'
import './matchVisualLab.css'

export default function MatchVisualLab() {
  const [seed, setSeed] = useState(7), [formation, setFormation] = useState('4-3-3')
  const [broadcast, setBroadcast] = useState(null), [selectedId, setSelectedId] = useState(null)
  const [reducedMotion, setReducedMotion] = useState(false), [diagnostics, setDiagnostics] = useState(null)
  const pitch = useRef(null)
  // Module cache survives StrictMode's initial double render. Playback controls
  // and resize never compile or resolve anything.
  const { view, program } = getVisualDemo(seed, formation)
  const update = useCallback((value) => setBroadcast(value), [])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { setReducedMotion(preference.matches); if (preference.matches) pitch.current?.pause() }
    preference.addEventListener('change', change); change()
    return () => preference.removeEventListener('change', change)
  }, [])
  const b = broadcast
  return <main className="mv-lab">
    <header className="mv-header"><div><p className="mv-eyebrow">FINAL XI · INTERNAL PROTOTYPE</p><h1>2D match inspection</h1></div><a href="/">Return to app</a></header>
    <p className="mv-note">Development only · visual_v2_2 · isolated resolved M1 example. Replay and seeking do not resolve another match.</p>
    <div className="mv-examples">
      <label>Example <select value={seed} onChange={(event) => { setBroadcast(null); setSelectedId(null); setDiagnostics(null); setSeed(Number(event.target.value)) }}>{[1, 7, 42, 99].map((value) => <option key={value} value={value}>Seed {value}</option>)}</select></label>
      <label>Formation <select value={formation} onChange={(event) => { setBroadcast(null); setSelectedId(null); setDiagnostics(null); setFormation(event.target.value) }}>{['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2'].map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <section className="mv-broadcast" aria-label="Match playback">
      <div className="mv-scorebar">
        <span>Your XI <small>{view.venue.playerTeam}</small></span>
        <strong role="status" aria-label="Score">{b?.score.us ?? 0} – {b?.score.opp ?? 0}</strong>
        <span>{view.opponent} <small>{view.venue.playerTeam === 'home' ? 'away' : 'home'}</small></span>
      </div>
      <div className="mv-matchmeta"><span>Match time: <output aria-label="Match time">{b?.clock ?? '0'}{b?.clock !== 'FT' ? '′' : ''}</output></span><span>Plan: Attack the Flanks</span></div>
      <MatchPitchCanvas key={`${seed}|${formation}`} ref={pitch} program={program} onBroadcast={update} selectedId={selectedId} onSelect={setSelectedId} />
      <p className="mv-legend">● Your XI &nbsp; ■ Opponent &nbsp; ◆ Goalkeeper · ring: carrier · dashed ring: press</p>
      <div className="mv-controls" aria-label="Playback controls">
        <button type="button" disabled={b?.finished} onClick={() => b?.playing ? pitch.current.pause() : pitch.current.play()}>{b?.playing ? 'Pause' : 'Play'}</button>
        {[1, 2, 4].map((speed) => <button type="button" key={speed} aria-label={`${speed}x speed`} aria-pressed={(b?.speed ?? 1) === speed} onClick={() => pitch.current.setSpeed(speed)}>{speed}x</button>)}
        <button type="button" disabled={!b?.hasNext} onClick={() => pitch.current.nextHighlight()}>Next Highlight</button>
        <button type="button" disabled={b?.finished} onClick={() => pitch.current.fullTime()}>Full Time</button>
        <button type="button" onClick={() => pitch.current.replay()}>Replay</button>
      </div>
      <div className="mv-commentary"><p aria-label="Current action">{b?.actionLine ?? 'Ready for kickoff'}</p><p role="status" aria-label="Canonical commentary">{b?.commentary ?? 'Awaiting the first event.'}</p></div>
      {b?.finished && <p role="status">Result: {b.result}{b.penalties ? ` · Penalties: ${b.penalties.score}` : ''}</p>}
      {b?.hidden && <p>Playback suspended while this tab is hidden.</p>}
      {reducedMotion && <p className="mv-note">Reduced motion: playback starts paused. Use Next Highlight or Full Time, or choose Play to inspect animation.</p>}
      <label className="mv-actor">Inspect actor <select value={selectedId ?? ''} onChange={(event) => setSelectedId(event.target.value || null)}><option value="">No selection</option>{program.actors.map((actor) => <option key={actor.id} value={actor.id}>{actorLabel(actor)} · {actor.slot}</option>)}</select></label>
      <section aria-label="Recent canonical events"><h2>Revealed events</h2><ol className="mv-feed">{b?.feed.map((item) => <li key={item.id}><span>{item.minute}′</span> {item.text}</li>)}</ol>{!b?.feed.length && <p>No events revealed.</p>}</section>
    </section>
    <details className="mv-diagnostics"><summary>Inspection notes</summary><p>Canonical scenes currently cut between highlights. The match clock advances at canonical reveals; it does not represent exact event seconds.</p><button type="button" onClick={() => setDiagnostics(pitch.current.getDiagnostics())}>Measure playback work</button>{diagnostics && <p>{diagnostics.frames} samples · mean sample {(diagnostics.sampleMs / Math.max(1, diagnostics.frames)).toFixed(2)} ms · accumulated drawing {diagnostics.drawMs.toFixed(1)} ms</p>}</details>
  </main>
}
