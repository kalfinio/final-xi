import { useState, useEffect, useMemo, useRef } from 'react'
import { shortDisplayName } from './data'
import { buildMatchTimeline, matchVerdict } from './matchTimeline'

// Base milliseconds an event is shown at x1 speed (divided by the speed multiplier).
const BASE_MS = 2100

// Attack-relative zone coordinates on a 100×62 pitch (home attacks toward +x).
// Away events are mirrored horizontally so each team attacks its own goal.
const ZONE = {
  leftDefense: { x: 24, y: 16 },
  leftMidfield: { x: 40, y: 16 },
  center: { x: 50, y: 31 },
  rightMidfield: { x: 40, y: 46 },
  rightAttack: { x: 72, y: 46 },
  box: { x: 88, y: 31 },
}

function zonePoint(zone, team) {
  const z = ZONE[zone] || ZONE.center
  return team === 'away' ? { x: 100 - z.x, y: z.y } : { x: z.x, y: z.y }
}

// Lay out an XI as dots, grouped into GK / DEF / MID / ATT lines.
// Home occupies the left half (attacking right); away mirrors on the right.
function layoutHome(players) {
  const lines = { GK: [], DEF: [], MID: [], ATT: [] }
  players.forEach((p) => { (lines[p.posType] || lines.MID).push(p) })
  const xByType = { GK: 6, DEF: 19, MID: 33, ATT: 45 }
  const dots = []
  for (const t of ['GK', 'DEF', 'MID', 'ATT']) {
    const arr = lines[t]
    arr.forEach((p, i) => {
      const y = arr.length === 1 ? 31 : 8 + i * (46 / (arr.length - 1))
      dots.push({ x: xByType[t], y, label: shortDisplayName(p.name), id: p.id, side: 'home', gk: t === 'GK' })
    })
  }
  return dots
}

// A generic opponent shape (4-3-3) mirrored on the right half.
function layoutAway() {
  const shape = [
    { t: 'GK', n: 1, x: 94 },
    { t: 'DEF', n: 4, x: 81 },
    { t: 'MID', n: 3, x: 67 },
    { t: 'ATT', n: 3, x: 55 },
  ]
  const dots = []
  shape.forEach((line) => {
    for (let i = 0; i < line.n; i++) {
      const y = line.n === 1 ? 31 : 8 + i * (46 / (line.n - 1))
      dots.push({ x: line.x, y, side: 'away', gk: line.t === 'GK' })
    }
  })
  return dots
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Scoreboard({ home, away, hg, ag, minute, stageLabel, finished }) {
  return (
    <div className="rounded-lg bg-card border border-border px-3 py-2.5 sm:px-5 sm:py-3 mb-3">
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-gold/80">{stageLabel || 'Match'}</span>
        <span className="text-[10px] text-secondary">·</span>
        <span className="text-[10px] font-mono text-secondary">{finished ? "FT" : `${minute}'`}</span>
      </div>
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        <div className="flex-1 text-right min-w-0">
          <div className="font-black text-sm sm:text-lg truncate text-primary">{home}</div>
        </div>
        <div className="shrink-0 px-3 py-1 rounded-md bg-bg border border-border">
          <span className="font-black text-2xl sm:text-3xl text-gold tabular-nums">{hg}</span>
          <span className="font-black text-xl sm:text-2xl text-secondary mx-1.5">–</span>
          <span className="font-black text-2xl sm:text-3xl text-primary tabular-nums">{ag}</span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="font-black text-sm sm:text-lg truncate text-blue-300">{away}</div>
        </div>
      </div>
    </div>
  )
}

function Pitch({ homeDots, awayDots, ball, pathPts, active, activeDot, flashKey }) {
  return (
    <div className="relative rounded-lg overflow-hidden border border-border mb-3" style={{ background: '#0c1a10' }}>
      <svg viewBox="0 0 100 62" className="w-full block" style={{ aspectRatio: '100 / 62' }}>
        <defs>
          <linearGradient id="fxPitch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#123322" />
            <stop offset="100%" stopColor="#0c1f14" />
          </linearGradient>
        </defs>
        {/* turf + stripes */}
        <rect x="0" y="0" width="100" height="62" fill="url(#fxPitch)" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={i} x={i * 12.5} y="0" width="12.5" height="62" fill={i % 2 ? '#ffffff' : '#000000'} opacity={i % 2 ? 0.018 : 0.03} />
        ))}
        {/* markings */}
        <g stroke="#9fe3bf" strokeOpacity="0.32" strokeWidth="0.35" fill="none">
          <rect x="2" y="2" width="96" height="58" />
          <line x1="50" y1="2" x2="50" y2="60" />
          <circle cx="50" cy="31" r="8" />
          <circle cx="50" cy="31" r="0.7" fill="#9fe3bf" fillOpacity="0.4" stroke="none" />
          <rect x="2" y="16" width="12" height="30" />
          <rect x="2" y="24" width="5" height="14" />
          <rect x="86" y="16" width="12" height="30" />
          <rect x="93" y="24" width="5" height="14" />
          <rect x="0.4" y="26.5" width="1.6" height="9" fill="#9fe3bf" fillOpacity="0.18" />
          <rect x="98" y="26.5" width="1.6" height="9" fill="#9fe3bf" fillOpacity="0.18" />
        </g>

        {/* active attacking path */}
        {pathPts && (
          <polyline key={`path-${flashKey}`} className="fx-path" points={pathPts} fill="none" stroke="#c9a84c" strokeOpacity="0.7" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="2.4 2" />
        )}

        {/* away dots */}
        {awayDots.map((d, i) => (
          <circle key={`a${i}`} cx={d.x} cy={d.y} r={d.gk ? 1.7 : 1.6} fill={d.gk ? '#f87171' : '#3b82f6'} stroke="#0c1a10" strokeWidth="0.4" opacity="0.92" />
        ))}
        {/* home dots */}
        {homeDots.map((d, i) => (
          <circle key={`h${i}`} cx={d.x} cy={d.y} r={d.gk ? 1.7 : 1.6} fill={d.gk ? '#c9a84c' : '#f5f5f5'} stroke="#0c1a10" strokeWidth="0.4" opacity="0.96" />
        ))}

        {/* active player highlight ring */}
        {activeDot && (
          <circle className="fx-dot-pulse" cx={activeDot.x} cy={activeDot.y} r={2.4} fill="none" stroke="#c9a84c" strokeWidth="0.6" />
        )}

        {/* ball */}
        <g className="fx-ball" style={{ transform: `translate(${ball.x}px, ${ball.y}px)` }}>
          <circle cx="0" cy="0" r="1.25" fill="#ffffff" stroke="#0c1a10" strokeWidth="0.35" />
        </g>
      </svg>

      {/* GOAL / SAVE flash */}
      {active && (active.type === 'goal' || active.type === 'save') && (
        <div key={flashKey} className="fx-flash pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`font-black tracking-tight ${active.type === 'goal' ? 'text-gold' : 'text-blue-200'}`} style={{ fontSize: 'clamp(2rem, 9vw, 4rem)', textShadow: '0 2px 18px rgba(0,0,0,0.7)' }}>
            {active.type === 'goal' ? 'GOAL' : 'SAVE'}
          </div>
        </div>
      )}
    </div>
  )
}

const TYPE_DOT = {
  goal: 'bg-gold',
  save: 'bg-blue-300',
  shot: 'bg-primary/70',
  chance: 'bg-secondary',
  momentum: 'bg-orange-300',
  card: 'bg-yellow-400',
  substitution: 'bg-secondary',
}

function Ticker({ shown }) {
  const ref = useRef(null)
  // newest event is appended last; keep the latest in view
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [shown.length])
  return (
    <div className="rounded-lg bg-card border border-border p-3 mb-3">
      <div className="text-[10px] uppercase tracking-widest text-secondary mb-2">Live commentary</div>
      <div ref={ref} className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        {shown.length === 0 && <div className="text-xs text-secondary italic">Kick-off…</div>}
        {shown.map((e) => {
          const card = e.type === 'card'
          return (
            <div key={e.id} className="fx-row-in flex items-start gap-2 text-xs">
              <span className="shrink-0 font-mono text-gold/70 w-7 text-right">{e.minute}'</span>
              <span className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${card && e.red ? 'bg-red-500' : TYPE_DOT[e.type] || 'bg-secondary'}`} />
              <span className="min-w-0">
                <span className={`font-semibold ${e.type === 'goal' ? 'text-gold' : e.team === 'home' ? 'text-primary' : 'text-blue-300'}`}>{e.title}</span>
                <span className="text-secondary"> — {e.description}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatBar({ label, hv, av, suffix = '' }) {
  const total = hv + av || 1
  const hpct = Math.round((hv / total) * 100)
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="font-semibold text-primary tabular-nums">{hv}{suffix}</span>
        <span className="text-secondary uppercase tracking-wide text-[9px]">{label}</span>
        <span className="font-semibold text-blue-300 tabular-nums">{av}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg overflow-hidden flex">
        <div className="h-full bg-gold transition-all duration-500" style={{ width: `${hpct}%` }} />
        <div className="h-full bg-blue-500/70 transition-all duration-500" style={{ width: `${100 - hpct}%` }} />
      </div>
    </div>
  )
}

function ControlBtn({ active, onClick, children, className = '' }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-md text-xs font-bold border fx-press transition-colors ${active ? 'border-gold bg-gold/15 text-gold' : 'border-border bg-card text-secondary hover:text-primary'} ${className}`}>{children}</button>
  )
}

// Compute the full live/final stat picture from the events shown so far.
function computeStats(shown, timeline, prog, hg, ag) {
  const fs = timeline.finalStats
  const ease = (v) => Math.round(v * prog)
  const cShot = (team) => shown.filter((e) => e.team === team && e.countsShot).length
  const cOnT = (team) => shown.filter((e) => e.team === team && e.countsShot && e.onTarget).length
  const hShots = Math.max(ease(fs.home.shots), cShot('home'))
  const aShots = Math.max(ease(fs.away.shots), cShot('away'))
  const hSot = Math.max(ease(fs.home.sot), hg, cOnT('home'))
  const aSot = Math.max(ease(fs.away.sot), ag, cOnT('away'))
  const hPoss = Math.round(50 + (fs.home.possession - 50) * prog)
  const big = (team) => shown.filter((e) => e.team === team && (e.type === 'goal' || e.type === 'save' || e.type === 'chance')).length
  // A save is credited to the DEFENDING keeper (opposite team attacked).
  const saves = (keeper) => shown.filter((e) => e.type === 'save' && e.team === (keeper === 'home' ? 'away' : 'home')).length
  const att = (team) => shown.filter((e) => e.team === team && ['goal', 'shot', 'save', 'chance'].includes(e.type)).length
  const totalAtt = att('home') + att('away') || 1
  return {
    hShots, aShots, hSot, aSot,
    hPoss, aPoss: 100 - hPoss,
    hBig: big('home'), aBig: big('away'),
    hSaves: saves('home'), aSaves: saves('away'),
    momentumHome: Math.round((att('home') / totalAtt) * 100),
  }
}

// Expandable detailed stats — possession, shots, on target, big chances, saves,
// momentum, plus the key player (player of the match from the simulation).
function FullStats({ s, home, away, keyPlayer }) {
  return (
    <div className="rounded-lg bg-card border border-border p-3 mb-3">
      <div className="grid grid-cols-3 text-[10px] uppercase tracking-wide text-secondary mb-2 pb-1.5 border-b border-border">
        <span className="text-gold font-bold truncate">{home}</span>
        <span className="text-center">Stat</span>
        <span className="text-blue-300 font-bold text-right truncate">{away}</span>
      </div>
      {[
        ['Possession', `${s.hPoss}%`, `${s.aPoss}%`],
        ['Shots', s.hShots, s.aShots],
        ['Shots on target', s.hSot, s.aSot],
        ['Big chances', s.hBig, s.aBig],
        ['Saves', s.hSaves, s.aSaves],
        ['Momentum', `${s.momentumHome}%`, `${100 - s.momentumHome}%`],
      ].map(([label, hv, av]) => (
        <div key={label} className="grid grid-cols-3 items-center text-xs py-1">
          <span className="font-semibold text-primary tabular-nums">{hv}</span>
          <span className="text-center text-[10px] uppercase tracking-wide text-secondary">{label}</span>
          <span className="font-semibold text-blue-300 tabular-nums text-right">{av}</span>
        </div>
      ))}
      {keyPlayer && (
        <div className="grid grid-cols-2 items-center text-xs pt-2 mt-1 border-t border-border">
          <span className="text-[10px] uppercase tracking-wide text-secondary">Key player</span>
          <span className="font-semibold text-gold text-right truncate">{keyPlayer}</span>
        </div>
      )}
    </div>
  )
}

// Full event list for the post-match timeline panel.
function TimelineList({ events }) {
  return (
    <div className="rounded-lg bg-card border border-border p-3 mb-3">
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 font-mono text-gold/70 w-7 text-right">{e.minute}'</span>
            <span className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${e.type === 'card' && e.red ? 'bg-red-500' : TYPE_DOT[e.type] || 'bg-secondary'}`} />
            <span className="min-w-0">
              <span className={`font-semibold ${e.type === 'goal' ? 'text-gold' : e.team === 'home' ? 'text-primary' : 'text-blue-300'}`}>{e.title}</span>
              <span className="text-secondary"> — {e.description}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToggleBtn({ open, onClick, children }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface text-left fx-press mb-3">
      <span className="text-xs font-semibold text-primary">{children}</span>
      <span className="text-secondary text-sm">{open ? '−' : '+'}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function MatchCenter({ squad, feature, onFinish, teamName = 'Final XI', tactics = null }) {
  const players = useMemo(() => squad.map((s) => s.player).filter(Boolean), [squad])
  const timeline = useMemo(
    () => buildMatchTimeline(feature.match, players, feature.stageLabel, teamName, tactics),
    [feature, players, teamName, tactics],
  )

  const homeDots = useMemo(() => layoutHome(players), [players])
  const awayDots = useMemo(() => layoutAway(), [])

  const events = timeline.events
  const [idx, setIdx] = useState(-1)        // -1 = kick-off, before first event
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [finished, setFinished] = useState(false)
  const [displayed, setDisplayed] = useState(0) // ticking clock minute
  const [showStats, setShowStats] = useState(false)   // expandable full match stats
  const [showTimeline, setShowTimeline] = useState(false) // post-match timeline

  // Playback: advance to the next event after a speed-scaled delay.
  useEffect(() => {
    if (!playing || finished) return
    const delay = (idx < 0 ? 800 : BASE_MS) / speed
    const t = setTimeout(() => {
      setIdx((i) => {
        if (i + 1 >= events.length) { setFinished(true); setPlaying(false); return i }
        return i + 1
      })
    }, delay)
    return () => clearTimeout(t)
  }, [idx, playing, finished, speed, events.length])

  // Clock: ease the displayed minute toward the active event's minute.
  const targetMinute = finished ? 90 : idx < 0 ? 0 : events[idx].minute
  useEffect(() => {
    if (displayed === targetMinute) return
    const step = setTimeout(() => setDisplayed((d) => d + Math.sign(targetMinute - d)), Math.max(34, 240 / speed))
    return () => clearTimeout(step)
  }, [displayed, targetMinute, speed])

  const shown = idx < 0 ? [] : events.slice(0, idx + 1)
  const hg = shown.filter((e) => e.type === 'goal' && e.team === 'home').length
  const ag = shown.filter((e) => e.type === 'goal' && e.team === 'away').length
  const active = idx >= 0 ? events[idx] : null

  // Ball + active path + highlighted player for the current event.
  const ball = active ? zonePoint(active.pitchZone, active.team) : { x: 50, y: 31 }
  const { pathPts, activeDot } = useMemo(() => {
    if (!active) return { pathPts: '', activeDot: null }
    const start = { x: 50, y: 31 }
    const lift = active.team === 'home' ? -6 : 6
    const mid = { x: (start.x + ball.x) / 2, y: (start.y + ball.y) / 2 + lift }
    const pts = `${start.x},${start.y} ${mid.x},${mid.y} ${ball.x},${ball.y}`
    const pool = active.team === 'home' ? homeDots : awayDots
    let near = null
    pool.forEach((d) => { if (!near || dist(d, ball) < dist(near, ball)) near = d })
    return { pathPts: pts, activeDot: near }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // Live stats eased over the match clock toward the simulation's finals.
  const prog = Math.min(1, displayed / 90)
  const stats = computeStats(shown, timeline, prog, hg, ag)
  const keyPlayer = timeline.potm ? shortDisplayName(timeline.potm) : null
  const oppStyle = timeline.opponentMeta ? `${timeline.away} are ${timeline.opponentMeta.style}` : null
  const verdictLine = matchVerdict(timeline)
  // Rotate through the XI's tactical commentary as the clock advances.
  const tacticalNotes = tactics?.liveNotes || []
  const tacticalNote = tacticalNotes.length ? tacticalNotes[Math.floor(displayed / 18) % tacticalNotes.length] : null

  function restart() {
    setIdx(-1); setFinished(false); setDisplayed(0); setPlaying(true)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-5 sm:py-7">
      <div className="text-center mb-3">
        <h2 className="text-xl sm:text-2xl font-black text-gold">Live Match Center</h2>
        <p className="text-[11px] text-secondary">Watch the match unfold — the result is already decided by your squad.</p>
      </div>

      <Scoreboard home={timeline.home} away={timeline.away} hg={hg} ag={ag} minute={displayed} stageLabel={timeline.stageLabel} finished={finished} />

      {oppStyle && <p className="text-center text-[11px] text-secondary -mt-1.5 mb-1">{oppStyle}.</p>}
      {!finished && tacticalNote && <p className="text-center text-[11px] text-gold/75 mb-3">{tacticalNote}</p>}

      <Pitch homeDots={homeDots} awayDots={awayDots} ball={ball} pathPts={pathPts} active={active} activeDot={activeDot} flashKey={idx} />

      {/* Live stats preview (always visible, compact) */}
      <div className="rounded-lg bg-card border border-border p-3 mb-3">
        <StatBar label="Possession" hv={stats.hPoss} av={stats.aPoss} suffix="%" />
        <StatBar label="Shots" hv={stats.hShots} av={stats.aShots} />
        <StatBar label="On target" hv={stats.hSot} av={stats.aSot} />
      </div>

      {/* Expandable full match stats */}
      <ToggleBtn open={showStats} onClick={() => setShowStats((o) => !o)}>{showStats ? 'Hide Full Match Stats' : 'Show Full Match Stats'}</ToggleBtn>
      {showStats && <FullStats s={stats} home={timeline.home} away={timeline.away} keyPlayer={keyPlayer} />}

      <Ticker shown={shown} />

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        {!finished ? (
          <>
            <ControlBtn active={false} onClick={() => setPlaying((p) => !p)} className="min-w-[5rem]">{playing ? '⏸ Pause' : '▶ Play'}</ControlBtn>
            <div className="flex items-center gap-1">
              {[1, 2, 4].map((s) => (
                <ControlBtn key={s} active={speed === s} onClick={() => setSpeed(s)}>x{s}</ControlBtn>
              ))}
            </div>
          </>
        ) : (
          <ControlBtn active={false} onClick={restart}>↻ Replay</ControlBtn>
        )}
      </div>

      {finished ? (
        <div>
          <div className="text-center mb-3">
            <div className="text-sm text-secondary">
              Full time: <span className="font-bold text-primary">{timeline.home} {timeline.gf}–{timeline.ga} {timeline.away}</span>
              {timeline.pens && <span className="block text-xs mt-0.5">Penalty shootout: {timeline.pens.score} — {timeline.pens.won ? 'won' : 'lost'}</span>}
            </div>
            {verdictLine && <div className="text-base font-black text-gold tracking-tight mt-1">“{verdictLine}”</div>}
            {tactics?.postNote && <div className="text-[11px] text-gold/70 mt-1 px-2">{tactics.postNote}</div>}
            {keyPlayer && <div className="text-[11px] text-secondary mt-0.5">Key player: <span className="text-primary font-semibold">{keyPlayer}</span></div>}
          </div>

          {/* Post-match expandable panels */}
          <ToggleBtn open={showTimeline} onClick={() => setShowTimeline((o) => !o)}>{showTimeline ? 'Hide Match Timeline' : 'Show Match Timeline'}</ToggleBtn>
          {showTimeline && <TimelineList events={events} />}
          <ToggleBtn open={showStats} onClick={() => setShowStats((o) => !o)}>{showStats ? 'Hide Full Match Stats' : 'Show Full Match Stats'}</ToggleBtn>
          {showStats && <FullStats s={stats} home={timeline.home} away={timeline.away} keyPlayer={keyPlayer} />}

          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-1">
            <button onClick={() => onFinish('report')} className="px-6 py-3 rounded-md font-semibold fx-press bg-card text-primary border border-border hover:border-gold w-full sm:w-auto">View European Run report</button>
            <button onClick={() => onFinish('result')} className="px-6 py-3 rounded-md font-semibold fx-press bg-gold text-black hover:bg-gold/90 w-full sm:w-auto">See Result</button>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <button onClick={() => onFinish('result')} className="text-xs text-secondary hover:text-gold">Skip to result ⏭</button>
        </div>
      )}
    </div>
  )
}
