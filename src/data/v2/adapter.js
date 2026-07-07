// ---------------------------------------------------------------------------
// V2 → legacy adapter (Phase A).
//
// The current draft/rating/simulation engine understands the V1 player shape
// (`{ id, name, primaryPos, posType, eligibleSlots, country, club, tags,
// rarity, role, secondaryRole, era }`). This adapter turns a V2 player into
// exactly that shape so every current system keeps working unchanged.
//
// FACTUAL fields (name, positions, country, club) pass through from V2.
// The legacy GAMEPLAY fields — `tags`, `rarity` — are DERIVED here from V2
// game-design fields (tier, club, developmentProfile). They are Final XI
// design values, never researched facts and never market value.
// ---------------------------------------------------------------------------

import { posTypeOf } from './schema'
import { nationById, clubById, leagueOfClub } from './index'
import { PLAYERS as V1_PLAYERS } from '../../data'

const V1_BY_ID = Object.fromEntries(V1_PLAYERS.map((p) => [p.id, p]))

// Club → "core" chemistry tag (matches the engine's existing tag vocabulary).
const CLUB_CORE_TAG = {
  man_city: 'city_core', liverpool: 'liverpool_core', real_madrid: 'madrid_modern',
  barcelona: 'barca_modern', bayern: 'bayern_core', psg: 'psg_star',
}

// Tier → coarse pick-rate ("rarity"). Only affects the cosmetic "smartest
// pick" readout; higher tier = more obvious pick = higher number.
const TIER_RARITY = { goat: 90, goat_candidate: 80, elite: 55, star: 42, quality: 30, squad: 22, prospect: 18 }
const TIER_TAGS = {
  goat: ['modern_icon', 'current_superstar'],
  goat_candidate: ['modern_icon', 'current_superstar'],
  elite: ['current_superstar'],
  star: ['modern_icon'],
  quality: [],
  squad: [],
  prospect: [],
}

// Derive the legacy chemistry tag set from V2 game-design fields.
function deriveTags(p) {
  const tags = new Set(TIER_TAGS[p.tier] || [])
  const core = CLUB_CORE_TAG[p.clubId]
  if (core) tags.add(core)
  const leagueId = leagueOfClub(p.clubId)
  if (leagueId === 'eng_pl' && p.tier !== 'squad' && p.tier !== 'prospect') tags.add('premier_league_star')
  if (p.developmentProfile === 'high_growth' || p.developmentProfile === 'developing') tags.add('future_legend')
  if (p.character === 'Big Stage') tags.add('big_game_player')
  return [...tags]
}

// Convert one V2 player into the legacy engine shape.
export function adaptPlayerV2ToLegacyShape(p) {
  const legacy = p.era === 'legend' ? V1_BY_ID[p.id] : null
  if (legacy) {
    return {
      id: legacy.id,
      name: legacy.name,
      primaryPos: legacy.primaryPos,
      posType: legacy.posType,
      eligibleSlots: [...legacy.eligibleSlots],
      country: legacy.country,
      club: legacy.club,
      tags: [...legacy.tags],
      rarity: legacy.rarity,
      role: legacy.role,
      secondaryRole: legacy.secondaryRole ?? null,
      sourceRole: legacy.sourceRole,
      era: legacy.era,
    }
  }

  return {
    id: p.id,
    name: p.name,
    primaryPos: p.primaryPosition,
    posType: posTypeOf(p.primaryPosition),
    eligibleSlots: [p.primaryPosition, ...(p.secondaryPositions || [])],
    country: nationById[p.nationId]?.name ?? p.nationId ?? 'Unknown',
    club: clubById[p.clubId]?.name ?? 'Free Agent',
    tags: deriveTags(p),
    rarity: TIER_RARITY[p.tier] ?? 30,
    role: p.primaryRole,
    secondaryRole: null,
    sourceRole: p.primaryRole,
    era: p.era,
  }
}

// Repository surface (thin, catalogue-agnostic) re-exported for consumers.
export { getNationById, getLeagueById, getClubById, getV2PlayerById } from './index'
