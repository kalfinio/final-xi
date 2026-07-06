// ---------------------------------------------------------------------------
// Tactical matchup engine (Phase 3).
//
//   Formation + Roles → Squad Tactical Profile (5 dims, 0–100)
//     → Opponent Tactical Profile (per archetype)
//     → resolveTacticalMatchup()
//     → ONE canonical stored matchup per match, feeding:
//        probability delta (capped ±0.05) · stat-profile shifts ·
//        pattern modifiers · highlight-density bias ·
//        Match Hub explanation · post-match tactical note
//
// Design rules:
//   • Pure + deterministic. No RNG anywhere in this module.
//   • The profile describes HOW the XI is constructed (roles/slots only) —
//     player ratings, chemistry points, and GOAT status never enter it, so
//     two squads with identical role/slot structure share one profile.
//   • DOUBLE-COUNTING PREVENTION: the existing engine already prices squad
//     quality (rating curve), absolute flaws (weakness drag, up to −0.15),
//     opponent strength (±0.045) and difficulty. Phase 3 adds only the
//     INTERACTION term — how much this specific opponent's style tests this
//     specific structure — centred on a neutral profile (50) so an average
//     squad gets ≈0, and capped at ±0.05 (a third of the weakness-drag cap),
//     with typical values ±0.01–0.03. A missing Defensive Shield still costs
//     its full weakness drag exactly once; here it only tilts matches against
//     styles that specifically attack that dimension, at reduced scale.
//   • Tunables are centralized in TUNING (mutable on purpose: the test suite
//     sets PROB_SCALE=0 to prove the rest of the engine is byte-identical to
//     the Phase 2.1 baseline).
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round1 = (v) => Math.round(v * 10) / 10

export const TUNING = {
  // matchup score → probability points. Calibrated so a squad with a real
  // tactical identity lands mostly in ±0.01–0.03 against styles that test it,
  // while a normally balanced XI stays near zero ("Even").
  PROB_SCALE: 0.07,
  PROB_CAP: 0.05,      // hard cap on |probabilityDelta|
  DIMINISH: 0.6,       // n-th overlapping role contributes DIMINISH^(n-1)
  // Per-dimension expected level of a normally constructed XI (measured over
  // representative drafted squads). The resolver centres on THESE, not on the
  // raw 50 baseline, so an average structure reads "Even", genuine surpluses
  // go positive and genuine deficits go negative — and absolute weaknesses
  // already priced by the weakness drag are not re-punished at full strength.
  DIM_CENTER: {
    buildupSecurity: 65,
    midfieldControl: 69,
    width: 68,
    transitionThreat: 63,
    defensiveStability: 68,
  },
}

export const DIMENSIONS = ['buildupSecurity', 'midfieldControl', 'width', 'transitionThreat', 'defensiveStability']

export const DIMENSION_LABELS = {
  buildupSecurity: 'Buildup Security',
  midfieldControl: 'Midfield Control',
  width: 'Width',
  transitionThreat: 'Transition Threat',
  defensiveStability: 'Defensive Stability',
}

// ---------------------------------------------------------------------------
// Role → dimension contributions (points added around the 50 baseline, with
// diminishing returns per dimension). Uses the approved Final XI role names.
// ---------------------------------------------------------------------------
const ROLE_DIMS = {
  'Shot Stopper': { defensiveStability: 3 },
  'Sweeper Keeper': { buildupSecurity: 8 },
  'Big Match Keeper': { defensiveStability: 6 },
  'Defensive Leader': { defensiveStability: 9 },
  'Ball-Playing Defender': { buildupSecurity: 9, defensiveStability: 4 },
  'Attacking Fullback': { width: 9, defensiveStability: -5 },
  'Balanced Fullback': { width: 5, defensiveStability: 3 },
  'Defensive Fullback': { defensiveStability: 6, width: 1 },
  'Attacking Wingback': { width: 10, defensiveStability: -4 },
  'Balanced Wingback': { width: 7, defensiveStability: 2 },
  'Defensive Wingback': { defensiveStability: 6, width: 3 },
  'Defensive Shield': { defensiveStability: 9, buildupSecurity: 5, midfieldControl: 4 },
  'Ball Winner': { midfieldControl: 7, transitionThreat: 6, defensiveStability: 5 },
  'Tempo Controller': { buildupSecurity: 8, midfieldControl: 9 },
  'Box-to-Box Engine': { midfieldControl: 7, transitionThreat: 5 },
  'Final Passer': { midfieldControl: 6, buildupSecurity: 4 },
  'Creative Magician': { midfieldControl: 4, transitionThreat: 3 },
  'Inside Forward': { transitionThreat: 7, width: 3 },
  'Touchline Winger': { width: 10, transitionThreat: 3 },
  'Direct Runner': { transitionThreat: 9, width: 4 },
  'Complete Striker': { transitionThreat: 5, buildupSecurity: 2 },
  'Box Finisher': { transitionThreat: 2 },
  'Link-Up Striker': { buildupSecurity: 6, midfieldControl: 3 },
  'Big Game Scorer': { transitionThreat: 3 },
}

const WIDE_SLOTS = new Set(['RW', 'LW', 'RM', 'LM', 'RWB', 'LWB'])
const CENTRAL_MID_SLOTS = new Set(['CM', 'CDM', 'CAM'])
const AGGRESSIVE_FB = new Set(['Attacking Fullback', 'Attacking Wingback'])
const SHIELD_ROLES = new Set(['Defensive Shield', 'Ball Winner'])

// Sum a list of same-sign contributions with diminishing returns: the value
// list is sorted by magnitude and the n-th entry is scaled by DIMINISH^(n-1),
// so a third Tempo Controller adds less than the second.
function diminish(values) {
  const sorted = [...values].sort((a, b) => Math.abs(b) - Math.abs(a))
  let total = 0
  sorted.forEach((v, i) => { total += v * Math.pow(TUNING.DIMINISH, i) })
  return total
}

// ---------------------------------------------------------------------------
// Squad tactical profile — structure only (roles + slots), never ratings.
// ---------------------------------------------------------------------------
export function buildSquadTacticalProfile(squad) {
  const entries = (squad || []).filter((s) => s && s.player)
  const roles = entries.map((s) => s.player.role)
  const slots = entries.map((s) => s.slot)
  const hasRole = (r) => roles.includes(r)
  const roleN = (r) => roles.filter((x) => x === r).length

  // 1) role contributions with per-dimension diminishing returns
  const pos = { buildupSecurity: [], midfieldControl: [], width: [], transitionThreat: [], defensiveStability: [] }
  const neg = { buildupSecurity: [], midfieldControl: [], width: [], transitionThreat: [], defensiveStability: [] }
  for (const role of roles) {
    const dims = ROLE_DIMS[role]
    if (!dims) continue
    for (const [dim, pts] of Object.entries(dims)) {
      ;(pts >= 0 ? pos : neg)[dim].push(pts)
    }
  }
  const profile = {}
  for (const dim of DIMENSIONS) {
    profile[dim] = 50 + diminish(pos[dim]) + diminish(neg[dim])
  }

  // 2) formation structure (slot-based, flat — structure has no "stacking")
  const wide = slots.filter((s) => WIDE_SLOTS.has(s)).length
  profile.width += wide === 0 ? -8 : wide === 1 ? 0 : wide === 2 ? 8 : 11
  const centralMids = slots.filter((s) => CENTRAL_MID_SLOTS.has(s)).length
  profile.midfieldControl += (centralMids - 2) * 6
  const cbs = slots.filter((s) => s === 'CB').length
  profile.defensiveStability += (cbs - 2) * 7

  // 3) structural role combinations — a short, inspectable list
  const aggFBs = roles.filter((r) => AGGRESSIVE_FB.has(r)).length
  const hasShield = roles.some((r) => SHIELD_ROLES.has(r))
  const combos = []
  if (hasRole('Inside Forward') && aggFBs >= 1) combos.push({ name: 'Inside forward + overlapping fullback', width: 6, transitionThreat: 2 })
  if (hasRole('Tempo Controller') && hasRole('Final Passer')) combos.push({ name: 'Controller + final passer', buildupSecurity: 5, midfieldControl: 4 })
  if (hasRole('Ball Winner') && hasRole('Direct Runner')) combos.push({ name: 'Ball winner + direct runner', transitionThreat: 7 })
  if (aggFBs >= 2 && !hasShield) combos.push({ name: 'Aggressive fullbacks without a shield', defensiveStability: -8 })
  if (cbs >= 3 && slots.filter((s) => s === 'RWB' || s === 'LWB').length >= 2) combos.push({ name: 'Back three + wingbacks', defensiveStability: 5, width: 4 })
  if (hasRole('Link-Up Striker') && (hasRole('Inside Forward') || hasRole('Direct Runner'))) combos.push({ name: 'Link-up striker + runner', transitionThreat: 5, buildupSecurity: 2 })
  for (const c of combos) {
    for (const dim of DIMENSIONS) if (c[dim]) profile[dim] += c[dim]
  }

  for (const dim of DIMENSIONS) profile[dim] = Math.round(clamp(profile[dim], 0, 100))
  profile._combos = combos.map((c) => c.name) // introspection/tests only
  return profile
}

// ---------------------------------------------------------------------------
// Opponent tactical profiles — WHICH squad dimensions each style tests.
// `tests` are two-sided (surplus helps, deficit hurts); `exposes` reward only
// a surplus (space the style leaves behind). Opponent raw strength is priced
// elsewhere (oppProbDelta) and is deliberately NOT repeated here.
// ---------------------------------------------------------------------------
const ARCHETYPE_PROFILES = {
  pressing: {
    tests: { buildupSecurity: 1.0, midfieldControl: 0.6 },
    exposes: { transitionThreat: 0.7 },
    densityBias: 1,
    awayPatterns: { press: 3, counterattack: 2, central_buildup: 1, cross: 1, direct_attack: 1 },
  },
  technical: {
    tests: { midfieldControl: 1.0, defensiveStability: 0.6 },
    exposes: { transitionThreat: 0.5 },
    densityBias: 0,
    awayPatterns: { central_buildup: 3, wide_overlap: 1.5, cross: 1, counterattack: 0.5 },
  },
  defensive: {
    tests: { width: 1.0, midfieldControl: 0.5 },
    exposes: {},
    densityBias: -1,
    awayPatterns: { counterattack: 3, direct_attack: 2, cross: 1, central_buildup: 0.5 },
  },
  attacking: {
    tests: { defensiveStability: 1.0 },
    exposes: { transitionThreat: 0.8 },
    densityBias: 1,
    awayPatterns: { central_buildup: 2, wide_overlap: 2, cross: 2, counterattack: 1 },
  },
  physical: {
    tests: { midfieldControl: 0.8, defensiveStability: 0.5 },
    exposes: { width: 0.5, buildupSecurity: 0.4 },
    densityBias: 0,
    awayPatterns: { direct_attack: 3, cross: 2, counterattack: 1, central_buildup: 0.5 },
  },
  elite: {
    tests: { buildupSecurity: 0.35, midfieldControl: 0.35, width: 0.35, transitionThreat: 0.35, defensiveStability: 0.35 },
    exposes: {},
    densityBias: 0,
    awayPatterns: { central_buildup: 2, wide_overlap: 1.5, cross: 1.5, counterattack: 1.5, direct_attack: 1 },
  },
  underdog: {
    tests: { width: 0.7, midfieldControl: 0.6 },
    exposes: {},
    densityBias: -1,
    awayPatterns: { counterattack: 2.5, direct_attack: 2, central_buildup: 0.5, cross: 1 },
  },
}

export function buildOpponentTacticalProfile(opp) {
  const archetype = opp?.archetype && ARCHETYPE_PROFILES[opp.archetype] ? opp.archetype : 'elite'
  return { archetype, name: opp?.name || 'Opponent', ...ARCHETYPE_PROFILES[archetype] }
}

// Archetype descriptor used in player-facing sentences.
const ARCHETYPE_DESC = {
  pressing: 'their press',
  technical: 'their passing game',
  defensive: 'their compact block',
  attacking: 'their attacking shape',
  physical: 'their physical midfield',
  elite: 'their all-court game',
  underdog: 'their deep block',
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Pre-match (present tense) and post-match (past tense) sentences per dim.
const ADV_TEXT = {
  buildupSecurity: (d) => [`Your buildup can play through ${d}.`, `Your buildup played through ${d} all night.`],
  midfieldControl: (d) => [`You can win the midfield battle against ${d}.`, `You controlled midfield against ${d}.`],
  width: (d) => [`Your width can stretch ${d}.`, `Your width repeatedly stretched ${d}.`],
  transitionThreat: (d) => [`Your transition threat can punish the space behind ${d}.`, `Your transition threat punished the space behind ${d}.`],
  defensiveStability: (d) => [`Your defensive structure can absorb ${d}.`, `Your defensive structure absorbed ${d}.`],
}
const RISK_TEXT = {
  buildupSecurity: (d) => [`${cap(d)} can disrupt your buildup.`, `${cap(d)} disrupted your buildup.`],
  midfieldControl: (d) => [`You may lose the midfield battle against ${d}.`, `You lost the midfield battle against ${d}.`],
  width: (d) => [`Your narrow attack may struggle against ${d}.`, `Your narrow attack struggled against ${d}.`],
  transitionThreat: (d) => [`You may lack the transition threat to punish ${d}.`, `You never punished the space behind ${d}.`],
  defensiveStability: (d) => [`${cap(d)} may expose your defense.`, `${cap(d)} exposed your defense.`],
}

export function matchupLabel(delta) {
  if (delta >= 0.03) return 'Strong Edge'
  if (delta >= 0.012) return 'Slight Edge'
  if (delta > -0.012) return 'Even'
  if (delta > -0.03) return 'Slight Concern'
  return 'Difficult Matchup'
}

// ---------------------------------------------------------------------------
// Resolver — ONE canonical matchup object per match.
// ---------------------------------------------------------------------------
export function resolveTacticalMatchup(profile, oppProfile) {
  const desc = ARCHETYPE_DESC[oppProfile.archetype] || 'their game plan'
  const dimensionResults = {}
  let score = 0
  for (const dim of DIMENSIONS) {
    // deviation around the expected level of a normal XI (see TUNING.DIM_CENTER)
    const dev = (profile[dim] - TUNING.DIM_CENTER[dim]) / 50
    const t = oppProfile.tests[dim] || 0
    const e = oppProfile.exposes[dim] || 0
    const c = t * dev + e * Math.max(0, dev)
    dimensionResults[dim] = Math.round(c * 1000) / 1000
    score += c
  }
  const probabilityDelta = clamp(
    Math.round(score * TUNING.PROB_SCALE * 1000) / 1000,
    -TUNING.PROB_CAP, TUNING.PROB_CAP,
  )

  // Key advantage / risk: strongest tested contributions either way.
  const tested = DIMENSIONS.filter((d) => (oppProfile.tests[d] || 0) > 0 || (oppProfile.exposes[d] || 0) > 0)
  let advDim = null
  let riskDim = null
  for (const d of tested) {
    const c = dimensionResults[d]
    if (c > 0.04 && (!advDim || c > dimensionResults[advDim])) advDim = d
    if (c < -0.04 && (!riskDim || c < dimensionResults[riskDim])) riskDim = d
  }
  const keyAdvantage = advDim ? { dim: advDim, text: ADV_TEXT[advDim](desc)[0], past: ADV_TEXT[advDim](desc)[1] } : null
  const keyRisk = riskDim ? { dim: riskDim, text: RISK_TEXT[riskDim](desc)[0], past: RISK_TEXT[riskDim](desc)[1] } : null

  // --- stat-profile shifts (capped again at the point of use) --------------
  const dc = dimensionResults
  const devMid = (profile.midfieldControl - TUNING.DIM_CENTER.midfieldControl) / 50
  const statModifiers = {
    possessionShift: clamp(Math.round(devMid * 2.5 + dc.midfieldControl * 4 + dc.buildupSecurity * 4), -5, 5),
    homeShotsShift: clamp(Math.round((dc.width + dc.transitionThreat) * 3 + Math.max(0, score) * 0.8), -2, 2),
    awayShotsShift: clamp(Math.round(-dc.defensiveStability * 3 - Math.min(0, score) * 0.8), -2, 2),
    bigChanceShift: (dc.width + dc.transitionThreat) > 0.3 ? 1 : (dc.width + dc.transitionThreat) < -0.3 ? -1 : 0,
  }

  // --- pattern modifiers (bounded 0.7–1.4, multiply Phase 2 role weights) ---
  const pm = {
    central_buildup: 1, wide_overlap: 1, switch_of_play: 1, through_ball: 1, one_two: 1,
    counterattack: 1, cross: 1, cutback: 1, pressing_recovery: 1, direct_attack: 1,
  }
  const bump = (k, v) => { pm[k] = clamp(pm[k] + v, 0.7, 1.4) }
  if (dc.buildupSecurity > 0.08) { bump('central_buildup', 0.25); bump('through_ball', 0.15) }
  if (dc.buildupSecurity < -0.08) { bump('central_buildup', -0.25); bump('one_two', -0.1) }
  if (dc.width > 0.08) { bump('wide_overlap', 0.3); bump('cross', 0.25); bump('cutback', 0.2); bump('switch_of_play', 0.2) }
  if (dc.width < -0.08) { bump('wide_overlap', -0.2); bump('cross', -0.2); bump('cutback', -0.15) }
  if (dc.transitionThreat > 0.08) { bump('counterattack', 0.3); bump('direct_attack', 0.2) }
  if (dc.midfieldControl > 0.08) { bump('central_buildup', 0.15); bump('one_two', 0.1); bump('switch_of_play', 0.1) }
  if (oppProfile.archetype === 'pressing') bump('pressing_recovery', 0.15)
  if (oppProfile.archetype === 'defensive' || oppProfile.archetype === 'underdog') bump('counterattack', -0.15)

  return {
    archetype: oppProfile.archetype,
    score: round1(score * 10) / 10,
    probabilityDelta,
    dimensionResults,
    keyAdvantage,
    keyRisk,
    overallLabel: matchupLabel(probabilityDelta),
    statModifiers,
    patternModifiers: pm,
    awayPatterns: oppProfile.awayPatterns,
    densityBias: oppProfile.densityBias,
  }
}

// Post-match tactical note — same canonical matchup, tone from the result.
export function postMatchTacticalNote(matchup, result) {
  if (!matchup) return null
  const won = result === 'win' || result === 'pens-win'
  const lost = result === 'loss' || result === 'pens-loss'
  const { keyAdvantage: adv, keyRisk: risk } = matchup
  if (won && adv) return adv.past
  if (lost && risk) return risk.past
  if (won && risk) return `You won despite the pressure — ${risk.text.charAt(0).toLowerCase()}${risk.text.slice(1)}`
  if (lost && adv) return `${adv.past} It wasn't enough on the night.`
  if (adv) return adv.past
  if (risk) return risk.past
  return 'Neither side found a decisive tactical advantage.'
}
