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

// (The old `approachFit` one-liner was removed in the alignment-wording
// remediation: the redesigned Match Hub renders the Selected Plan Analysis
// panel — advantage/risk/identity/read — instead, and the function's legacy
// "…fit:" copy is prohibited user-facing wording. Deliberately deleted, not
// renamed, so no dead identity-fit strings survive in the bundle.)

// ---------------------------------------------------------------------------
// Opponent Scout (UX clarity phase). PLAN-INDEPENDENT read of the opponent —
// archetype, likely style, primary threat, exploitable weakness. Pure data
// derived from the opponent's archetype only: no result, no probability, no
// RNG, valid for both engines because it describes the opponent, not a plan.
// ---------------------------------------------------------------------------
const OPPONENT_SCOUT_BY_ARCHETYPE = {
  pressing: {
    threat: 'They hunt the ball high and punish loose buildup with fast recoveries.',
    weakness: 'Their aggressive shape leaves space behind once the first press is beaten.',
  },
  technical: {
    threat: 'They can dominate settled midfield possession and pass through a passive block.',
    weakness: 'They may be vulnerable when forced away from central combinations.',
  },
  defensive: {
    threat: 'They defend deep and compact, protecting the central lanes for ninety minutes.',
    weakness: 'They concede territory out wide and can be stretched by crosses and cutbacks.',
  },
  attacking: {
    threat: 'They commit numbers forward and create sustained attacking pressure.',
    weakness: 'Their high commitment leaves transition space when attacks break down.',
  },
  physical: {
    threat: 'They dominate duels, deliveries and set pieces with sheer physicality.',
    weakness: 'They can be moved around by quick switches and width before the block sets.',
  },
  elite: {
    threat: 'They are strong in every phase and punish any clear mistake.',
    weakness: 'No structural gift — small edges must be built patiently or on the break.',
  },
  underdog: {
    threat: 'They sit deep, stay disciplined and look for one moment on the counter.',
    weakness: 'They offer little going forward and can be worn down out wide.',
  },
}
export function opponentScout(opponentMeta) {
  const archetype = opponentMeta?.archetype || 'elite'
  const scout = OPPONENT_SCOUT_BY_ARCHETYPE[archetype] || OPPONENT_SCOUT_BY_ARCHETYPE.elite
  return { archetype, style: opponentMeta?.style || null, threat: scout.threat, weakness: scout.weakness }
}

// ---------------------------------------------------------------------------
// Club Identity ↔ Match Plan relationship (UX clarity phase). Presentation
// only: identities shape squad building; this table just says how NATURAL a
// per-match plan feels for that identity. It never enters the engine, never
// changes probabilities, and is deliberately separate from opponent fit.
// ---------------------------------------------------------------------------
const IDENTITY_PLAN_FIT = {
  control: { balanced: 'neutral', control: 'natural', wide: 'neutral', counter: 'stretch' },
  press: { balanced: 'neutral', control: 'stretch', wide: 'neutral', counter: 'natural' },
  transition: { balanced: 'neutral', control: 'stretch', wide: 'neutral', counter: 'natural' },
  fortress: { balanced: 'neutral', control: 'stretch', wide: 'stretch', counter: 'natural' },
}
export function identityPlanFit(identityKey, approachKey) {
  return IDENTITY_PLAN_FIT[identityKey]?.[approachKey] || 'neutral'
}

// One combined line for the selected plan: opponent read × identity read.
// `opponentGood` comes from existing preview evidence (m1Preview.recommended
// or a positive legacy label) — this helper adds no judgement of its own.
export function identityRelationship({ identityKey, identityName, approachKey, opponentGood = null }) {
  if (!identityKey || !identityName) return null
  const fit = identityPlanFit(identityKey, approachKey)
  if (fit === 'natural') {
    if (opponentGood === false) return `Matches your ${identityName} identity but may struggle against this opponent.`
    return `Naturally aligned with your ${identityName} identity.`
  }
  if (fit === 'stretch') {
    if (opponentGood === true) return `Effective matchup, but less natural for your ${identityName} squad identity.`
    return `A stretch for your ${identityName} identity — your squad is not built around this plan.`
  }
  return `Compatible with your ${identityName} identity.`
}

// Concise selector badges. Engine badges come ONLY from existing M1 preview
// evidence (never invented for legacy runs); the identity badge comes from
// the identity table above. Tone is a style hint for the UI. The identity
// badge is deliberately NOT gold and reads "Identity Alignment": it describes
// squad-style alignment only and must never imply a hidden match-probability
// modifier — it carries no performance bonus of any kind.
export function matchPlanBadges({ preview = null, identityKey = null, approachKey }) {
  const badges = []
  const m1 = preview?.m1Preview
  if (m1) {
    if (m1.recommended) badges.push({ label: 'Recommended', tone: 'success' })
    else if (m1.score >= 0.35) badges.push({ label: 'Strong Matchup', tone: 'success' })
    else if (m1.score > -0.35) badges.push({ label: 'Viable', tone: 'neutral' })
    else badges.push({ label: 'Risky', tone: 'danger' })
  }
  if (identityKey && identityPlanFit(identityKey, approachKey) === 'natural') {
    badges.push({ label: 'Identity Alignment', tone: 'neutral' })
  }
  return badges
}

// Shown once near the Match Plan selector so the alignment badge can never be
// read as a gameplay modifier.
export const IDENTITY_ALIGNMENT_NOTE = 'Squad-style alignment only — no direct performance bonus.'

// Short, non-duplicating recommendation line for the Selected Plan Analysis
// panel. Uses only existing preview evidence (M1 recommendation score, or the
// legacy probability-delta comparison vs Balanced) — never repeats the
// advantage/risk prose shown alongside it.
export function planRecommendationLine(approachKey, previews) {
  const sel = previews?.[approachKey]
  const base = previews?.balanced
  if (!sel) return ''
  const m1 = sel.m1Preview
  if (m1) {
    if (m1.recommended) return 'Recommended read for this opponent.'
    if (m1.score > -0.35) return 'Viable option against this opponent.'
    return 'Risky read against this opponent.'
  }
  if (approachKey === 'balanced' || !base) return 'Trusts your natural shape against this opponent.'
  const diff = (sel.probabilityDelta ?? 0) - (base.probabilityDelta ?? 0)
  if (diff >= 0.008) return 'Reads well against this opponent.'
  if (diff <= -0.008) return 'Reads risky against this opponent.'
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
