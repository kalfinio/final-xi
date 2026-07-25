import { useState, useEffect, useMemo, useRef } from 'react'
import { shortDisplayName } from './data'
import { buildMatchTimeline, matchVerdict } from './matchTimeline'
import { projectHomeDots, layoutAwayDots } from './sequenceEngine'
import { PATTERN_LABELS, buildSeqChain, chainActiveIndex, pathSegments, spreadMarkers, outcomeBanner, placeLabels, ftBallPoint } from './matchCenterView'
import { TACTICAL_APPROACHES, approachFeedback } from './tacticalApproach'
import { UPGRADES_BY_ID } from './runUpgrades'

// ---------------------------------------------------------------------------
// 2D Match Center (Phase 2): participant-based sequence playback.
//
// Home markers come from the tactics.js role/formation marker model (projected
// by sequenceEngine — one positional source, shared with TacticalPitch's data).
// Shot-like events carry `event.seq` (real-XI touches); the animator plays them
// touch by touch: highlight actor → move ball → action text → next actor.
// Involved players move to their touch positions, one or two nearby defenders
// react, the keeper adjusts on shots, everyone eases back to shape afterwards.
// No physics — simple, readable movement only. Momentum/card/substitution
// events still use the legacy zone plan (no ball, no participants).
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

// Per-event playback plan. Sequence events: one stop per touch → outcome →
// rest. Legacy (no-ball) events keep the Phase 1 zone plan. Exported for the
// view-helper tests.
export function buildPlan(e) {
  if (e.seq) {
    const seq = e.seq
    const a = e.anim || {}
    const dramatic = e.type === 'goal' || e.type === 'save' || !!a.lateDrama
    // Phase 3: slightly tighter pacing so the denser highlight package stays
    // watchable at x1 — dead time is trimmed, football actions are not.
    const outcomeMs = e.type === 'goal' ? 1800 : e.type === 'save' ? 1400 : a.lateDrama ? 1100 : 780
    const stops = seq.touches.map((t, i) => ({
      point: t.at,
      hold: i === 0 ? 560 : 640,
      kind: 'touch',
      touchIdx: i,
      text: t.text,
      actorKey: t.playerId != null ? `h${t.playerId}` : `a${t.awayNum}`,
      actorName: t.playerName,
    }))
    const outcomeFrame = stops.length
    const last = seq.touches[seq.touches.length - 1]
    stops.push({
      point: seq.outcome.at, hold: outcomeMs, kind: 'outcome',
      actorKey: last.playerId != null ? `h${last.playerId}` : `a${last.awayNum}`,
      actorName: last.playerName,
    })
    stops.push({ point: zonePt('center', e.team), hold: dramatic ? 560 : 380, kind: 'rest' })
    return {
      seq, stops, outcomeFrame, noBall: false, dramatic,
      lateDrama: !!a.lateDrama, animType: a.animType || e.type,
      label: a.visualLabel, sub: a.subLabel, endPoint: seq.outcome.at,
      highlightZone: null,
    }
  }
  // Legacy zone plan — momentum / card / substitution (no ball, no actors).
  const a = e.anim
  const team = e.team
  const noBall = true
  const pts = [zonePt('center', team), zonePt('center', team)]
  const stops = [{ point: pts[0], hold: 460, kind: 'build' }]
  const outcomeFrame = stops.length
  stops.push({ point: pts[pts.length - 1], hold: 1050, kind: 'outcome' })
  stops.push({ point: zonePt('center', team), hold: 460, kind: 'rest' })
  return {
    seq: null, stops, outcomeFrame, noBall, dramatic: false, lateDrama: false,
    animType: a.animType, label: a.visualLabel, sub: a.subLabel,
    endPoint: pts[pts.length - 1], pathPts: null, highlightZone: a.highlightZone,
  }
}

// Displayed marker positions for the current frame: involved players at their
// touch spots, uninvolved attackers lean toward their in-possession shape,
// 1–2 nearest defenders react to the ball, keeper adjusts on shots, and
// everyone returns to base on rest/finish.
function displayDots(baseHome, baseAway, plan, frame, finished) {
  const home = baseHome.map((d) => ({ ...d }))
  const away = baseAway.map((d) => ({ ...d }))
  const stop = plan?.stops?.[frame]
  if (!plan?.seq || finished || !stop || stop.kind === 'rest') return { home, away }

  const seq = plan.seq
  const atOutcome = frame >= plan.outcomeFrame
  const curTouch = atOutcome ? seq.touches.length - 1 : Math.min(frame, seq.touches.length - 1)
  const ball = stop.point

  // Involved players: at (or pre-moving toward) their touch positions.
  seq.touches.forEach((t, i) => {
    if (i > curTouch + 1) return
    if (t.playerId != null) {
      const d = home.find((x) => x.id === t.playerId)
      if (d) { d.x = t.at.x; d.y = t.at.y }
    } else if (t.awayNum != null) {
      const d = away.find((x) => x.num === t.awayNum)
      if (d) { d.x = t.at.x; d.y = t.at.y }
    }
  })

  const attacking = seq.team
  const involved = new Set(seq.touches.slice(0, curTouch + 2).map((t) => (t.playerId != null ? `h${t.playerId}` : `a${t.awayNum}`)))

  if (attacking === 'home') {
    // Uninvolved home attackers/mids lean into the in-possession shape.
    home.forEach((d) => {
      if (d.gk || involved.has(`h${d.id}`)) return
      d.x = (d.x + d.possX) / 2
      d.y = (d.y + d.possY) / 2
    })
    // Two nearest away outfielders shift toward the ball; keeper adjusts on shots.
    reactDefenders(away, ball, atOutcome, plan)
  } else {
    reactDefenders(home, ball, atOutcome, plan)
  }
  // Display-only de-overlap pass (deterministic, bounded) so clustered
  // markers and their name labels stay readable around the box. Tactical
  // coordinates are untouched; markers ease back once positions separate.
  const spread = spreadMarkers([...home, ...away])
  return { home: spread.slice(0, home.length), away: spread.slice(home.length) }
}

function reactDefenders(defs, ball, atOutcome, plan) {
  const outfield = defs.filter((d) => !d.gk)
  outfield
    .map((d) => ({ d, dd: dist(d, ball) }))
    .sort((a, b) => a.dd - b.dd)
    .slice(0, 2)
    .forEach(({ d, dd }) => {
      if (dd < 1) return
      const k = Math.min(3.2, dd) / dd
      d.x += (ball.x - d.x) * k * 0.4
      d.y += (ball.y - d.y) * k * 0.4
    })
  const gk = defs.find((d) => d.gk)
  if (gk && atOutcome && plan.seq && ['goal', 'save', 'shot_on', 'shot_off'].includes(plan.seq.outcome.type)) {
    gk.y = Math.max(24, Math.min(40, ball.y))
  }
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

function Spotlight({ active, homeName, awayName, atOutcome, momentumHome, liveAction, chain, chainPos, patternLabel }) {
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
      {/* Live play-by-play during the sequence; the resolved story at the outcome. */}
      <div className="text-xs text-secondary leading-snug">{!atOutcome && liveAction ? liveAction : active.description}</div>
      {/* Compact sequence chain: pattern + actors (done · CURRENT · next). */}
      {chain && chain.length > 1 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-tight">
          {patternLabel && <span className="mr-1 px-1.5 py-0.5 rounded border border-gold/30 text-gold/80 text-[9px] font-bold tracking-wide uppercase">{patternLabel}</span>}
          {chain.map((c, i) => (
            <span key={i} className="flex items-center gap-x-1 min-w-0">
              {i > 0 && <span className="text-secondary/50">→</span>}
              <span className={`truncate max-w-[7rem] ${i < chainPos ? 'text-secondary/60' : i === chainPos ? 'text-gold font-bold' : 'text-secondary'}`}>{c.name}</span>
            </span>
          ))}
        </div>
      )}
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
function Dot({ d, active, keeper, dim, label, labelTone, labelPos }) {
  const fill = d.gk ? (d.side === 'home' ? '#c9a84c' : '#f87171') : (d.side === 'home' ? '#f5f5f5' : '#3b82f6')
  // Temporary name label for the active participant (and, subtler, the next
  // receiver / the keeper on saves). Position comes from the deterministic
  // placeLabels pass (above/below/left/right, collision- and bounds-aware).
  const dx = labelPos?.dx ?? 0
  const dy = labelPos?.dy ?? -3.6
  const labelFill = labelTone === 'active' ? '#c9a84c' : labelTone === 'keeper' ? '#e2e8f0' : '#cbd5e1'
  return (
    <g className="fx-dotm" style={{ transform: `translate(${d.x}px, ${d.y}px)` }} opacity={dim ? 0.45 : 1}>
      {(active || keeper) && <circle className="fx-dot-pulse" cx="0" cy="0" r="3.3" fill="none" stroke="#c9a84c" strokeWidth="0.6" />}
      <circle cx="0" cy="0" r="2.1" fill={fill} stroke="#0c1a10" strokeWidth="0.4" />
      <text x="0" y="0.8" textAnchor="middle" fontSize="2.1" fontWeight="700" fill="#0c1a10">{d.num}</text>
      {label && (
        <text
          x={dx} y={dy} textAnchor="middle" fontSize="2.5" fontWeight="800"
          fill={labelFill} stroke="#0c1a10" strokeWidth="0.55" style={{ paintOrder: 'stroke' }}
          opacity={labelTone === 'next' ? 0.75 : 1}
        >{label}</text>
      )}
    </g>
  )
}

// Tone styles for the compact outcome banner (dark/gold identity preserved).
const BANNER_TONE = {
  goal: { box: 'border-gold/60', title: 'text-gold' },
  save: { box: 'border-blue-400/50', title: 'text-blue-200' },
  miss: { box: 'border-border', title: 'text-primary' },
  chance: { box: 'border-emerald-400/40', title: 'text-emerald-200' },
  card: { box: 'border-yellow-400/50', title: 'text-yellow-200' },
  neutral: { box: 'border-orange-400/40', title: 'text-orange-200' },
}

function Pitch({ homeDots, awayDots, ball, moveDur, segments, segKey, activeTeam, activeKey, activeName, nextKey, nextName, keeperSide, keeperName, banner, goalFlash, drama, highlight, eventKey }) {
  // Deterministic, collision-aware label placement (priority: active → keeper → next).
  const allDots = [...homeDots.map((d) => ({ d, key: `h${d.id}` })), ...awayDots.map((d) => ({ d, key: `a${d.num}` }))]
  const requests = []
  const findDot = (key) => allDots.find((x) => x.key === key)?.d
  if (activeKey && activeName) { const d = findDot(activeKey); if (d) requests.push({ key: activeKey, name: activeName, x: d.x, y: d.y }) }
  if (keeperSide && keeperName) {
    const gkDot = (keeperSide === 'home' ? homeDots : awayDots).find((d) => d.gk)
    if (gkDot) requests.push({ key: keeperSide === 'home' ? `h${gkDot.id}` : `a${gkDot.num}`, name: keeperName, x: gkDot.x, y: gkDot.y })
  }
  if (nextKey && nextName) { const d = findDot(nextKey); if (d) requests.push({ key: nextKey, name: nextName, x: d.x, y: d.y }) }
  const placements = placeLabels(requests)
  const dotLabel = (key, d) => {
    if (key === activeKey && activeName) return { label: activeName, tone: 'active', pos: placements[key] }
    if (d.gk && keeperSide === d.side && keeperName) return { label: keeperName, tone: 'keeper', pos: placements[key] }
    if (key === nextKey && nextName) return { label: nextName, tone: 'next', pos: placements[key] }
    return { label: null, tone: null, pos: null }
  }
  const tone = banner ? (BANNER_TONE[banner.tone] || BANNER_TONE.neutral) : null
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

        {/* travelled path — dim: "where the ball has been" */}
        {segments?.completed && (
          <polyline points={segments.completed} fill="none" stroke="#c9a84c" strokeOpacity="0.26" strokeWidth="0.55" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1.4 1.8" />
        )}
        {/* current pass — bright, arrowed: "where the ball is moving now" */}
        {segments?.current && (
          <line
            key={`seg-${eventKey}-${segKey}`} className="fx-path"
            x1={segments.current.x1} y1={segments.current.y1} x2={segments.current.x2} y2={segments.current.y2}
            stroke="#c9a84c" strokeOpacity="0.95" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="2.6 2" markerEnd="url(#fxArrow)"
          />
        )}

        {/* dots */}
        {awayDots.map((d) => {
          const { label, tone: lt, pos } = dotLabel(`a${d.num}`, d)
          return <Dot key={`a${d.num}`} d={d} active={activeKey === `a${d.num}`} keeper={d.gk && keeperSide === 'away'} dim={activeTeam === 'home'} label={label} labelTone={lt} labelPos={pos} />
        })}
        {homeDots.map((d) => {
          const { label, tone: lt, pos } = dotLabel(`h${d.id}`, d)
          return <Dot key={`h${d.id}`} d={d} active={activeKey === `h${d.id}`} keeper={d.gk && keeperSide === 'home'} dim={activeTeam === 'away'} label={label} labelTone={lt} labelPos={pos} />
        })}

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

      {/* compact outcome banner — top edge, never covers the final movement */}
      {banner && (
        <div key={`bn-${eventKey}`} className={`fx-banner pointer-events-none absolute top-1.5 left-1/2 z-10 max-w-[94%] px-3 py-1 rounded-md border bg-black/75 text-center ${tone.box}`}>
          <div className="flex items-baseline justify-center gap-1.5 min-w-0">
            <span className={`font-black tracking-tight text-sm sm:text-base ${tone.title}`}>{banner.title}</span>
            {banner.detail && <span className="truncate text-[10px] sm:text-xs font-bold text-primary/90 uppercase tracking-wide">{banner.detail}</span>}
          </div>
          {banner.sub && <div className="truncate text-[9px] sm:text-[10px] text-secondary leading-tight">{banner.sub}</div>}
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

// Progressive live stats reconciled to the canonical MatchDetail totals.
//
// Strategy (documented): the timeline shows selected highlights, not every
// canonical shot, so live numbers use time-eased progression toward
// timeline.finalStats (the canonical MatchDetail values), FLOORED by the
// resolved-event counts and CAPPED at the canonical totals. The timeline's
// budget accounting guarantees resolved counts never exceed those totals, and
// at full time (prog = 1) every number equals MatchDetail exactly. Big
// chances are now event-driven too: sequences carry canonical big-chance
// flags (assigned within the detail.bigChances budget), so most stat changes
// are explained by a resolved sequence; the eased floor only covers the
// residual un-visualized share. Exported for the cross-view tests.
export function computeStats(resolved, timeline, prog, hg, ag) {
  const fs = timeline.finalStats
  const ease = (v) => Math.round(v * prog)
  // progressive value: eased toward `fin`, never below observed events, never above canonical
  const live = (fin, counted) => Math.min(fin, Math.max(ease(fin), counted))
  const cShot = (team) => resolved.filter((e) => e.team === team && e.countsShot).length
  const cOnT = (team) => resolved.filter((e) => e.team === team && e.countsShot && e.onTarget).length
  // resolved saves BY a team = opponent's resolved on-target shots that didn't score
  const cSaves = (team) => resolved.filter((e) => e.team !== team && e.countsShot && e.onTarget && e.type !== 'goal').length
  // resolved big chances = sequences flagged within the canonical budget
  const cBig = (team) => resolved.filter((e) => e.team === team && e.big).length
  const hShots = live(fs.home.shots, cShot('home'))
  const aShots = live(fs.away.shots, cShot('away'))
  const hSot = live(fs.home.sot, Math.max(hg, cOnT('home')))
  const aSot = live(fs.away.sot, Math.max(ag, cOnT('away')))
  const hSaves = live(fs.home.saves, cSaves('home'))
  const aSaves = live(fs.away.saves, cSaves('away'))
  const hBig = live(fs.home.bigChances, cBig('home'))
  const aBig = live(fs.away.bigChances, cBig('away'))
  const hPoss = Math.round(50 + (fs.home.possession - 50) * prog)
  // momentum is visual flair (not a canonical hard stat) — unchanged.
  const att = (team) => resolved.filter((e) => e.team === team && ['goal', 'shot', 'save', 'chance'].includes(e.type)).length
  const totalAtt = att('home') + att('away') || 1
  return {
    hShots, aShots, hSot, aSot, hPoss, aPoss: 100 - hPoss,
    hBig, aBig, hSaves, aSaves,
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
export default function MatchCenter({ squad, feature, onContinue, isLast = false, teamName = 'Final XI', tactics = null }) {
  const players = useMemo(() => squad.map((s) => s.player).filter(Boolean), [squad])
  const timeline = useMemo(
    () => buildMatchTimeline(feature.match, players, feature.stageLabel, teamName, tactics, squad),
    [feature, players, teamName, tactics, squad],
  )
  const events = timeline.events
  // Home shape: tactics.js role/formation markers projected onto the 2D pitch.
  const baseHome = useMemo(() => projectHomeDots(squad, tactics?.flags?.exposed ? 0.4 : 1), [squad, tactics])
  const baseAway = useMemo(() => layoutAwayDots(), [])
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
  const curStop = plan ? plan.stops[clampedFrame] : null
  const moveDur = curStop ? Math.min(curStop.hold, 700) / speed : 500

  // Resolved = events whose outcome has fired → drives score, ticker, stats.
  // When finished (naturally or via Skip), everything is fully resolved.
  const resolvedCount = finished ? events.length : (idx < 0 ? 0 : (atOutcome ? idx + 1 : idx))
  const resolved = events.slice(0, resolvedCount)
  const hg = resolved.filter((e) => e.type === 'goal' && e.team === 'home').length
  const ag = resolved.filter((e) => e.type === 'goal' && e.team === 'away').length

  // Marker positions for this frame (sequence movement + defensive reaction).
  const { home: homeDots, away: awayDots } = useMemo(
    () => displayDots(baseHome, baseAway, plan, clampedFrame, finished),
    [baseHome, baseAway, plan, clampedFrame, finished],
  )

  // Ball position — on rest frames it nudges deterministically off any marker
  // sitting near the centre spot (bug 10C); marker coordinates never move.
  const ballRaw = curStop ? curStop.point : zonePt('center', 'home')
  const ball = !curStop || curStop.kind === 'rest'
    ? ftBallPoint([...homeDots, ...awayDots], ballRaw)
    : ballRaw

  // Active actor + keeper highlight + name labels for the current frame. The
  // labels, ball, highlight ring, spotlight text and chain all read the same
  // stop, so they always tell one story.
  const activeKey = !finished ? (curStop?.actorKey ?? null) : null
  const activeName = !finished ? (curStop?.actorName ?? null) : null
  const keeperSide = !finished && atOutcome && plan?.seq && ['goal', 'save', 'shot_on'].includes(plan.seq.outcome.type)
    ? (active.team === 'home' ? 'away' : 'home')
    : null
  const gkPlayer = players.find((p) => p.posType === 'GK')
  const keeperName = keeperSide === 'home' ? (gkPlayer ? shortDisplayName(gkPlayer.name) : 'Keeper') : keeperSide === 'away' ? 'Keeper' : null
  const nextStop = plan && !finished && curStop?.kind === 'touch' ? plan.stops[clampedFrame + 1] : null
  const nextKey = nextStop?.kind === 'touch' && nextStop.actorKey !== activeKey ? nextStop.actorKey : null
  const nextName = nextKey ? nextStop.actorName : null

  const minute = finished ? 90 : (active ? active.minute : (resolved.length ? events[resolved.length - 1].minute : 0))
  const prog = Math.min(1, (finished ? 90 : (active ? active.minute : 0)) / 90)
  const stats = computeStats(resolved, timeline, prog, hg, ag)
  const keyPlayer = timeline.potm ? shortDisplayName(timeline.potm) : null
  const oppStyle = timeline.opponentMeta ? `${timeline.away} are ${timeline.opponentMeta.style}` : null
  const verdictLine = timeline.verdict || matchVerdict(timeline) // canonical detail.verdict
  const tacticalNotes = tactics?.liveNotes || []
  const tacticalNote = tacticalNotes.length ? tacticalNotes[Math.floor(minute / 18) % tacticalNotes.length] : null
  // Canonical approach-aware note (Phase 4) — one helper, shared with the
  // Post Match Card; reasoning comes from the stored matchup + real stats.
  const ftTacticalNote = approachFeedback({
    approach: feature.match.approach || 'balanced',
    matchup: feature.match.matchup,
    detail: feature.match.detail,
    result: feature.match.result,
  }) || tactics?.postNote || null
  const approachName = feature.match.approach && feature.match.approach !== 'balanced'
    ? TACTICAL_APPROACHES[feature.match.approach]?.name
    : null
  // FT summary (Phase 6.1): the locked approach + only the upgrades that
  // actually fired this match — canonical names, no condition recompute.
  const ftApproachName = TACTICAL_APPROACHES[feature.match.approach || 'balanced']?.name || 'Balanced'
  const ftActiveUpgrades = (feature.match.activeUpgrades || [])
    .map((id) => UPGRADES_BY_ID[id]?.name).filter(Boolean)

  // Pitch flags for the active event at its outcome moment. The compact
  // banner derives strictly from the canonical event/sequence outcome.
  const banner = (active && atOutcome && !finished) ? outcomeBanner(active) : null
  const goalFlash = (active && atOutcome && active.type === 'goal') ? active.team : null
  const drama = !!(active && plan?.lateDrama && !finished)
  const highlight = (active && plan?.highlightZone && !finished) ? zonePt(plan.highlightZone, active.team) : null
  // Path split: dim travelled segments vs one bright current segment; future
  // segments stay hidden until played.
  const segments = plan && !plan.noBall && !finished ? pathSegments(plan.stops, clampedFrame) : null
  const liveAction = !finished && curStop?.kind === 'touch' ? curStop.text : null
  // Compact sequence chain (pattern + actors), derived from event.seq.
  const chain = active?.seq && !finished ? buildSeqChain(active.seq) : null
  const chainPos = chain ? chainActiveIndex(chain, curStop?.kind === 'touch' ? curStop.touchIdx : Infinity) : -1
  const patternLabel = active?.seq ? (PATTERN_LABELS[active.seq.pattern] || active.seq.pattern) : null

  function restart() { setIdx(-1); setFrame(0); setFinished(false); setPlaying(true) }

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 sm:py-7">
      <div className="text-center mb-3">
        <h2 className="text-xl sm:text-2xl font-black text-gold">Live Match Center</h2>
        <p className="text-[11px] text-secondary">A tactical replay of the match your squad already decided.</p>
      </div>

      <Scoreboard home={timeline.home} away={timeline.away} hg={hg} ag={ag} minute={minute} stageLabel={timeline.stageLabel} finished={finished} />

      {!finished ? (
        <>
          {oppStyle && <p className="text-center text-[11px] text-secondary -mt-1.5 mb-1">{oppStyle}.{approachName ? <span className="text-gold/70"> Approach: {approachName}.</span> : null}</p>}
          {tacticalNote && <p className="text-center text-[11px] text-gold/75 mb-2">{tacticalNote}</p>}

          <Spotlight active={active} homeName={timeline.home} awayName={timeline.away} atOutcome={atOutcome} momentumHome={stats.momentumHome} liveAction={liveAction} chain={chain} chainPos={chainPos} patternLabel={patternLabel} />

          <Pitch
            homeDots={homeDots} awayDots={awayDots}
            ball={ball} moveDur={moveDur}
            segments={segments} segKey={clampedFrame}
            activeTeam={active ? active.team : null}
            activeKey={activeKey} activeName={activeName}
            nextKey={nextKey} nextName={nextName}
            keeperSide={keeperSide} keeperName={keeperName}
            banner={banner} goalFlash={goalFlash}
            drama={drama} highlight={highlight}
            eventKey={idx}
          />

          {/* Controls (under pitch) */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
            <ControlBtn active={false} onClick={() => setPlaying((p) => !p)} className="min-w-[5rem]">{playing ? '⏸ Pause' : '▶ Play'}</ControlBtn>
            <div className="flex items-center gap-1">
              {[1, 2, 4].map((s) => (<ControlBtn key={s} active={speed === s} onClick={() => setSpeed(s)}>x{s}</ControlBtn>))}
            </div>
            <button onClick={() => { setPlaying(false); setFinished(true) }} className="ml-1 px-3 py-1.5 rounded-md text-xs font-bold border border-border bg-card text-secondary hover:text-gold fx-press">Skip to end</button>
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
        </>
      ) : (
        <>
          {/* Full time: compact summary first, primary CTA early, everything
              else collapses. The pitch lives behind "Replay Match". */}
          <div className="rounded-lg bg-card border border-border p-4 mb-3 text-center">
            {verdictLine && <div className="text-lg font-black text-gold tracking-tight mb-1">“{verdictLine}”</div>}
            {timeline.pens && <p className="text-xs text-secondary mb-1">Penalty shootout: {timeline.pens.score} — {timeline.pens.won ? 'won' : 'lost'}</p>}
            {ftTacticalNote && <div className="text-[11px] text-gold/70 mb-1 px-2">{ftTacticalNote}</div>}
            {keyPlayer && <div className="text-[11px] text-secondary">Key player: <span className="text-primary font-semibold">{keyPlayer}</span></div>}
            <div className="mt-2 pt-2 border-t border-border flex flex-col items-center gap-0.5">
              <div className="text-[10px] text-secondary"><span className="uppercase tracking-wide text-secondary/80">Match plan</span> <span className="text-primary font-semibold">{ftApproachName}</span></div>
              {ftActiveUpgrades.length > 0 && (
                <div className="text-[10px] text-secondary"><span className="uppercase tracking-wide text-secondary/80">Upgrades active</span> <span className="text-gold font-semibold">{ftActiveUpgrades.join(' · ')}</span></div>
              )}
            </div>
          </div>

          <div className="mb-4">
            <button onClick={() => onContinue && onContinue()} className="w-full px-6 py-3 rounded-md font-semibold fx-press bg-gold text-black hover:bg-gold/90">{isLast ? 'See Final Result →' : 'Continue to Next Match →'}</button>
          </div>

          <div className="rounded-lg bg-card border border-border p-3 mb-3">
            <StatBar label="Possession" hv={stats.hPoss} av={stats.aPoss} suffix="%" />
            <StatBar label="Shots" hv={stats.hShots} av={stats.aShots} />
            <StatBar label="On target" hv={stats.hSot} av={stats.aSot} />
          </div>

          <ToggleBtn open={showStats} onClick={() => setShowStats((o) => !o)}>{showStats ? 'Hide Full Match Stats' : 'Show Full Match Stats'}</ToggleBtn>
          {showStats && <FullStats s={stats} home={timeline.home} away={timeline.away} keyPlayer={keyPlayer} />}

          <ToggleBtn open={showTimeline} onClick={() => setShowTimeline((o) => !o)}>{showTimeline ? 'Hide Match Timeline' : 'Show Match Timeline'}</ToggleBtn>
          {showTimeline && <TimelineList events={events} />}

          <div className="flex justify-center">
            <ControlBtn active={false} onClick={restart}>↻ Replay Match</ControlBtn>
          </div>
        </>
      )}
    </div>
  )
}
