// ---------------------------------------------------------------------------
// Player Database V2 — master assembly (Phase A).
//
// Normalizes NATIONS / LEAGUES / CLUBS and assembles the master player list:
//   • LEGENDS are migrated deterministically from the frozen V1 PLAYERS array
//     (era === 'legend') so IDs, names and positions are preserved exactly —
//     no legend is re-authored by hand and none can silently drift.
//   • MODERN players are the curated V2 set (playersModern.js).
//
// This module only ASSEMBLES and LOOKS UP data. It never touches the live
// game's V1 pool, draft, or determinism — those keep running on data.js.
// ---------------------------------------------------------------------------

import { PLAYERS as V1_PLAYERS, GOAT_IDS, GOAT_CANDIDATE_IDS } from '../../data'
import { posTypeOf } from './schema'
import { NATIONS } from './nations'
import { LEAGUES } from './leagues'
import { CLUBS } from './clubs'
import { MODERN_PLAYERS } from './playersModern'
import { curatedRoleSuitability } from './roleSuitabilityOverrides'
import { LEGEND_SIGNATURES, LEGEND_CHARACTERS } from './legendProfiles'

export { NATIONS, LEAGUES, CLUBS }

// --- reference lookups -----------------------------------------------------
export const nationById = Object.fromEntries(NATIONS.map((n) => [n.id, n]))
export const leagueById = Object.fromEntries(LEAGUES.map((l) => [l.id, l]))
export const clubById = Object.fromEntries(CLUBS.map((c) => [c.id, c]))

const NATION_BY_NAME = Object.fromEntries(NATIONS.map((n) => [n.name.toLowerCase(), n.id]))
const CLUB_BY_ALIAS = (() => {
  const m = {}
  for (const c of CLUBS) {
    m[c.name.toLowerCase()] = c.id
    for (const a of c.aliases || []) m[a.toLowerCase()] = c.id
  }
  return m
})()

// League a club plays in (single source of truth: the club record).
export const leagueOfClub = (clubId) => clubById[clubId]?.leagueId ?? null

// ---------------------------------------------------------------------------
// Legend migration. Still-active greats get their current 2026 club via an
// explicit, sourced override so the GOAT invariant + stable IDs are preserved
// while the club reflects reality (see transferIntel + report). Everyone else
// keeps their historical club (a documented limitation for retired players).
// ---------------------------------------------------------------------------
const LEGEND_CLUB_OVERRIDES = {
  messi: 'inter_miami',    // Inter Miami (confirmed, active)
  ronaldo: 'al_nassr',     // Cristiano Ronaldo — Al Nassr (confirmed, active)
  suarez: 'inter_miami',   // Luis Suárez — Inter Miami (active)
  neymar: 'santos',        // Neymar — Santos return (active)
  benzema: 'al_ittihad',   // Karim Benzema — Al Ittihad (active)
}

// Deterministic, id-seeded spread so migrated legends aren't all identical.
function hashId(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const pickFrom = (arr, seed) => arr[seed % arr.length]

// Role → plausible character pool + signature pool for migrated legends
// (game-design defaults; legends do not drive Phase A gameplay).
const ROLE_CHARACTERS = ['Standard Bearer', 'Big Stage', 'Club Heart', 'Competitor', 'Relentless', 'Mentor', 'Maverick', 'Quiet Pro']
function legendSignatures(role, posType) {
  if (posType === 'GK') return ['Shot Blocker', 'Box Guardian']
  if (posType === 'DEF') return ['Front-Foot Defender', 'Aerial Target']
  if (['Tempo Controller', 'Final Passer', 'Creative Magician'].includes(role)) return ['Final Ball', 'Pocket Finder']
  if (['Ball Winner', 'Defensive Shield', 'Box-to-Box Engine'].includes(role)) return ['Duel Hunter', 'Line Breaker']
  if (['Inside Forward', 'Touchline Winger', 'Direct Runner'].includes(role)) return ['Inside Threat', 'Composed Finisher']
  return ['Composed Finisher', 'One-Touch Threat']
}

function migrateLegend(p) {
  const nationId = NATION_BY_NAME[p.country.toLowerCase()] ?? null
  const clubId = LEGEND_CLUB_OVERRIDES[p.id] ?? CLUB_BY_ALIAS[p.club.toLowerCase()] ?? null
  const secondary = (p.eligibleSlots || []).filter((s) => s !== p.primaryPos)
  const tier = GOAT_IDS.has(p.id) ? 'goat' : GOAT_CANDIDATE_IDS.has(p.id) ? 'goat_candidate' : 'elite'
  const seed = hashId(p.id)
  return {
    id: p.id,
    name: p.name,
    primaryPosition: p.primaryPos,
    secondaryPositions: secondary,
    nationId,
    clubId,
    primaryRole: p.role,
    tier,
    // Curated distinctive character/signatures where authored (Phase A
    // remediation); role-templated fallback keeps any uncurated legend valid.
    character: LEGEND_CHARACTERS[p.id] ?? pickFrom(ROLE_CHARACTERS, seed),
    signatures: LEGEND_SIGNATURES[p.id] ?? legendSignatures(p.role, posTypeOf(p.primaryPos)),
    developmentProfile: 'veteran',
    era: 'legend',
  }
}

// A few V1 "legend"-classified players are actually current-era pros (e.g.
// Virgil van Dijk) and are re-authored in the modern set. The modern record
// wins, so we skip migrating any legend whose id also exists in MODERN_PLAYERS.
const MODERN_ID_SET = new Set(MODERN_PLAYERS.map((p) => p.id))
export const LEGEND_PLAYERS = V1_PLAYERS
  .filter((p) => p.era === 'legend' && !MODERN_ID_SET.has(p.id))
  .map(migrateLegend)

// ---------------------------------------------------------------------------
// Role suitability (Phase A.2) — DERIVED, sparse, player-specific.
//
// Rather than hand-author a role map for every player (fragile at scale), we
// derive a small role profile from data that is ALREADY curated per player:
// the primary role (level 3), the real secondary positions (their natural
// role at level 2), a signature-driven sibling of the primary position, and —
// only for utility/multi-position players — one plausible neighbour (level 1).
// Elite specialists with no secondary positions therefore stay narrow, while
// genuinely versatile players earn breadth. Values: 3 natural, 2 accomplished,
// 1 plausible. This never affects gameplay/determinism (the adapter ignores
// it); it is data for the future Tactical HQ.
// ---------------------------------------------------------------------------
function roleForPosition(pos, sig) {
  const has = (s) => sig.includes(s)
  switch (pos) {
    case 'GK': return has('Sweeper Instinct') ? 'Sweeper Keeper' : 'Shot Stopper'
    case 'CB': return has('Line Breaker') ? 'Ball-Playing Defender' : 'Defensive Leader'
    case 'RB': case 'LB': return has('Overlap Instinct') ? 'Attacking Fullback' : (has('Duel Hunter') && !has('Final Ball')) ? 'Defensive Fullback' : 'Balanced Fullback'
    case 'RWB': case 'LWB': return has('Overlap Instinct') ? 'Attacking Wingback' : 'Balanced Wingback'
    case 'CDM': return has('Tempo Setter') ? 'Tempo Controller' : has('Duel Hunter') ? 'Ball Winner' : 'Defensive Shield'
    case 'CM': return has('Tempo Setter') ? 'Tempo Controller' : has('Final Ball') ? 'Final Passer' : 'Box-to-Box Engine'
    case 'CAM': return has('Final Ball') ? 'Final Passer' : 'Creative Magician'
    case 'RM': case 'LM': return has('Inside Threat') ? 'Inside Forward' : 'Touchline Winger'
    case 'RW': case 'LW': return has('Touchline Runner') ? 'Touchline Winger' : (has('Recovery Pace') && !has('Inside Threat')) ? 'Direct Runner' : 'Inside Forward'
    case 'ST': return has('Aerial Target') ? 'Box Finisher' : has('Pocket Finder') ? 'Link-Up Striker' : 'Complete Striker'
    default: return null
  }
}
const ROLE_NEIGHBOR = {
  'Shot Stopper': 'Sweeper Keeper', 'Sweeper Keeper': 'Shot Stopper', 'Big Match Keeper': 'Shot Stopper',
  'Defensive Leader': 'Ball-Playing Defender', 'Ball-Playing Defender': 'Defensive Leader',
  'Attacking Fullback': 'Balanced Fullback', 'Balanced Fullback': 'Defensive Fullback', 'Defensive Fullback': 'Balanced Fullback',
  'Attacking Wingback': 'Balanced Wingback', 'Balanced Wingback': 'Defensive Wingback', 'Defensive Wingback': 'Balanced Wingback',
  'Defensive Shield': 'Ball Winner', 'Ball Winner': 'Defensive Shield', 'Tempo Controller': 'Final Passer',
  'Box-to-Box Engine': 'Ball Winner', 'Final Passer': 'Tempo Controller',
  'Creative Magician': 'Final Passer', 'Inside Forward': 'Direct Runner', 'Touchline Winger': 'Inside Forward', 'Direct Runner': 'Inside Forward',
  'Complete Striker': 'Link-Up Striker', 'Box Finisher': 'Complete Striker', 'Link-Up Striker': 'Complete Striker',
}
export function deriveRoleSuitability(p) {
  const sig = p.signatures || []
  const primaryRole = p.primaryRole
  const sec = p.secondaryPositions || []
  const map = { [primaryRole]: 3 }
  const add = (role, lvl) => { if (role && role !== primaryRole) map[role] = Math.max(map[role] || 0, lvl) }
  for (const pos of sec) add(roleForPosition(pos, sig), 2)          // accomplished from real positions
  add(roleForPosition(p.primaryPosition, sig), 2)                   // signature-driven sibling
  const utility = p.tier === 'quality' || p.tier === 'squad' || p.tier === 'prospect' || sec.length >= 2
  if (utility && Object.keys(map).length < 4) add(ROLE_NEIGHBOR[primaryRole], 1)
  return map
}

// Master player list: migrated legends first (stable historical order), then
// the curated modern set (authored order). Both orders are explicit and never
// derived from Object key iteration. Role suitability is attached here so every
// player (legend + modern) carries a profile. Resolution order:
//   explicit field  →  hand-curated override  →  deterministic derivation.
// Curated overrides (legends, top modern, specialists) win over derivation but
// always keep the primary role natural (3); derivation remains the fallback.
export const V2_PLAYERS = [...LEGEND_PLAYERS, ...MODERN_PLAYERS].map((p) => ({
  ...p,
  roleSuitability: p.roleSuitability || curatedRoleSuitability(p) || deriveRoleSuitability(p),
}))

export const v2PlayerById = Object.fromEntries(V2_PLAYERS.map((p) => [p.id, p]))

// Convenience getters (repository surface used by the adapter + validators).
export const getNationById = (id) => nationById[id] || null
export const getLeagueById = (id) => leagueById[id] || null
export const getClubById = (id) => clubById[id] || null
export const getV2PlayerById = (id) => v2PlayerById[id] || null
