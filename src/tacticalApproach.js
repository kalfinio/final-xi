// ---------------------------------------------------------------------------
// Tactical approaches (Phase 4).
//
// One pre-match decision: "How should this XI approach this opponent?"
// An approach is ONLY a bounded modifier on the Phase 3 squad tactical
// profile (plus tightly bounded pattern-intent nudges). Everything else —
// probability, stat shifts, pattern modifiers, hub text, post-match notes —
// still flows through the single authoritative Phase 3 chain:
//
//   base squad profile
//     → selected approach          (this module)
//     → optional future Phase 6 run modifiers (upgradeContext hook below)
//     → adjusted tactical profile
//     → existing resolveTacticalMatchup()
//     → canonical probability delta / stat shifts / pattern effects
//
// There is NO separate approach probability, stat, or sequence system, and
// no hidden bonus for any approach. Balanced is a true no-op. Deterministic
// throughout — no RNG in this module.
//
// PHASE 6 EXTENSION POINTS (do not implement upgrades now):
//   • applyTacticalApproach(base, key, upgradeContext) accepts an optional
//     upgradeContext = { profileModifiers?: {dim: ±pts}, intentModifiers?:
//     {pattern: mult} }. Profile modifiers are added AFTER the approach and
//     clamped by the same caps; intent modifiers multiply into the same
//     bounded intent range. Upgrades must never bypass this function.
//   • approachIntents(key, upgradeContext) is the only source of intent
//     multipliers for the sequence engine.
// ---------------------------------------------------------------------------

import { resolveTacticalMatchup, buildOpponentTacticalProfile, DIMENSIONS, DIMENSION_LABELS, postMatchTacticalNote } from './tacticalMatchup'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Hard caps: no single approach/upgrade path may move a dimension more than
// this, and intents stay within 0.85–1.15 (they may never override roles,
// matchup modifiers, or canonical budgets).
export const APPROACH_PROFILE_CAP = 12
export const INTENT_MIN = 0.85
export const INTENT_MAX = 1.15

export const TACTICAL_APPROACHES = {
  balanced: {
    key: 'balanced',
    name: 'Balanced',
    tagline: "Trust your XI's natural identity.",
    modifiers: {},
    intents: {},
  },
  // Every non-Balanced approach is a ZERO-SUM trade (modifiers sum to 0):
  // specialization buys emphasis, never free profile points, so Balanced is
  // never strictly dominated and the resolver decides the actual fit.
  control: {
    key: 'control',
    name: 'Control Tempo',
    tagline: 'Control possession and midfield.',
    modifiers: { buildupSecurity: 7, midfieldControl: 7, transitionThreat: -7, width: -4, defensiveStability: -3 },
    intents: { central_buildup: 1.12, one_two: 1.08, switch_of_play: 1.06, through_ball: 1.05, counterattack: 0.9, direct_attack: 0.88 },
  },
  wide: {
    key: 'wide',
    name: 'Attack the Flanks',
    tagline: 'Stretch the pitch and create wide.',
    modifiers: { width: 9, transitionThreat: 2, midfieldControl: -5, buildupSecurity: -3, defensiveStability: -3 },
    intents: { wide_overlap: 1.12, cross: 1.12, cutback: 1.1, switch_of_play: 1.08, central_buildup: 0.9 },
  },
  counter: {
    key: 'counter',
    name: 'Play on the Counter',
    tagline: 'Stay compact and attack space.',
    modifiers: { transitionThreat: 8, defensiveStability: 4, midfieldControl: -7, buildupSecurity: -5 },
    intents: { counterattack: 1.14, direct_attack: 1.1, pressing_recovery: 1.05, central_buildup: 0.88, one_two: 0.9 },
  },
}

export const APPROACH_KEYS = Object.keys(TACTICAL_APPROACHES)

// Adjust a base squad profile for the selected approach (+ optional future
// Phase 6 modifiers). Pure and deterministic; ratings never enter.
export function applyTacticalApproach(baseProfile, approachKey, upgradeContext = null) {
  const def = TACTICAL_APPROACHES[approachKey] || TACTICAL_APPROACHES.balanced
  const adjusted = {}
  for (const dim of DIMENSIONS) {
    const fromApproach = clamp(def.modifiers[dim] || 0, -APPROACH_PROFILE_CAP, APPROACH_PROFILE_CAP)
    const fromUpgrades = clamp(upgradeContext?.profileModifiers?.[dim] || 0, -APPROACH_PROFILE_CAP, APPROACH_PROFILE_CAP)
    adjusted[dim] = Math.round(clamp(baseProfile[dim] + fromApproach + fromUpgrades, 0, 100))
  }
  return adjusted
}

// Pattern-intent multipliers for the sequence engine (bounded; Balanced = {}).
export function approachIntents(approachKey, upgradeContext = null) {
  const def = TACTICAL_APPROACHES[approachKey] || TACTICAL_APPROACHES.balanced
  const out = { ...def.intents }
  if (upgradeContext?.intentModifiers) {
    for (const [k, v] of Object.entries(upgradeContext.intentModifiers)) {
      out[k] = clamp((out[k] ?? 1) * v, INTENT_MIN, INTENT_MAX)
    }
  }
  for (const k of Object.keys(out)) out[k] = clamp(out[k], INTENT_MIN, INTENT_MAX)
  return out
}

// One canonical matchup per approach for the Match Hub preview (pure — no
// rng). The locked match later stores exactly previews[selectedApproach].
// Phase 6: `upgradeContext` may be a FUNCTION of the approach key (approach-
// conditional upgrades produce different contexts per approach) or a plain
// context object; both flow through the same applyTacticalApproach() hook.
export function approachMatchupPreviews(baseProfile, opp, upgradeContext = null) {
  const oppProfile = buildOpponentTacticalProfile(opp)
  const ctxFor = typeof upgradeContext === 'function' ? upgradeContext : () => upgradeContext
  const out = {}
  for (const key of APPROACH_KEYS) {
    out[key] = resolveTacticalMatchup(applyTacticalApproach(baseProfile, key, ctxFor(key)), oppProfile)
  }
  return out
}

// Player-facing "Helps / Costs" summary (directions only — no raw numbers).
export function approachTradeoffs(approachKey) {
  const def = TACTICAL_APPROACHES[approachKey]
  if (!def) return { helps: [], costs: [] }
  const helps = []
  const costs = []
  // Show only the defining trades (±4+) so the chips stay scannable.
  for (const dim of DIMENSIONS) {
    const v = def.modifiers[dim] || 0
    if (v >= 4) helps.push(DIMENSION_LABELS[dim])
    else if (v <= -4) costs.push(DIMENSION_LABELS[dim])
  }
  return { helps, costs }
}

// Compact directional emphasis line, e.g. "Buildup ↑ · Control ↑ · Transition ↓".
const SHORT_DIM = {
  buildupSecurity: 'Buildup',
  midfieldControl: 'Control',
  width: 'Width',
  transitionThreat: 'Transition',
  defensiveStability: 'Stability',
}
export function approachEmphasis(approachKey) {
  const def = TACTICAL_APPROACHES[approachKey]
  if (!def) return []
  return DIMENSIONS
    .filter((d) => Math.abs(def.modifiers[d] || 0) >= 4)
    .sort((a, b) => Math.abs(def.modifiers[b] || 0) - Math.abs(def.modifiers[a] || 0))
    .map((d) => `${SHORT_DIM[d]} ${def.modifiers[d] > 0 ? '↑' : '↓'}`)
}

// Grounded one-line fit sentence: compares this approach's canonical preview
// against Balanced for the SAME squad and opponent. No probabilities shown,
// no spoilers, no random flavor.
export function approachFit(approachKey, previews, baseProfile) {
  const sel = previews[approachKey]
  const base = previews.balanced
  if (!sel || !base) return ''
  if (sel.m1Preview) return sel.m1Preview.fit
  if (approachKey === 'balanced') {
    return base.keyAdvantage
      ? `Natural fit: ${base.keyAdvantage.text.charAt(0).toLowerCase()}${base.keyAdvantage.text.slice(1)}`
      : 'Trusts your natural shape against this opponent.'
  }
  const diff = sel.probabilityDelta - base.probabilityDelta
  const def = TACTICAL_APPROACHES[approachKey]
  // strongest helped/costed dimension for grounded wording
  const helped = DIMENSIONS.filter((d) => (def.modifiers[d] || 0) > 0)
    .sort((a, b) => (sel.dimensionResults[b] - base.dimensionResults[b]) - (sel.dimensionResults[a] - base.dimensionResults[a]))[0]
  const costed = DIMENSIONS.filter((d) => (def.modifiers[d] || 0) < 0)
    .sort((a, b) => (sel.dimensionResults[a] - base.dimensionResults[a]) - (sel.dimensionResults[b] - base.dimensionResults[b]))[0]
  const structural = {
    control: baseProfile.midfieldControl >= 74 ? 'your midfield structure supports this approach' : null,
    wide: baseProfile.width >= 74 ? 'your wide structure supports this approach' : null,
    counter: baseProfile.transitionThreat >= 70 ? 'your runners support this approach' : null,
  }[approachKey]
  if (diff >= 0.008) {
    const why = sel.keyAdvantage ? `${sel.keyAdvantage.text.charAt(0).toLowerCase()}${sel.keyAdvantage.text.slice(1)}` : 'it targets what this opponent concedes.'
    return structural ? `Natural fit: ${structural} — ${why}` : `Good fit: ${why}`
  }
  if (diff <= -0.008) {
    const why = sel.keyRisk ? `${sel.keyRisk.text.charAt(0).toLowerCase()}${sel.keyRisk.text.slice(1)}` : 'this opponent punishes what it gives up.'
    return `Risky fit: ${why}`
  }
  if (helped && costed) return `Tradeoff: more ${SHORT_DIM[helped].toLowerCase()}, but less ${SHORT_DIM[costed].toLowerCase()} against this opponent.`
  return 'Roughly even with your natural approach here.'
}

// ---------------------------------------------------------------------------
// Post-match approach feedback — ONE canonical helper, stat- and result-
// gated so it never claims success the numbers don't support. Used by the
// Match Center FT summary and the Post Match Card.
// ---------------------------------------------------------------------------
export function approachFeedback({ approach = 'balanced', matchup = null, detail = null, result = null }) {
  const won = result === 'win' || result === 'pens-win'
  const lost = result === 'loss' || result === 'pens-loss'
  const poss = detail?.finalStats?.home?.possession ?? 50
  const shots = detail?.finalStats?.home?.shots ?? 0
  const big = detail?.finalStats?.home?.bigChances ?? 0
  const causal = detail?.metadata?.causalSummary || null
  // M1 feedback is evidence-gated: it may describe a plan's observed route or
  // control effect, but never credits the result merely because a plan was
  // selected. Legacy keeps its frozen, stat-gated wording below.
  if (causal) {
    const shares = causal.routeShares?.home || {}
    const influenced = causal.plan?.influencedEvents || 0
    if (approach === 'control') {
      const settled = (shares.central_buildup || 0) + (shares.one_two || 0) + (shares.switch_of_play || 0)
      if (influenced > 0 && settled >= 0.45 && poss >= 52) {
        if ((causal.plan?.downsideMetric || 0) > 0) return 'Control Tempo produced settled buildup, but the event log also shows sterile possession against their compact shape.'
        return 'Control Tempo produced the settled central spells shown in the event log.'
      }
      return 'Control Tempo was selected, but the match never turned its possession into sustained penetration.'
    }
    if (approach === 'wide') {
      const wideShare = (shares.wide_overlap || 0) + (shares.cross || 0) + (shares.cutback || 0)
      if (influenced > 0 && wideShare >= 0.38) return 'The event log shows the wide plan repeatedly reaching overlaps and deliveries.'
      return 'The wide plan was selected, but the recorded attacks rarely reached the flanks.'
    }
    if (approach === 'counter') {
      const counterShare = (shares.counterattack || 0) + (shares.direct_attack || 0) + (shares.pressing_recovery || 0)
      if (influenced > 0 && counterShare >= 0.35) return 'The event log shows the counter plan creating fast, direct attacks.'
      return 'The counter plan found little usable transition space and produced too few settled attacks.'
    }
    return 'Balanced kept the route mix tied to the XI’s natural structure.'
  }
  switch (approach) {
    case 'control': {
      if (poss >= 55 && won) return 'Control Tempo helped your midfield dictate long spells of possession.'
      if (poss >= 55 && lost) return 'Control Tempo brought long spells of possession, but they cut through you anyway.'
      if (poss >= 55) return 'Control Tempo dictated possession without forcing the breakthrough.'
      return 'The plan was control, but you never truly dictated the tempo.'
    }
    case 'wide': {
      if (won && big >= 3) return 'Attacking the flanks stretched their shape and created the decisive openings.'
      if (won) return 'The wide approach did just enough to tilt the pitch your way.'
      if (shots >= 12) return 'Your wide approach stretched their block, but the final delivery lacked quality.'
      return 'The wide plan never produced enough deliveries to hurt them.'
    }
    case 'counter': {
      if (won) return 'The counterattacking plan punished the space behind them.'
      if (shots >= 9) return 'The breaks came on the counter, but they were not finished.'
      return 'They gave your counters little space to run into.'
    }
    default: { // balanced — lean on the canonical matchup note
      const note = postMatchTacticalNote(matchup, result)
      if (note) return note
      if (won && poss >= 55) return "Balanced allowed your XI's natural identity to control the game."
      return 'Your XI played its natural game.'
    }
  }
}
