// ---------------------------------------------------------------------------
// Final XI Match Engine M1 — deterministic causal match core.
//
// The score is never selected. Six chronological windows create bounded
// opportunity candidates; routes, progression, chance quality, participants
// and conversion are resolved in that order. Goals and every public statistic
// are reductions of the resulting canonical event log.
//
// RNG contract: every mechanic owns a stable named/indexed substream. Adding
// presentation work, copy variants, or a new candidate at another index cannot
// move route/progression/conversion draws that already exist.
// ---------------------------------------------------------------------------

import { combineSeed, hashString, makeRng } from './seedUtils'
import { MODERN_PLAYERS } from './data/v2/playersModern'
import { LEGEND_SIGNATURES } from './data/v2/legendProfiles'

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
const round2 = (value) => Math.round(value * 100) / 100
const unique = (values, limit = 3) => [...new Set(values.filter(Boolean))].slice(0, limit)

export const M1_RNG_CONTRACT = 'finalxi.match.m1.rng.v1'

export const M1_WINDOWS = Object.freeze([
  Object.freeze({ index: 0, start: 1, end: 15, phase: 'early', tempo: 0.9 }),
  Object.freeze({ index: 1, start: 16, end: 30, phase: 'early', tempo: 0.98 }),
  Object.freeze({ index: 2, start: 31, end: 45, phase: 'middle', tempo: 0.95, stoppage: 4 }),
  Object.freeze({ index: 3, start: 46, end: 60, phase: 'middle', tempo: 1.0 }),
  Object.freeze({ index: 4, start: 61, end: 75, phase: 'late', tempo: 1.06 }),
  Object.freeze({ index: 5, start: 76, end: 90, phase: 'late', tempo: 1.12, stoppage: 6 }),
])

export const M1_ROUTES = Object.freeze([
  'central_buildup', 'wide_overlap', 'switch_of_play', 'through_ball',
  'one_two', 'counterattack', 'cross', 'cutback', 'pressing_recovery',
  'direct_attack', 'set_piece', 'long_range',
])

const ROUTE = Object.freeze({
  central_buildup: { weight: 4.2, progression: 0.67, xg: 0.145, control: 1.35 },
  wide_overlap: { weight: 2.2, progression: 0.64, xg: 0.115, control: 1.05 },
  switch_of_play: { weight: 1.5, progression: 0.72, xg: 0.09, control: 1.3 },
  through_ball: { weight: 2.0, progression: 0.57, xg: 0.24, control: 0.9 },
  one_two: { weight: 1.6, progression: 0.62, xg: 0.195, control: 1.1 },
  counterattack: { weight: 2.0, progression: 0.64, xg: 0.195, control: 0.68 },
  cross: { weight: 1.9, progression: 0.68, xg: 0.115, control: 0.86 },
  cutback: { weight: 1.25, progression: 0.59, xg: 0.255, control: 0.92 },
  pressing_recovery: { weight: 1.15, progression: 0.61, xg: 0.22, control: 0.72 },
  direct_attack: { weight: 1.3, progression: 0.56, xg: 0.13, control: 0.66 },
  set_piece: { weight: 0.85, progression: 0.73, xg: 0.12, control: 0.58 },
  long_range: { weight: 0.72, progression: 0.96, xg: 0.045, control: 0.78 },
})

// Complete controlled-vocabulary coverage. The executable helpers below use
// these exact contexts; this table is also an audit surface for catalogue tests.
export const M1_SIGNATURE_HOOKS = Object.freeze({
  'Line Breaker': Object.freeze({ stages: ['route', 'progression'], routes: ['central_buildup', 'through_ball'] }),
  'Final Ball': Object.freeze({ stages: ['progression', 'quality'], routes: ['through_ball', 'cutback', 'central_buildup'] }),
  'Tempo Setter': Object.freeze({ stages: ['route', 'progression'], routes: ['central_buildup', 'switch_of_play'] }),
  'Switch Specialist': Object.freeze({ stages: ['route', 'progression'], routes: ['switch_of_play', 'wide_overlap'] }),
  'Inside Threat': Object.freeze({ stages: ['route', 'quality', 'participant'], routes: ['one_two', 'through_ball', 'long_range'] }),
  'Touchline Runner': Object.freeze({ stages: ['route', 'progression', 'participant'], routes: ['wide_overlap', 'cross', 'cutback'] }),
  'Late Arrival': Object.freeze({ stages: ['participant', 'conversion'], routes: ['central_buildup', 'cutback', 'set_piece'] }),
  'Pocket Finder': Object.freeze({ stages: ['route', 'progression'], routes: ['one_two', 'central_buildup', 'through_ball'] }),
  'Overlap Instinct': Object.freeze({ stages: ['route', 'progression'], routes: ['wide_overlap', 'cutback', 'cross'] }),
  'Early Finisher': Object.freeze({ stages: ['conversion'], routes: ['through_ball', 'counterattack', 'cutback'] }),
  'Distance Threat': Object.freeze({ stages: ['route', 'quality', 'conversion'], routes: ['long_range'] }),
  'Composed Finisher': Object.freeze({ stages: ['conversion'], routes: M1_ROUTES }),
  'Aerial Target': Object.freeze({ stages: ['route', 'quality', 'conversion'], routes: ['cross', 'set_piece', 'direct_attack'] }),
  'One-Touch Threat': Object.freeze({ stages: ['participant', 'conversion'], routes: ['cross', 'cutback', 'one_two'] }),
  'Front-Foot Defender': Object.freeze({ stages: ['defending'], routes: ['central_buildup', 'counterattack', 'pressing_recovery'] }),
  'Duel Hunter': Object.freeze({ stages: ['defending'], routes: ['direct_attack', 'set_piece', 'counterattack'] }),
  'Lane Reader': Object.freeze({ stages: ['defending'], routes: ['through_ball', 'cutback', 'central_buildup'] }),
  'Recovery Pace': Object.freeze({ stages: ['defending'], routes: ['counterattack', 'direct_attack', 'through_ball'] }),
  'Box Guardian': Object.freeze({ stages: ['quality', 'defending'], routes: ['central_buildup', 'cross', 'cutback', 'set_piece'] }),
  'Shot Blocker': Object.freeze({ stages: ['conversion', 'goalkeeping'], routes: M1_ROUTES }),
  'Sweeper Instinct': Object.freeze({ stages: ['progression', 'goalkeeping'], routes: ['through_ball', 'counterattack', 'direct_attack'] }),
  'Distribution Range': Object.freeze({ stages: ['route', 'progression'], routes: ['switch_of_play', 'direct_attack', 'counterattack'] }),
})

export const M1_ROLE_HOOKS = Object.freeze({
  'Shot Stopper': Object.freeze({ stages: ['conversion'], routes: M1_ROUTES }),
  'Sweeper Keeper': Object.freeze({ stages: ['progression', 'route'], routes: ['through_ball', 'counterattack', 'direct_attack'] }),
  'Big Match Keeper': Object.freeze({ stages: ['conversion', 'penalties'], routes: M1_ROUTES }),
  'Defensive Leader': Object.freeze({ stages: ['progression', 'quality'], routes: ['central_buildup', 'cross', 'set_piece', 'direct_attack'] }),
  'Ball-Playing Defender': Object.freeze({ stages: ['route', 'progression'], routes: ['central_buildup', 'switch_of_play', 'direct_attack'] }),
  'Attacking Fullback': Object.freeze({ stages: ['route', 'progression', 'exposure'], routes: ['wide_overlap', 'cross', 'cutback'] }),
  'Balanced Fullback': Object.freeze({ stages: ['route', 'defending'], routes: ['wide_overlap', 'cross'] }),
  'Defensive Fullback': Object.freeze({ stages: ['defending'], routes: ['wide_overlap', 'cross', 'cutback'] }),
  'Attacking Wingback': Object.freeze({ stages: ['route', 'progression', 'exposure'], routes: ['wide_overlap', 'cross', 'cutback'] }),
  'Balanced Wingback': Object.freeze({ stages: ['route', 'defending'], routes: ['wide_overlap', 'cross'] }),
  'Defensive Wingback': Object.freeze({ stages: ['defending'], routes: ['wide_overlap', 'cross', 'cutback'] }),
  'Defensive Shield': Object.freeze({ stages: ['defending', 'control'], routes: ['central_buildup', 'counterattack', 'cutback'] }),
  'Ball Winner': Object.freeze({ stages: ['route', 'progression', 'exposure'], routes: ['pressing_recovery', 'counterattack'] }),
  'Tempo Controller': Object.freeze({ stages: ['route', 'progression', 'control'], routes: ['central_buildup', 'switch_of_play', 'one_two'] }),
  'Box-to-Box Engine': Object.freeze({ stages: ['route', 'participant'], routes: ['counterattack', 'pressing_recovery', 'cutback'] }),
  'Final Passer': Object.freeze({ stages: ['progression', 'quality', 'participant'], routes: ['through_ball', 'central_buildup', 'cutback'] }),
  'Creative Magician': Object.freeze({ stages: ['progression', 'quality', 'participant'], routes: ['one_two', 'through_ball', 'central_buildup'] }),
  'Inside Forward': Object.freeze({ stages: ['route', 'participant', 'conversion'], routes: ['one_two', 'through_ball', 'long_range'] }),
  'Touchline Winger': Object.freeze({ stages: ['route', 'progression', 'participant'], routes: ['wide_overlap', 'cross', 'cutback'] }),
  'Direct Runner': Object.freeze({ stages: ['route', 'progression', 'participant'], routes: ['counterattack', 'direct_attack', 'through_ball'] }),
  'Complete Striker': Object.freeze({ stages: ['participant', 'conversion'], routes: M1_ROUTES }),
  'Box Finisher': Object.freeze({ stages: ['participant', 'conversion'], routes: ['central_buildup', 'cross', 'cutback', 'through_ball', 'set_piece'] }),
  'Link-Up Striker': Object.freeze({ stages: ['route', 'progression', 'participant'], routes: ['one_two', 'direct_attack', 'central_buildup'] }),
  'Big Game Scorer': Object.freeze({ stages: ['conversion'], routes: M1_ROUTES }),
})

const MODERN_SIGNATURES = Object.fromEntries(MODERN_PLAYERS.map((player) => [player.id, player.signatures || []]))

function fallbackSignatures(player) {
  const role = player?.role
  if (player?.posType === 'GK') return role === 'Sweeper Keeper'
    ? ['Sweeper Instinct', 'Distribution Range']
    : ['Shot Blocker', 'Box Guardian']
  if (player?.posType === 'DEF') return role === 'Ball-Playing Defender'
    ? ['Line Breaker', 'Lane Reader']
    : role?.includes('Attacking') ? ['Overlap Instinct', 'Touchline Runner'] : ['Front-Foot Defender', 'Aerial Target']
  if (role === 'Tempo Controller') return ['Tempo Setter', 'Switch Specialist']
  if (role === 'Final Passer') return ['Final Ball', 'Line Breaker']
  if (role === 'Creative Magician') return ['Pocket Finder', 'Final Ball']
  if (role === 'Defensive Shield' || role === 'Ball Winner') return ['Duel Hunter', 'Lane Reader']
  if (role === 'Touchline Winger') return ['Touchline Runner', 'Final Ball']
  if (role === 'Inside Forward' || role === 'Direct Runner') return ['Inside Threat', 'Recovery Pace']
  if (role === 'Box Finisher') return ['Composed Finisher', 'One-Touch Threat']
  return ['Composed Finisher', 'Pocket Finder']
}

export function signaturesForM1Player(player) {
  // Version isolation: a catalogue-resolved player carries its own signature
  // record (direct `signatures` and/or the frozen `v2Source` snapshot) and
  // must NEVER fall back to the current master database — a historical R1
  // squad replays with R1 data even after master corrections. The master
  // lookups below remain only for legacy V1 objects, whose data is frozen.
  const versioned = player?.signatures || player?.v2Source?.signatures || null
  const signatures = versioned || MODERN_SIGNATURES[player?.id] || LEGEND_SIGNATURES[player?.id] || fallbackSignatures(player)
  return unique(signatures.filter((signature) => M1_SIGNATURE_HOOKS[signature]), 4)
}

export function deriveM1MatchSeed({ runSeed, matchNumber, stage, opponentId, nonce }) {
  return hashString([M1_RNG_CONTRACT, runSeed >>> 0, matchNumber, stage, opponentId, nonce >>> 0].join('|'))
}

export function m1SubstreamSeed(matchSeed, label, ...indexes) {
  return combineSeed(matchSeed, hashString([M1_RNG_CONTRACT, label, ...indexes].join('|')))
}

export function m1Substream(matchSeed, label, ...indexes) {
  return makeRng(m1SubstreamSeed(matchSeed, label, ...indexes))
}

function effectiveRole(entry) {
  const role = entry.player.role
  if (entry.slot !== 'RWB' && entry.slot !== 'LWB') return role
  if (role === 'Attacking Fullback') return 'Attacking Wingback'
  if (role === 'Balanced Fullback') return 'Balanced Wingback'
  if (role === 'Defensive Fullback') return 'Defensive Wingback'
  return role
}

function buildEntries(squad, playerQualityById = {}) {
  return (squad || []).filter((entry) => entry?.player).map((entry, index) => ({
    ...entry,
    index,
    role: effectiveRole(entry),
    signatures: signaturesForM1Player(entry.player),
    quality: clamp(Number(playerQualityById[entry.player.id]) || 8, 1, 30),
  }))
}

function hasRole(entry, role) {
  return entry.role === role || entry.player.secondaryRole === role
}

function weightedPick(rng, entries, weightOf, excludeId = null) {
  const pool = entries.filter((entry) => entry.player.id !== excludeId)
  const source = pool.length ? pool : entries
  if (!source.length) return null
  const weights = source.map((entry) => Math.max(0.001, weightOf(entry)))
  const total = weights.reduce((sum, value) => sum + value, 0)
  let roll = rng() * total
  for (let index = 0; index < source.length; index++) {
    roll -= weights[index]
    if (roll <= 0) return source[index]
  }
  return source[source.length - 1]
}

function chooseWeightedKey(rng, weights) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0)
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll <= 0) return key
  }
  return entries.at(-1)?.[0] || 'central_buildup'
}

const PLAN_ROUTE_MULTIPLIERS = Object.freeze({
  balanced: {},
  control: { central_buildup: 1.75, one_two: 1.55, switch_of_play: 1.65, through_ball: 1.08, counterattack: 0.42, direct_attack: 0.5, pressing_recovery: 0.75, cross: 0.72, cutback: 0.82 },
  wide: { wide_overlap: 2.3, cross: 2.15, cutback: 2.05, switch_of_play: 1.55, central_buildup: 0.55, one_two: 0.72, through_ball: 0.82, pressing_recovery: 0.85 },
  counter: { counterattack: 2.65, direct_attack: 1.95, pressing_recovery: 1.5, through_ball: 1.18, central_buildup: 0.4, one_two: 0.58, switch_of_play: 0.55, wide_overlap: 0.75 },
})

const ARCHETYPE_ROUTE_WEIGHTS = Object.freeze({
  pressing: { pressing_recovery: 5.2, counterattack: 2.5, direct_attack: 1.7, central_buildup: 1.2, cross: 1.1, through_ball: 1.0, set_piece: 0.8, long_range: 0.7 },
  technical: { central_buildup: 4.8, one_two: 2.4, through_ball: 2.2, switch_of_play: 1.8, wide_overlap: 1.5, cross: 1.0, counterattack: 0.7, long_range: 0.7 },
  defensive: { counterattack: 4.2, direct_attack: 2.5, set_piece: 1.5, cross: 1.25, central_buildup: 0.75, wide_overlap: 0.65, long_range: 0.75 },
  attacking: { central_buildup: 2.7, wide_overlap: 2.6, cross: 2.35, through_ball: 2.0, counterattack: 1.8, cutback: 1.35, pressing_recovery: 1.2, set_piece: 0.8 },
  physical: { direct_attack: 4.5, cross: 3.1, set_piece: 2.35, counterattack: 1.4, wide_overlap: 1.0, central_buildup: 0.7, long_range: 0.8 },
  elite: { central_buildup: 2.5, wide_overlap: 1.8, through_ball: 1.8, one_two: 1.5, counterattack: 1.6, cross: 1.6, direct_attack: 1.25, pressing_recovery: 1.2, set_piece: 1.0, long_range: 0.75 },
  underdog: { counterattack: 3.8, direct_attack: 2.7, set_piece: 1.65, cross: 1.2, central_buildup: 0.65, wide_overlap: 0.6, long_range: 0.8 },
})

const ROUTE_ROLE_BUMPS = Object.freeze({
  central_buildup: { 'Tempo Controller': 0.24, 'Ball-Playing Defender': 0.14, 'Final Passer': 0.1, 'Link-Up Striker': 0.08 },
  wide_overlap: { 'Attacking Fullback': 0.25, 'Attacking Wingback': 0.28, 'Balanced Fullback': 0.1, 'Balanced Wingback': 0.12, 'Touchline Winger': 0.2 },
  switch_of_play: { 'Tempo Controller': 0.28, 'Ball-Playing Defender': 0.1, 'Touchline Winger': 0.08 },
  through_ball: { 'Final Passer': 0.28, 'Creative Magician': 0.2, 'Direct Runner': 0.16 },
  one_two: { 'Creative Magician': 0.22, 'Link-Up Striker': 0.25, 'Inside Forward': 0.17 },
  counterattack: { 'Ball Winner': 0.2, 'Defensive Shield': 0.1, 'Direct Runner': 0.25, 'Box-to-Box Engine': 0.13 },
  cross: { 'Touchline Winger': 0.28, 'Attacking Fullback': 0.18, 'Attacking Wingback': 0.2, 'Box Finisher': 0.12 },
  cutback: { 'Touchline Winger': 0.2, 'Attacking Fullback': 0.2, 'Attacking Wingback': 0.22, 'Inside Forward': 0.1 },
  pressing_recovery: { 'Ball Winner': 0.28, 'Box-to-Box Engine': 0.2, 'Direct Runner': 0.08 },
  direct_attack: { 'Direct Runner': 0.25, 'Complete Striker': 0.16, 'Link-Up Striker': 0.12, 'Ball-Playing Defender': 0.08 },
  set_piece: { 'Defensive Leader': 0.12, 'Box Finisher': 0.14, 'Complete Striker': 0.1 },
  long_range: { 'Inside Forward': 0.13, 'Creative Magician': 0.1, 'Box-to-Box Engine': 0.08 },
})

function signatureRouteBump(signature, route) {
  const hooks = M1_SIGNATURE_HOOKS[signature]
  if (!hooks?.stages.includes('route') || !hooks.routes.includes(route)) return 0
  return signature === 'Distance Threat' ? 0.36 : signature === 'Aerial Target' ? 0.2 : 0.13
}

function homeRouteWeights({ entries, approach, matchup, archetype, scoreState, exposure }) {
  const weights = {}
  for (const route of M1_ROUTES) {
    let weight = ROUTE[route].weight
    weight *= PLAN_ROUTE_MULTIPLIERS[approach]?.[route] || 1
    const matchupModifier = matchup?.patternModifiers?.[route]
    if (matchupModifier != null) weight *= clamp(matchupModifier, 0.82, 1.22)
    let roleBump = 0
    for (const [role, bump] of Object.entries(ROUTE_ROLE_BUMPS[route] || {})) {
      const count = entries.filter((entry) => hasRole(entry, role)).length
      if (count) roleBump += bump * (count === 1 ? 1 : 1.45)
    }
    let signatureBump = 0
    for (const entry of entries) for (const signature of entry.signatures) signatureBump += signatureRouteBump(signature, route)
    weight *= 1 + clamp(roleBump, 0, 0.55) + clamp(signatureBump, 0, 0.38)

    if (scoreState.trailing && scoreState.late && ['direct_attack', 'cross', 'pressing_recovery', 'through_ball'].includes(route)) weight *= 1.24
    if (scoreState.leading && ['counterattack', 'central_buildup', 'switch_of_play'].includes(route)) weight *= 1.18
    if (exposure && ['counterattack', 'pressing_recovery', 'direct_attack'].includes(route)) weight *= 1.55

    if ((archetype === 'defensive' || archetype === 'underdog') && route === 'counterattack') weight *= 0.55
    if ((archetype === 'defensive' || archetype === 'underdog') && ['wide_overlap', 'cross', 'cutback'].includes(route)) weight *= 1.15
    if (archetype === 'pressing' && ['counterattack', 'direct_attack'].includes(route)) weight *= 1.22
    if (archetype === 'physical' && ['wide_overlap', 'switch_of_play'].includes(route)) weight *= 1.14
    weights[route] = weight
  }
  return weights
}

function awayRouteWeights({ archetype, approach, scoreState, exposure }) {
  const source = ARCHETYPE_ROUTE_WEIGHTS[archetype] || ARCHETYPE_ROUTE_WEIGHTS.elite
  const weights = Object.fromEntries(M1_ROUTES.map((route) => [route, source[route] || ROUTE[route].weight * 0.45]))
  if (approach === 'control') {
    weights.counterattack *= 0.68
    weights.pressing_recovery *= 0.78
    weights.central_buildup *= 0.92
  } else if (approach === 'wide') {
    weights.counterattack *= 1.55
    weights.central_buildup *= 1.2
    weights.pressing_recovery *= 1.18
  } else if (approach === 'counter') {
    weights.central_buildup *= 1.35
    weights.switch_of_play *= 1.25
    weights.counterattack *= 0.8
  }
  if (scoreState.trailing && scoreState.late) {
    weights.direct_attack *= 1.25
    weights.cross *= 1.2
    weights.pressing_recovery *= 1.2
  }
  if (scoreState.leading) weights.counterattack *= 1.25
  if (exposure) {
    weights.counterattack *= 1.6
    weights.pressing_recovery *= 1.35
    weights.direct_attack *= 1.25
  }
  return weights
}

function routeRoleCauses(entries, route) {
  const causes = []
  for (const role of Object.keys(ROUTE_ROLE_BUMPS[route] || {})) {
    const contributor = entries.find((entry) => hasRole(entry, role))
    if (contributor) causes.push(`${role}:${contributor.player.id}`)
  }
  return unique(causes, 2)
}

function routeSignatureCauses(entries, route) {
  const causes = []
  for (const entry of entries) {
    for (const signature of entry.signatures) {
      if (signatureRouteBump(signature, route) > 0) causes.push(`${signature}:${entry.player.id}`)
    }
  }
  return unique(causes, 2)
}

function creatorWeight(entry, route) {
  const role = entry.role
  let weight = entry.player.posType === 'MID' ? 2.3 : entry.player.posType === 'ATT' ? 1.6 : entry.player.posType === 'DEF' ? 0.65 : 0.08
  weight *= 1 + entry.quality / 38
  const affinity = M1_ROLE_HOOKS[role]?.routes.includes(route) ? 2.0 : 1
  weight *= affinity
  if (['wide_overlap', 'cross', 'cutback'].includes(route) && ['RB', 'LB', 'RWB', 'LWB', 'RM', 'LM', 'RW', 'LW'].includes(entry.slot)) weight *= 2.1
  if (route === 'pressing_recovery' && ['Ball Winner', 'Box-to-Box Engine', 'Direct Runner'].includes(role)) weight *= 2.3
  if (['central_buildup', 'switch_of_play'].includes(route) && ['CB', 'CDM', 'CM'].includes(entry.slot)) weight *= 1.8
  if (route === 'direct_attack' && (entry.player.posType === 'GK' || entry.slot === 'CB')) weight *= 2.1
  for (const signature of entry.signatures) {
    const hook = M1_SIGNATURE_HOOKS[signature]
    if (hook?.routes.includes(route) && (hook.stages.includes('route') || hook.stages.includes('progression'))) weight *= 1.22
  }
  return weight
}

function shooterWeight(entry, route) {
  const role = entry.role
  let weight = entry.player.posType === 'ATT' ? 5.2 : entry.player.posType === 'MID' ? 2.15 : entry.player.posType === 'DEF' ? 0.55 : 0.01
  weight *= 1 + entry.quality / 42
  if (role === 'Box Finisher') weight *= 1.8
  else if (role === 'Complete Striker') weight *= 1.45
  else if (role === 'Inside Forward' || role === 'Direct Runner') weight *= 1.4
  else if (role === 'Creative Magician' || role === 'Final Passer') weight *= 1.15
  else if (role === 'Box-to-Box Engine') weight *= 1.2
  if (['cross', 'set_piece', 'direct_attack'].includes(route) && entry.signatures.includes('Aerial Target')) weight *= 2.4
  if (route === 'long_range' && entry.signatures.includes('Distance Threat')) weight *= 3.2
  if (['central_buildup', 'cutback'].includes(route) && entry.signatures.includes('Late Arrival')) weight *= 1.8
  if (route === 'set_piece' && entry.player.posType === 'DEF') weight *= 3.2
  if (['wide_overlap', 'cross'].includes(route) && ['Touchline Winger', 'Attacking Fullback', 'Attacking Wingback'].includes(role)) weight *= 0.72
  return weight
}

function defenderWeight(entry, route) {
  let weight = entry.player.posType === 'DEF' ? 3.0 : entry.player.posType === 'MID' ? 1.4 : 0.15
  if (['central_buildup', 'through_ball', 'counterattack', 'cutback'].includes(route) && ['Defensive Shield', 'Ball Winner'].includes(entry.role)) weight *= 2.4
  if (['cross', 'set_piece', 'direct_attack'].includes(route) && entry.role === 'Defensive Leader') weight *= 2.4
  if (['wide_overlap', 'cross', 'cutback'].includes(route) && ['Defensive Fullback', 'Defensive Wingback', 'Balanced Fullback', 'Balanced Wingback'].includes(entry.role)) weight *= 2.2
  for (const signature of entry.signatures) if (M1_SIGNATURE_HOOKS[signature]?.stages.includes('defending') && M1_SIGNATURE_HOOKS[signature].routes.includes(route)) weight *= 1.3
  return weight
}

function scoreStateFor(us, opp, side, phase) {
  const own = side === 'us' ? us : opp
  const other = side === 'us' ? opp : us
  const diff = own - other
  return {
    diff,
    level: diff === 0,
    leading: diff > 0,
    leadingTwo: diff >= 2,
    trailing: diff < 0,
    trailingTwo: diff <= -2,
    late: phase === 'late',
  }
}

function statePressure(state) {
  const timeScale = state.late ? 1 : 0.72
  if (state.trailingTwo) return 1 + 0.19 * timeScale
  if (state.trailing) return 1 + 0.11 * timeScale
  if (state.leadingTwo) return 1 - 0.18 * timeScale
  if (state.leading) return 1 - 0.08 * timeScale
  if (state.level && state.late) return 1.035
  return 1
}

export function m1ScoreStateOpportunityMultiplier({ us = 0, opp = 0, side = 'us', phase = 'middle' } = {}) {
  return statePressure(scoreStateFor(us, opp, side, phase))
}

const ARCHETYPE_TEMPO = Object.freeze({ pressing: 1.1, technical: 0.96, defensive: 0.84, attacking: 1.14, physical: 1.04, elite: 1, underdog: 0.86 })
const PLAN_VOLUME = Object.freeze({
  balanced: { us: 1, opp: 1 },
  control: { us: 0.94, opp: 0.94 },
  wide: { us: 1.08, opp: 1.11 },
  counter: { us: 0.91, opp: 1.06 },
})

const M1_PREVIEW_ARCHETYPE_FIT = Object.freeze({
  balanced: Object.freeze({ pressing: 0, technical: 0.2, defensive: 0.15, attacking: 0, physical: 0.1, elite: 0.35, underdog: 0.1 }),
  control: Object.freeze({ pressing: 0.2, technical: 0.85, defensive: -1.15, attacking: 0.05, physical: 0.65, elite: 0.25, underdog: -1.15 }),
  wide: Object.freeze({ pressing: -0.1, technical: 0.1, defensive: 1.2, attacking: -0.15, physical: 0.45, elite: 0.1, underdog: 1.2 }),
  counter: Object.freeze({ pressing: 1.25, technical: -0.15, defensive: -1.25, attacking: 1.25, physical: -0.35, elite: 0.15, underdog: -1.25 }),
})

function m1PlanProfileSupport(approach, profile) {
  if (approach === 'control') return clamp((((profile?.buildupSecurity ?? 65) + (profile?.midfieldControl ?? 69)) / 2 - 67) / 12, -0.7, 0.7)
  if (approach === 'wide') return clamp(((profile?.width ?? 68) - 68) / 12, -0.7, 0.7)
  if (approach === 'counter') return clamp(((profile?.transitionThreat ?? 63) - 63) / 12, -0.7, 0.7)
  const dimensions = ['buildupSecurity', 'midfieldControl', 'width', 'transitionThreat', 'defensiveStability']
  const weakest = Math.min(...dimensions.map((dimension) => profile?.[dimension] ?? 65))
  return weakest >= 60 ? 0.2 : 0
}

function m1PlanPreviewCopy(approach, archetype) {
  const compact = archetype === 'defensive' || archetype === 'underdog'
  const aggressive = archetype === 'pressing' || archetype === 'attacking'
  if (approach === 'control') return {
    benefit: 'Settled central buildup can improve control and reduce open transitions.',
    risk: compact
      ? 'Their compact block can turn extra possession sterile and lower the chance ceiling.'
      : 'Reduced directness can leave fewer quick, high-quality attacks.',
  }
  if (approach === 'wide') return {
    benefit: compact
      ? 'Width, crosses and cutbacks can stretch their compact defensive shape.'
      : 'Overlaps and deliveries create a distinct route around central pressure.',
    risk: 'Failed wide attacks can expose central transitions.',
  }
  if (approach === 'counter') return {
    benefit: aggressive
      ? 'Their aggressive shape leaves space for counter and direct attacks.'
      : 'Fast transition routes can turn recoveries into higher-variance chances.',
    risk: compact
      ? 'Their deep block removes transition space and leaves fewer settled chances.'
      : 'Lower possession and fewer settled attacks reduce control when breaks fail.',
  }
  return {
    benefit: 'A stable route mix lets the XI use its natural all-round structure.',
    risk: 'No specialist plan means no targeted matchup edge.',
  }
}

function m1PreviewLabel(score) {
  if (score >= 1) return 'Strong Edge'
  if (score >= 0.35) return 'Slight Edge'
  if (score > -0.35) return 'Even'
  if (score > -1) return 'Slight Concern'
  return 'Difficult Matchup'
}

// Engine-aware Match Hub adapter. It preserves the legacy matchup mechanics
// object used by route resolution, while replacing only player-facing advice
// with deterministic evidence from M1's actual plan/archetype tradeoffs and
// this XI's tactical profile. No result probability or RNG enters the preview.
export function buildM1ApproachPreviews({ baseProfile, opponent, legacyPreviews }) {
  const archetype = opponent?.archetype || 'elite'
  const evidence = Object.fromEntries(Object.keys(PLAN_ROUTE_MULTIPLIERS).map((approach) => {
    const score = (M1_PREVIEW_ARCHETYPE_FIT[approach]?.[archetype] || 0) + m1PlanProfileSupport(approach, baseProfile)
    return [approach, { score, ...m1PlanPreviewCopy(approach, archetype) }]
  }))
  const bestScore = Math.max(...Object.values(evidence).map((value) => value.score))
  return Object.fromEntries(Object.entries(legacyPreviews).map(([approach, legacy]) => {
    const current = evidence[approach]
    const recommended = current.score >= bestScore - 0.2
    // `fit` and its exact historical strings are part of the frozen M1 replay
    // payload. They are intentionally retained for byte-identical R1 saves;
    // no current UI renders this field (MatchHub uses score/recommended and
    // its own Alignment/Matchup vocabulary).
    const fit = recommended
      ? `Recommended fit: ${current.benefit.charAt(0).toLowerCase()}${current.benefit.slice(1)}`
      : current.score <= -0.55
        ? `Poor fit: ${current.risk.charAt(0).toLowerCase()}${current.risk.slice(1)}`
        : `Tradeoff: ${current.benefit.charAt(0).toLowerCase()}${current.benefit.slice(1)} ${current.risk}`
    return [approach, {
      ...legacy,
      engineVersion: 'm1',
      overallLabel: m1PreviewLabel(current.score),
      keyAdvantage: { dim: 'causalPlan', text: current.benefit, past: current.benefit },
      keyRisk: { dim: 'causalPlan', text: current.risk, past: current.risk },
      m1Preview: { archetype, score: round2(current.score), recommended, benefit: current.benefit, risk: current.risk, fit },
    }]
  }))
}

function opportunityPressure({ side, qualityProbability, approach, archetype, window, score, tempo, exposure, home }) {
  const state = scoreStateFor(score.us, score.opp, side, window.phase)
  // Pivoted near the representative high-squad baseline. The stronger slope
  // separates squad/opponent bands without inflating that baseline's volume.
  const quality = side === 'us'
    ? 0.2 + qualityProbability * 1.35
    : 1.725 - qualityProbability * 1.25
  let plan = PLAN_VOLUME[approach]?.[side] || 1
  // Context prices the two specialist plans through opportunity creation,
  // never through a result bonus. Counter recovers volume only when an
  // aggressive opponent leaves space, while a low block preserves its
  // settled-attack tax. Control becomes sterile against the same compact
  // shapes instead of receiving cheap safety everywhere.
  if (side === 'us' && approach === 'counter') {
    if (archetype === 'pressing' || archetype === 'attacking') plan *= 1.05
    else if (archetype === 'defensive' || archetype === 'underdog') plan *= 0.91
  }
  if (side === 'us' && approach === 'control' && (archetype === 'defensive' || archetype === 'underdog')) plan *= 0.9
  const archetypeTempo = ARCHETYPE_TEMPO[archetype] || 1
  const venue = side === 'us' ? (home === false ? 0.985 : 1.015) : (home === false ? 1.015 : 0.985)
  return clamp(quality * plan * archetypeTempo * window.tempo * statePressure(state) * tempo * venue * (exposure ? 1.16 : 1), 0.48, 1.62)
}

function planCause(approach, side, route, exposure) {
  if (approach === 'balanced') return []
  if (side === 'us' && (PLAN_ROUTE_MULTIPLIERS[approach]?.[route] || 1) !== 1) return [`${approach}:route-mix`]
  if (side === 'opp') {
    if (approach === 'control' && ['counterattack', 'pressing_recovery'].includes(route)) return ['control:transition-suppression']
    if (approach === 'wide' && ['counterattack', 'pressing_recovery', 'central_buildup'].includes(route)) return [exposure ? 'wide:failed-wide-exposure' : 'wide:central-exposure']
    if (approach === 'counter' && ['central_buildup', 'switch_of_play'].includes(route)) return ['counter:territory-concession']
  }
  return []
}

function creatorProgressionModifier(entry, route) {
  if (!entry) return { delta: 0, roles: [], signatures: [] }
  let delta = 0
  const roles = []
  const signatures = []
  const roleDelta = {
    'Tempo Controller': ['central_buildup', 'switch_of_play', 'one_two'].includes(route) ? 0.045 : 0,
    'Final Passer': ['through_ball', 'central_buildup', 'cutback'].includes(route) ? 0.04 : 0,
    'Creative Magician': ['one_two', 'through_ball'].includes(route) ? 0.035 : 0,
    'Touchline Winger': ['wide_overlap', 'cross', 'cutback'].includes(route) ? 0.04 : 0,
    'Direct Runner': ['counterattack', 'direct_attack', 'through_ball'].includes(route) ? 0.04 : 0,
    'Ball-Playing Defender': ['central_buildup', 'switch_of_play', 'direct_attack'].includes(route) ? 0.035 : 0,
    'Ball Winner': ['pressing_recovery', 'counterattack'].includes(route) ? 0.035 : 0,
    'Link-Up Striker': ['one_two', 'direct_attack'].includes(route) ? 0.035 : 0,
  }[entry.role] || 0
  if (roleDelta) { delta += roleDelta; roles.push(`${entry.role}:${entry.player.id}`) }
  for (const signature of entry.signatures) {
    if (!M1_SIGNATURE_HOOKS[signature]?.routes.includes(route)) continue
    const sigDelta = {
      'Line Breaker': 0.025, 'Final Ball': 0.02, 'Tempo Setter': 0.028,
      'Switch Specialist': 0.032, 'Touchline Runner': 0.024, 'Pocket Finder': 0.025,
      'Overlap Instinct': 0.028, 'Distribution Range': 0.02,
    }[signature] || 0
    if (sigDelta) { delta += sigDelta; signatures.push(`${signature}:${entry.player.id}`) }
  }
  return { delta: clamp(delta, -0.08, 0.08), roles: unique(roles, 2), signatures: unique(signatures, 2) }
}

function defensiveProgressionModifier(defender, keeper, route) {
  let delta = 0
  const roles = []
  const signatures = []
  if (defender) {
    const roleDelta = {
      'Defensive Shield': ['central_buildup', 'counterattack', 'cutback'].includes(route) ? -0.055 : 0,
      'Ball Winner': ['central_buildup', 'pressing_recovery', 'counterattack'].includes(route) ? -0.045 : 0,
      'Defensive Leader': ['central_buildup', 'cross', 'set_piece', 'direct_attack'].includes(route) ? -0.05 : 0,
      'Defensive Fullback': ['wide_overlap', 'cross', 'cutback'].includes(route) ? -0.05 : 0,
      'Defensive Wingback': ['wide_overlap', 'cross', 'cutback'].includes(route) ? -0.05 : 0,
      'Balanced Fullback': ['wide_overlap', 'cross'].includes(route) ? -0.025 : 0,
      'Balanced Wingback': ['wide_overlap', 'cross'].includes(route) ? -0.025 : 0,
    }[defender.role] || 0
    if (roleDelta) { delta += roleDelta; roles.push(`${defender.role}:${defender.player.id}`) }
    for (const signature of defender.signatures) {
      if (!M1_SIGNATURE_HOOKS[signature]?.routes.includes(route)) continue
      const sigDelta = {
        'Front-Foot Defender': -0.025, 'Duel Hunter': -0.03, 'Lane Reader': -0.032,
        'Recovery Pace': -0.035, 'Box Guardian': -0.02,
      }[signature] || 0
      if (sigDelta) { delta += sigDelta; signatures.push(`${signature}:${defender.player.id}`) }
    }
  }
  if (keeper && ['through_ball', 'counterattack', 'direct_attack'].includes(route)) {
    if (keeper.role === 'Sweeper Keeper') { delta -= 0.035; roles.push(`Sweeper Keeper:${keeper.player.id}`) }
    if (keeper.signatures.includes('Sweeper Instinct')) { delta -= 0.025; signatures.push(`Sweeper Instinct:${keeper.player.id}`) }
  }
  return { delta: clamp(delta, -0.1, 0.02), roles: unique(roles, 2), signatures: unique(signatures, 2) }
}

function progressionProbability({ side, route, qualityProbability, approach, archetype, profile, creator, defender, keeper, scoreState }) {
  let probability = ROUTE[route].progression
  if (side === 'us') {
    probability += (qualityProbability - 0.5) * 0.18
    const routeDimension = ['central_buildup', 'switch_of_play', 'one_two'].includes(route) ? 'buildupSecurity'
      : ['wide_overlap', 'cross', 'cutback'].includes(route) ? 'width'
        : ['counterattack', 'direct_attack', 'pressing_recovery'].includes(route) ? 'transitionThreat' : 'midfieldControl'
    probability += ((profile?.[routeDimension] ?? 65) - 65) / 520
  } else {
    probability -= (qualityProbability - 0.5) * 0.15
    const stability = profile?.defensiveStability ?? 65
    probability -= (stability - 65) / 600
  }

  const planDelta = side === 'us' ? ({
    control: ['central_buildup', 'switch_of_play', 'one_two'].includes(route) ? 0.055 : ['counterattack', 'direct_attack'].includes(route) ? -0.055 : -0.01,
    wide: ['wide_overlap', 'cross', 'cutback'].includes(route) ? 0.05 : ['central_buildup', 'one_two'].includes(route) ? -0.045 : -0.005,
    counter: ['counterattack', 'direct_attack', 'pressing_recovery'].includes(route) ? 0.06 : ['central_buildup', 'switch_of_play'].includes(route) ? -0.07 : -0.02,
  }[approach] || 0) : 0
  probability += planDelta

  // Score state changes execution, not just volume: late chasers complete
  // urgent routes a little more often but lose patience in settled buildup;
  // leaders are marginally cleaner on control routes. All shifts are small.
  let stateDelta = 0
  if (scoreState?.trailing && scoreState.late) {
    stateDelta = ['direct_attack', 'cross', 'pressing_recovery', 'through_ball'].includes(route) ? 0.015 : -0.006
  } else if (scoreState?.leading && ['central_buildup', 'switch_of_play', 'counterattack'].includes(route)) {
    stateDelta = 0.008
  }
  probability += stateDelta

  if (archetype === 'pressing') probability += side === 'us' ? (['central_buildup', 'one_two'].includes(route) ? -0.075 : ['counterattack', 'direct_attack'].includes(route) ? 0.065 : 0) : (route === 'pressing_recovery' ? 0.065 : 0)
  if (side === 'us' && approach === 'counter' && archetype === 'attacking' && ['counterattack', 'direct_attack', 'pressing_recovery'].includes(route)) probability += 0.045
  if (side === 'us' && approach === 'counter' && archetype === 'elite' && ['counterattack', 'direct_attack'].includes(route)) probability += 0.025
  if (side === 'us' && approach === 'control' && (archetype === 'defensive' || archetype === 'underdog') && ['central_buildup', 'one_two', 'through_ball'].includes(route)) probability -= 0.03
  if (archetype === 'defensive' || archetype === 'underdog') probability += side === 'us' ? (['central_buildup', 'through_ball'].includes(route) ? -0.09 : ['wide_overlap', 'switch_of_play'].includes(route) ? 0.025 : 0) : 0.025
  if (archetype === 'physical') probability += side === 'us' ? (['wide_overlap', 'switch_of_play'].includes(route) ? 0.04 : ['direct_attack', 'set_piece'].includes(route) ? -0.035 : 0) : (['direct_attack', 'cross', 'set_piece'].includes(route) ? 0.045 : 0)
  if (archetype === 'technical' && side === 'opp' && ['central_buildup', 'one_two', 'through_ball'].includes(route)) probability += 0.045
  if (archetype === 'attacking' && side === 'opp') probability += 0.025
  if (archetype === 'elite' && side === 'opp') probability += 0.035

  const creatorMod = side === 'us' ? creatorProgressionModifier(creator, route) : { delta: 0, roles: [], signatures: [] }
  const defenderMod = side === 'opp' ? defensiveProgressionModifier(defender, keeper, route) : { delta: 0, roles: [], signatures: [] }
  probability += creatorMod.delta + defenderMod.delta
  return { probability: clamp(probability, 0.25, 0.9), creatorMod, defenderMod, planDelta, stateDelta }
}

function progressionFailure(route, rng) {
  const roll = rng()
  if (['wide_overlap', 'cross', 'cutback'].includes(route)) {
    if (roll < 0.36) return { outcome: 'cross_blocked', cornerWon: true, createsTransition: false }
    if (roll < 0.7) return { outcome: 'delivery_cleared', createsTransition: true }
    return { outcome: 'possession_recycled', createsTransition: false }
  }
  if (['counterattack', 'direct_attack'].includes(route)) {
    if (roll < 0.58) return { outcome: 'counter_halted', createsTransition: true }
    if (roll < 0.82) return { outcome: 'foul_won', foulWon: true, createsTransition: false }
    return { outcome: 'turnover_created', createsTransition: true }
  }
  if (route === 'pressing_recovery') return roll < 0.55
    ? { outcome: 'heavy_touch_turnover', createsTransition: true }
    : { outcome: 'foul_won', foulWon: true, createsTransition: false }
  if (route === 'set_piece') return roll < 0.55
    ? { outcome: 'set_piece_cleared', createsTransition: true }
    : { outcome: 'keeper_claim', createsTransition: false }
  if (roll < 0.42) return { outcome: 'pass_intercepted', createsTransition: true }
  if (roll < 0.72) return { outcome: 'buildup_stopped', createsTransition: false }
  return { outcome: 'possession_recycled', createsTransition: false }
}

function qualityBand(xg) {
  if (xg < 0.1) return 'low'
  if (xg < 0.2) return 'medium'
  if (xg < 0.33) return 'high'
  return 'clear'
}

function chanceQuality({ side, route, qualityProbability, approach, archetype, progressionMargin, creator, defender, keeper, scoreState, rng }) {
  let xg = ROUTE[route].xg
  const jitter = route === 'counterattack' ? (rng() - 0.5) * 0.18 : (rng() - 0.5) * 0.055
  xg += jitter + clamp(progressionMargin * 0.18, 0, 0.055)
  xg *= side === 'us'
    ? 0.413 + qualityProbability
    : 1.523 - qualityProbability
  if (scoreState?.trailing && scoreState.late && ['direct_attack', 'cross', 'pressing_recovery', 'through_ball'].includes(route)) xg += 0.012
  if (scoreState?.leadingTwo && ['through_ball', 'one_two', 'cutback'].includes(route)) xg -= 0.008

  const planCauses = []
  if (side === 'us' && approach === 'control') {
    if (['central_buildup', 'one_two', 'switch_of_play'].includes(route)) { xg += 0.004; planCauses.push('control:settled-quality') }
    if (['counterattack', 'direct_attack'].includes(route)) { xg -= 0.025; planCauses.push('control:lower-directness') }
    if ((archetype === 'defensive' || archetype === 'underdog') && ['central_buildup', 'one_two', 'through_ball'].includes(route)) {
      xg -= 0.025
      planCauses.push('control:sterile-possession')
    }
  }
  if (side === 'us' && approach === 'wide') {
    if (route === 'cutback') { xg += 0.035; planCauses.push('wide:cutback-quality') }
    if (route === 'cross') { xg -= 0.006; planCauses.push('wide:cross-volume-tradeoff') }
  }
  if (side === 'us' && approach === 'counter') {
    if (route === 'counterattack') { xg += 0.06; planCauses.push('counter:space-quality') }
    if (['central_buildup', 'one_two'].includes(route)) { xg -= 0.02; planCauses.push('counter:lower-settled-quality') }
  }

  const opponentCauses = []
  if (side === 'us') {
    if (archetype === 'pressing' && ['counterattack', 'direct_attack'].includes(route)) {
      xg += 0.045 + (approach === 'counter' ? 0.02 : 0)
      opponentCauses.push('pressing:space-behind')
    }
    if ((archetype === 'defensive' || archetype === 'underdog') && ['central_buildup', 'through_ball'].includes(route)) { xg -= 0.035; opponentCauses.push(`${archetype}:central-protection`) }
    if ((archetype === 'defensive' || archetype === 'underdog') && route === 'cutback') { xg += 0.018; opponentCauses.push(`${archetype}:wide-concession`) }
    if (archetype === 'attacking' && route === 'counterattack') {
      xg += 0.045 + (approach === 'counter' ? 0.035 : 0)
      opponentCauses.push('attacking:transition-space')
    }
    if (archetype === 'attacking' && approach === 'counter' && ['direct_attack', 'pressing_recovery'].includes(route)) {
      xg += route === 'direct_attack' ? 0.035 : 0.025
      opponentCauses.push('attacking:transition-space')
    }
    if (archetype === 'elite' && approach === 'counter' && route === 'counterattack') { xg += 0.02; opponentCauses.push('elite:space-behind') }
    if (archetype === 'physical' && ['cross', 'set_piece'].includes(route)) { xg -= 0.018; opponentCauses.push('physical:aerial-pressure') }
  } else {
    if (archetype === 'attacking' && ['counterattack', 'through_ball'].includes(route)) xg += 0.025
    if (archetype === 'physical' && ['cross', 'set_piece', 'direct_attack'].includes(route)) xg += 0.018
    if (archetype === 'defensive' || archetype === 'underdog') xg -= 0.025
    if (archetype === 'elite') xg += 0.015
  }

  const roles = []
  const signatures = []
  if (side === 'us' && creator) {
    if (creator.role === 'Final Passer' && ['through_ball', 'central_buildup', 'cutback'].includes(route)) { xg += 0.018; roles.push(`Final Passer:${creator.player.id}`) }
    if (creator.role === 'Creative Magician' && ['one_two', 'through_ball'].includes(route)) {
      const spark = rng() < 0.22 ? 0.06 : 0.006
      xg += spark; roles.push(`Creative Magician:${creator.player.id}`)
    }
    if (creator.role === 'Tempo Controller' && ['central_buildup', 'switch_of_play'].includes(route)) { xg += 0.01; roles.push(`Tempo Controller:${creator.player.id}`) }
    for (const signature of creator.signatures) {
      const delta = signature === 'Final Ball' && ['through_ball', 'cutback', 'central_buildup'].includes(route) ? 0.02
        : signature === 'Inside Threat' && ['one_two', 'through_ball'].includes(route) ? 0.015
          : signature === 'Aerial Target' && ['cross', 'set_piece'].includes(route) ? 0.015
            : signature === 'Distance Threat' && route === 'long_range' ? 0.018 : 0
      if (delta) { xg += delta; signatures.push(`${signature}:${creator.player.id}`) }
    }
  }
  if (side === 'opp') {
    if (defender?.role === 'Defensive Shield' && ['central_buildup', 'counterattack', 'cutback'].includes(route)) { xg -= 0.02; roles.push(`Defensive Shield:${defender.player.id}`) }
    if (defender?.role === 'Defensive Leader' && ['central_buildup', 'cross', 'set_piece'].includes(route)) { xg -= 0.018; roles.push(`Defensive Leader:${defender.player.id}`) }
    if (defender?.signatures.includes('Box Guardian') && ['central_buildup', 'cross', 'cutback', 'set_piece'].includes(route)) { xg -= 0.022; signatures.push(`Box Guardian:${defender.player.id}`) }
    if (keeper?.role === 'Sweeper Keeper' && ['through_ball', 'counterattack'].includes(route)) { xg -= 0.014; roles.push(`Sweeper Keeper:${keeper.player.id}`) }
  }
  xg = clamp(xg, 0.025, 0.5)
  return { xg: round2(xg), band: qualityBand(xg), planCauses, opponentCauses, roles: unique(roles, 2), signatures: unique(signatures, 2) }
}

function conversionModifier({ side, route, band, shooter, keeper, isKnockout, round }) {
  let delta = 0
  const roles = []
  const signatures = []
  if (side === 'us' && shooter) {
    if (shooter.role === 'Box Finisher' && route !== 'long_range') { delta += 0.05; roles.push(`Box Finisher:${shooter.player.id}`) }
    else if (shooter.role === 'Complete Striker') { delta += 0.015; roles.push(`Complete Striker:${shooter.player.id}`) }
    else if (shooter.role === 'Inside Forward' && ['one_two', 'through_ball', 'long_range'].includes(route)) { delta += 0.014; roles.push(`Inside Forward:${shooter.player.id}`) }
    else if (shooter.role === 'Big Game Scorer' && isKnockout && ['Semi-final', 'Final'].includes(round)) { delta += 0.018; roles.push(`Big Game Scorer:${shooter.player.id}`) }
    for (const signature of shooter.signatures) {
      const sigDelta = signature === 'Composed Finisher' && ['high', 'clear'].includes(band) ? 0.026
        : signature === 'Early Finisher' && ['through_ball', 'counterattack', 'cutback'].includes(route) ? 0.019
          : signature === 'One-Touch Threat' && ['cross', 'cutback', 'one_two'].includes(route) ? 0.02
            : signature === 'Aerial Target' && ['cross', 'set_piece', 'direct_attack'].includes(route) ? 0.022
              : signature === 'Distance Threat' && route === 'long_range' ? 0.016
                : signature === 'Late Arrival' && ['central_buildup', 'cutback', 'set_piece'].includes(route) ? 0.012 : 0
      if (sigDelta) { delta += sigDelta; signatures.push(`${signature}:${shooter.player.id}`) }
    }
  }
  if (side === 'opp' && keeper) {
    if (keeper.role === 'Shot Stopper') { delta -= band === 'low' ? 0.012 : 0.024; roles.push(`Shot Stopper:${keeper.player.id}`) }
    if (keeper.role === 'Big Match Keeper' && isKnockout) { delta -= 0.014; roles.push(`Big Match Keeper:${keeper.player.id}`) }
    if (keeper.signatures.includes('Shot Blocker')) { delta -= 0.02; signatures.push(`Shot Blocker:${keeper.player.id}`) }
    if (keeper.signatures.includes('Box Guardian') && ['high', 'clear'].includes(band)) { delta -= 0.012; signatures.push(`Box Guardian:${keeper.player.id}`) }
  }
  return { delta: clamp(delta, -0.055, 0.055), roles: unique(roles, 2), signatures: unique(signatures, 2) }
}

function genericOpponentParticipants(route) {
  if (['wide_overlap', 'cross', 'cutback'].includes(route)) return { creatorName: 'Opponent Winger', shooterName: 'Opponent Striker' }
  if (route === 'set_piece' || route === 'direct_attack') return { creatorName: 'Opponent Midfielder', shooterName: 'Opponent Centre-Back' }
  if (route === 'long_range') return { creatorName: 'Opponent Midfielder', shooterName: 'Opponent Midfielder' }
  return { creatorName: 'Opponent Playmaker', shooterName: 'Opponent Forward' }
}

function baseCauses({ approach, archetype, side, route, entries, exposure }) {
  return {
    plan: planCause(approach, side, route, exposure),
    roles: side === 'us' ? routeRoleCauses(entries, route) : [],
    signatures: side === 'us' ? routeSignatureCauses(entries, route) : [],
    opponent: [`${archetype}:route-profile`],
  }
}

function mergeCauses(...causes) {
  return {
    plan: unique(causes.flatMap((cause) => cause?.plan || []), 3),
    roles: unique(causes.flatMap((cause) => cause?.roles || []), 3),
    signatures: unique(causes.flatMap((cause) => cause?.signatures || []), 3),
    opponent: unique(causes.flatMap((cause) => cause?.opponent || []), 3),
  }
}

function minuteForCandidate(matchSeed, window, candidateIndex) {
  const rng = m1Substream(matchSeed, 'timing', window.index, candidateIndex)
  return window.start + Math.floor(rng() * (window.end - window.start + 1))
}

function minuteLabel(minute, stoppage) {
  return stoppage ? `${minute}+${stoppage}` : String(minute)
}

function buildCandidateList(matchSeed, window) {
  const candidates = Array.from({ length: 4 }, (_, candidateIndex) => ({
    candidateIndex,
    minute: minuteForCandidate(matchSeed, window, candidateIndex),
    stoppage: 0,
  }))
  candidates.sort((left, right) => left.minute - right.minute || left.candidateIndex - right.candidateIndex)
  if (window.stoppage) {
    const stoppageRng = m1Substream(matchSeed, 'stoppage-time', window.index)
    candidates.push({ candidateIndex: 4, minute: window.end, stoppage: 1 + Math.floor(stoppageRng() * window.stoppage), stoppageCandidate: true })
  }
  return candidates
}

function eventControlWeight({ side, route, approach, archetype, progressed }) {
  let value = ROUTE[route].control * (progressed ? 1.15 : 0.82)
  if (side === 'us' && approach === 'control') value *= 1.18
  if (side === 'us' && approach === 'counter') value *= 0.76
  if (side === 'opp' && archetype === 'technical') value *= 1.16
  if (side === 'opp' && (archetype === 'defensive' || archetype === 'underdog')) value *= 0.78
  return round2(value)
}

function resolvePenaltyShootout(matchSeed, entries) {
  const rng = m1Substream(matchSeed, 'penalty-shootout')
  const keeper = entries.find((entry) => entry.player.posType === 'GK')
  let winProbability = 0.5
  if (keeper?.role === 'Big Match Keeper') winProbability += 0.025
  if (keeper?.signatures.includes('Shot Blocker')) winProbability += 0.012
  const won = rng() < clamp(winProbability, 0.46, 0.54)
  const winnerScore = 4 + Math.floor(rng() * 2)
  const loserScore = Math.max(2, winnerScore - 1 - Math.floor(rng() * 2))
  return {
    won,
    score: won ? `${winnerScore}-${loserScore}` : `${loserScore}-${winnerScore}`,
    hero: won ? (rng() < 0.5 ? 'GK save in the shootout' : 'Ice-cold winning penalty') : null,
  }
}

function scorerLabelForRoute(route) {
  if (route === 'set_piece') return 'set-piece finish'
  if (route === 'long_range') return 'long-range strike'
  if (route === 'counterattack') return 'counterattack finish'
  if (route === 'cross') return 'header'
  return null
}

export function deriveM1EventMetrics(causalEvents) {
  const home = { opportunities: 0, chances: 0, shots: 0, shotsOnTarget: 0, goals: 0, saves: 0, bigChances: 0, xg: 0, fouls: 0, corners: 0, setPieces: 0, dangerousTransitions: 0, highTurnovers: 0, control: 2 }
  const away = { ...home, control: 2 }
  const routeDistribution = { home: {}, away: {} }
  const chanceQuality = { low: 0, medium: 0, high: 0, clear: 0 }
  const goalBands = [0, 0, 0, 0, 0, 0]
  let firstGoalMinute = null
  let halftime = { us: 0, opp: 0 }
  let leadChanges = 0
  let previousLeader = 0

  for (const event of causalEvents || []) {
    const own = event.side === 'us' ? home : away
    const other = event.side === 'us' ? away : home
    const routeKey = event.side === 'us' ? 'home' : 'away'
    own.opportunities++
    own.control += event.controlWeight || 0
    routeDistribution[routeKey][event.route] = (routeDistribution[routeKey][event.route] || 0) + 1
    if (event.cornerWon) own.corners++
    if (event.route === 'set_piece') own.setPieces++
    if (event.foulWon) other.fouls++
    if (event.dangerousTransition) own.dangerousTransitions++
    if (event.highTurnover) own.highTurnovers++
    if (event.progression !== 'success') continue
    own.chances++
    own.shots++
    own.xg += event.xg || 0
    if (event.chanceQuality) chanceQuality[event.chanceQuality]++
    if (event.chanceQuality === 'high' || event.chanceQuality === 'clear') own.bigChances++
    if (event.onTarget) own.shotsOnTarget++
    if (event.outcome === 'saved') other.saves++
    if (event.goal) {
      own.goals++
      const band = Math.min(5, Math.max(0, Math.floor((event.minute - 1) / 15)))
      goalBands[band]++
      if (firstGoalMinute == null) firstGoalMinute = event.minute
      if (event.minute <= 45) halftime[event.side]++
      const leader = event.scoreAfter.us === event.scoreAfter.opp ? 0 : event.scoreAfter.us > event.scoreAfter.opp ? 1 : -1
      if (previousLeader && leader && leader !== previousLeader) leadChanges++
      // Retain the last non-level leader through an equalizer so a later goal
      // by the other side is correctly counted as a lead change.
      if (leader) previousLeader = leader
    }
  }
  const controlTotal = home.control + away.control
  home.possession = clamp(Math.round((home.control / controlTotal) * 100), 24, 76)
  away.possession = 100 - home.possession
  home.xg = round2(home.xg)
  away.xg = round2(away.xg)
  delete home.control
  delete away.control
  const routeShares = (distribution) => {
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0) || 1
    return Object.fromEntries(M1_ROUTES.map((route) => [route, round2((distribution[route] || 0) / total)]))
  }
  return {
    home, away,
    routeDistribution,
    routeShares: { home: routeShares(routeDistribution.home), away: routeShares(routeDistribution.away) },
    chanceQuality,
    goalBands,
    firstGoalMinute,
    halftime,
    leadChanges,
  }
}

function causalSummaryFor({ metrics, causalEvents, approach, archetype }) {
  const planInfluenced = causalEvents.filter((event) => event.causes.plan.length).length
  const progressionFailures = causalEvents.filter((event) => event.progression !== 'success').length
  const ownFailures = causalEvents.filter((event) => event.side === 'us' && event.progression !== 'success').length
  const concessionTransitions = causalEvents.filter((event) => event.side === 'opp' && event.dangerousTransition).length
  let downsideMetric
  if (approach === 'control') downsideMetric = causalEvents.filter((event) => event.side === 'us' && event.causes.plan.includes('control:sterile-possession')).length
  else if (approach === 'wide') downsideMetric = concessionTransitions
  else if (approach === 'counter') downsideMetric = causalEvents.filter((event) => event.side === 'us' && ['central_buildup', 'one_two'].includes(event.route) && event.progression !== 'success').length + Math.max(0, metrics.away.opportunities - metrics.home.opportunities)
  else downsideMetric = 0
  return {
    opportunities: { us: metrics.home.opportunities, opp: metrics.away.opportunities },
    chances: { us: metrics.home.chances, opp: metrics.away.chances },
    routeShares: metrics.routeShares,
    chanceQuality: metrics.chanceQuality,
    plan: { key: approach, influencedEvents: planInfluenced, downsideMetric },
    opponent: { archetype, progressionFailures, ownFailures },
  }
}

function keyPlayerFromEvents(causalEvents, entries) {
  const points = Object.fromEntries(entries.map((entry) => [entry.player.id, 0]))
  for (const event of causalEvents) {
    if (event.side === 'us') {
      if (event.creatorId) points[event.creatorId] = (points[event.creatorId] || 0) + (event.goal ? 2 : event.progression === 'success' ? 0.35 : 0.08)
      if (event.shooterId) points[event.shooterId] = (points[event.shooterId] || 0) + (event.goal ? 5 : event.onTarget ? 0.8 : 0.25)
    } else {
      if (event.defenderId && event.progression !== 'success') points[event.defenderId] = (points[event.defenderId] || 0) + 0.55
      if (event.keeperId && event.outcome === 'saved') points[event.keeperId] = (points[event.keeperId] || 0) + 1.1
    }
  }
  const best = [...entries].sort((left, right) => (points[right.player.id] || 0) - (points[left.player.id] || 0) || right.quality - left.quality || left.index - right.index)[0]
  return best?.player.name || null
}

// Public core resolver. It accepts context only; there is no target score or
// result input. The returned score is a strict reduction of goal events.
export function resolveM1Match({
  runSeed,
  matchNumber,
  matchNonce,
  kind,
  round = null,
  opponent,
  home = null,
  approach = 'balanced',
  squad,
  adjustedProfile,
  matchup,
  qualityProbability,
  playerQualityById = {},
}) {
  const stage = kind === 'league' ? `League:${matchNumber}` : round
  const archetype = opponent?.archetype || 'elite'
  const matchSeed = deriveM1MatchSeed({ runSeed, matchNumber, stage, opponentId: opponent?.id || opponent?.name || 'opponent', nonce: matchNonce })
  const entries = buildEntries(squad, playerQualityById)
  const keeper = entries.find((entry) => entry.player.posType === 'GK') || null
  const tempoRng = m1Substream(matchSeed, 'match-tempo')
  const tempoBand = approach === 'control' ? [0.96, 0.08]
    : approach === 'counter' ? [0.75, 0.5]
      : approach === 'wide' ? [0.84, 0.32]
        : [0.88, 0.24]
  const tempo = tempoBand[0] + tempoRng() * tempoBand[1]
  const score = { us: 0, opp: 0 }
  const causalEvents = []
  let exposure = null

  for (const window of M1_WINDOWS) {
    const candidates = buildCandidateList(matchSeed, window)
    for (const candidate of candidates) {
      const exposureUs = exposure?.beneficiary === 'us'
      const exposureOpp = exposure?.beneficiary === 'opp'
      const usPressure = opportunityPressure({ side: 'us', qualityProbability, approach, archetype, window, score, tempo, exposure: exposureUs, home })
      const oppPressure = opportunityPressure({ side: 'opp', qualityProbability, approach, archetype, window, score, tempo, exposure: exposureOpp, home })
      const occurrenceRng = m1Substream(matchSeed, 'window-opportunity', window.index, candidate.candidateIndex)
      const baseHazard = candidate.stoppageCandidate ? 0.115 : 0.61
      const occurrenceProbability = clamp(baseHazard * ((usPressure + oppPressure) / 2), candidate.stoppageCandidate ? 0.05 : 0.25, candidate.stoppageCandidate ? 0.24 : 0.86)
      if (occurrenceRng() >= occurrenceProbability) continue

      const sideRng = m1Substream(matchSeed, 'side-selection', window.index, candidate.candidateIndex)
      const side = sideRng() < usPressure / (usPressure + oppPressure) ? 'us' : 'opp'
      const usedExposure = exposure?.beneficiary === side ? exposure : null
      if (usedExposure) exposure = null
      const scoreState = scoreStateFor(score.us, score.opp, side, window.phase)
      const routeWeights = side === 'us'
        ? homeRouteWeights({ entries, approach, matchup, archetype, scoreState, exposure: usedExposure })
        : awayRouteWeights({ archetype, approach, scoreState, exposure: usedExposure })
      const routeRng = m1Substream(matchSeed, 'attack-route', window.index, candidate.candidateIndex)
      const route = chooseWeightedKey(routeRng, routeWeights)

      const creator = side === 'us'
        ? weightedPick(m1Substream(matchSeed, 'participant-creator', window.index, candidate.candidateIndex), entries, (entry) => creatorWeight(entry, route))
        : null
      const opponentParticipants = genericOpponentParticipants(route)
      const defender = side === 'opp'
        ? weightedPick(m1Substream(matchSeed, 'participant-defender', window.index, candidate.candidateIndex), entries.filter((entry) => entry.player.posType !== 'GK'), (entry) => defenderWeight(entry, route))
        : null
      const progression = progressionProbability({
        side, route, qualityProbability, approach, archetype, profile: adjustedProfile,
        creator, defender, keeper, scoreState,
      })
      const progressionRng = m1Substream(matchSeed, 'progression', window.index, candidate.candidateIndex)
      const progressionRoll = progressionRng()
      const progressed = progressionRoll < progression.probability
      const before = { us: score.us, opp: score.opp }
      const base = baseCauses({ approach, archetype, side, route, entries, exposure: usedExposure })
      const progressionCauses = {
        roles: [...progression.creatorMod.roles, ...progression.defenderMod.roles],
        signatures: [...progression.creatorMod.signatures, ...progression.defenderMod.signatures],
        plan: progression.planDelta ? [`${approach}:progression`] : [],
        opponent: [`${archetype}:progression-pressure`],
      }
      const id = `m1-w${window.index + 1}-o${candidate.candidateIndex}`

      if (!progressed) {
        const failure = progressionFailure(route, m1Substream(matchSeed, 'progression-outcome', window.index, candidate.candidateIndex))
        if (failure.createsTransition) exposure = { beneficiary: side === 'us' ? 'opp' : 'us', sourceEventId: id }
        causalEvents.push({
          id,
          minute: candidate.minute,
          minuteLabel: minuteLabel(candidate.minute, candidate.stoppage),
          stoppage: candidate.stoppage || null,
          side,
          window: window.index + 1,
          phase: window.phase,
          route,
          progression: 'failed',
          chanceQuality: null,
          xg: 0,
          creatorId: creator?.player.id || null,
          creatorName: creator?.player.name || opponentParticipants.creatorName,
          shooterId: null,
          shooterName: null,
          defenderId: defender?.player.id || null,
          keeperId: keeper?.player.id || null,
          outcome: failure.outcome,
          goal: false,
          onTarget: false,
          cornerWon: !!failure.cornerWon,
          foulWon: !!failure.foulWon,
          createsTransition: !!failure.createsTransition,
          dangerousTransition: route === 'counterattack' || !!usedExposure,
          highTurnover: route === 'pressing_recovery',
          controlWeight: eventControlWeight({ side, route, approach, archetype, progressed: false }),
          scoreBefore: before,
          scoreAfter: { ...before },
          causes: mergeCauses(base, progressionCauses, usedExposure ? { plan: planCause(approach, side, route, usedExposure), opponent: [`transition-from:${usedExposure.sourceEventId}`] } : null),
        })
        continue
      }

      const shooter = side === 'us'
        ? weightedPick(m1Substream(matchSeed, 'participant-shooter', window.index, candidate.candidateIndex), entries.filter((entry) => entry.player.posType !== 'GK'), (entry) => shooterWeight(entry, route), route === 'long_range' ? null : creator?.player.id)
        : null
      const quality = chanceQuality({
        side, route, qualityProbability, approach, archetype,
        progressionMargin: progression.probability - progressionRoll,
        creator, defender, keeper, scoreState,
        rng: m1Substream(matchSeed, 'chance-quality', window.index, candidate.candidateIndex),
      })
      const conversion = conversionModifier({ side, route, band: quality.band, shooter, keeper, isKnockout: kind === 'ko', round })
      const conversionProbability = clamp(quality.xg + conversion.delta, 0.015, 0.52)
      const goal = m1Substream(matchSeed, 'conversion', window.index, candidate.candidateIndex)() < conversionProbability
      let onTarget = goal
      let outcome = 'goal'
      if (!goal) {
        const targetProbability = clamp(0.22 + quality.xg * 1.35 + (shooter?.signatures.includes('Composed Finisher') ? 0.035 : 0), 0.24, 0.78)
        onTarget = m1Substream(matchSeed, 'shot-target', window.index, candidate.candidateIndex)() < targetProbability
        outcome = onTarget ? 'saved' : 'off_target'
      }
      if (goal) score[side]++
      const after = { us: score.us, opp: score.opp }
      causalEvents.push({
        id,
        minute: candidate.minute,
        minuteLabel: minuteLabel(candidate.minute, candidate.stoppage),
        stoppage: candidate.stoppage || null,
        side,
        window: window.index + 1,
        phase: window.phase,
        route,
        progression: 'success',
        chanceQuality: quality.band,
        xg: quality.xg,
        creatorId: creator?.player.id || null,
        creatorName: creator?.player.name || opponentParticipants.creatorName,
        shooterId: shooter?.player.id || null,
        shooterName: shooter?.player.name || opponentParticipants.shooterName,
        defenderId: defender?.player.id || null,
        keeperId: keeper?.player.id || null,
        outcome,
        goal,
        onTarget,
        cornerWon: false,
        foulWon: false,
        createsTransition: false,
        dangerousTransition: route === 'counterattack' || !!usedExposure,
        highTurnover: route === 'pressing_recovery',
        controlWeight: eventControlWeight({ side, route, approach, archetype, progressed: true }),
        scoreBefore: before,
        scoreAfter: after,
        causes: mergeCauses(
          base,
          progressionCauses,
          { plan: quality.planCauses, roles: quality.roles, signatures: quality.signatures, opponent: quality.opponentCauses },
          { roles: conversion.roles, signatures: conversion.signatures },
          usedExposure ? { plan: planCause(approach, side, route, usedExposure), opponent: [`transition-from:${usedExposure.sourceEventId}`] } : null,
        ),
      })
    }
  }

  const metrics = deriveM1EventMetrics(causalEvents)
  const goalEvents = causalEvents.filter((event) => event.goal).map((event) => ({
    minute: event.minute,
    side: event.side,
    scorer: event.shooterName || (event.side === 'us' ? 'Final XI' : 'Opponent Forward'),
    assist: event.creatorName && event.creatorName !== event.shooterName ? event.creatorName : null,
    label: scorerLabelForRoute(event.route),
    causalEventId: event.id,
    route: event.route,
    chanceQuality: event.chanceQuality,
  }))
  const gf = metrics.home.goals
  const ga = metrics.away.goals
  let pens = null
  let result
  let eliminated = false
  if (kind === 'ko' && gf === ga) {
    pens = resolvePenaltyShootout(matchSeed, entries)
    result = pens.won ? 'pens-win' : 'pens-loss'
    eliminated = !pens.won
  } else if (gf > ga) result = 'win'
  else if (gf < ga) { result = 'loss'; eliminated = kind === 'ko' }
  else result = 'draw'
  const points = kind === 'league' ? (result === 'win' ? 3 : result === 'draw' ? 1 : 0) : undefined
  const normalScore = `${gf}-${ga}`
  const scoreText = pens ? `${normalScore} (pens ${pens.score})` : normalScore
  const causalSummary = causalSummaryFor({ metrics, causalEvents, approach, archetype })
  const potm = keyPlayerFromEvents(causalEvents, entries)
  const homeStats = metrics.home

  return {
    type: kind,
    ...(kind === 'league' ? { matchNo: matchNumber, home } : { round }),
    opponent: opponent?.name || 'Opponent',
    opponentMeta: opponent || null,
    matchup,
    approach,
    ...(kind === 'league' ? { points } : { normalScore, pens, eliminated }),
    score: scoreText,
    result,
    events: goalEvents,
    goals: goalEvents,
    stats: {
      possession: homeStats.possession,
      shots: homeStats.shots,
      shotsOnTarget: homeStats.shotsOnTarget,
      xg: homeStats.xg,
      saves: homeStats.saves,
      fouls: homeStats.fouls,
      potm,
      corners: homeStats.corners,
      bigChances: homeStats.bigChances,
    },
    gf,
    ga,
    engineVersion: 'm1',
    simulationSeed: matchSeed,
    presentationSeed: m1SubstreamSeed(matchSeed, 'presentation'),
    rngContract: M1_RNG_CONTRACT,
    causalEvents,
    causalSummary,
    eventMetrics: metrics,
  }
}
