// Run Development offer screen (Phase 6). Presents one stored, deterministic
// offer — three upgrade cards, pick one or skip. Pure display: the offer was
// generated and frozen when the trigger fired; nothing here re-rolls it.
import { UPGRADES_BY_ID, UPGRADE_CATEGORIES } from './runUpgrades'

const TIER_STYLE = {
  gold: 'border-gold/60 ring-1 ring-gold/30',
  standard: 'border-border',
}

export default function UpgradeOffer({ offer, owned, teamName, onPick, onSkip }) {
  const ownedMap = Object.fromEntries((owned || []).map((o) => [o.id, o.stacks || 1]))
  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8">
      <div className="text-center mb-1"><span className="text-[10px] uppercase tracking-widest text-gold/80">European Run · Run Development</span></div>
      <h2 className="text-2xl sm:text-3xl font-black text-gold text-center mb-1">Pick One Upgrade</h2>
      <p className="text-center text-secondary text-sm mb-5">{teamName} can develop one part of its game for the rest of the run.</p>

      <div className="flex flex-col gap-3 mb-4">
        {offer.optionIds.map((id) => {
          const u = UPGRADES_BY_ID[id]
          if (!u) return null
          const stacking = ownedMap[id] ? ` ×${ownedMap[id] + 1}` : ''
          return (
            <button
              key={id}
              onClick={() => onPick(id)}
              className={`p-3.5 rounded-lg border bg-card text-left fx-press fx-lift hover:border-gold ${TIER_STYLE[u.tier] || TIER_STYLE.standard}`}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-black text-sm tracking-wide ${u.tier === 'gold' ? 'text-gold' : 'text-primary'}`}>{u.name.toUpperCase()}{stacking}</span>
                <span className="px-1.5 py-0.5 rounded border border-border text-[9px] uppercase tracking-wide text-secondary">{UPGRADE_CATEGORIES[u.category]}</span>
                {u.tier === 'gold' && <span className="px-1.5 py-0.5 rounded border border-gold/40 bg-gold/10 text-[9px] uppercase tracking-wide text-gold">Gold</span>}
              </div>
              <div className="text-xs text-secondary leading-snug">{u.desc}</div>
            </button>
          )
        })}
      </div>

      <div className="text-center">
        <button onClick={onSkip} className="text-xs text-secondary hover:text-gold underline-offset-2 hover:underline fx-press">Skip — keep the squad as it is →</button>
      </div>
    </div>
  )
}
