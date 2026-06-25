import { useState, useEffect, useMemo, useRef } from 'react'
import { shortDisplayName } from './data'
import { buildMatchTimeline, matchVerdict } from './matchTimeline'

// ---------------------------------------------------------------------------
// Zone-based football (no physics). Coordinates are attack-relative on a 100×64
// pitch — the home team attacks toward +x; away events are mirrored. The ball
// only moves while an event is playing, then rests at the centre spot.
// ---------------------------------------------------------------------------
const ZONES = {
  ownBox: { x: 9, y: 32 },
  ownDefense: { x: 20, y: 32 },
  ownMidfield: { x: 36, y: 32 },
  center: { x: 50, y: 32 },
  opponentMidfield: { x: 64, y: 32 },
  finalThird: { x: 79, y: 32 },
  opponentBox: { x: 90, y: 32 },
  goal: { x: 97, y: 32 },
  wideLeft: { x: 72, y: 12 },
  wideRight: { x: 72, y: 52 },
}
function zonePt(zone, team) {
  const z = ZONES[zone] || ZONES.center
  return team === 'away' ? { x: 100 - z.x, y: z.y } : { x: z.x, y: z.y }
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }

// Per-event timings (ms @ x1). Goals/saves/late drama linger longer.
function buildPlan(e) {
  const a = e.anim
  const team = e.team
  const noBall = a.animType === 'momentum_shift' || a.animType === 'substitution_impact' || a.animType === 'card'
  const pts = noBall
    ? [zonePt('center', team), zonePt('center', team)]
    : [a.startZone, ...a.pathZones, a.endZone].map((z) => zonePt(z, team))

  const dramatic = a.outcome === 'goal' || a.outcome === 'save' || a.lateDrama
  const buildMs = 460
  const moveMs = dramatic ? 560 : 620
  const outcomeMs = a.outcome === 'goal' ? 1800 : a.outcome === 'save' ? 1450 : noBall ? 1050 : a.lateDrama ? 1150 : 820
  const restMs = dramatic ? 680 : 460

  const stops = [{ point: pts[0], hold: buildMs, kind: 'build' }]
  for (let i = 1; i < pts.length; i++) stops.push({ point: pts[i], hold: moveMs, kind: 'move' })
  const outcomeFrame = stops.length
  stops.push({ point: pts[pts.length - 1], hold: outcomeMs, kind: 'outcome' })
  stops.push({ point: zonePt('center', team), hold: restMs, kind: 'rest' })

  // Pixel path for the gold pass/shot line (build → outcome, excludes rest).
  const pathPts = noBall ? null : pts.map((p) => `${p.x},${p.y}`).join(' ')
  return { stops, outcomeFrame, noBall, dramatic, lateDrama: a.lateDrama, animType: a.animType, label: a.visualLabel, sub: a.subLabel, endPoint: pts[pts.length - 1], pathPts, highlightZone: a.highlightZone }
}

// Lay out the user's XI (left half, attacking right), numbered 1..11.
function layoutHome(players) {
  const lines = { GK: [], DEF: [], MID: [], ATT: [] }
  players.forEach((p) => { (lines[p.posType] || lines.MID).push(p) })
  const xByType = { GK: 7, DEF: 21, MID: 36, ATT: 47 }
  const dots = []
  let n = 0
  for (const t of ['GK', 'DEF', 'MID', 'ATT']) {
    const arr = lines[t]
    arr.forEach((p, i) => {
      const y = arr.length === 1 ? 32 : 9 + i * (46 / (arr.length - 1))
      dots.push({ x: xByType[t], y, id: p.id, side: 'home', gk: t === 'GK', num: ++n })
    })
  }
  return dots
}

// Generic opponent shape (mirrored on the right half), numbered 1..11.
function layoutAway() {
  const shape = [{ t: 'GK', n: 1, x: 93 }, { t: 'DEF', n: 4, x: 79 }, { t: 'MID', n: 3, x: 64 }, { t: 'ATT', n: 3, x: 53 }]
  const dots = []
  let n = 0
  shape.forEach((line) => {
    for (let i = 0; i < line.n; i++) {
      const y = line.n === 1 ? 32 : 9 + i * (46 / (line.n - 1))
      dots.push({ x: line.x, y, side: 'away', gk: line.t === 'GK', num: ++n })
    }
  })
  return dots
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------
function Scoreboard({ home, away, hg, ag, minute, stageLabel, finished }) {
  return (
    <div className="rounded-lg bg-card border border-border px-3 py-2.5 sm:px-5 sm:py-3 mb-3">
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-gold/80">{stageLabel || 'Match'}</span>
        <span className="text-[10px] text-secondary">·</span>
        <span className="text-[10px] font-mono text-secondary">{finished ? 'FT' : `${minute}'`}</span>
      </div>
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        <div className="flex-1 text-right min-w-0"><div className="font-black text-sm sm:text-lg truncate text-primary">{home}</div></div>
        <div className="shrink-0 px-3 py-1 rounded-md bg-bg border border-border">
          <span className="font-black text-2xl sm:text-3xl text-gold tabular-nums">{hg}</span>
          <span className="font-black text-xl sm:text-2xl text-secondary mx-1.5">–</span>
          <span className="font-black text-2xl sm:text-3xl text-primary tabular-nums">{ag}</span>
        </div>
        <div className="flex-1 text-left min-w-0"><div className="font-black text-sm sm:text-lg truncate text-blue-300">{away}</div></div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Current Event spotlight — explains, in words, exactly what the pitch is doing.
// ---------------------------------------------------------------------------
const TYPE_META = {
  goal: { label: 'GOAL', cls: 'text-gold border-gold/50 bg-gold/15' },
  save: { label: 'BIG SAVE', cls: 'text-blue-200 border-blue-400/50 bg-blue-500/15' },
  shot: { label: 'SHOT', cls: 'text-primary border-border bg-surface' },
  chance: { label: 'CHANCE', cls: 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10' },
  momentum: { label: 'MOMENTUM', cls: 'text-orange-200 border-orange-400/40 bg-orange-500/10' },
  card: { label: 'CARD', cls: 'text-yellow-200 border-yellow-400/40 bg-yellow-500/10' },
  substitution: { label: 'ROLE IMPACT', cls: 'text-secondary border-border bg-surface' },
}

function Spotlight({ active, homeName, awayName, atOutcome, momentumHome }) {
  if (!active) {
    return (
      <div className="rounded-lg bg-card border border-border px-3 py-2.5 mb-2 text-center">
        <span className="text-xs text-secondary italic">Kick-off — the match is about to begin…</span>
      </div>
    )
  }
  const meta = TYPE_META[active.type] || TYPE_META.substitution
  const isHome = active.team === 'home'
  const teamLabel = isHome ? homeName : awayName
  const showLabel = active.anim?.visualLabel || meta.label
  return (
    <div className={`rounded-lg border px-3 py-2.5 mb-2 transition-colors ${atOutcome && active.type === 'goal' ? 'border-gold bg-gold/10' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="font-mono text-gold/80 text-sm font-bold">{active.minute}'</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide border ${meta.cls}`}>{showLabel}</span>
        {active.anim?.lateDrama && <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide border text-red-200 border-red-400/50 bg-red-500/15">LATE DRAMA</span>}
        <span className={`text-xs font-bold truncate ${isHome ? 'text-primary' : 'text-blue-300'}`}>{teamLabel}</span>
      </div>
      <div className="text-xs text-secondary leading-snug">{active.description}</div>
      {active.type === 'momentum' && (
        <div className="mt-1.5 h-1.5 rounded-full bg-bg overflow-hidden flex">
          <div className="h-full bg-gold transition-all duration-700" style={{ width: `${momentumHome}%` }} />
          <div className="h-full bg-blue-500/70 transition-all duration-700" style={{ width: `${100 - momentumHome}%` }} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pitch — larger, clearer, event-driven.
// ---------------------------------------------------------------------------
function Dot({ d, active, dim, keeper }) {
  const fill = d.gk ? (d.side === 'home' ? '#c9a84c' : '#f87171') : (d.side === 'home' ? '#f5f5f5' : '#3b82f6')
  const numFill = d.side === 'home' && !d.gk ? '#0c1a10' : '#0c1a10'
  return (
    <g opacity={dim ? 0.45 : 1}>
      {(active || keeper) && <circle className="fx-dot-pulse" cx={d.x} cy={d.y} r="3.3" fill="none" stroke="#c9a84c" strokeWidth="0.6" />}
      <circle cx={d.x} cy={d.y} r="2.1" fill={fill} stroke="#0c1a10" strokeWidth="0.4" />
      <text x={d.x} y={d.y + 0.8} textAnchor="middle" fontSize="2.1" fontWeight="700" fill={numFill}>{d.num}</text>
    </g>
  )
}

function Pitch({ homeDots, awayDots, ball, moveDur, pathPts, activeTeam, activeDotId, keeperDotId, overlay, goalFlash, drama, highlight, ballMoving, eventKey }) {
  return (
    <div className="relative rounded-lg overflow-hidden border border-border mb-2" style={{ background: '#0c1a10' }}>
      <svg viewBox="0 0 100 64" className="w-full block" style={{ aspectRatio: '100 / 64' }}>
        <defs>
          <linearGradient id="fxPitch2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#123322" />
            <stop offset="100%" stopColor="#0c1f14" />
          </linearGradient>
          <marker id="fxArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#c9a84c" />
          </marker>
        </defs>
        <rect x="0" y="0" width="100" height="64" fill="url(#fxPitch2)" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect key={i} x={i * 12.5} y="0" width="12.5" height="64" fill={i % 2 ? '#ffffff' : '#000000'} opacity={i % 2 ? 0.016 : 0.028} />
        ))}
        {/* attacking-third tint for the active team */}
        {activeTeam === 'home' && <rect x="66" y="2" width="32" height="60" fill="#c9a84c" opacity="0.05" />}
        {activeTeam === 'away' && <rect x="2" y="2" width="32" height="60" fill="#3b82f6" opacity="0.06" />}

        {/* markings */}
        <g stroke="#9fe3bf" strokeOpacity="0.34" strokeWidth="0.32" fill="none">
          <rect x="2" y="2" width="96" height="60" rx="1" />
          <line x1="50" y1="2" x2="50" y2="62" />
          <circle cx="50" cy="32" r="9" />
          <circle cx="50" cy="32" r="0.7" fill="#9fe3bf" fillOpacity="0.5" stroke="none" />
          {/* left goal/box (away goal) */}
          <rect x="2" y="13" width="15" height="38" />
          <rect x="2" y="23" width="6" height="18" />
          <rect x="0.3" y="26.5" width="1.7" height="11" fill="#9fe3bf" fillOpacity="0.2" />
          <circle cx="12" cy="32" r="0.5" fill="#9fe3bf" fillOpacity="0.4" stroke="none" />
          {/* right goal/box (home goal) */}
          <rect x="83" y="13" width="15" height="38" />
          <rect x="92" y="23" width="6" height="18" />
          <rect x="98" y="26.5" width="1.7" height="11" fill="#9fe3bf" fillOpacity="0.2" />
          <circle cx="88" cy="32" r="0.5" fill="#9fe3bf" fillOpacity="0.4" stroke="none" />
        </g>

        {/* zone highlight band for momentum / role-impact events */}
        {highlight && (
          <rect className="fx-zone-pulse" x={highlight.x - 11} y="4" width="22" height="56" rx="2" fill="#c9a84c" />
        )}

        {/* active pass/shot path */}
        {ballMoving && pathPts && (
          <polyline key={`path-${eventKey}`} className="fx-path" points={pathPts} fill="none" stroke="#c9a84c" strokeOpacity="0.85" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.6 2" markerEnd="url(#fxArrow)" />
        )}

        {/* dots */}
        {awayDots.map((d) => <Dot key={`a${d.num}`} d={d} active={activeTeam === 'away' && d.num === activeDotId} keeper={d.gk && keeperDotId === 'away'} dim={activeTeam === 'home'} />)}
        {homeDots.map((d) => <Dot key={`h${d.num}`} d={d} active={activeTeam === 'home' && d.num === activeDotId} keeper={d.gk && keeperDotId === 'home'} dim={activeTeam === 'away'} />)}

        {/* goal-mouth flash */}
        {goalFlash && (
          <rect key={`gf-${eventKey}`} className="fx-goal-flash" x={goalFlash === 'home' ? 92 : 2} y="22" width="6" height="20" fill="#c9a84c" />
        )}

        {/* ball */}
        <g className="fx-ball" style={{ transform: `translate(${ball.x}px, ${ball.y}px)`, transitionDuration: `${moveDur}ms` }}>
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" opacity="0.18" />
          <circle cx="0" cy="0" r="1.55" fill="#ffffff" stroke="#0c1a10" strokeWidth="0.45" />
        </g>
      </svg>

      {/* late-drama vignette */}
      <div className="fx-drama pointer-events-none absolute inset-0" style={{ opacity: drama ? 1 : 0, background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.55) 100%)' }} />

      {/* outcome overlay */}
      {overlay && (
        <div key={overlay.key} className="fx-flash pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className={`font-black tracking-tight ${overlay.color}`} style={{ fontSize: overlay.big ? 'clamp(2.2rem, 9vw, 4rem)' : 'clamp(1.1rem, 4.5vw, 2rem)', textShadow: '0 2px 18px rgba(0,0,0,0.75)' }}>{overlay.text}</div>
          {overlay.sub && <div className="text-xs sm:text-sm font-bold text-primary/90 mt-0.5" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>{overlay.sub}</div>}
        </div>
      )}

      {/* attack-direction hint */}
      {activeTeam && (
        <div className={`pointer-events-none absolute top-1 ${activeTeam === 'home' ? 'right-2 text-gold' : 'left-2 text-blue-300'} text-[9px] font-bold tracking-wide opacity-80`}>
          {activeTeam === 'home' ? 'attacking →' : '← attacking'}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ticker / stats / panels
// ---------------------------------------------------------------------------
const TYPE_DOT = { goal: 'bg-gold', save: 'bg-blue-300', shot: 'bg-primary/70', chance: 'bg-emerald-300', momentum: 'bg-orange-300', card: 'bg-yellow-400', substitution: 'bg-secondary' }

function Ticker({ shown, activeId }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [shown.length])
  return (
    <div className="rounded-lg bg-card border border-border p-3 mb-3">
      <div className="text-[10px] uppercase tracking-widest text-secondary mb-2">Live commentary</div>
      <div ref={ref} className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        {shown.length === 0 && <div className="text-xs text-secondary italic">Kick-off…</div>}
        {shown.map((e) => (
          <div key={e.id} className={`fx-row-in flex items-start gap-2 text-xs rounded px-1 -mx-1 ${e.id === activeId ? 'bg-gold/10' : ''}`}>
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

// Resolved-event stats (everything updates only once an event reaches its outcome).
function computeStats(resolved, timeline, prog, hg, ag) {
  const fs = timeline.finalStats
  const ease = (v) => Math.round(v * prog)
  const cShot = (team) => resolved.filter((e) => e.team === team && e.countsShot).length
  const cOnT = (team) => resolved.filter((e) => e.team === team && e.countsShot && e.onTarget).length
  const hShots = Math.max(ease(fs.home.shots), cShot('home'))
  const aShots = Math.max(ease(fs.away.shots), cShot('away'))
  const hSot = Math.max(ease(fs.home.sot), hg, cOnT('home'))
  const aSot = Math.max(ease(fs.away.sot), ag, cOnT('away'))
  const hPoss = Math.round(50 + (fs.home.possession - 50) * prog)
  const big = (team) => resolved.filter((e) => e.team === team && (e.type === 'goal' || e.type === 'save' || e.type === 'chance')).length
  const saves = (keeper) => resolved.filter((e) => e.type === 'save' && e.team === (keeper === 'home' ? 'away' : 'home')).length
  const att = (team) => resolved.filter((e) => e.team === team && ['goal', 'shot', 'save', 'chance'].includes(e.type)).length
  const totalAtt = att('home') + att('away') || 1
  return {
    hShots, aShots, hSot, aSot, hPoss, aPoss: 100 - hPoss,
    hBig: big('home'), aBig: big('away'), hSaves: saves('home'), aSaves: saves('away'),
    momentumHome: Math.round((att('home') / totalAtt) * 100),
  }
}

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
const OUTCOME_OVERLAY = {
  goal: { text: 'GOAL', color: 'text-gold', big: true },
  save: { text: 'BIG SAVE', color: 'text-blue-200', big: true },
  shot: { text: 'SHOT', color: 'text-primary', big: false },
  chance: { text: 'CHANCE', color: 'text-emerald-200', big: false },
  momentum: { text: 'MOMENTUM SHIFT', color: 'text-orange-200', big: false },
  card: { text: 'CARD', color: 'text-yellow-200', big: false },
  substitution: { text: 'ROLE IMPACT', color: 'text-secondary', big: false },
}

export default function MatchCenter({ squad, feature, onContinue, isLast = false, teamName = 'Final XI', tactics = null }) {
  const players = useMemo(() => squad.map((s) => s.player).filter(Boolean), [squad])
  const timeline = useMemo(
    () => buildMatchTimeline(feature.match, players, feature.stageLabel, teamName, tactics),
    [feature, players, teamName, tactics],
  )
  const events = timeline.events
  const homeDots = useMemo(() => layoutHome(players), [players])
  const awayDots = useMemo(() => layoutAway(), [])
  const plans = useMemo(() => events.map(buildPlan), [events])

  const [idx, setIdx] = useState(-1)   // -1 = kick-off
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [finished, setFinished] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)

  // Event-driven state machine: advance frames within an event, then to the
  // next event. Score/stats commit only when a frame reaches the outcome.
  useEffect(() => {
    if (finished || !playing) return
    if (idx < 0) {
      const t = setTimeout(() => { setIdx(0); setFrame(0) }, 700 / speed)
      return () => clearTimeout(t)
    }
    const plan = plans[idx]
    if (!plan) return
    const last = plan.stops.length - 1
    if (frame >= last) {
      const t = setTimeout(() => {
        if (idx + 1 >= events.length) setFinished(true)
        else { setIdx(idx + 1); setFrame(0) }
      }, plan.stops[last].hold / speed)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setFrame((f) => f + 1), plan.stops[frame].hold / speed)
    return () => clearTimeout(t)
  }, [idx, frame, playing, finished, speed, plans, events.length])

  const active = idx >= 0 ? events[idx] : null
  const plan = active ? plans[idx] : null
  const clampedFrame = plan ? Math.min(frame, plan.stops.length - 1) : 0
  const atOutcome = plan ? clampedFrame >= plan.outcomeFrame : false
  const ball = plan ? plan.stops[clampedFrame].point : zonePt('center', 'home')
  const moveDur = plan ? Math.min(plan.stops[clampedFrame].hold, 700) / speed : 500

  // Resolved = events whose outcome has fired → drives score, ticker, stats.
  // When finished (naturally or via Skip), everything is fully resolved.
  const resolvedCount = finished ? events.length : (idx < 0 ? 0 : (atOutcome ? idx + 1 : idx))
  const resolved = events.slice(0, resolvedCount)
  const hg = resolved.filter((e) => e.type === 'goal' && e.team === 'home').length
  const ag = resolved.filter((e) => e.type === 'goal' && e.team === 'away').length

  // Active / keeper dot highlight for the current event.
  const { activeDotId, keeperDotId } = useMemo(() => {
    if (!active || !plan) return { activeDotId: null, keeperDotId: null }
    const pool = active.team === 'home' ? homeDots : awayDots
    let near = pool[0]
    pool.forEach((d) => { if (dist(d, plan.endPoint) < dist(near, plan.endPoint)) near = d })
    const keeper = (plan.animType === 'goal' || plan.animType === 'save') ? (active.team === 'home' ? 'away' : 'home') : null
    return { activeDotId: plan.noBall ? null : near.num, keeperDotId: keeper }
  }, [idx, active, plan, homeDots, awayDots])

  const minute = finished ? 90 : (active ? active.minute : (resolved.length ? events[resolved.length - 1].minute : 0))
  const prog = Math.min(1, (finished ? 90 : (active ? active.minute : 0)) / 90)
  const stats = computeStats(resolved, timeline, prog, hg, ag)
  const keyPlayer = timeline.potm ? shortDisplayName(timeline.potm) : null
  const oppStyle = timeline.opponentMeta ? `${timeline.away} are ${timeline.opponentMeta.style}` : null
  const verdictLine = matchVerdict(timeline)
  const tacticalNotes = tactics?.liveNotes || []
  const tacticalNote = tacticalNotes.length ? tacticalNotes[Math.floor(minute / 18) % tacticalNotes.length] : null

  // Pitch overlay/flags for the active event at its outcome moment.
  const overlay = (active && atOutcome)
    ? { ...(OUTCOME_OVERLAY[active.type] || OUTCOME_OVERLAY.substitution), sub: plan.sub, key: `${idx}` }
    : null
  const goalFlash = (active && atOutcome && plan.animType === 'goal') ? active.team : null
  const drama = !!(active && plan?.lateDrama && !finished)
  const highlight = (active && plan?.highlightZone && !finished) ? zonePt(plan.highlightZone, active.team) : null
  const ballMoving = !!(plan && !plan.noBall && clampedFrame >= 1)

  function restart() { setIdx(-1); setFrame(0); setFinished(false); setPlaying(true) }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 sm:py-7">
      <div className="text-center mb-3">
        <h2 className="text-xl sm:text-2xl font-black text-gold">Live Match Center</h2>
        <p className="text-[11px] text-secondary">A tactical replay of the match your squad already decided.</p>
      </div>

      <Scoreboard home={timeline.home} away={timeline.away} hg={hg} ag={ag} minute={minute} stageLabel={timeline.stageLabel} finished={finished} />

      {oppStyle && <p className="text-center text-[11px] text-secondary -mt-1.5 mb-1">{oppStyle}.</p>}
      {!finished && tacticalNote && <p className="text-center text-[11px] text-gold/75 mb-2">{tacticalNote}</p>}

      {!finished && <Spotlight active={active} homeName={timeline.home} awayName={timeline.away} atOutcome={atOutcome} momentumHome={stats.momentumHome} />}

      <Pitch
        homeDots={homeDots} awayDots={awayDots}
        ball={ball} moveDur={moveDur} pathPts={plan?.pathPts}
        activeTeam={active && !finished ? active.team : null}
        activeDotId={activeDotId} keeperDotId={keeperDotId}
        overlay={finished ? null : overlay} goalFlash={finished ? null : goalFlash}
        drama={drama} highlight={highlight} ballMoving={ballMoving && !finished}
        eventKey={idx}
      />

      {/* Controls (under pitch) */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        {!finished ? (
          <>
            <ControlBtn active={false} onClick={() => setPlaying((p) => !p)} className="min-w-[5rem]">{playing ? '⏸ Pause' : '▶ Play'}</ControlBtn>
            <div className="flex items-center gap-1">
              {[1, 2, 4].map((s) => (<ControlBtn key={s} active={speed === s} onClick={() => setSpeed(s)}>x{s}</ControlBtn>))}
            </div>
            <button onClick={() => { setPlaying(false); setFinished(true) }} className="ml-1 px-3 py-1.5 rounded-md text-xs font-bold border border-border bg-card text-secondary hover:text-gold fx-press">Skip to end ⏭</button>
          </>
        ) : (
          <ControlBtn active={false} onClick={restart}>↻ Replay</ControlBtn>
        )}
      </div>

      {/* Live stats preview */}
      <div className="rounded-lg bg-card border border-border p-3 mb-3">
        <StatBar label="Possession" hv={stats.hPoss} av={stats.aPoss} suffix="%" />
        <StatBar label="Shots" hv={stats.hShots} av={stats.aShots} />
        <StatBar label="On target" hv={stats.hSot} av={stats.aSot} />
      </div>

      <ToggleBtn open={showStats} onClick={() => setShowStats((o) => !o)}>{showStats ? 'Hide Full Match Stats' : 'Show Full Match Stats'}</ToggleBtn>
      {showStats && <FullStats s={stats} home={timeline.home} away={timeline.away} keyPlayer={keyPlayer} />}

      <Ticker shown={resolved} activeId={active ? active.id : null} />

      {finished && (
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

          <ToggleBtn open={showTimeline} onClick={() => setShowTimeline((o) => !o)}>{showTimeline ? 'Hide Match Timeline' : 'Show Match Timeline'}</ToggleBtn>
          {showTimeline && <TimelineList events={events} />}

          <div className="flex justify-center mt-1">
            <button onClick={() => onContinue && onContinue()} className="px-6 py-3 rounded-md font-semibold fx-press bg-gold text-black hover:bg-gold/90 w-full sm:w-auto">{isLast ? 'See Final Result →' : 'Continue to Next Match →'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
