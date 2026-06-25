import { useState, useMemo } from 'react'
import { shortDisplayName, squadDisplayName } from './data'
import { buildMatchTimeline, matchVerdict } from './matchTimeline'

// Public stage names (the sim stores 'Quarter-final'/'Semi-final' lowercase).
const STAGE_DISPLAY = {
  'League Phase': 'League Phase',
  'Knockout Play-Off': 'Knockout Play-Off',
  'Round of 16': 'Round of 16',
  'Quarter-final': 'Quarter-Final',
  'Semi-final': 'Semi-Final',
  'Final': 'Final',
}
const DIFF_STYLE = {
  Easy: 'text-success border-success/40 bg-success/10',
  Balanced: 'text-gold border-gold/40 bg-gold/10',
  Dangerous: 'text-orange-300 border-orange-400/40 bg-orange-500/10',
  Elite: 'text-danger border-danger/40 bg-danger/10',
}
const TYPE_DOT = { goal: 'bg-gold', save: 'bg-blue-300', shot: 'bg-primary/70', chance: 'bg-emerald-300', momentum: 'bg-orange-300', card: 'bg-yellow-400', substitution: 'bg-secondary' }

// ---------------------------------------------------------------------------
// Run data: turn a finished simulation into an ordered list of playable matches.
// (League 1..8 → Knockout Play-Off? → knockout rounds.) No matches are invented;
// it only walks the matches the simulation already produced.
// ---------------------------------------------------------------------------
export function buildRunMatches(result) {
  if (!result) return []
  const list = []
  const league = result.leaguePhase?.matches || []
  league.forEach((m, i) => list.push({ match: m, kind: 'league', stageLabel: 'League Phase', matchNo: i + 1, leagueTotal: league.length }))
  if (result.playoff) list.push({ match: result.playoff, kind: 'ko', stageLabel: 'Knockout Play-Off' })
  ;(result.knockouts || []).forEach((m) => list.push({ match: m, kind: 'ko', stageLabel: m.round }))
  return list
}

// Running W-D-L + goals from the matches already played.
export function runRecord(items) {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0
  items.forEach(({ match }) => {
    gf += match.gf; ga += match.ga
    if (match.result === 'win' || match.result === 'pens-win') w++
    else if (match.result === 'loss' || match.result === 'pens-loss') l++
    else d++
  })
  return { w, d, l, gf, ga }
}

export function stageDisplay(item) {
  if (item.kind === 'league') return { stage: 'League Phase', label: `League Match ${item.matchNo} of ${item.leagueTotal}` }
  const d = STAGE_DISPLAY[item.stageLabel] || item.stageLabel
  return { stage: d, label: d }
}

// Short scoreboard label fed to the Match Center for this match.
export function mcStageLabel(item) {
  if (item.kind === 'league') return `League Match ${item.matchNo}`
  return STAGE_DISPLAY[item.stageLabel] || item.stageLabel
}

// Pre-match difficulty flavour from opponent strength + round (no result spoiler).
export function predictedDifficulty(item) {
  const s = item.match.opponentMeta?.strength ?? 80
  let score = s >= 88 ? 4 : s >= 83 ? 3 : s >= 76 ? 2 : 1
  if (item.kind === 'ko' && (item.stageLabel === 'Semi-final' || item.stageLabel === 'Final')) score = Math.min(4, score + 1)
  return ['', 'Easy', 'Balanced', 'Dangerous', 'Elite'][score]
}

function RunBtn({ children, onClick, variant = 'gold', className = '' }) {
  const styles = variant === 'gold'
    ? 'bg-gold text-black hover:bg-gold/90'
    : variant === 'ghost'
      ? 'bg-card text-primary border border-border hover:border-gold'
      : 'bg-surface text-secondary border border-border hover:text-primary'
  return <button onClick={onClick} className={`px-5 py-3 rounded-md font-semibold fx-press ${styles} ${className}`}>{children}</button>
}

// ---------------------------------------------------------------------------
// Match Hub — shown before every match.
// ---------------------------------------------------------------------------
export function MatchHub({ item, teamName, record, matchIndex, total, onWatch, onQuick, onSimAll }) {
  const { stage, label } = stageDisplay(item)
  const meta = item.match.opponentMeta
  const diff = predictedDifficulty(item)
  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-center mb-1"><span className="text-[10px] uppercase tracking-widest text-gold/80">European Run · Match {matchIndex + 1} of {total}</span></div>
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">{stage}</h2>
      <p className="text-center text-secondary text-sm mb-5">{label}</p>

      <div className="rounded-lg bg-card border border-border p-4 mb-4">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="flex-1 text-right min-w-0"><div className="font-black text-base sm:text-lg truncate text-primary">{teamName}</div><div className="text-[10px] text-secondary">You</div></div>
          <div className="shrink-0 text-secondary font-bold text-sm">vs</div>
          <div className="flex-1 text-left min-w-0"><div className="font-black text-base sm:text-lg truncate text-blue-300">{meta?.name || item.match.opponent}</div><div className="text-[10px] text-secondary truncate capitalize">{meta ? meta.archetype : 'opponent'}</div></div>
        </div>
        {meta?.style && <p className="text-center text-[11px] text-secondary mb-3">{meta.name} — {meta.style}.</p>}
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-secondary">Predicted difficulty</span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${DIFF_STYLE[diff]}`}>{diff}</span>
        </div>
      </div>

      <div className="rounded-lg bg-surface border border-border p-3 mb-5 text-center text-sm">
        <span className="text-secondary">Run record </span>
        <span className="font-bold text-primary">{record.w}W-{record.d}D-{record.l}L</span>
        <span className="text-secondary mx-2">·</span>
        <span className="text-secondary">Goals </span><span className="font-bold text-primary">{record.gf}–{record.ga}</span>
      </div>

      <div className="flex flex-col gap-3">
        <RunBtn onClick={onWatch} className="w-full">▶ Watch Match</RunBtn>
        <div className="flex flex-col sm:flex-row gap-3">
          <RunBtn onClick={onQuick} variant="ghost" className="w-full sm:flex-1">⏩ Quick Sim</RunBtn>
          <RunBtn onClick={onSimAll} variant="surface" className="w-full sm:flex-1">⏭ Sim All to Final Result</RunBtn>
        </div>
      </div>
    </div>
  )
}

function StatRow3({ label, h, a }) {
  const hn = parseFloat(h), an = parseFloat(a)
  const tot = (hn + an) || 1
  const hp = Math.round((hn / tot) * 100)
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="font-semibold text-primary tabular-nums">{h}</span>
        <span className="text-secondary uppercase tracking-wide text-[9px]">{label}</span>
        <span className="font-semibold text-blue-300 tabular-nums">{a}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg overflow-hidden flex">
        <div className="h-full bg-gold" style={{ width: `${hp}%` }} />
        <div className="h-full bg-blue-500/70" style={{ width: `${100 - hp}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post-match card — shown after Quick Sim (and after a watched match continues).
// ---------------------------------------------------------------------------
export function PostMatchCard({ squad, item, teamName, tactics, isLast, onContinue }) {
  const players = useMemo(() => squad.map((s) => s.player).filter(Boolean), [squad])
  const { stage } = stageDisplay(item)
  const m = item.match
  const tl = useMemo(() => buildMatchTimeline(m, players, mcStageLabel(item), teamName, tactics), [m, players, item, teamName, tactics])
  const [open, setOpen] = useState(false)

  const verdict = matchVerdict({ gf: m.gf, ga: m.ga, result: m.result, pens: m.pens })
  const keyPlayer = m.stats?.potm ? shortDisplayName(m.stats.potm) : null
  const squadNames = new Set(players.map((p) => p.name))
  const firstUs = (m.events || []).find((e) => e.side === 'us')
  const keyEvent = (m.events || []).length === 0
    ? 'A tight, goalless battle'
    : firstUs
      ? `${squadDisplayName(firstUs.scorer, squadNames)} on the scoresheet`
      : `${m.opponent} found the net`
  const fs = tl.finalStats
  const won = m.result === 'win' || m.result === 'pens-win'
  const lost = m.result === 'loss' || m.result === 'pens-loss'

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-center mb-1"><span className="text-[10px] uppercase tracking-widest text-gold/80">{stage} · Full time</span></div>
      <div className="flex items-center justify-center gap-3 sm:gap-5 mb-1">
        <div className="flex-1 text-right min-w-0"><div className="font-black text-sm sm:text-lg truncate text-primary">{teamName}</div></div>
        <div className="shrink-0 px-3 py-1 rounded-md bg-bg border border-border">
          <span className={`font-black text-2xl sm:text-3xl tabular-nums ${won ? 'text-gold' : lost ? 'text-danger' : 'text-primary'}`}>{m.gf}</span>
          <span className="font-black text-xl text-secondary mx-1.5">–</span>
          <span className="font-black text-2xl sm:text-3xl tabular-nums text-primary">{m.ga}</span>
        </div>
        <div className="flex-1 text-left min-w-0"><div className="font-black text-sm sm:text-lg truncate text-blue-300">{m.opponent}</div></div>
      </div>
      {m.pens && <p className="text-center text-xs text-secondary mb-1">Penalty shootout: {m.pens.score} — {m.pens.won ? 'won' : 'lost'}</p>}
      {verdict && <div className="text-center text-base font-black text-gold tracking-tight mb-3">“{verdict}”</div>}

      <div className="rounded-lg bg-card border border-border p-3 mb-3 space-y-1.5 text-xs">
        <div className="flex justify-between gap-3"><span className="text-secondary shrink-0">Key event</span><span className="font-semibold text-primary text-right">{keyEvent}</span></div>
        <div className="flex justify-between gap-3"><span className="text-secondary shrink-0">Key player</span><span className="font-semibold text-gold text-right">{keyPlayer || '—'}</span></div>
        {tactics?.postNote && <div className="flex justify-between gap-3"><span className="text-secondary shrink-0">Tactical note</span><span className="text-gold/80 text-right">{tactics.postNote}</span></div>}
      </div>

      <div className="rounded-lg bg-card border border-border p-3 mb-3">
        <StatRow3 label="Possession" h={`${fs.home.possession}%`} a={`${fs.away.possession}%`} />
        <StatRow3 label="Shots" h={fs.home.shots} a={fs.away.shots} />
        <StatRow3 label="On target" h={fs.home.sot} a={fs.away.sot} />
      </div>

      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface text-left fx-press mb-3">
        <span className="text-xs font-semibold text-primary">{open ? 'Hide full timeline' : 'Show full timeline'}</span>
        <span className="text-secondary text-sm">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="rounded-lg bg-card border border-border p-3 mb-3">
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {tl.events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 font-mono text-gold/70 w-7 text-right">{e.minute}'</span>
                <span className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${e.type === 'card' && e.red ? 'bg-red-500' : TYPE_DOT[e.type] || 'bg-secondary'}`} />
                <span className="min-w-0"><span className={`font-semibold ${e.type === 'goal' ? 'text-gold' : e.team === 'home' ? 'text-primary' : 'text-blue-300'}`}>{e.title}</span><span className="text-secondary"> — {e.description}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center">
        <RunBtn onClick={onContinue} className="w-full sm:w-auto">{isLast ? 'See Final Result →' : 'Continue to Next Match →'}</RunBtn>
      </div>
    </div>
  )
}
