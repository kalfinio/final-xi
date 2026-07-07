// ---------------------------------------------------------------------------
// Run upgrades (Phase 6) — deterministic, run-scoped roguelite development.
//
// GOVERNING RULE: an upgrade is nothing but a source of Phase 4
// upgradeContext values. Every mechanical effect enters through
//
//   buildUpgradeContext(owned, matchContext, baseProfile)
//     → { profileModifiers, intentModifiers, activeIds }
//     → applyTacticalApproach() / approachIntents()
//     → existing Phase 3 matchup resolver
//
// BEFORE matchup resolution. No upgrade may touch result rolls, goals,
// scorelines, MatchDetail after generation, or sequence outcomes — there is
// no code path here that could: this module never sees them.
//
// Timing semantics (fixed): for an upcoming unresolved match,
//   matchContext.runRecord  = the W-D-L record BEFORE that match,
//   matchContext.prevResult = the immediately previous resolved match result,
//   matchContext.kind/round = the upcoming match itself.
// Previews and resolution use the same context, so what the hub highlights
// as active is exactly what fires.
//
// Determinism: offer generation uses its own seeded stream derived from the
// run seed + offer index + owned set (presentationSeed pattern) — it never
// consumes simulation RNG, and opening/closing UI cannot alter a stored offer.
// ---------------------------------------------------------------------------

import { makeRng, hashString, combineSeed } from './seedUtils'
import { DIMENSIONS, DIMENSION_LABELS } from './tacticalMatchup'
import { TACTICAL_APPROACHES } from './tacticalApproach'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Hard limits (below the Phase 4 per-call caps; the Phase 3 ±0.05 resolver
// cap remains the ultimate governor).
export const MAX_UPGRADES_PER_RUN = 6
export const UPGRADE_DIM_CAP = 8       // accumulated profile points per dimension
export const UPGRADE_INTENT_MIN = 0.9  // accumulated intent product per pattern
export const UPGRADE_INTENT_MAX = 1.1

export const UPGRADE_CATEGORIES = {
  mastery: 'Approach Mastery',
  structural: 'Structural',
  situational: 'Situational',
  identity: 'Run Identity',
}

// ---------------------------------------------------------------------------
// The pool — 24 upgrades. `when` conditions are resolved against the
// pre-match context; `special` entries are computed deterministically:
//   topTwo      → +3 to the squad's two strongest NATURAL profile dimensions
//   refundCosts → +2 to each dimension the selected approach reduces
// ---------------------------------------------------------------------------
export const UPGRADE_POOL = [
  // --- Approach Mastery ----------------------------------------------------
  { id: 'press-resistance', name: 'Press Resistance', desc: 'Control Tempo loses less buildup security against pressing sides.', category: 'mastery', tier: 'standard', stackMax: 1, when: { approach: 'control', archetypes: ['pressing'] }, effect: { profileModifiers: { buildupSecurity: 4 } } },
  { id: 'wide-overload', name: 'Wide Overload', desc: 'Attack the Flanks produces sharper overlaps and cutbacks.', category: 'mastery', tier: 'standard', stackMax: 2, when: { approach: 'wide' }, effect: { intentModifiers: { wide_overlap: 1.06, cutback: 1.06 } } },
  { id: 'spring-the-trap', name: 'Spring the Trap', desc: 'Play on the Counter punishes attacking sides harder.', category: 'mastery', tier: 'standard', stackMax: 1, when: { approach: 'counter', archetypes: ['attacking'] }, effect: { profileModifiers: { transitionThreat: 4 } } },
  { id: 'tempo-masters', name: 'Tempo Masters', desc: 'Control Tempo gives up less threat in transition.', category: 'mastery', tier: 'gold', stackMax: 1, when: { approach: 'control' }, effect: { profileModifiers: { transitionThreat: 3 } } },
  { id: 'touchline-coaching', name: 'Touchline Coaching', desc: 'Attack the Flanks keeps more midfield control.', category: 'mastery', tier: 'standard', stackMax: 1, when: { approach: 'wide' }, effect: { profileModifiers: { midfieldControl: 3 } } },
  { id: 'drilled-block', name: 'Drilled Block', desc: 'Play on the Counter defends even more compactly.', category: 'mastery', tier: 'standard', stackMax: 1, when: { approach: 'counter' }, effect: { profileModifiers: { defensiveStability: 3 } } },
  { id: 'trust-the-xi', name: 'Trust the XI', desc: "Balanced sharpens your squad's two strongest natural qualities.", category: 'mastery', tier: 'gold', stackMax: 1, when: { approach: 'balanced' }, special: 'topTwo' },
  { id: 'versatile-coaching', name: 'Versatile Coaching', desc: 'Every specialised approach costs a little less.', category: 'mastery', tier: 'gold', stackMax: 1, when: { notBalanced: true }, special: 'refundCosts' },
  // --- Structural Development ----------------------------------------------
  { id: 'midfield-triangle', name: 'Midfield Triangle', desc: 'Better structure through the middle.', category: 'structural', tier: 'standard', stackMax: 2, effect: { profileModifiers: { midfieldControl: 3, buildupSecurity: 2 } } },
  { id: 'overlap-drills', name: 'Overlap Drills', desc: 'Fullbacks arrive higher, more often.', category: 'structural', tier: 'standard', stackMax: 2, effect: { profileModifiers: { width: 3 }, intentModifiers: { wide_overlap: 1.04 } } },
  { id: 'counter-press-drills', name: 'Counter-Press Drills', desc: 'Win it back faster, break quicker.', category: 'structural', tier: 'standard', stackMax: 2, effect: { profileModifiers: { transitionThreat: 2, midfieldControl: 2 } } },
  { id: 'back-line-organisation', name: 'Back-Line Organisation', desc: 'The defensive line holds its shape.', category: 'structural', tier: 'standard', stackMax: 2, effect: { profileModifiers: { defensiveStability: 3 } } },
  { id: 'playing-out-short', name: 'Playing Out Short', desc: 'Calmer buildup from the keeper out.', category: 'structural', tier: 'standard', stackMax: 2, effect: { profileModifiers: { buildupSecurity: 3 } } },
  { id: 'width-and-depth', name: 'Width and Depth', desc: 'Stretch them sideways and in behind.', category: 'structural', tier: 'standard', stackMax: 1, effect: { profileModifiers: { width: 2, transitionThreat: 2 } } },
  { id: 'total-football-sessions', name: 'Total Football Sessions', desc: 'A little of everything.', category: 'structural', tier: 'gold', stackMax: 1, effect: { profileModifiers: { buildupSecurity: 1, midfieldControl: 1, width: 1, transitionThreat: 1, defensiveStability: 1 } } },
  { id: 'engine-room', name: 'Engine Room', desc: 'Midfield runs the match.', category: 'structural', tier: 'gold', stackMax: 1, effect: { profileModifiers: { midfieldControl: 4 } } },
  // --- Situational ----------------------------------------------------------
  { id: 'giant-slayers', name: 'Giant Slayers', desc: 'Raise your level against elite opposition.', category: 'situational', tier: 'gold', stackMax: 1, when: { archetypes: ['elite'] }, effect: { profileModifiers: { defensiveStability: 3, transitionThreat: 3 } } },
  { id: 'block-breakers', name: 'Block Breakers', desc: 'Tools against deep, compact blocks.', category: 'situational', tier: 'standard', stackMax: 1, when: { archetypes: ['defensive', 'underdog'] }, effect: { profileModifiers: { width: 4 }, intentModifiers: { cross: 1.05 } } },
  { id: 'press-breakers', name: 'Press Breakers', desc: 'Composure against the press — whatever the plan.', category: 'situational', tier: 'standard', stackMax: 1, when: { archetypes: ['pressing'] }, effect: { profileModifiers: { buildupSecurity: 4 } } },
  { id: 'shut-the-gates', name: 'Shut the Gates', desc: 'Absorb attacking sides.', category: 'situational', tier: 'standard', stackMax: 1, when: { archetypes: ['attacking'] }, effect: { profileModifiers: { defensiveStability: 4 } } },
  { id: 'tempo-thieves', name: 'Tempo Thieves', desc: 'Take the ball off passing sides.', category: 'situational', tier: 'standard', stackMax: 1, when: { archetypes: ['technical'] }, effect: { profileModifiers: { midfieldControl: 4 } } },
  // --- Run Identity ----------------------------------------------------------
  { id: 'bounce-back', name: 'Bounce Back', desc: 'The match after any defeat, the team steadies itself.', category: 'identity', tier: 'standard', stackMax: 1, when: { afterLoss: true }, effect: { profileModifiers: { defensiveStability: 3, midfieldControl: 2 } } },
  { id: 'big-night-dna', name: 'Big Night DNA', desc: 'Knockout football suits this side.', category: 'identity', tier: 'gold', stackMax: 1, when: { kind: 'ko' }, effect: { profileModifiers: { transitionThreat: 2, defensiveStability: 2 } } },
  { id: 'front-runners', name: 'Front Runners', desc: 'While unbeaten, confidence flows.', category: 'identity', tier: 'gold', stackMax: 1, when: { unbeaten: true }, effect: { profileModifiers: { midfieldControl: 2, buildupSecurity: 1 } } },
]

export const UPGRADES_BY_ID = Object.fromEntries(UPGRADE_POOL.map((u) => [u.id, u]))

// ---------------------------------------------------------------------------
// Condition resolution — strictly pre-match facts (clarified semantics).
// ---------------------------------------------------------------------------
function conditionApplies(u, mc) {
  const w = u.when
  if (!w) return true
  if (w.approach && mc.approachKey !== w.approach) return false
  if (w.notBalanced && mc.approachKey === 'balanced') return false
  if (w.archetypes && !w.archetypes.includes(mc.opponentMeta?.archetype)) return false
  if (w.kind && mc.kind !== w.kind) return false
  if (w.afterLoss && !(mc.prevResult === 'loss' || mc.prevResult === 'pens-loss')) return false
  if (w.unbeaten && (mc.runRecord?.l ?? 0) !== 0) return false
  return true
}

// The squad's two strongest NATURAL dimensions (base profile, never the
// approach-adjusted one). Deterministic tie-break: DIMENSIONS order.
function topTwoDims(baseProfile) {
  return [...DIMENSIONS]
    .sort((a, b) => (baseProfile[b] - baseProfile[a]) || (DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b)))
    .slice(0, 2)
}

// ---------------------------------------------------------------------------
// The single funnel: owned upgrades + pre-match context + NATURAL profile →
// one flat Phase 4 upgradeContext (plus the ids that actually fired).
// applyTacticalApproach / approachIntents are never modified.
// ---------------------------------------------------------------------------
export function buildUpgradeContext(owned, matchContext, baseProfile) {
  const profileModifiers = {}
  const intentModifiers = {}
  const activeIds = []
  for (const o of owned || []) {
    const u = UPGRADES_BY_ID[o.id]
    if (!u) continue
    if (!conditionApplies(u, matchContext || {})) continue
    const stacks = clamp(o.stacks || 1, 1, u.stackMax)
    let pm = u.effect?.profileModifiers || null
    if (u.special === 'topTwo' && baseProfile) {
      pm = Object.fromEntries(topTwoDims(baseProfile).map((d) => [d, 3]))
    } else if (u.special === 'refundCosts') {
      const mods = TACTICAL_APPROACHES[matchContext?.approachKey]?.modifiers || {}
      pm = {}
      for (const [dim, v] of Object.entries(mods)) if (v < 0) pm[dim] = 2
    }
    if (pm) for (const [dim, v] of Object.entries(pm)) profileModifiers[dim] = (profileModifiers[dim] || 0) + v * stacks
    if (u.effect?.intentModifiers) {
      for (const [pat, v] of Object.entries(u.effect.intentModifiers)) {
        intentModifiers[pat] = (intentModifiers[pat] ?? 1) * Math.pow(v, stacks)
      }
    }
    activeIds.push(u.id)
  }
  for (const dim of Object.keys(profileModifiers)) profileModifiers[dim] = clamp(profileModifiers[dim], -UPGRADE_DIM_CAP, UPGRADE_DIM_CAP)
  for (const pat of Object.keys(intentModifiers)) intentModifiers[pat] = clamp(intentModifiers[pat], UPGRADE_INTENT_MIN, UPGRADE_INTENT_MAX)
  return { profileModifiers, intentModifiers, activeIds }
}

// ---------------------------------------------------------------------------
// Offer triggers. The schedule can identify up to 7 triggers (MD3, MD6,
// MD8-if-qualified, each KO win except the Final); the hard cap of
// MAX_UPGRADES_PER_RUN offers suppresses any trigger beyond the sixth —
// no named trigger is removed from the schedule.
// ---------------------------------------------------------------------------
export function shouldOfferUpgrade(justResolvedMatch, ctrl, offersSoFar) {
  if (!justResolvedMatch || !ctrl) return false
  if (offersSoFar >= MAX_UPGRADES_PER_RUN) return false
  if (ctrl.isDone) return false // eliminated, or the Final has been played
  const m = justResolvedMatch
  if (m.type === 'league') return m.matchNo === 3 || m.matchNo === 6 || m.matchNo === 8
  // knockout: after wins only (a Final win sets isDone and is caught above)
  return m.result === 'win' || m.result === 'pens-win'
}

// ---------------------------------------------------------------------------
// Deterministic offer generation. Seed = run seed + offer index + owned set;
// selecting/opening/closing UI never regenerates a stored offer, and this
// stream is fully separate from simulation RNG.
// ---------------------------------------------------------------------------
export function generateUpgradeOffer({ runSeed, offerIndex, owned }) {
  const ownedKey = (owned || []).map((o) => `${o.id}x${o.stacks || 1}`).sort().join(',')
  const rng = makeRng(combineSeed(hashString(`upgrades|${runSeed >>> 0}`), offerIndex, hashString(ownedKey)))
  const ownedMap = Object.fromEntries((owned || []).map((o) => [o.id, o.stacks || 1]))
  const eligible = UPGRADE_POOL.filter((u) => (ownedMap[u.id] || 0) < u.stackMax)
  const weightOf = (u) => (u.tier === 'gold' ? (offerIndex >= 3 ? 0.45 : 0) : 1)

  const picked = []
  const pool = [...eligible]
  while (picked.length < 3 && pool.length) {
    const weights = pool.map(weightOf)
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) { picked.push(pool.shift()); continue }
    let r = rng() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) { if ((r -= weights[i]) < 0) { idx = i; break } }
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  // category spread: the three options must span ≥2 categories (deterministic swap)
  if (picked.length === 3 && new Set(picked.map((u) => u.category)).size === 1) {
    const alt = pool.find((u) => u.category !== picked[0].category)
    if (alt) picked[2] = alt
  }
  return picked.map((u) => u.id)
}

// ---------------------------------------------------------------------------
// Sim All: future offers are SKIPPED, never auto-selected. This runs after
// finishRemaining() and records — deterministically — which offers would
// have appeared (owned set is frozen during Sim All, so each offer's seed
// input is stable). Pure bookkeeping for the report and Phase 5; it executes
// after all results exist and cannot influence them.
// ---------------------------------------------------------------------------
export function recordSimAllSkips(state, ctrl, fromCount, runSeed) {
  const matches = ctrl.matches
  for (let i = fromCount; i < matches.length; i++) {
    if (state.offers.length >= MAX_UPGRADES_PER_RUN) break
    const m = matches[i]
    let triggered = false
    if (m.type === 'league') {
      // MD8 only counts if the run continued (qualification) — i.e. any match
      // exists after it, or the run isn't done at MD8 (it always is done when
      // eliminated in the league phase).
      if (m.matchNo === 3 || m.matchNo === 6) triggered = true
      else if (m.matchNo === 8) triggered = i < matches.length - 1 || !ctrl.isDone
    } else if ((m.result === 'win' || m.result === 'pens-win') && m.round !== 'Final') {
      triggered = true
    }
    if (!triggered) continue
    const offerIndex = state.offers.length + 1
    state.offers.push({
      offerIndex,
      afterMatch: i + 1,
      optionIds: generateUpgradeOffer({ runSeed, offerIndex, owned: state.owned }),
      chosenId: 'skipped',
      viaSimAll: true,
    })
  }
  return state
}

// Display helper for chips/rows.
export function upgradeLabel(o) {
  const u = UPGRADES_BY_ID[o.id]
  if (!u) return o.id
  return (o.stacks || 1) > 1 ? `${u.name} ×${o.stacks}` : u.name
}

export { DIMENSION_LABELS }
