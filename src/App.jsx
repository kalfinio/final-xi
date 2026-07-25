import { useState, useEffect, useRef } from 'react'
import {
  FORMATIONS,
  SLOT_NAMES,
  TAG_LABELS,
  DIFFICULTIES,
  playerPoints,
  playerBreakdown,
  canPlay,
  computeRating,
  squadStrengthBreakdown,
  squadMVP,
  smartestPick,
  topBonus,
  keyWeakness,
  bestRoleSynergy,
  tacticalIdentity,
  eraCounts,
  bestEraPick,
  knockoutOutlook,
  createRunSimulation,
  ordinal,
  outcomeLabel,
  runVerdict,
  validateXI,
  posTypeOf,
  makeRng,
  randomSeed,
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
import UpgradeOffer from './UpgradeOffer'
import { MatchHub, PostMatchCard, itemForMatch, runRecord, mcStageLabel } from './RunFlow'
import {
  buildUpgradeContext, generateUpgradeOffer, shouldOfferUpgrade, recordSimAllSkips,
  UPGRADES_BY_ID, upgradeLabel,
} from './runUpgrades'
import {
  createRunSnapshot, saveRunSnapshot, loadRunSnapshot, clearRunSnapshot,
  snapshotSummary, reconstructRun,
} from './runPersistence'
import { LEGACY_ENGINE_VERSION, M1_ENGINE_VERSION, selectEngineVersionForNewRun } from './matchEngineVersions'
import { catalogueSlotOptions, activationCatalogVersion, getCatalogue } from './data/v2/catalogues'
import {
  CLUB_IDENTITIES,
  acknowledgeDraftGuidance,
  analyzeSquadNeed,
  buildPickFeedback,
  calculateIdentityFit,
  clubIdentity,
  hasSeenDraftGuidance,
  playerArchetype,
  playerKeyStrengths,
  playerQualityTier,
  playerRoleSuitability,
  playerSignatures,
  playerTradeoff,
} from './draftClarity'

const TOTAL_REROLLS = 3

// Development-only M1 browser harness. Production builds compile DEV to
// false, Daily explicitly ignores the override, and the chosen controller
// version is persisted normally so refresh/Resume exercises the real path.
export function developmentMatchEngineVersion(config, search = null, isDevelopment = import.meta.env.DEV) {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const requested = new URLSearchParams(query).get('engine')
  return selectEngineVersionForNewRun({
    mode: config?.mode,
    pool: config?.pool,
    requestedEngineVersion: requested === M1_ENGINE_VERSION || requested === LEGACY_ENGINE_VERSION ? requested : null,
    isDevelopment,
  })
}

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

export function HowToPlay() {
  return (
    <div className="mt-2 p-4 rounded-lg bg-card border border-border space-y-3">
      <HowToStep n={1} title="Choose your run">Random Run gives a fresh draft each time. Daily Challenge gives everyone the same draft for the day.</HowToStep>
      <HowToStep n={2} title="Choose difficulty">Casual is easier, Classic is balanced, Legendary is harder.</HowToStep>
      <HowToStep n={3} title="Choose your player pool">Legends Only is classic icons. Modern Mix adds modern stars.</HowToStep>
      <HowToStep n={4} title="Choose a Club Identity">Decide what kind of team you want to build. Identity guides recruitment; it does not lock your match plan.</HowToStep>
      <HowToStep n={5} title="Pick a formation">The formation decides which positions you need to fill.</HowToStep>
      <HowToStep n={6} title="Draft your XI">Compare Player Quality, Identity Alignment, and Squad Need. Alignment shows how naturally a player matches your squad style — it does not directly increase match probability.</HowToStep>
      <HowToStep n={7} title="Set Your XI">Rearrange players into their real eligible positions. Illegal moves are blocked.</HowToStep>
      <HowToStep n={8} title="Build your squad strength">Player value, current-ability traits, squad bonuses, and weaknesses shape your European Run odds. R2 shows both raw and effective strength.</HowToStep>
      <HowToStep n={9} title="Play the European Run">Pick a Match Plan for each opponent, then finish in the top 24 to reach the knockouts and survive each tie to Conquer Europe.</HowToStep>
      <div className="pt-1 border-t border-border text-xs text-gold/80">A strong XI combines individual quality, tactical alignment, and squad balance.</div>
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

// First-run onboarding modal — a concise 4-step explainer.
const HOWTO_KEY = 'finalxi.howToPlaySeen.v1'

function HowToPlayModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-xl bg-card border border-gold/30 p-5 sm:p-6 fx-in" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute top-2.5 right-3 text-secondary hover:text-gold text-2xl leading-none fx-press">×</button>
        <h2 className="text-xl font-black text-gold mb-1">Welcome to Final XI</h2>
        <p className="text-xs text-secondary mb-4">The whole game in four steps.</p>
        <div className="space-y-3 mb-5">
          <HowToStep n={1} title="Choose your style">Pick a Club Identity, then a formation for the team you want to build.</HowToStep>
          <HowToStep n={2} title="Draft with a reason">Compare Player Quality, Identity Alignment, and Squad Need. Star power alone is not enough.</HowToStep>
          <HowToStep n={3} title="Name & plan">Name your team, then open Tactical Breakdown to see your in / out-of-possession shape.</HowToStep>
          <HowToStep n={4} title="Play the European Run">Go match by match — Watch Match, Quick Sim, or Sim All to the final result.</HowToStep>
        </div>
        <button onClick={onClose} className="w-full px-5 py-3 rounded-md font-semibold fx-press bg-gold text-black hover:bg-gold/90">Got it — Start Drafting</button>
      </div>
    </div>
  )
}

// Compact "Resume Run" card + a New Run confirmation modal (Phase 6.1). Shown
// on the intro screen when a valid active-run snapshot exists.
function ResumeCard({ summary, onResume }) {
  if (!summary) return null
  const { w, d, l } = summary.record
  return (
    <div className="fx-in mb-5 p-4 rounded-lg border border-gold/40 bg-gold/5">
      <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Continue where you left off</div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-black text-lg text-primary truncate">{summary.teamName}</div>
          <div className="text-xs text-secondary">
            {summary.mode === 'daily' ? `Daily ${summary.dateKey || ''} · ` : ''}{summary.stageLabel}
            {summary.clubIdentity && <><span className="mx-1.5">·</span>{summary.clubIdentity}</>}
            <span className="mx-1.5">·</span>{w}W-{d}D-{l}L
            {summary.upgradeCount > 0 && <><span className="mx-1.5">·</span>{summary.upgradeCount} Run Upgrade{summary.upgradeCount > 1 ? 's' : ''}</>}
          </div>
        </div>
        <button onClick={onResume} className="shrink-0 px-5 py-2.5 rounded-md font-semibold fx-press bg-gold text-black hover:bg-gold/90">Resume Run</button>
      </div>
    </div>
  )
}

function NewRunConfirm({ onKeep, onReplace }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onKeep}>
      <div className="relative w-full max-w-sm rounded-xl bg-card border border-gold/30 p-5 sm:p-6 fx-in text-center" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-black text-gold mb-1">Start a new run?</h2>
        <p className="text-sm text-secondary mb-5">Your current European Run will be replaced. This can't be undone.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onKeep} variant="ghost" className="w-full sm:w-auto">Keep Current Run</Button>
          <Button onClick={onReplace} className="w-full sm:w-auto">Start New Run</Button>
        </div>
      </div>
    </div>
  )
}

function IntroScreen({ onStart, stats, savedRun, onResume, resumeError }) {
  // Brand-new players (no recorded games) start on Casual so a first run isn't
  // brutal before they learn roles/synergies. Returning users keep Classic.
  const firstTime = !stats?.gamesPlayed
  const [formation, setFormation] = useState(null)
  const [mode, setMode] = useState('random')
  const [difficulty, setDifficulty] = useState(firstTime ? 'casual' : 'classic')
  const [pool, setPool] = useState('modern')
  const [identity, setIdentity] = useState(null)
  const [howOpen, setHowOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const summary = savedRun ? snapshotSummary(savedRun) : null
  // Starting a run replaces any active save — confirm first when one exists.
  // The activation catalogue is fixed at run creation from the chosen mode/pool
  // (normal Modern Mix → curated V2; Daily/Legends → frozen legacy) and stays
  // constant for the whole run, so offers, rerolls and restore use one catalogue.
  function requestStart() {
    const cfg = { formation, mode, difficulty, pool, clubIdentity: identity, catalogVersion: activationCatalogVersion({ mode, pool }) }
    if (summary) setConfirmNew(cfg)
    else onStart(cfg)
  }
  // Auto-show the onboarding modal only the first time the game is opened.
  const [showModal, setShowModal] = useState(() => {
    try { return !localStorage.getItem(HOWTO_KEY) } catch { return false }
  })
  function closeModal() {
    try { localStorage.setItem(HOWTO_KEY, '1') } catch { /* ignore */ }
    setShowModal(false)
  }
  const fav = favoriteFormation(stats)

  return (
    <div className="relative">
      {showModal && <HowToPlayModal onClose={closeModal} />}
      {confirmNew && <NewRunConfirm onKeep={() => setConfirmNew(false)} onReplace={() => { setConfirmNew(false); onStart(confirmNew) }} />}
      <IntroBackdrop />
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-8 sm:py-10">
        <div className="text-center mb-7 sm:mb-8">
          <h1 className="fx-in text-4xl sm:text-5xl font-black tracking-tight text-gold mb-2">Final XI</h1>
          <p className="fx-in fx-d1 text-secondary text-base sm:text-lg">Draft 11 legends. Conquer Europe.</p>
          <button onClick={() => setShowModal(true)} className="fx-in fx-d1 mt-2 text-xs text-gold/80 hover:text-gold underline-offset-2 hover:underline">How to Play</button>
        </div>

        {resumeError && <div className="fx-in mb-4 p-3 rounded-lg border border-danger/40 bg-danger/5 text-center text-xs text-danger">Saved run could not be restored. Start a new run to continue.</div>}
        <ResumeCard summary={summary} onResume={onResume} />

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

        <h2 className="fx-in fx-d4 text-xs uppercase tracking-widest text-secondary mb-2">Club Identity</h2>
        <p className="fx-in fx-d4 text-xs text-secondary mb-3">Your Club Identity shapes recruitment and squad alignment. You can still choose a different Match Plan before every match.</p>
        <div className="fx-in fx-d4 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {CLUB_IDENTITIES.map((option) => {
            const active = identity === option.key
            return (
              <button key={option.key} onClick={() => setIdentity(option.key)} className={`fx-lift p-4 rounded-lg border text-left ${active ? 'border-gold bg-card ring-1 ring-gold/40' : 'border-border bg-surface'}`}>
                <div className={`font-black text-lg ${active ? 'text-gold' : 'text-primary'}`}>{option.name}</div>
                <div className="text-sm font-semibold text-primary">{option.slogan}</div>
                <div className="text-xs text-secondary mt-1 leading-snug">{option.description}</div>
              </button>
            )
          })}
        </div>
        {identity && (() => {
          const selected = clubIdentity(identity)
          return (
            <div className="fx-in mb-6 p-4 rounded-lg border border-border bg-card text-xs">
              <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Values</div>
                  <div className="text-secondary">{selected.values.join(' · ')}</div>
                </div>
                <div className="sm:max-w-[15rem]">
                  <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Tradeoff</div>
                  <div className="text-secondary">{selected.tradeoff}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border text-secondary">Style reference: {selected.inspiredBy}</div>
            </div>
          )
        })()}

        <div className="fx-in fx-d4 mb-6">
          <button onClick={() => setHowOpen((o) => !o)} className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-surface text-left">
            <span className="text-sm font-semibold">Detailed Guide</span>
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
          <Button onClick={requestStart} disabled={!formation || !identity} className="fx-lift w-full sm:w-auto">
            {summary ? 'Start New Run' : `Start ${mode === 'daily' ? 'Daily Challenge' : 'Draft'}`}
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
// Draft card: plain-language decision layer first, expert detail on demand.
// ---------------------------------------------------------------------------
export function PlayerDetails({ player, slot, fit, tradeoff }) {
  const b = playerBreakdown(player)
  const suitability = playerRoleSuitability(player)
  const signatures = playerSignatures(player)
  const suitabilityLabel = (level) => level >= 3 ? 'Natural' : level >= 2 ? 'Accomplished' : 'Alternative'
  return (
    <div className="mt-3 p-3 rounded bg-bg border border-border text-[11px] space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Advanced role</div>
        <div className="font-semibold text-primary">{slotAwareRole(player, slot || player.primaryPos)}{b.secondaryRole ? ` · ${b.secondaryRole}` : ''}</div>
        <div className="text-secondary leading-snug mt-1">{roleReasonText(player)}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Role suitability</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(suitability).sort((a, b) => b[1] - a[1]).map(([role, level]) => (
            <span key={role} className="px-2 py-1 rounded border border-border bg-surface text-secondary"><span className="text-primary">{role}</span> · {suitabilityLabel(level)}</span>
          ))}
        </div>
      </div>
      {signatures.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Signatures</div>
          <div className="flex flex-wrap gap-1.5">
            {signatures.map((signature) => <span key={signature} className="px-2 py-1 rounded border border-border bg-surface text-secondary">{signature}</span>)}
          </div>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">{fit.identityName} alignment: {fit.label}</div>
        <div className="space-y-1 text-secondary">
          {fit.why.map((reason) => <div key={reason}><span className="text-success">+</span> {reason}</div>)}
          {tradeoff && <div><span className="text-gold">Tradeoff:</span> {tradeoff}</div>}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">Final XI value breakdown</div>
        <div className="text-secondary mb-2">Internal draft value used by the game. This is not a football rating.</div>
        <div className="space-y-1">
          <div className="flex justify-between"><span className="text-secondary">Base: {b.basePos}</span><span className="text-primary">+{b.base}</span></div>
          {b.traits.map((trait, i) => <div key={i} className="flex justify-between"><span className="text-secondary">{trait.label}</span><span className="text-primary">+{trait.pts}</span></div>)}
          {b.extras.map((extra, i) => <div key={`x${i}`} className="flex justify-between"><span className="text-secondary">{extra.label}</span><span className="text-gold">+{extra.pts}</span></div>)}
          <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Draft value</span><span className="text-gold">{b.total}</span></div>
        </div>
      </div>
      <div className="border-t border-border pt-2">
        <Badges player={player} className="mb-2" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {player.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded bg-surface border border-border text-[10px] text-secondary">{TAG_LABELS[tag]}</span>)}
        </div>
        <div className="text-secondary leading-snug"><span className="text-primary font-semibold">Evidence: </span>{roleEvidenceText(player)}</div>
        <div className="text-secondary mt-1">Historical pick rate: {player.rarity}%</div>
      </div>
    </div>
  )
}

function fitStyle(label) {
  if (label === 'STRONG') return 'text-success border-success/40 bg-success/5'
  if (label === 'GOOD') return 'text-gold border-gold/40 bg-gold/5'
  if (label === 'WEAK') return 'text-danger border-danger/40 bg-danger/5'
  return 'text-primary border-border bg-surface'
}

export function PlayerCard({ player, onPick, slot, identityKey, squadNeed }) {
  const [open, setOpen] = useState(false)
  const fit = calculateIdentityFit(player, identityKey)
  const quality = playerQualityTier(player)
  const strengths = playerKeyStrengths(player)
  const tradeoff = playerTradeoff(player, { fit, squadNeed })
  return (
    <div className="w-full p-4 rounded-lg bg-card border border-border text-left flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="font-bold text-lg leading-tight break-words">{player.name}</div>
          <div className="text-xs text-secondary mt-1">{player.country} · {player.club}</div>
        </div>
        <div className="shrink-0 text-right max-w-[8rem]">
          <div className="text-[9px] uppercase tracking-widest text-secondary">Player Quality</div>
          <div className="text-sm leading-tight font-black text-gold">{quality.label}</div>
          <div className="mt-1"><PosBadge type={player.posType} label={player.primaryPos} /></div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[9px] uppercase tracking-widest text-secondary">Archetype</div>
        <div className="text-sm font-black text-primary">{playerArchetype(player)}</div>
      </div>
      <div className="space-y-1.5 text-sm mb-3 min-h-[3.25rem]">
        {strengths.map((strength) => <div key={strength} className="text-secondary"><span className="text-success font-bold">+</span> {strength}</div>)}
      </div>

      <div className={`rounded border p-2.5 mb-2 text-xs ${fitStyle(fit.label)}`}>
        <div className="flex justify-between gap-2 font-bold">
          <span>{fit.identityName} ALIGNMENT</span>
          <span>{fit.label}</span>
        </div>
        {squadNeed && <div className="mt-2 pt-2 border-t border-current/20"><span className="font-bold">{squadNeed.label}</span><span className="block mt-0.5 opacity-80">{squadNeed.detail}</span></div>}
      </div>
      {tradeoff && <div className="text-[11px] text-secondary mb-3"><span className="text-gold font-semibold">Tradeoff:</span> {tradeoff}</div>}

      <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
        <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="px-3 py-2 rounded-md text-[11px] font-semibold border border-border bg-surface text-secondary hover:text-gold hover:border-gold">{open ? 'HIDE DETAILS' : 'VIEW DETAILS'}</button>
        <button onClick={onPick} className="px-3 py-2 rounded-md text-[11px] font-bold bg-gold text-black hover:bg-gold/90 fx-press">SELECT</button>
      </div>
      {open && <PlayerDetails player={player} slot={slot} fit={fit} tradeoff={tradeoff} />}
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
export function DraftGuidance({ identityKey, onClose }) {
  const [exampleOpen, setExampleOpen] = useState(false)
  const identity = clubIdentity(identityKey)
  return (
    <div className="mb-5 p-4 rounded-lg border border-gold/40 bg-gold/5">
      <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">A strong team is more than star power</div>
      <div className="font-bold text-primary mb-1">The highest-rated player is not always the best pick.</div>
      <p className="text-xs text-secondary leading-snug">Player Quality shows broad individual level. Look at Quality, {identity.name} Alignment, and Squad Need together. Alignment shows how naturally the player matches your squad style — it does not directly increase match probability.</p>
      {exampleOpen && (
        <div className="mt-3 p-3 rounded bg-bg border border-border text-xs text-secondary leading-snug">
          A creative star may have the stronger individual profile, while a midfielder who protects the defence can be the better choice when that profile is missing. Alignment and Need explain that opportunity cost.
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={onClose} className="px-4 py-2 rounded-md bg-gold text-black text-xs font-bold fx-press">GOT IT</button>
        <button onClick={() => setExampleOpen((value) => !value)} className="px-4 py-2 rounded-md border border-border bg-card text-primary text-xs font-semibold">{exampleOpen ? 'HIDE EXAMPLE' : 'SHOW ME AN EXAMPLE'}</button>
      </div>
    </div>
  )
}

function PickFeedback({ feedback, onClose }) {
  if (!feedback) return null
  return (
    <div role="status" className="mb-5 p-3 rounded-lg border border-border bg-surface relative">
      <button onClick={onClose} aria-label="Dismiss selection feedback" className="absolute top-2 right-3 text-secondary hover:text-primary text-lg leading-none">×</button>
      <div className="text-xs uppercase tracking-widest text-gold font-bold pr-6">{feedback.title}</div>
      <div className="mt-1.5 grid sm:grid-cols-2 gap-1 text-xs text-secondary">
        {feedback.positives.map((positive) => <div key={positive}><span className="text-success font-bold">+</span> {positive}</div>)}
        {feedback.warning && <div><span className="text-gold font-bold">Tradeoff:</span> {feedback.warning}</div>}
      </div>
    </div>
  )
}

function DraftScreen({ config, onComplete }) {
  const { formation, mode, difficulty, pool, catalogVersion, clubIdentity: identityKey } = config
  const slots = FORMATIONS[formation].slots
  const [squad, setSquad] = useState(() => slots.map((slot) => ({ slot, player: null })))
  const [index, setIndex] = useState(0)
  const [choices, setChoices] = useState([])
  const [rerollsLeft, setRerollsLeft] = useState(TOTAL_REROLLS)
  const [slotRerolls, setSlotRerolls] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [showGuidance, setShowGuidance] = useState(() => !hasSeenDraftGuidance())

  useEffect(() => {
    if (index < slots.length) {
      const usedIds = squad.filter((s) => s.player).map((s) => s.player.id)
      setChoices(catalogueSlotOptions({ catalogVersion, mode, slotLabel: slots[index], slotIndex: index, rerollCount: slotRerolls, usedIds, pool }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slotRerolls])

  function pick(player) {
    const next = squad.map((s, i) => (i === index ? { ...s, player } : s))
    const nextFeedback = buildPickFeedback({ player, identityKey, squad, pickIndex: index, formationSlots: slots })
    setSquad(next)
    setFeedback(nextFeedback)
    if (index + 1 >= slots.length) onComplete(next, TOTAL_REROLLS - rerollsLeft, nextFeedback)
    else { setIndex(index + 1); setSlotRerolls(0) }
  }

  function reroll() {
    if (rerollsLeft <= 0) return
    setRerollsLeft((r) => r - 1)
    setSlotRerolls((c) => c + 1)
  }

  const slot = slots[index]
  function closeGuidance() {
    acknowledgeDraftGuidance()
    setShowGuidance(false)
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {showGuidance && <DraftGuidance identityKey={identityKey} onClose={closeGuidance} />}
      <div className="mb-6">
        <div className="flex justify-between items-center gap-2 text-xs text-secondary mb-1.5">
          <span className="flex items-center gap-2 min-w-0 truncate"><ModeBadge mode={mode} /><span className="truncate">{formation} · {clubIdentity(identityKey).name} · {DIFFICULTIES[difficulty].name}</span></span>
          <span className="shrink-0 font-semibold text-primary">{index} / 11</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${(index / 11) * 100}%` }} /></div>
      </div>

      <div className="text-center mb-6">
        <p className="text-secondary text-xs sm:text-sm uppercase tracking-widest">Pick your</p>
        <h2 className="text-2xl sm:text-3xl font-black text-gold">{SLOT_NAMES[slot]}</h2>
        <p className="text-[11px] text-secondary mt-2">Compare broad quality with Identity Alignment and what your squad still needs.</p>
      </div>

      <PickFeedback feedback={feedback} onClose={() => setFeedback(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-start">
        {choices.map((player) => {
          const squadNeed = analyzeSquadNeed({ squad, candidate: player, pickIndex: index, formationSlots: slots })
          return <PlayerCard key={player.id} player={player} onPick={() => pick(player)} slot={slot} identityKey={identityKey} squadNeed={squadNeed} />
        })}
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
function SetXIScreen({ config, draftedSquad, onConfirm, onReset, lastPickFeedback, onDismissFeedback }) {
  const [squad, setSquad] = useState(draftedSquad)
  const [selected, setSelected] = useState(null) // index of tapped player
  const [message, setMessage] = useState(null)
  const [showFinalFeedback, setShowFinalFeedback] = useState(true)
  const finalSelection = draftedSquad[draftedSquad.length - 1]
  const finalFeedback = lastPickFeedback || buildPickFeedback({
    player: finalSelection.player,
    identityKey: config.clubIdentity,
    squad: draftedSquad.slice(0, -1),
    pickIndex: draftedSquad.length - 1,
    formationSlots: FORMATIONS[config.formation].slots,
  })

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

      <PickFeedback feedback={showFinalFeedback ? finalFeedback : null} onClose={() => { setShowFinalFeedback(false); onDismissFeedback?.() }} />

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

export function BonusesScreen({ squad, config, rerollsUsed, onSimulate, initialTeamName }) {
  const { base, bonusTotal, total, bonuses, weaknesses } = computeRating(squad)
  const strength = squadStrengthBreakdown(squad)
  const usesR2Strength = strength.policy === 'ability'
  const positiveBonusTotal = bonuses.reduce((sum, bonus) => sum + bonus.pts, 0)
  const displayStrength = (value) => Number.isInteger(value) ? value : Number(value.toFixed(1))
  const squadProfile = tacticalIdentity(squad)
  const [howOpen, setHowOpen] = useState(false)
  const [tacticsOpen, setTacticsOpen] = useState(false)
  const [teamName, setTeamName] = useState(initialTeamName || DEFAULT_TEAM_NAME)
  const outlook = knockoutOutlook(squad, config.difficulty)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-center gap-2 mb-1 flex-wrap"><ModeBadge mode={config.mode} /><span className="text-xs text-secondary">{config.formation} · {DIFFICULTIES[config.difficulty].name}</span></div>
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">Squad Rating</h2>
      <p className="text-center text-secondary text-sm mb-6">Club Identity: <span className="text-primary font-semibold">{clubIdentity(config.clubIdentity)?.name || 'UNSET'}</span><span className="mx-2">·</span>Squad profile: <span className="text-primary font-semibold">{squadProfile}</span><span className="mx-2">·</span>Rerolls: <span className="text-primary font-semibold">{rerollsUsed}</span></p>

      {usesR2Strength ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <StatBox label="Player Value" value={base} />
          <StatBox label="Squad Bonuses" value={`+${positiveBonusTotal}`} accent="text-success" />
          <StatBox label="Raw Strength" value={displayStrength(strength.rawStrength)} />
          <StatBox label="Effective Strength" value={displayStrength(strength.effectiveStrength)} accent="text-gold" />
        </div>
      ) : (
        <div className="flex gap-2 sm:gap-3 mb-4">
          <StatBox label="Player Value" value={base} />
          <StatBox label="Bonus" value={`${bonusTotal >= 0 ? '+' : ''}${bonusTotal}`} accent={bonusTotal >= 0 ? 'text-success' : 'text-danger'} />
          <StatBox label="Total" value={total} accent="text-gold" />
        </div>
      )}

      {/* Plain-English meaning of this screen — quick clarity for new players. */}
      <div className="mb-6 p-3 rounded-lg bg-card border border-border text-xs text-secondary space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-gold/80 mb-1">What this means</div>
        {usesR2Strength ? (
          <>
            <div><span className="text-primary font-semibold">Raw Strength</span> = player value + active squad bonuses.</div>
            <div><span className="text-primary font-semibold">Effective Strength</span> = the R2-compressed value used by the engine's win-probability curve.</div>
            <div><span className="text-primary font-semibold">Weaknesses</span> apply separately as a capped probability penalty.</div>
          </>
        ) : <div><span className="text-primary font-semibold">Rating</span> = squad quality + chemistry bonuses.</div>}
        <div><span className="text-primary font-semibold">Strengths</span> help your European Run.</div>
        {!usesR2Strength && <div><span className="text-primary font-semibold">Weaknesses</span> can show up in match commentary.</div>}
        <div><span className="text-primary font-semibold">Tactics</span> shape match events and your tactical notes.</div>
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
          {usesR2Strength ? (
            <>
              <div><span className="text-primary font-semibold">Raw Strength</span> = player value + bonuses + role synergies</div>
              <div><span className="text-primary font-semibold">Effective Strength</span> = compressed Raw Strength; the engine then applies weakness penalties and match context</div>
              <div className="text-gold/80">Both values are shown above so the number used by the probability curve is never hidden.</div>
            </>
          ) : (
            <>
              <div><span className="text-primary font-semibold">Final Rating</span> = player value + bonuses + role synergies − weaknesses</div>
              <div className="text-gold/80">A higher Final Rating lifts your odds — but pressure rises every round and the Final is the hardest match.</div>
            </>
          )}
        </div>
      )}

      <button onClick={() => setTacticsOpen((o) => !o)} className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-surface text-left mb-1">
        <span className="text-sm font-semibold">{tacticsOpen ? 'Hide Tactical Breakdown' : 'Show Tactical Breakdown'}</span>
        <span className="text-secondary text-sm">{tacticsOpen ? '−' : '+'}</span>
      </button>
      <p className="text-[11px] text-secondary px-1 mb-6">Shows how your XI behaves in and out of possession.</p>
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
        <p className="text-[11px] text-secondary text-center mt-1.5">Used in the Match Center and share card · up to {TEAM_NAME_MAX} characters.</p>
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

// Reads the canonical MatchDetail (match.detail.finalStats / keyPlayer) — the
// same source the Match Center and Post Match Card use. Legacy match.stats is
// only a fallback for matches without detail.
function StatsGrid({ match, squadNames }) {
  const d = match.detail
  const home = d?.finalStats?.home
  const s = match.stats || {}
  const poss = home?.possession ?? s.possession
  const shots = home?.shots ?? s.shots
  const sot = home?.shotsOnTarget ?? s.shotsOnTarget
  const xg = home?.xg ?? s.xg
  const saves = home?.saves ?? s.saves
  const fouls = home?.fouls ?? s.fouls
  const potm = d?.keyPlayer ?? s.potm
  return (
    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
      <Stat label="Poss" value={`${poss}%`} />
      <Stat label="Shots" value={`${sot}/${shots}`} />
      <Stat label="xG" value={xg} />
      <Stat label="Saves" value={saves} />
      <Stat label="Fouls" value={fouls} />
      <Stat label="MotM" value={squadDisplayName(String(potm), squadNames)} />
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
      <StatsGrid match={r} squadNames={squadNames} />
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
      <StatsGrid match={m} squadNames={squadNames} />
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

function ResultScreen({ squad, result, config, rerollsUsed, onPlayAgain, onViewReport, teamName, tactics, upgrades = [] }) {
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
        <DetailRow label="Run upgrades" value={upgrades.length ? upgrades.map(upgradeLabel).join(', ') : '—'} accent={upgrades.length ? 'text-gold' : 'text-secondary'} />
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
  const [lastPickFeedback, setLastPickFeedback] = useState(null)
  const [stats, setStats] = useState(() => loadStats())
  const [teamName, setTeamName] = useState(() => loadTeamName())
  // Phase 4 staged run: matchNo counts hubs shown (also keys the hub so the
  // approach selector resets to Balanced for every new match).
  const [matchNo, setMatchNo] = useState(0)
  const resultRef = useRef(null)
  const tacticsRef = useRef(null)
  const runRef = useRef(null)          // staged run controller
  const pendingRef = useRef(null)      // prepared-but-unresolved match
  const currentMatchRef = useRef(null) // the one locked, resolved match
  const recordedRef = useRef(false)
  // Phase 6 run-scoped upgrade state: owned upgrades + full offer history.
  const upgradeStateRef = useRef({ owned: [], offers: [] })
  const runSeedRef = useRef(0)
  // Phase 6.1 persistence: daily date-key for the active run, the hub's
  // currently-selected (unlocked) approach, and the intro Resume snapshot.
  const dailyDateRef = useRef(null)
  const selectedApproachRef = useRef('balanced')
  const [savedRun, setSavedRun] = useState(() => loadRunSnapshot())
  const [resumeError, setResumeError] = useState(false)

  // Persist the active run at a checkpoint. Cheap, called only at real state
  // transitions — never per frame. Rebuilds a minimal snapshot from refs.
  function persistRun(screen, extra = {}) {
    const ctrl = runRef.current
    if (!ctrl || !squad || !config) return
    try {
      saveRunSnapshot(createRunSnapshot({
        engineVersion: ctrl.engineVersion,
        config: { ...config, dateKey: dailyDateRef.current },
        // Persist the exact catalogue this run drafted from so restore resolves
        // the same players; absent/legacy runs still default to legacy_v1.
        catalogVersion: config.catalogVersion,
        dbVersion: getCatalogue(config.catalogVersion)?.dbVersion,
        runSeed: runSeedRef.current,
        teamName: extra.teamName ?? teamName, squad, rerollsUsed,
        matches: ctrl.matches,
        upgradeState: upgradeStateRef.current,
        checkpoint: {
          screen,
          resolvedMatchCount: ctrl.resolvedCount,
          currentMatchIndex: extra.currentMatchIndex ?? null,
          selectedApproach: selectedApproachRef.current,
          stageLabel: extra.stageLabel ?? pendingRef.current?.stageLabel ?? null,
        },
      }))
    } catch { /* storage best-effort */ }
  }

  function startDraft(cfg) { setConfig(cfg); setScreen('draft') }

  function finishDraft(finalSquad, usedRerolls, feedback) {
    setDraftedSquad(finalSquad)
    setRerollsUsed(usedRerolls)
    setLastPickFeedback(feedback)
    setScreen('setxi')
  }

  function confirmXI(finalSquad) { setSquad(finalSquad); setScreen('bonuses') }

  function runSimulation(rawName) {
    const clean = saveTeamName(rawName)   // sanitize + persist last used
    setTeamName(clean)
    const { total } = computeRating(squad)
    // Both modes seed the sim RNG (Phase 6.1): the whole run is reproducible
    // from runSeed, which is what run persistence stores and replays. Daily's
    // seed is content-derived (same draft → same run for everyone); a random
    // run picks one fixed seed once. Only the seed pick uses Math.random; the
    // simulation itself never does. Balance/distribution are unchanged.
    let dateKey = null
    let runSeed
    if (config.mode === 'daily') {
      dateKey = todayKey()
      const ids = squad.map((s) => s.player.id)
      const slots = squad.map((s) => s.slot)
      runSeed = buildSimSeed({ dateKey, formation: config.formation, ids, slots, difficulty: config.difficulty, pool: config.pool, rerollsUsed })
    } else {
      runSeed = randomSeed()
    }
    const rng = makeRng(runSeed)
    // A new run replaces any active save.
    clearRunSnapshot()
    setSavedRun(null)
    // Staged run (Phase 4): matches resolve one at a time, each when its
    // tactical approach locks — nothing about a match exists before that.
    // Phase 6: run upgrades feed the same pipeline via upgradeContextFor;
    // with nothing owned the context is empty and the run is byte-identical.
    upgradeStateRef.current = { owned: [], offers: [] }
    runSeedRef.current = runSeed
    dailyDateRef.current = dateKey
    selectedApproachRef.current = 'balanced'
    runRef.current = createRunSimulation({
      rating: total, difficulty: config.difficulty, squad, rng, runSeed,
      engineVersion: developmentMatchEngineVersion(config),
      upgradeContextFor: (mc, profile) => buildUpgradeContext(upgradeStateRef.current.owned, mc, profile),
    })
    // Tactical read of the XI — flavours the Match Center, report and result.
    tacticsRef.current = buildTactics(squad, config.formation)
    resultRef.current = null
    recordedRef.current = false
    currentMatchRef.current = null
    pendingRef.current = runRef.current.prepareNext()
    setMatchNo(1)
    // React has not committed setTeamName(clean) yet, so pass the sanitized
    // value directly into this first checkpoint.
    persistRun('hub', { stageLabel: pendingRef.current?.stageLabel, teamName: clean })
    setScreen('hub')
  }

  // ---- European Run, match by match -------------------------------------
  // Watch / Quick Sim lock the approach and resolve the match exactly once;
  // both then read the same stored canonical match object.
  function watchMatch(approach) {
    currentMatchRef.current = runRef.current.resolveNext(approach)
    persistRun('watch', { currentMatchIndex: runRef.current.resolvedCount - 1 })
    setScreen('watch')
  }
  function quickSim(approach) {
    currentMatchRef.current = runRef.current.resolveNext(approach)
    persistRun('postmatch', { currentMatchIndex: runRef.current.resolvedCount - 1 })
    setScreen('postmatch')
  }

  // Continue from a finished match: first check the Phase 6 upgrade schedule
  // (offer BEFORE preparing the next match, so the new context applies to it),
  // then advance to the next hub or the final result.
  function continueRun() {
    const ctrl = runRef.current
    const st = upgradeStateRef.current
    if (
      shouldOfferUpgrade(currentMatchRef.current, ctrl, st.offers.length) &&
      !st.offers.some((o) => o.afterMatch === ctrl.resolvedCount)
    ) {
      const offerIndex = st.offers.length + 1
      const offer = {
        offerIndex,
        afterMatch: ctrl.resolvedCount,
        optionIds: generateUpgradeOffer({ runSeed: runSeedRef.current, offerIndex, owned: st.owned }),
        chosenId: null,
      }
      st.offers.push(offer)
      persistRun('upgrade', { currentMatchIndex: ctrl.resolvedCount - 1 })
      setScreen('upgrade')
      return
    }
    advanceToNextMatch()
  }

  function advanceToNextMatch() {
    const pending = runRef.current.prepareNext()
    if (pending) {
      pendingRef.current = pending
      selectedApproachRef.current = 'balanced' // fresh hub defaults to Balanced
      setMatchNo((n) => n + 1)
      persistRun('hub', { stageLabel: pending.stageLabel })
      setScreen('hub')
    } else {
      finishRun()
    }
  }

  // Resolve the open upgrade offer (id = null → skip), then move on. The
  // pick mutates only run-scoped upgrade state — never simulation RNG.
  function pickUpgrade(id) {
    const st = upgradeStateRef.current
    const offer = st.offers[st.offers.length - 1]
    if (offer && !offer.chosenId) {
      offer.chosenId = id || 'skipped'
      if (id) {
        const existing = st.owned.find((o) => o.id === id)
        if (existing) existing.stacks = Math.min((existing.stacks || 1) + 1, UPGRADES_BY_ID[id].stackMax)
        else st.owned.push({ id, stacks: 1, acquiredAfterMatch: offer.afterMatch })
      }
    }
    advanceToNextMatch()
  }

  // Sim All: the current match uses the approach selected on the hub; every
  // remaining match uses Balanced. Future upgrade offers are SKIPPED (never
  // auto-selected) and recorded deterministically for the report.
  function simAll(approach) {
    const fromCount = runRef.current.resolvedCount
    runRef.current.resolveNext(approach)
    runRef.current.finishRemaining('balanced')
    recordSimAllSkips(upgradeStateRef.current, runRef.current, fromCount, runSeedRef.current)
    finishRun()
  }

  // Record the game once, then show the final result/share screen.
  function finishRun() {
    if (!resultRef.current) resultRef.current = runRef.current.finish()
    if (!recordedRef.current) {
      const updated = recordGame({ result: resultRef.current, squad, formation: config.formation })
      setStats(updated)
      recordedRef.current = true
    }
    persistRun('result', { stageLabel: 'Run complete' })
    setScreen('result')
  }

  function backToResult() { persistRun('result', { stageLabel: 'Run complete' }); setScreen('result') }
  function viewReport() { persistRun('sim', { stageLabel: 'Run complete' }); setScreen('sim') }

  // Restore a saved run deterministically and jump to its checkpoint. Any
  // divergence (corrupt/incompatible snapshot) fails safely back to intro.
  function resumeRun() {
    const snap = loadRunSnapshot()
    const rec = snap ? reconstructRun(snap) : { ok: false }
    if (!rec.ok) {
      clearRunSnapshot(); setSavedRun(null); setResumeError(true); setScreen('intro'); return
    }
    runRef.current = rec.ctrl
    upgradeStateRef.current = rec.upgradeState
    runSeedRef.current = rec.runSeed
    dailyDateRef.current = rec.config.dateKey
    tacticsRef.current = buildTactics(rec.squad, rec.config.formation)
    selectedApproachRef.current = rec.selectedApproach
    pendingRef.current = rec.pending
    currentMatchRef.current = rec.currentMatch
    resultRef.current = rec.result
    recordedRef.current = (rec.screen === 'result' || rec.screen === 'sim') // already recorded when first finished
    setConfig({ formation: rec.config.formation, mode: rec.config.mode, difficulty: rec.config.difficulty, pool: rec.config.pool, clubIdentity: rec.config.clubIdentity || null, catalogVersion: rec.catalogVersion })
    setSquad(rec.squad)
    setTeamName(rec.teamName)
    setRerollsUsed(rec.rerollsUsed)
    setResumeError(false)
    setMatchNo(rec.matchNo)
    setScreen(rec.screen)
  }

  function reset() {
    clearRunSnapshot(); setSavedRun(null); setResumeError(false)
    setConfig(null); setDraftedSquad(null); setSquad(null); setRerollsUsed(0); setLastPickFeedback(null)
    resultRef.current = null; tacticsRef.current = null; recordedRef.current = false
    runRef.current = null; pendingRef.current = null; currentMatchRef.current = null
    upgradeStateRef.current = { owned: [], offers: [] }; runSeedRef.current = 0
    dailyDateRef.current = null; selectedApproachRef.current = 'balanced'
    setMatchNo(0); setScreen('intro')
  }

  const activeRunScreen = ['hub', 'watch', 'postmatch', 'upgrade', 'result', 'sim'].includes(screen)
  return (
    <div className="min-h-full">
      {screen === 'intro' && <IntroScreen onStart={startDraft} stats={stats} savedRun={savedRun} onResume={resumeRun} resumeError={resumeError} />}
      {screen === 'draft' && <DraftScreen config={config} onComplete={finishDraft} />}
      {screen === 'setxi' && <SetXIScreen config={config} draftedSquad={draftedSquad} onConfirm={confirmXI} lastPickFeedback={lastPickFeedback} onDismissFeedback={() => setLastPickFeedback(null)} />}
      {screen === 'bonuses' && <BonusesScreen squad={squad} config={config} rerollsUsed={rerollsUsed} onSimulate={runSimulation} initialTeamName={teamName} />}
      {screen === 'hub' && pendingRef.current && runRef.current && (
        <MatchHub
          key={matchNo}
          pending={pendingRef.current}
          teamName={teamName}
          record={runRecord(runRef.current.matches)}
          matchNumber={matchNo}
          firstTime={!stats?.gamesPlayed}
          squadProfile={runRef.current.squadProfile}
          clubIdentityKey={config?.clubIdentity || null}
          upgrades={upgradeStateRef.current.owned}
          initialApproach={selectedApproachRef.current}
          onApproachChange={(a) => { selectedApproachRef.current = a; persistRun('hub') }}
          onWatch={watchMatch}
          onQuick={quickSim}
          onSimAll={simAll}
        />
      )}
      {screen === 'upgrade' && upgradeStateRef.current.offers.length > 0 && (
        <UpgradeOffer
          offer={upgradeStateRef.current.offers[upgradeStateRef.current.offers.length - 1]}
          owned={upgradeStateRef.current.owned}
          teamName={teamName}
          onPick={(id) => pickUpgrade(id)}
          onSkip={() => pickUpgrade(null)}
        />
      )}
      {screen === 'watch' && currentMatchRef.current && (
        <MatchCenter
          squad={squad}
          feature={{ match: currentMatchRef.current, stageLabel: mcStageLabel(itemForMatch(currentMatchRef.current)) }}
          onContinue={continueRun}
          isLast={runRef.current.isDone}
          teamName={teamName}
          tactics={tacticsRef.current}
        />
      )}
      {screen === 'postmatch' && currentMatchRef.current && (
        <PostMatchCard
          squad={squad}
          item={itemForMatch(currentMatchRef.current)}
          teamName={teamName}
          tactics={tacticsRef.current}
          isLast={runRef.current.isDone}
          onContinue={continueRun}
        />
      )}
      {screen === 'sim' && <SimulationScreen result={resultRef.current} onFinish={backToResult} squadNames={new Set(squad.map(s => s.player.name))} teamName={teamName} tactics={tacticsRef.current} />}
      {screen === 'result' && <ResultScreen squad={squad} result={resultRef.current} config={config} rerollsUsed={rerollsUsed} onPlayAgain={reset} onViewReport={viewReport} teamName={teamName} tactics={tacticsRef.current} upgrades={upgradeStateRef.current.owned} />}
      {activeRunScreen && (
        <div className="text-center pb-4 -mt-1">
          <span className="text-[10px] text-secondary/60">Run saved on this device</span>
        </div>
      )}
    </div>
  )
}
