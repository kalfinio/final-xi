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
    character: pickFrom(ROLE_CHARACTERS, seed),
    signatures: legendSignatures(p.role, posTypeOf(p.primaryPos)),
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

// Master player list: migrated legends first (stable historical order), then
// the curated modern set (authored order). Both orders are explicit and never
// derived from Object key iteration.
export const V2_PLAYERS = [...LEGEND_PLAYERS, ...MODERN_PLAYERS]

export const v2PlayerById = Object.fromEntries(V2_PLAYERS.map((p) => [p.id, p]))

// Convenience getters (repository surface used by the adapter + validators).
export const getNationById = (id) => nationById[id] || null
export const getLeagueById = (id) => leagueById[id] || null
export const getClubById = (id) => clubById[id] || null
export const getV2PlayerById = (id) => v2PlayerById[id] || null
