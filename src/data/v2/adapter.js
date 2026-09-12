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

// ---------------------------------------------------------------------------
// R2 current-ability scoring model.
//
// The tier — the game's calibrated current-ability judgement — supplies the
// complete non-positional ability contribution for every R2 player, modern or
// legend. These values consolidate the former tier-tag/aura arithmetic into
// one explicit, visible component; playerPoints branches on `scoringPolicy`
// and never scores R2 prestige tags or identity-based badges. Big Stage is the
// only separate individual trait (+3). The model is causal (tier in → points
// out), invariant to club/league/fame/potential, and preserves strict tier
// separation. Values keep the calibrated R2 strength scale while removing the
// old duplicated reputation labels from the visible breakdown.
// ---------------------------------------------------------------------------
export const R2_ABILITY_POINTS = Object.freeze({
  goat: 21, goat_candidate: 18, elite: 9, star: 6, quality: 2, squad: 1, prospect: 0,
})
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
//
// Two tag policies exist as a deliberate CATALOGUE-VERSION boundary:
//   • 'legacy'  — the original derivation (club cores, premier_league_star,
//     future_legend). Frozen R1 saves and the master/audit views keep it so
//     historical runs stay byte-identical.
//   • 'ability' — current-ability scoring only. Used by the live R2 pool:
//     club and league stay purely descriptive identity fields, development
//     potential stays metadata, and only tier-based current-ability tags plus
//     the Big Stage behaviour tag carry points. No club-core team bonuses and
//     no Future Legends pair bonus can therefore fire for new R2 squads.
function deriveTags(p, tagPolicy = 'legacy') {
  const tags = new Set(TIER_TAGS[p.tier] || [])
  if (tagPolicy === 'legacy') {
    const core = CLUB_CORE_TAG[p.clubId]
    if (core) tags.add(core)
    const leagueId = leagueOfClub(p.clubId)
    if (leagueId === 'eng_pl' && p.tier !== 'squad' && p.tier !== 'prospect') tags.add('premier_league_star')
    if (p.developmentProfile === 'high_growth' || p.developmentProfile === 'developing') tags.add('future_legend')
  }
  if (p.character === 'Big Stage') tags.add('big_game_player')
  return [...tags]
}

// Convert one V2 player into the legacy engine shape. The adapted object
// carries its complete immutable SOURCE record (`v2Source`) plus a direct
// `signatures` array, so presentation/quality/signature helpers resolve
// through the run's catalogue-resolved object and never need to consult the
// current master database for a versioned player.
export function adaptPlayerV2ToLegacyShape(p, { tagPolicy = 'legacy' } = {}) {
  const legacy = p.era === 'legend' ? V1_BY_ID[p.id] : null
  if (legacy) {
    if (tagPolicy === 'ability') {
      // R2 legends use the SAME ability policy as R2 moderns: their strength
      // comes from the explicit R2_ABILITY_POINTS tier contribution plus the
      // Big Stage behaviour trait — never from historical club-DNA,
      // association, achievement-reputation, identity badges or league tags. The
      // football identity (positions, role, name, club as description) stays
      // the frozen V1 record so gameplay roles are unchanged.
      return {
        id: legacy.id,
        name: legacy.name,
        primaryPos: legacy.primaryPos,
        posType: legacy.posType,
        eligibleSlots: [...legacy.eligibleSlots],
        country: legacy.country,
        club: legacy.club,
        tags: deriveTags(p, 'ability'),
        rarity: TIER_RARITY[p.tier] ?? legacy.rarity,
        role: legacy.role,
        secondaryRole: legacy.secondaryRole ?? null,
        sourceRole: legacy.sourceRole,
        era: legacy.era,
        signatures: p.signatures ? [...p.signatures] : undefined,
        scoringPolicy: 'ability',
        abilityBonus: R2_ABILITY_POINTS[p.tier] ?? 0,
        v2Source: freezeSource(p),
      }
    }
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
      signatures: p.signatures ? [...p.signatures] : undefined,
      v2Source: freezeSource(p),
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
    tags: deriveTags(p, tagPolicy),
    rarity: TIER_RARITY[p.tier] ?? 30,
    role: p.primaryRole,
    secondaryRole: null,
    sourceRole: p.primaryRole,
    era: p.era,
    signatures: p.signatures ? [...p.signatures] : undefined,
    // Ability-policy (R2) objects: squad-level club-prestige bonuses (Club
    // Spine) are disabled in computeBonuses, and the tier-derived
    // current-ability contribution replaces the removed prestige tags.
    ...(tagPolicy === 'ability'
      ? { scoringPolicy: 'ability', abilityBonus: R2_ABILITY_POINTS[p.tier] ?? 0 }
      : {}),
    v2Source: freezeSource(p),
  }
}

// Complete immutable version record: every V2 field UI, adapters or match
// logic may consult, frozen at adaptation time so later master edits cannot
// leak into a historical catalogue view.
function freezeSource(p) {
  return Object.freeze({
    id: p.id,
    name: p.name,
    nationId: p.nationId,
    clubId: p.clubId,
    leagueId: leagueOfClub(p.clubId) ?? null,
    primaryPosition: p.primaryPosition,
    secondaryPositions: Object.freeze([...(p.secondaryPositions || [])]),
    primaryRole: p.primaryRole,
    tier: p.tier,
    signatures: Object.freeze([...(p.signatures || [])]),
    roleSuitability: p.roleSuitability ? Object.freeze({ ...p.roleSuitability }) : null,
    developmentProfile: p.developmentProfile ?? null,
    character: p.character ?? null,
    era: p.era,
  })
}

// Repository surface (thin, catalogue-agnostic) re-exported for consumers.
export { getNationById, getLeagueById, getClubById, getV2PlayerById } from './index'
