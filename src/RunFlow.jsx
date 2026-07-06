import { useState, useMemo } from 'react'
import { shortDisplayName, squadDisplayName } from './data'
import { buildMatchTimeline, matchVerdict } from './matchTimeline'
import { TACTICAL_APPROACHES, APPROACH_KEYS, approachTradeoffs, approachEmphasis, approachFit, approachFeedback } from './tacticalApproach'

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
const MATCHUP_STYLE = {
  'Strong Edge': 'text-success border-success/40 bg-success/10',
  'Slight Edge': 'text-success border-success/30 bg-success/5',
  Even: 'text-gold border-gold/40 bg-gold/10',
  'Slight Concern': 'text-orange-300 border-orange-400/40 bg-orange-500/10',
  'Difficult Matchup': 'text-danger border-danger/40 bg-danger/10',
}

// Running W-D-L + goals from the matches already resolved (Phase 4: the run
// is resolved match by match, so this takes the controller's matches array).
export function runRecord(matches) {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0
  matches.forEach((match) => {
    gf += match.gf; ga += match.ga
    if (match.result === 'win' || match.result === 'pens-win') w++
    else if (match.result === 'loss' || match.result === 'pens-loss') l++
    else d++
  })
  return { w, d, l, gf, ga }
}

// Wrap a resolved match in the item shape the post-match views expect.
export function itemForMatch(match) {
  return match.type === 'league'
    ? { match, kind: 'league', stageLabel: 'League Phase', matchNo: match.matchNo, leagueTotal: 8 }
    : { match, kind: 'ko', stageLabel: match.round }
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
export function predictedDifficulty(pending) {
  const s = pending.opponentMeta?.strength ?? 80
  let score = s >= 88 ? 4 : s >= 83 ? 3 : s >= 76 ? 2 : 1
  if (pending.kind === 'ko' && (pending.round === 'Semi-final' || pending.round === 'Final')) score = Math.min(4, score + 1)
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
// Match Hub — shown before every match. Phase 4: the player picks a tactical
// approach here; it locks the moment Watch / Quick Sim / Sim All starts the
// match. Everything shown is a pure preview (no rng, no result exists yet).
// ---------------------------------------------------------------------------
export function MatchHub({ pending, teamName, record, matchNumber, firstTime, squadProfile, onWatch, onQuick, onSimAll }) {
  const [approach, setApproach] = useState('balanced') // reset per match via key
  const stage = pending.kind === 'league' ? 'League Phase' : (STAGE_DISPLAY[pending.round] || pending.round)
  const label = pending.kind === 'league' ? `League Match ${pending.matchNo} of ${pending.leagueTotal}` : stage
  const meta = pending.opponentMeta
  const diff = predictedDifficulty(pending)
  const matchup = pending.previews[approach]
  const fit = approachFit(approach, pending.previews, squadProfile)
  const { helps, costs } = approachTradeoffs(approach)
  const emphasis = approachEmphasis(approach)
  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-center mb-1"><span className="text-[10px] uppercase tracking-widest text-gold/80">European Run · Match {matchNumber}</span></div>
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">{stage}</h2>
      <p className="text-center text-secondary text-sm mb-5">{label}</p>

      <div className="rounded-lg bg-card border border-border p-4 mb-4">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="flex-1 text-right min-w-0"><div className="font-black text-base sm:text-lg truncate text-primary">{teamName}</div><div className="text-[10px] text-secondary">You</div></div>
          <div className="shrink-0 text-secondary font-bold text-sm">vs</div>
          <div className="flex-1 text-left min-w-0"><div className="font-black text-base sm:text-lg truncate text-blue-300">{meta?.name || pending.opponent}</div><div className="text-[10px] text-secondary truncate capitalize">{meta ? meta.archetype : 'opponent'}</div></div>
        </div>
        {meta?.style && <p className="text-center text-[11px] text-secondary mb-3">{meta.name} — {meta.style}.</p>}
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-secondary">Predicted difficulty</span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${DIFF_STYLE[diff]}`}>{diff}</span>
        </div>
      </div>

      {/* Tactical matchup card — canonical preview for the SELECTED approach. */}
      {matchup && (
        <div className="rounded-lg bg-card border border-border p-3 mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-secondary">Tactical matchup</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${MATCHUP_STYLE[matchup.overallLabel] || MATCHUP_STYLE.Even}`}>{matchup.overallLabel}</span>
          </div>
          <div className="space-y-1 text-[11px] leading-snug">
            <div className="flex gap-2">
              <span className="shrink-0 w-16 text-[9px] uppercase tracking-wide text-success font-bold pt-0.5">Advantage</span>
              <span className="text-primary">{matchup.keyAdvantage?.text || 'No clear structural edge in this matchup.'}</span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 w-16 text-[9px] uppercase tracking-wide text-danger font-bold pt-0.5">Risk</span>
              <span className="text-primary">{matchup.keyRisk?.text || 'No obvious structural weakness against this style.'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tactical approach selector — locks when the match starts. */}
      <div className="rounded-lg bg-card border border-border p-3 mb-4">
        <div className="text-[10px] uppercase tracking-widest text-secondary mb-2">Tactical approach</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {APPROACH_KEYS.map((key) => {
            const def = TACTICAL_APPROACHES[key]
            const active = approach === key
            return (
              <button
                key={key}
                onClick={() => setApproach(key)}
                className={`p-2.5 rounded-lg border text-left fx-press ${active ? 'border-gold bg-gold/10 ring-1 ring-gold/40' : 'border-border bg-surface hover:border-gold/50'}`}
              >
                <div className={`text-xs font-black tracking-wide ${active ? 'text-gold' : 'text-primary'}`}>{def.name.toUpperCase()}</div>
                <div className="text-[10px] text-secondary leading-snug mt-0.5">{def.tagline}</div>
              </button>
            )
          })}
        </div>
        {(helps.length > 0 || costs.length > 0) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] mb-1.5">
            {helps.length > 0 && <span><span className="text-success font-bold uppercase text-[9px] tracking-wide mr-1">Helps</span><span className="text-secondary">{helps.join(', ')}</span></span>}
            {costs.length > 0 && <span><span className="text-danger font-bold uppercase text-[9px] tracking-wide mr-1">Costs</span><span className="text-secondary">{costs.join(', ')}</span></span>}
          </div>
        )}
        {emphasis.length > 0 && (
          <div className="text-[10px] text-gold/70 mb-1.5">{TACTICAL_APPROACHES[approach].name} emphasizes: {emphasis.join(' · ')}</div>
        )}
        {fit && <div className="text-[11px] text-primary leading-snug">{fit}</div>}
      </div>

      <div className="rounded-lg bg-surface border border-border p-3 mb-5 text-center text-sm">
        <span className="text-secondary">Run record </span>
        <span className="font-bold text-primary">{record.w}W-{record.d}D-{record.l}L</span>
        <span className="text-secondary mx-2">·</span>
        <span className="text-secondary">Goals </span><span className="font-bold text-primary">{record.gf}–{record.ga}</span>
      </div>

      {firstTime && matchNumber === 1 && (
        <p className="text-[11px] text-gold/75 text-center mb-3">Recommended: Watch one match first, then Quick Sim league matches for a faster run.</p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <RunBtn onClick={() => onWatch(approach)} className="w-full">Watch Match</RunBtn>
          <p className="text-[10px] text-secondary text-center mt-1">Watch the 2D simulation play out.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="sm:flex-1">
            <RunBtn onClick={() => onQuick(approach)} variant="ghost" className="w-full">Quick Sim</RunBtn>
            <p className="text-[10px] text-secondary text-center mt-1">Instantly simulate this match.</p>
          </div>
          <div className="sm:flex-1">
            <RunBtn onClick={() => onSimAll(approach)} variant="surface" className="w-full">Sim All</RunBtn>
            <p className="text-[10px] text-secondary text-center mt-1">Future matches use Balanced.</p>
          </div>
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
  const tl = useMemo(() => buildMatchTimeline(m, players, mcStageLabel(item), teamName, tactics, squad), [m, players, item, teamName, tactics, squad])
  const [open, setOpen] = useState(false)

  // Canonical MatchDetail values (verdict + key player), same source as the
  // Match Center and the European Run report.
  const verdict = m.detail?.verdict ?? matchVerdict({ gf: m.gf, ga: m.ga, result: m.result, pens: m.pens })
  const canonicalPotm = m.detail?.keyPlayer ?? m.stats?.potm
  const keyPlayer = canonicalPotm ? shortDisplayName(canonicalPotm) : null
  // Approach-aware note from the ONE canonical helper (Phase 4) — same
  // source the Match Center FT summary uses.
  const tacticalNote = approachFeedback({ approach: m.approach, matchup: m.matchup, detail: m.detail, result: m.result }) || tactics?.postNote || null
  const approachName = m.approach ? TACTICAL_APPROACHES[m.approach]?.name : null
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
        {approachName && <div className="flex justify-between gap-3"><span className="text-secondary shrink-0">Approach</span><span className="font-semibold text-primary text-right">{approachName}</span></div>}
        {tacticalNote && <div className="flex justify-between gap-3"><span className="text-secondary shrink-0">Tactical note</span><span className="text-gold/80 text-right">{tacticalNote}</span></div>}
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
