import { useState, useEffect, useRef } from 'react'
import {
  FORMATIONS,
  SLOT_NAMES,
  TAG_LABELS,
  DIFFICULTIES,
  slotOptions,
  playerPoints,
  playerBreakdown,
  canPlay,
  computeRating,
  squadMVP,
  smartestPick,
  topBonus,
  keyWeakness,
  bestRoleSynergy,
  tacticalIdentity,
  eraCounts,
  bestEraPick,
  knockoutOutlook,
  simulate,
  ordinal,
  outcomeLabel,
  runVerdict,
  validateXI,
  posTypeOf,
  makeRng,
  buildSimSeed,
  todayKey,
  loadStats,
  favoriteFormation,
  recordGame,
  loadTeamName,
  saveTeamName,
  sanitizeTeamName,
  DEFAULT_TEAM_NAME,
  TEAM_NAME_MAX,
  shortDisplayName,
  squadDisplayName,
  slotAwareRole,
  ROLE_GUIDE,
  auraLabel,
  playerBadges,
  roleReasonText,
  roleEvidenceText,
} from './data'
import { buildShareData, buildShareText, downloadShareCard } from './share'
import { buildTactics } from './tactics'
import MatchCenter from './MatchCenter'
import TacticalPitch from './TacticalPitch'
import { MatchHub, PostMatchCard, buildRunMatches, runRecord, mcStageLabel } from './RunFlow'

const TOTAL_REROLLS = 3

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------
const POS_BADGE = {
  GK: 'text-success bg-success/10',
  DEF: 'text-blue-400 bg-blue-400/10',
  MID: 'text-orange-400 bg-orange-400/10',
  ATT: 'text-pink-400 bg-pink-400/10',
}

function PosBadge({ type, label }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${POS_BADGE[type]}`}>{label ?? type}</span>
  )
}

// Aura / special badge styling, keyed by badge label.
function badgeStyle(label) {
  if (label === 'GOAT') return 'text-gold bg-gold/15 border-gold/50'
  if (label === 'GOAT Candidate') return 'text-amber-200 bg-amber-200/10 border-amber-200/40'
  if (label === 'Big Game Scorer') return 'text-success bg-success/10 border-success/40'
  if (label === 'Football Icon') return 'text-amber-200 bg-amber-200/10 border-amber-200/40'
  if (label === 'Infinity Aura' || label === '3× World Champion') return 'text-pink-300 bg-pink-300/10 border-pink-300/40'
  return 'text-secondary bg-surface border-border'
}

function Badges({ player, className = '' }) {
  const badges = playerBadges(player)
  if (badges.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {badges.map((b) => (
        <span key={b} className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide border ${badgeStyle(b)}`}>{b}</span>
      ))}
    </div>
  )
}

function Button({ children, onClick, disabled, variant = 'gold', className = '' }) {
  const base = 'px-6 py-3 rounded-md font-semibold fx-press disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    gold: 'bg-gold text-black hover:bg-gold/90',
    ghost: 'bg-card text-primary border border-border hover:border-gold',
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>{children}</button>
  )
}

function ModeBadge({ mode }) {
  const daily = mode === 'daily'
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${daily ? 'text-gold bg-gold/10 border border-gold/40' : 'text-secondary bg-surface border border-border'}`}>
      {daily ? 'DAILY CHALLENGE' : 'RANDOM RUN'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------
function IntroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vmin] h-[70vmin] rounded-full border border-primary/[0.035]" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26vmin] h-[26vmin] rounded-full border border-primary/[0.035]" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/[0.035]" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-primary/[0.07]" />
    </div>
  )
}

function HowToStep({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-surface border border-border text-gold text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0">
        <div className="font-semibold text-primary text-sm">{title}</div>
        <div className="text-xs text-secondary leading-snug">{children}</div>
      </div>
    </div>
  )
}

function HowToPlay() {
  return (
    <div className="mt-2 p-4 rounded-lg bg-card border border-border space-y-3">
      <HowToStep n={1} title="Choose your run">Random Run gives a fresh draft each time. Daily Challenge gives everyone the same draft for the day.</HowToStep>
      <HowToStep n={2} title="Choose difficulty">Casual is easier, Classic is balanced, Legendary is harder.</HowToStep>
      <HowToStep n={3} title="Choose your player pool">Legends Only is classic icons. Modern Mix adds modern stars.</HowToStep>
      <HowToStep n={4} title="Pick a formation">The formation decides which positions you need to fill.</HowToStep>
      <HowToStep n={5} title="Draft your XI">For each position, pick 1 of 3 players. You have 3 rerolls — each refreshes only the current position.</HowToStep>
      <HowToStep n={6} title="Set Your XI">Rearrange players into their real eligible positions (e.g. Messi can move between RW and CAM). Illegal moves are blocked.</HowToStep>
      <HowToStep n={7} title="Build your rating">Base points + traits + chemistry + role synergies − weaknesses. A higher Final Rating improves your European Run odds.</HowToStep>
      <HowToStep n={8} title="Simulate the European Run">Play the League Phase. Finish top 8 for a direct Round of 16; 9th–24th means a Knockout Play-Off; 25th–36th is eliminated. Survive the knockouts to Conquer Europe.</HowToStep>
      <HowToStep n={9} title="Share your result">Copy your result, download your share card, then try to beat your best run.</HowToStep>
      <div className="pt-1 border-t border-border text-xs text-gold/80">Scoring in one sentence: Final Rating = player value + traits + chemistry + role synergies − weaknesses.</div>
    </div>
  )
}

function RoleGuide() {
  const groups = ['Goalkeeper', 'Defence', 'Midfield', 'Wide & Attacking Mid', 'Strikers']
  return (
    <div className="mt-2 p-4 rounded-lg bg-card border border-border space-y-3">
      {groups.map((g) => (
        <div key={g}>
          <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1.5">{g}</div>
          <div className="space-y-1.5">
            {ROLE_GUIDE.filter((r) => r.group === g).map((r) => (
              <div key={r.role} className="flex gap-2">
                <span className="shrink-0 w-32 text-xs font-semibold text-primary">{r.role}</span>
                <span className="text-xs text-secondary leading-snug">{r.line}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="pt-1 border-t border-border text-xs text-secondary">A player can only be drafted or moved into a slot their position allows — roles describe how they play, not where they can go.</div>
    </div>
  )
}

function IntroScreen({ onStart, stats }) {
  // Brand-new players (no recorded games) start on Casual so a first run isn't
  // brutal before they learn roles/synergies. Returning users keep Classic.
  const firstTime = !stats?.gamesPlayed
  const [formation, setFormation] = useState(null)
  const [mode, setMode] = useState('random')
  const [difficulty, setDifficulty] = useState(firstTime ? 'casual' : 'classic')
  const [pool, setPool] = useState('modern')
  const [howOpen, setHowOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const fav = favoriteFormation(stats)

  return (
    <div className="relative">
      <IntroBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-8 sm:py-10">
        <div className="text-center mb-7 sm:mb-8">
          <h1 className="fx-in text-4xl sm:text-5xl font-black tracking-tight text-gold mb-2">Final XI</h1>
          <p className="fx-in fx-d1 text-secondary text-base sm:text-lg">Draft 11 legends. Conquer Europe.</p>
        </div>

        <div className="fx-in fx-d2 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <button onClick={() => setMode('random')} className={`fx-lift p-4 rounded-lg border text-left ${mode === 'random' ? 'border-gold bg-card' : 'border-border bg-surface'}`}>
            <div className="font-bold mb-0.5">Random Run</div>
            <div className="text-xs text-secondary">Fresh random draft every time.</div>
          </button>
          <button onClick={() => setMode('daily')} className={`fx-lift p-4 rounded-lg border text-left ${mode === 'daily' ? 'border-gold bg-card' : 'border-border bg-surface'}`}>
            <div className="font-bold mb-0.5 flex items-center gap-2 flex-wrap">
              Daily Challenge
              <span className="fx-badge-pulse text-[10px] text-gold border border-gold/40 rounded px-1.5 py-0.5">{todayKey()}</span>
            </div>
            <div className="text-xs text-secondary">Everyone gets the same draft today.</div>
          </button>
        </div>

        <h2 className="fx-in fx-d2 text-xs uppercase tracking-widest text-secondary mb-2">Player pool</h2>
        <div className="fx-in fx-d2 grid grid-cols-2 gap-3 mb-5">
          <button onClick={() => setPool('modern')} className={`fx-lift p-4 rounded-lg border text-left ${pool === 'modern' ? 'border-gold bg-card' : 'border-border bg-surface'}`}>
            <div className="font-bold mb-0.5">Modern Mix</div>
            <div className="text-xs text-secondary">Legends + modern stars.</div>
          </button>
          <button onClick={() => setPool('legends')} className={`fx-lift p-4 rounded-lg border text-left ${pool === 'legends' ? 'border-gold bg-card' : 'border-border bg-surface'}`}>
            <div className="font-bold mb-0.5">Legends Only</div>
            <div className="text-xs text-secondary">All-time greats, no modern players.</div>
          </button>
        </div>

        <h2 className="fx-in fx-d3 text-xs uppercase tracking-widest text-secondary mb-2">Difficulty</h2>
        <div className="fx-in fx-d3 grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          {Object.entries(DIFFICULTIES).map(([key, dd]) => (
            <button key={key} onClick={() => setDifficulty(key)} className={`fx-lift p-3 rounded-lg border text-center ${difficulty === key ? 'border-gold bg-card' : 'border-border bg-surface'}`}>
              <div className="font-bold text-sm sm:text-base">{dd.name}</div>
              <div className="text-[11px] text-secondary leading-tight">{dd.desc}</div>
            </button>
          ))}
        </div>
        {firstTime && <p className="fx-in fx-d3 text-[11px] text-secondary -mt-3 mb-5">New? Casual is recommended for your first run.</p>}

        <div className="fx-in fx-d4 mb-6">
          <button onClick={() => setHowOpen((o) => !o)} className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-surface text-left">
            <span className="text-sm font-semibold">How to Play</span>
            <span className="text-secondary text-sm">{howOpen ? '−' : '+'}</span>
          </button>
          {howOpen && <HowToPlay />}
        </div>

        <div className="fx-in fx-d4 mb-6">
          <button onClick={() => setRoleOpen((o) => !o)} className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-surface text-left">
            <span className="text-sm font-semibold">Role Guide</span>
            <span className="text-secondary text-sm">{roleOpen ? '−' : '+'}</span>
          </button>
          {roleOpen && <RoleGuide />}
        </div>

        <h2 className="fx-in fx-d4 text-xs uppercase tracking-widest text-secondary mb-2">Formation</h2>
        <div className="fx-in fx-d5 grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {Object.values(FORMATIONS).map((f) => {
            const active = formation === f.name
            return (
              <button key={f.name} onClick={() => setFormation(f.name)} className={`fx-lift p-4 sm:p-5 rounded-lg border text-left ${active ? 'border-gold bg-card ring-1 ring-gold/40' : 'border-border bg-surface'}`}>
                <div className={`text-xl sm:text-2xl font-bold mb-1 ${active ? 'text-gold' : ''}`}>{f.name}</div>
                <FormationMini slots={f.slots} />
              </button>
            )
          })}
        </div>

        <div className="fx-in fx-d5 text-center mb-10">
          <Button onClick={() => onStart({ formation, mode, difficulty, pool })} disabled={!formation} className="fx-lift w-full sm:w-auto">
            Start {mode === 'daily' ? 'Daily Challenge' : 'Draft'}
          </Button>
        </div>

        <div className="fx-in fx-d6"><StatsPanel stats={stats} fav={fav} /></div>
      </div>
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border last:border-0">
      <span className="text-secondary">{label}</span>
      <span className="font-semibold text-primary text-right">{value}</span>
    </div>
  )
}

function StatsPanel({ stats, fav }) {
  return (
    <div className="p-4 rounded-lg bg-surface border border-border text-sm">
      <h3 className="text-xs uppercase tracking-widest text-secondary mb-2">Your Stats</h3>
      <StatRow label="Games played" value={stats.gamesPlayed} />
      <StatRow label="Trophies won" value={stats.trophies} />
      <StatRow label="Finals reached" value={stats.finalsReached} />
      <StatRow label="Best rating" value={stats.bestRating || '—'} />
      <StatRow label="Favorite formation" value={fav || '—'} />
      <StatRow label="Best MVP" value={stats.bestMVP ? `${stats.bestMVP.name} (${stats.bestMVP.pts})` : '—'} />
      <StatRow label="Best smartest pick" value={stats.bestSmartestPick ? `${stats.bestSmartestPick.name} (${stats.bestSmartestPick.rarity}%)` : '—'} />
    </div>
  )
}

function FormationMini({ slots }) {
  const counts = { DEF: 0, MID: 0, ATT: 0 }
  slots.forEach((s) => { const t = posTypeOf(s); if (t in counts) counts[t]++ })
  return <div className="text-xs text-secondary">{counts.DEF} DEF · {counts.MID} MID · {counts.ATT} ATT</div>
}

// ---------------------------------------------------------------------------
// Player card with "Why these points?"
// ---------------------------------------------------------------------------
function WhyPoints({ player, slot }) {
  const b = playerBreakdown(player)
  return (
    <div className="mt-2 p-2.5 rounded bg-bg border border-border text-[11px] space-y-1">
      <div className="flex justify-between"><span className="text-secondary">Base: {b.basePos}</span><span className="text-primary">+{b.base}</span></div>
      {b.traits.map((t, i) => (
        <div key={i} className="flex justify-between"><span className="text-secondary">{t.label}</span><span className="text-primary">+{t.pts}</span></div>
      ))}
      {b.extras.map((x, i) => (
        <div key={`x${i}`} className="flex justify-between"><span className="text-secondary">{x.label}</span><span className="text-gold">+{x.pts}</span></div>
      ))}
      <div className="flex justify-between text-secondary"><span>Role</span><span className="text-gold/80">{slotAwareRole(player, slot || player.primaryPos)}{b.secondaryRole ? ` · ${b.secondaryRole}` : ''}</span></div>
      <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Player value</span><span className="text-gold">{b.total}</span></div>
      <div className="border-t border-border pt-1.5 mt-1 space-y-1">
        <div className="text-secondary leading-snug"><span className="text-primary font-semibold">Why this role: </span>{roleReasonText(player)}</div>
        <div className="text-secondary leading-snug"><span className="text-primary font-semibold">Evidence: </span>{roleEvidenceText(player)}</div>
      </div>
    </div>
  )
}

function PlayerCard({ player, onPick, slot }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full p-4 rounded-lg bg-card border border-border text-left">
      <button onClick={onPick} className="w-full text-left">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-bold text-lg leading-tight">{player.name}</span>
          <PosBadge type={player.posType} label={player.primaryPos} />
        </div>
        <div className="text-sm text-secondary">{player.country} · {player.club}</div>
        <div className="text-xs text-gold/80 mb-2">{slotAwareRole(player, slot || player.primaryPos)}{player.secondaryRole ? <span className="text-secondary"> · {player.secondaryRole}</span> : ''}</div>
        <Badges player={player} className="mb-2" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {player.tags.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded bg-surface border border-border text-[10px] text-secondary">{TAG_LABELS[t]}</span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gold font-bold text-sm">{playerPoints(player)} pts</span>
          <span className="text-[10px] text-secondary">{player.rarity}% pick rate</span>
        </div>
      </button>
      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[11px] text-secondary hover:text-gold">{open ? 'Hide breakdown' : 'Why these points?'}</button>
      {open && <WhyPoints player={player} slot={slot} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Squad preview strip
// ---------------------------------------------------------------------------
function SquadPreview({ squad, activeIndex }) {
  const squadNames = new Set(squad.map(s => s.player?.name).filter(Boolean))
  return (
    <div className="flex flex-wrap gap-1.5">
      {squad.map((s, i) => (
        <div key={i} className={`px-2 py-1 rounded text-xs border ${i === activeIndex ? 'border-gold bg-card' : s.player ? 'border-border bg-surface' : 'border-border bg-bg text-secondary'}`}>
          <span className="font-bold mr-1 text-gold/80">{s.slot}</span>
          {s.player ? <span className="text-primary">{squadDisplayName(s.player.name, squadNames)}</span> : <span className="text-secondary">·</span>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------
function DraftScreen({ config, onComplete }) {
  const { formation, mode, difficulty, pool } = config
  const slots = FORMATIONS[formation].slots
  const [squad, setSquad] = useState(() => slots.map((slot) => ({ slot, player: null })))
  const [index, setIndex] = useState(0)
  const [choices, setChoices] = useState([])
  const [rerollsLeft, setRerollsLeft] = useState(TOTAL_REROLLS)
  const [slotRerolls, setSlotRerolls] = useState(0)

  useEffect(() => {
    if (index < slots.length) {
      const usedIds = squad.filter((s) => s.player).map((s) => s.player.id)
      setChoices(slotOptions({ mode, slotLabel: slots[index], slotIndex: index, rerollCount: slotRerolls, usedIds, pool }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slotRerolls])

  function pick(player) {
    const next = squad.map((s, i) => (i === index ? { ...s, player } : s))
    setSquad(next)
    if (index + 1 >= slots.length) onComplete(next, TOTAL_REROLLS - rerollsLeft)
    else { setIndex(index + 1); setSlotRerolls(0) }
  }

  function reroll() {
    if (rerollsLeft <= 0) return
    setRerollsLeft((r) => r - 1)
    setSlotRerolls((c) => c + 1)
  }

  const slot = slots[index]
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <div className="flex justify-between items-center gap-2 text-xs text-secondary mb-1.5">
          <span className="flex items-center gap-2 min-w-0 truncate"><ModeBadge mode={mode} /><span className="truncate">{formation} · {DIFFICULTIES[difficulty].name}</span></span>
          <span className="shrink-0 font-semibold text-primary">{index} / 11</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${(index / 11) * 100}%` }} /></div>
      </div>

      <div className="text-center mb-6">
        <p className="text-secondary text-xs sm:text-sm uppercase tracking-widest">Pick your</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gold">{SLOT_NAMES[slot]}</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {choices.map((pl) => <PlayerCard key={pl.id} player={pl} onPick={() => pick(pl)} slot={slot} />)}
      </div>

      <div className="flex items-center justify-center gap-3 mb-8">
        <button onClick={reroll} disabled={rerollsLeft <= 0} className="px-4 py-2.5 rounded-md text-sm font-semibold border border-border bg-card text-primary hover:border-gold fx-press transition-colors disabled:opacity-40 disabled:cursor-not-allowed">↻ Reroll options</button>
        <span className="text-sm text-secondary">Rerolls left: <span className={rerollsLeft > 0 ? 'text-gold font-bold' : 'text-danger font-bold'}>{rerollsLeft}</span> / {TOTAL_REROLLS}</span>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-xs uppercase tracking-widest text-secondary mb-2">Your squad</p>
        <SquadPreview squad={squad} activeIndex={index} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Set Your XI
// ---------------------------------------------------------------------------
function SetXIScreen({ config, draftedSquad, onConfirm, onReset }) {
  const [squad, setSquad] = useState(draftedSquad)
  const [selected, setSelected] = useState(null) // index of tapped player
  const [message, setMessage] = useState(null)

  function tapSlot(i) {
    const squadNames = new Set(squad.map(s => s.player?.name).filter(Boolean))
    if (selected === null) {
      setSelected(i)
      setMessage(null)
      return
    }
    if (i === selected) { setSelected(null); return }
    const a = squad[selected]
    const b = squad[i]
    // legality: a must be able to play b.slot, and b must be able to play a.slot
    const aOk = canPlay(a.player, b.slot)
    const bOk = canPlay(b.player, a.slot)
    if (!aOk) {
      setMessage(`${squadDisplayName(a.player.name, squadNames)} can only play ${a.player.eligibleSlots.join(' or ')}.`)
      return
    }
    if (!bOk) {
      setMessage(`${squadDisplayName(b.player.name, squadNames)} can only play ${b.player.eligibleSlots.join(' or ')}.`)
      return
    }
    const next = squad.map((s, idx) => {
      if (idx === selected) return { ...s, player: b.player }
      if (idx === i) return { ...s, player: a.player }
      return s
    })
    setSquad(next)
    setSelected(null)
    setMessage(null)
  }

  function reset() {
    setSquad(draftedSquad)
    setSelected(null)
    setMessage(null)
    onReset && onReset()
  }

  const selPlayer = selected !== null ? squad[selected].player : null
  const legalTargets = new Set()
  const squadNames = new Set(squad.map(s => s.player?.name).filter(Boolean))
  if (selected !== null) {
    squad.forEach((s, i) => {
      if (i === selected) return
      if (canPlay(selPlayer, s.slot) && canPlay(s.player, squad[selected].slot)) legalTargets.add(i)
    })
  }

  const problems = validateXI(squad, config.formation)
  const canContinue = problems.length === 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-center gap-2 mb-1 flex-wrap"><ModeBadge mode={config.mode} /><span className="text-xs text-secondary">{config.formation}</span></div>
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">Set Your XI</h2>
      <p className="text-center text-secondary text-sm mb-4">Tap a player, then tap a highlighted slot to swap. Moves are limited to each player's positions.</p>

      {selPlayer && (
        <div className="mb-3 p-2.5 rounded-lg bg-card border border-gold/40 text-sm text-center">
          <span className="font-semibold text-gold">{squadDisplayName(selPlayer.name, squadNames)}</span>
          <span className="text-secondary"> can play: {selPlayer.eligibleSlots.join(', ')}</span>
        </div>
      )}
      {message && <div className="mb-3 p-2.5 rounded-lg bg-card border border-danger/40 text-sm text-center text-danger">{message}</div>}

      <div className="space-y-2 mb-6">
        {squad.map((s, i) => {
          const isSel = i === selected
          const isLegal = legalTargets.has(i)
          const dimmed = selected !== null && !isSel && !isLegal
          return (
            <button
              key={i}
              onClick={() => tapSlot(i)}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors fx-press ${
                isSel ? 'border-gold bg-card ring-1 ring-gold/40' : isLegal ? 'border-success/60 bg-card' : dimmed ? 'border-border bg-surface opacity-40' : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-12 shrink-0 text-xs font-bold text-gold/80">{s.slot}</span>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{squadDisplayName(s.player.name, squadNames)}</div>
                  <div className="text-[11px] text-secondary truncate">{slotAwareRole(s.player, s.slot)} · {s.player.eligibleSlots.join('/')}</div>
                </div>
              </div>
              <PosBadge type={s.player.posType} label={s.player.primaryPos} />
            </button>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={reset} variant="ghost" className="w-full sm:w-auto">Reset Positions</Button>
        <Button onClick={() => onConfirm(squad)} disabled={!canContinue} className="w-full sm:w-auto">Confirm XI</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bonuses
// ---------------------------------------------------------------------------
function StatBox({ label, value, accent }) {
  return (
    <div className="flex-1 p-3 sm:p-4 rounded-lg bg-card border border-border text-center">
      <div className={`text-2xl sm:text-3xl font-black ${accent || 'text-primary'}`}>{value}</div>
      <div className="text-[10px] sm:text-xs uppercase tracking-widest text-secondary mt-1">{label}</div>
    </div>
  )
}

function BonusesScreen({ squad, config, rerollsUsed, onSimulate, initialTeamName }) {
  const { base, bonusTotal, total, bonuses, weaknesses } = computeRating(squad)
  const identity = tacticalIdentity(squad)
  const [howOpen, setHowOpen] = useState(false)
  const [tacticsOpen, setTacticsOpen] = useState(false)
  const [teamName, setTeamName] = useState(initialTeamName || DEFAULT_TEAM_NAME)
  const outlook = knockoutOutlook(squad, config.difficulty)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-center gap-2 mb-1 flex-wrap"><ModeBadge mode={config.mode} /><span className="text-xs text-secondary">{config.formation} · {DIFFICULTIES[config.difficulty].name}</span></div>
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">Squad Rating</h2>
      <p className="text-center text-secondary text-sm mb-6">Identity: <span className="text-primary font-semibold">{identity}</span><span className="mx-2">·</span>Rerolls used: <span className="text-primary font-semibold">{rerollsUsed}</span></p>

      <div className="flex gap-2 sm:gap-3 mb-4">
        <StatBox label="Player Value" value={base} />
        <StatBox label="Bonus" value={`${bonusTotal >= 0 ? '+' : ''}${bonusTotal}`} accent={bonusTotal >= 0 ? 'text-success' : 'text-danger'} />
        <StatBox label="Total" value={total} accent="text-gold" />
      </div>

      <button onClick={() => setHowOpen((o) => !o)} className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-surface text-left mb-6">
        <span className="text-sm font-semibold">How rating works</span>
        <span className="text-secondary text-sm">{howOpen ? '−' : '+'}</span>
      </button>
      {howOpen && (
        <div className="-mt-4 mb-6 p-4 rounded-lg bg-card border border-border text-sm text-secondary space-y-1.5">
          <div><span className="text-primary font-semibold">Player Value</span> = base position value + trait value</div>
          <div><span className="text-primary font-semibold">Chemistry Bonuses</span> = squad links and achievements</div>
          <div><span className="text-primary font-semibold">Role Synergies</span> = tactical role combinations</div>
          <div><span className="text-primary font-semibold">Weakness Penalties</span> = squad balance problems</div>
          <div><span className="text-primary font-semibold">Final Rating</span> = player value + bonuses + role synergies − weaknesses</div>
          <div className="text-gold/80">A higher Final Rating lifts your odds — but pressure rises every round and the Final is the hardest match.</div>
        </div>
      )}

      <button onClick={() => setTacticsOpen((o) => !o)} className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-surface text-left mb-6">
        <span className="text-sm font-semibold">{tacticsOpen ? 'Hide Tactical Breakdown' : 'Show Tactical Breakdown'}</span>
        <span className="text-secondary text-sm">{tacticsOpen ? '−' : '+'}</span>
      </button>
      {tacticsOpen && (
        <div className="-mt-4 mb-6">
          <TacticalPitch squad={squad} formation={config.formation} />
        </div>
      )}

      <h3 className="text-xs uppercase tracking-widest text-secondary mb-2">Chemistry &amp; Role Synergies</h3>
      <div className="space-y-2 mb-6">
        {bonuses.length === 0 && <p className="text-secondary text-center text-sm">No bonuses triggered.</p>}
        {bonuses.map((b, i) => (
          <div key={i} className="flex justify-between items-center gap-3 p-3 rounded-lg bg-card border border-border">
            <span className="font-semibold flex items-center gap-2 min-w-0"><span className="truncate">{b.name}</span>{b.kind === 'role' && <span className="text-[9px] text-gold/70 border border-gold/30 rounded px-1 shrink-0">ROLE</span>}{b.kind === 'era' && <span className="text-[9px] text-gold/70 border border-gold/30 rounded px-1 shrink-0">ERA</span>}{b.kind === 'aura' && <span className="text-[9px] text-gold border border-gold/50 bg-gold/10 rounded px-1 shrink-0">AURA</span>}</span>
            <span className="font-bold text-success shrink-0">+{b.pts}</span>
          </div>
        ))}
      </div>

      <h3 className="text-xs uppercase tracking-widest text-secondary mb-2">Squad Weaknesses</h3>
      <div className="space-y-2 mb-8">
        {weaknesses.length === 0 && <p className="text-secondary text-center text-sm">No glaring weaknesses. Balanced XI.</p>}
        {weaknesses.map((w, i) => (
          <div key={i} className="flex justify-between items-center gap-3 p-3 rounded-lg bg-card border border-danger/30">
            <div className="min-w-0"><div className="font-semibold text-danger truncate">{w.name}</div><div className="text-xs text-secondary">{w.desc}</div></div>
            <span className="font-bold text-danger shrink-0">{w.pts}</span>
          </div>
        ))}
      </div>

      <div className="mb-6 max-w-sm mx-auto">
        <label htmlFor="teamName" className="block text-xs uppercase tracking-widest text-secondary mb-2 text-center">Name Your XI</label>
        <input
          id="teamName"
          type="text"
          value={teamName}
          maxLength={TEAM_NAME_MAX}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder={DEFAULT_TEAM_NAME}
          className="w-full px-4 py-3 rounded-lg bg-card border border-border text-center text-primary font-semibold focus:outline-none focus:border-gold"
        />
        <p className="text-[11px] text-secondary text-center mt-1.5">Up to {TEAM_NAME_MAX} characters · used across your Match Center and result.</p>
      </div>

      <div className="text-center">
        <div className="mb-4 p-3 rounded-lg bg-card border border-border inline-block text-left">
          <div className="text-sm text-secondary">Early-round win chance: <span className="text-gold font-bold">{outlook.r16}%</span><span className="text-secondary"> → Final {outlook.final}%</span></div>
          <div className="text-xs text-secondary mt-1">Knockout pressure: <span className="text-primary font-semibold">{outlook.pressure}</span><span className="mx-1.5">·</span>Final difficulty: <span className="text-primary font-semibold">{outlook.finalDifficulty}</span></div>
          {config.difficulty === 'legendary' && <div className="text-[11px] text-danger/80 mt-1">Legendary reduces your margin for error.</div>}
        </div>
        <Button onClick={() => onSimulate(teamName)} className="w-full sm:w-auto">Begin European Run</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simulation — cinematic match reports
// ---------------------------------------------------------------------------
const RESULT_STYLE = { win: 'text-success', 'pens-win': 'text-success', draw: 'text-secondary', 'pens-loss': 'text-danger', loss: 'text-danger' }

function Stat({ label, value }) {
  return (
    <div className="px-2 py-1 rounded bg-surface border border-border text-center">
      <div className="text-secondary uppercase tracking-wide text-[9px]">{label}</div>
      <div className="text-primary font-semibold truncate">{value}</div>
    </div>
  )
}

function EventsTimeline({ events, squadNames }) {
  if (events.length === 0) return null
  return (
    <div className="mb-2 space-y-0.5">
      {events.map((e, i) => (
        <div key={i} className={`text-xs ${e.side === 'us' ? 'text-primary' : 'text-secondary'}`}>
          <span className="text-gold/70 font-mono mr-1">{e.minute}'</span>
          {e.side === 'us' ? <>{squadDisplayName(e.scorer, squadNames)}{e.label ? ` ${e.label}` : ''}{e.assist ? <span className="text-secondary"> — {e.assistLabel ? `${e.assistLabel} ` : 'assist '}{squadDisplayName(e.assist, squadNames)}</span> : ''}</> : <span className="text-secondary">{e.scorer} (opponent)</span>}
        </div>
      ))}
    </div>
  )
}

function StatsGrid({ stats, squadNames }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
      <Stat label="Poss" value={`${stats.possession}%`} />
      <Stat label="Shots" value={`${stats.shotsOnTarget}/${stats.shots}`} />
      <Stat label="xG" value={stats.xg} />
      <Stat label="Saves" value={stats.saves} />
      <Stat label="Fouls" value={stats.fouls} />
      <Stat label="MotM" value={squadDisplayName(String(stats.potm), squadNames)} />
    </div>
  )
}

// Knockout / play-off match card
function KOCard({ r, squadNames }) {
  return (
    <div className="fx-row-in p-4 rounded-lg bg-card border border-border">
      <div className="flex justify-between items-center gap-2 mb-1">
        <span className="font-bold">{r.round}</span>
        <span className={`font-bold shrink-0 ${RESULT_STYLE[r.result]}`}>{r.score}</span>
      </div>
      <div className="text-sm text-secondary mb-2">vs {r.opponent} — <span className={RESULT_STYLE[r.result]}>{r.result.startsWith('pens') ? (r.pens.won ? 'Won on penalties' : 'Lost on penalties') : r.result === 'win' ? 'Win' : 'Knocked out'}</span>{r.pens && r.pens.hero ? ` · ${r.pens.hero}` : ''}</div>
      <EventsTimeline events={r.events} squadNames={squadNames} />
      <StatsGrid stats={r.stats} squadNames={squadNames} />
    </div>
  )
}

// One league-phase match (shown when the 8 reports are expanded)
function LeagueMatchCard({ m, squadNames }) {
  return (
    <div className="p-3 rounded-lg bg-surface border border-border">
      <div className="flex justify-between items-center gap-2 mb-1">
        <span className="font-semibold text-sm">MD{m.matchNo} · {m.home ? 'H' : 'A'} vs {m.opponent}</span>
        <span className={`font-bold text-sm shrink-0 ${RESULT_STYLE[m.result]}`}>{m.score} · {m.points}pt</span>
      </div>
      <EventsTimeline events={m.events} squadNames={squadNames} />
      <StatsGrid stats={m.stats} squadNames={squadNames} />
    </div>
  )
}

// League-phase summary card with expandable 8-match reports
function LeaguePhaseCard({ lp, squadNames }) {
  const [open, setOpen] = useState(false)
  const qualColor = lp.qualification === 'direct' ? 'text-success' : lp.qualification === 'playoff' ? 'text-gold' : 'text-danger'
  return (
    <div className="fx-row-in p-4 rounded-lg bg-card border border-border">
      <div className="text-xs uppercase tracking-widest text-secondary mb-1">European League Phase</div>
      <div className="flex justify-between items-center gap-2 mb-2">
        <span className="font-black text-lg">Finished {ordinal(lp.position)}</span>
        <span className={`font-bold text-sm shrink-0 ${qualColor}`}>{lp.qualLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-[11px] mb-2">
        <Stat label="Points" value={lp.points} />
        <Stat label="Record" value={`${lp.record.w}-${lp.record.d}-${lp.record.l}`} />
        <Stat label="Goals" value={`${lp.gf}-${lp.ga}`} />
        <Stat label="GD" value={`${lp.gd >= 0 ? '+' : ''}${lp.gd}`} />
        <Stat label="Top scorer" value={lp.topScorer ? `${squadDisplayName(lp.topScorer.name, squadNames)} ${lp.topScorer.goals}` : '—'} />
        <Stat label="Top assist" value={lp.topAssister ? `${squadDisplayName(lp.topAssister.name, squadNames)} ${lp.topAssister.assists}` : '—'} />
      </div>
      {lp.bestMatch && <div className="text-xs text-secondary mb-2">Best match: {lp.bestMatch.score} vs {lp.bestMatch.opponent}</div>}
      <button onClick={() => setOpen((o) => !o)} className="text-xs text-secondary hover:text-gold">{open ? 'Hide match reports' : 'View 8 match reports'} {open ? '−' : '+'}</button>
      {open && <div className="mt-2 space-y-2">{lp.matches.map((m, i) => <LeagueMatchCard key={i} m={m} squadNames={squadNames} />)}</div>}
    </div>
  )
}

function SimulationScreen({ result, onFinish, squadNames, teamName, tactics }) {
  // Ordered stages: league summary → (play-off) → knockout rounds
  const stages = [{ kind: 'league', data: result.leaguePhase }]
  if (result.playoff) stages.push({ kind: 'ko', data: result.playoff })
  result.knockouts.forEach((m) => stages.push({ kind: 'ko', data: m }))

  const [shown, setShown] = useState(1)
  const done = shown >= stages.length

  useEffect(() => {
    if (shown < stages.length) {
      const t = setTimeout(() => setShown((s) => s + 1), 750)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8">
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">European Run</h2>
      {teamName && <p className="text-center text-secondary text-sm mb-1">{teamName}{tactics ? ` · ${tactics.identity}` : ''}</p>}
      {tactics?.postNote && <p className="text-center text-[11px] text-gold/70 mb-2 px-4">{tactics.postNote}</p>}
      <div className="flex items-center justify-center gap-4 mb-6">
        {!done ? <button onClick={() => setShown(stages.length)} className="text-xs text-secondary hover:text-gold">Show full report ⏩</button> : <span className="text-xs text-secondary">Full report</span>}
        <button onClick={onFinish} className="text-xs text-secondary hover:text-gold">Back to result ⏎</button>
      </div>
      <div className="space-y-3">
        {stages.slice(0, shown).map((st, i) => (st.kind === 'league' ? <LeaguePhaseCard key={i} lp={st.data} squadNames={squadNames} /> : <KOCard key={i} r={st.data} squadNames={squadNames} />))}
      </div>
      {done && <div className="text-center mt-6"><Button onClick={onFinish} className="w-full sm:w-auto">Back to Result</Button></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
function DetailRow({ label, value, accent }) {
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0 gap-4">
      <span className="text-secondary text-sm shrink-0">{label}</span>
      <span className={`font-semibold text-right break-words ${accent || 'text-primary'}`}>{value}</span>
    </div>
  )
}

function ResultScreen({ squad, result, config, rerollsUsed, onPlayAgain, onViewReport, teamName, tactics }) {
  const { total } = computeRating(squad)
  const mvp = squadMVP(squad)
  const smart = smartestPick(squad)
  const best = topBonus(squad)
  const weak = keyWeakness(squad)
  const roleSynergy = bestRoleSynergy(squad)
  const identity = tacticalIdentity(squad)
  const era = eraCounts(squad)
  const bestModern = bestEraPick(squad, 'modern')
  const bestLegend = bestEraPick(squad, 'legend')
  const diffName = DIFFICULTIES[config.difficulty].name
  const outlook = knockoutOutlook(squad, config.difficulty)
  const winPct = outlook.r16
  const [copied, setCopied] = useState(false)

  const lp = result.leaguePhase
  const outcome = outcomeLabel(result)
  const verdict = runVerdict(result, squad)
  const squadNames = new Set(squad.map(s => s.player.name))

  const shareData = buildShareData({
    result, config: { ...config, difficultyName: diffName, identity }, total, winPct, outcome,
    league: { position: lp.position, points: lp.points },
    mvp, smart, best, weak, rerollsUsed, totalRerolls: TOTAL_REROLLS, date: todayKey(),
    era, bestModern, bestLegend, topScorer: result.topScorer, topAssister: result.topAssister,
    squadNames, verdict, teamName,
  })
  const shareText = buildShareText(shareData)

  function copy() {
    navigator.clipboard.writeText(shareText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 sm:py-10 text-center">
      <div className="text-6xl sm:text-7xl mb-3">{result.champion ? '🏆' : '🗡️'}</div>
      <div className="flex justify-center mb-2"><ModeBadge mode={config.mode} /></div>
      {teamName && <div className="text-sm font-bold text-primary tracking-tight mb-1">{teamName}</div>}
      <h2 className={`text-2xl sm:text-3xl font-black mb-1 ${result.champion ? 'text-gold' : 'text-danger'}`}>{result.champion ? 'Won Europe!' : outcome}</h2>
      {verdict && <div className="text-lg sm:text-xl font-black text-gold tracking-tight mb-2">“{verdict}”</div>}
      <p className="text-secondary mb-2 text-sm sm:text-base">{result.champion ? 'Your XI conquered the continent.' : 'The run ends here — but it was a story worth telling.'}</p>
      {tactics?.postNote && <p className="text-[12px] text-gold/70 mb-6 px-2">{tactics.postNote}</p>}

      <div className="p-4 sm:p-5 rounded-lg bg-card border border-border text-left mb-5">
        <DetailRow label="League Phase finish" value={`${ordinal(lp.position)} · ${lp.points} pts`} accent="text-gold" />
        <DetailRow label="League Phase record" value={`${lp.record.w}W-${lp.record.d}D-${lp.record.l}L`} />
        <DetailRow label="League Phase goals" value={`${lp.gf}–${lp.ga} (${lp.gd >= 0 ? '+' : ''}${lp.gd})`} />
        <DetailRow label="Final rating" value={total} accent="text-gold" />
        <DetailRow label="Early-round win chance" value={`${winPct}% → Final ${outlook.final}%`} />
        <DetailRow label="Difficulty" value={`${diffName} · ${outlook.finalDifficulty} final`} />
        <DetailRow label="Tactical identity" value={identity} accent="text-gold" />
        {tactics && <DetailRow label="Tactical shape" value={`${tactics.inShape} in / ${tactics.outShape} out`} />}
        <DetailRow label="Key role synergy" value={roleSynergy ? `${roleSynergy.name} (+${roleSynergy.pts})` : '—'} accent={roleSynergy ? 'text-success' : 'text-secondary'} />
        <DetailRow label="Biggest weakness" value={weak ? weak.name : 'None'} accent={weak ? 'text-danger' : 'text-success'} />
        <DetailRow label="MVP" value={`${squadDisplayName(mvp.name, squadNames)} (${playerPoints(mvp)} pts)`} />
        <DetailRow label="Top scorer" value={result.topScorer ? `${squadDisplayName(result.topScorer.name, squadNames)} (${result.topScorer.goals})` : '—'} accent="text-success" />
        <DetailRow label="Top assister" value={result.topAssister ? `${squadDisplayName(result.topAssister.name, squadNames)} (${result.topAssister.assists})` : '—'} />
        <DetailRow label="Best match" value={result.bestMatch ? `${result.bestMatch.score} vs ${result.bestMatch.opponent}` : '—'} />
        <DetailRow label="Toughest opponent" value={result.toughestOpponent || '—'} accent="text-danger" />
        <DetailRow label="Key bonus" value={best ? `${best.name} (+${best.pts})` : '—'} accent={best ? 'text-success' : 'text-secondary'} />
        <DetailRow label="Smartest pick" value={`${squadDisplayName(smart.name, squadNames)} — ${smart.rarity}%`} accent="text-success" />
        <DetailRow label="Era mix" value={`Legends ${era.legends} / Modern ${era.modern}`} />
        <DetailRow label="Rerolls used" value={`${rerollsUsed} / ${TOTAL_REROLLS}`} />
      </div>

      <div className="p-4 rounded-lg bg-surface border border-border text-left whitespace-pre-wrap font-mono text-xs mb-6 break-words">{shareText}</div>

      {onViewReport && (
        <div className="mb-3">
          <button onClick={onViewReport} className="text-xs text-secondary hover:text-gold underline-offset-2 hover:underline">View European Run report →</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={copy} variant="ghost" className="w-full sm:w-auto">{copied ? 'Copied!' : 'Copy Share Text'}</Button>
        <Button onClick={() => downloadShareCard(shareData)} variant="ghost" className="w-full sm:w-auto">Download Share Card</Button>
        <Button onClick={onPlayAgain} className="w-full sm:w-auto">Play Again</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function App() {
  const [screen, setScreen] = useState('intro')
  const [config, setConfig] = useState(null)
  const [draftedSquad, setDraftedSquad] = useState(null)
  const [squad, setSquad] = useState(null)
  const [rerollsUsed, setRerollsUsed] = useState(0)
  const [stats, setStats] = useState(() => loadStats())
  const [teamName, setTeamName] = useState(() => loadTeamName())
  const [matchIndex, setMatchIndex] = useState(0)
  const resultRef = useRef(null)
  const tacticsRef = useRef(null)
  const runMatchesRef = useRef([])
  const recordedRef = useRef(false)

  function startDraft(cfg) { setConfig(cfg); setScreen('draft') }

  function finishDraft(finalSquad, usedRerolls) {
    setDraftedSquad(finalSquad)
    setRerollsUsed(usedRerolls)
    setScreen('setxi')
  }

  function confirmXI(finalSquad) { setSquad(finalSquad); setScreen('bonuses') }

  function runSimulation(rawName) {
    const clean = saveTeamName(rawName)   // sanitize + persist last used
    setTeamName(clean)
    const { total } = computeRating(squad)
    let rng = Math.random
    if (config.mode === 'daily') {
      const ids = squad.map((s) => s.player.id)
      const slots = squad.map((s) => s.slot)
      rng = makeRng(buildSimSeed({ dateKey: todayKey(), formation: config.formation, ids, slots, difficulty: config.difficulty, pool: config.pool, rerollsUsed }))
    }
    resultRef.current = simulate({ rating: total, difficulty: config.difficulty, squad, rng })
    // Tactical read of the XI — flavours the Match Center, report and result.
    tacticsRef.current = buildTactics(squad, config.formation)
    // Walk the run match-by-match. The simulation already decided every result.
    runMatchesRef.current = buildRunMatches(resultRef.current)
    recordedRef.current = false
    setMatchIndex(0)
    if (runMatchesRef.current.length) setScreen('hub')
    else finishRun()
  }

  // ---- European Run, match by match -------------------------------------
  function watchMatch() { setScreen('watch') }
  function quickSim() { setScreen('postmatch') }

  // Continue from a finished match (watched or quick-simmed) to the next one,
  // or to the final result if the whole run is over.
  function continueRun() {
    const next = matchIndex + 1
    if (next < runMatchesRef.current.length) { setMatchIndex(next); setScreen('hub') }
    else finishRun()
  }

  // Skip the rest of the run straight to the final result/share screen.
  function simAll() { finishRun() }

  // Record the game once, then show the final result/share screen.
  function finishRun() {
    if (!recordedRef.current) {
      const updated = recordGame({ result: resultRef.current, squad, formation: config.formation })
      setStats(updated)
      recordedRef.current = true
    }
    setScreen('result')
  }

  function backToResult() { setScreen('result') }

  function reset() {
    setConfig(null); setDraftedSquad(null); setSquad(null); setRerollsUsed(0)
    resultRef.current = null; tacticsRef.current = null; runMatchesRef.current = []; recordedRef.current = false
    setMatchIndex(0); setScreen('intro')
  }

  return (
    <div className="min-h-full">
      {screen === 'intro' && <IntroScreen onStart={startDraft} stats={stats} />}
      {screen === 'draft' && <DraftScreen config={config} onComplete={finishDraft} />}
      {screen === 'setxi' && <SetXIScreen config={config} draftedSquad={draftedSquad} onConfirm={confirmXI} />}
      {screen === 'bonuses' && <BonusesScreen squad={squad} config={config} rerollsUsed={rerollsUsed} onSimulate={runSimulation} initialTeamName={teamName} />}
      {screen === 'hub' && runMatchesRef.current[matchIndex] && (
        <MatchHub
          item={runMatchesRef.current[matchIndex]}
          teamName={teamName}
          record={runRecord(runMatchesRef.current.slice(0, matchIndex))}
          matchIndex={matchIndex}
          total={runMatchesRef.current.length}
          onWatch={watchMatch}
          onQuick={quickSim}
          onSimAll={simAll}
        />
      )}
      {screen === 'watch' && runMatchesRef.current[matchIndex] && (
        <MatchCenter
          squad={squad}
          feature={{ match: runMatchesRef.current[matchIndex].match, stageLabel: mcStageLabel(runMatchesRef.current[matchIndex]) }}
          onContinue={continueRun}
          isLast={matchIndex === runMatchesRef.current.length - 1}
          teamName={teamName}
          tactics={tacticsRef.current}
        />
      )}
      {screen === 'postmatch' && runMatchesRef.current[matchIndex] && (
        <PostMatchCard
          squad={squad}
          item={runMatchesRef.current[matchIndex]}
          teamName={teamName}
          tactics={tacticsRef.current}
          isLast={matchIndex === runMatchesRef.current.length - 1}
          onContinue={continueRun}
        />
      )}
      {screen === 'sim' && <SimulationScreen result={resultRef.current} onFinish={backToResult} squadNames={new Set(squad.map(s => s.player.name))} teamName={teamName} tactics={tacticsRef.current} />}
      {screen === 'result' && <ResultScreen squad={squad} result={resultRef.current} config={config} rerollsUsed={rerollsUsed} onPlayAgain={reset} onViewReport={() => setScreen('sim')} teamName={teamName} tactics={tacticsRef.current} />}
    </div>
  )
}
