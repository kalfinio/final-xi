// ---------------------------------------------------------------------------
// Versioned game catalogues (Phase A).
//
// A catalogue is an ACTIVE DRAFT POOL — deliberately curated and versioned —
// which is NOT the same as the master database. Catalogue ordering is always
// explicit and stable so seeded drafting is deterministic; it never depends on
// Object key iteration, filesystem order, or a mutable sort.
//
//   • legacy_v1                    — the frozen V1 pool, sourced directly from
//                                    data.js so existing daily/random drafts
//                                    remain byte-identical. Order = V1 order.
//   • modern_mix_v2_2026_07_07     — V2 legends (historical order) + V2 modern
//                                    (authored order), adapted to legacy shape.
//   • legends_v2                   — V2 legends only.
//
// Nothing here is wired into the live draft in Phase A; the deterministic V2
// draft path exists and is tested, ready for a future phase to enable.
// ---------------------------------------------------------------------------

import { PLAYERS as V1_PLAYERS, getEligiblePlayers as v1Eligible, dateSeed, combineSeed, makeRng, shuffle } from '../../data'
import { V2_PLAYERS, v2PlayerById } from './index'
import { adaptPlayerV2ToLegacyShape } from './adapter'

export const DEFAULT_CATALOG_VERSION = 'legacy_v1'

// V2 players adapted once into legacy shape, preserving V2_PLAYERS order.
const V2_ADAPTED = V2_PLAYERS.map(adaptPlayerV2ToLegacyShape)

// ---------------------------------------------------------------------------
// Curated activation membership (Phase A remediation).
//
// The full master catalogue (modern_mix_v2_2026_07_07 = all 544 players) is a
// faithful database view, but a deterministic 5-formation / multi-seed draft
// sweep showed it drafts MUCH weaker XIs than the live legacy Modern pool
// (avg XI ~118 vs ~184) because ~240 quality/squad players with thin chemistry
// tags dilute every offer. Rather than inflate points or retune the engine
// (both forbidden), the ACTIVATION pool is a curated subset:
//
//   • all legends (premium excitement + GOAT exposure),
//   • all elite/star modern players (recognisable strength + coverage),
//   • quality-tier players ONLY where they fill a scarce, tactically important
//     role (keepers-of-note, wing-backs, ball-winning / shielding midfielders,
//     touchline wingers) so role access and formation variety stay healthy.
//
// This recovers most of the strength (sim avg XI ~145, offer pts ~12.5 vs
// legacy 13.3) while roughly TRIPLING draft variety vs legacy and keeping every
// formation 100% completable. The master DB is untouched; this only chooses
// which explicitly-ordered members are eligible when the curated pool is drafted.
// ---------------------------------------------------------------------------
const CURATED_PREMIUM_TIERS = new Set(['goat', 'goat_candidate', 'elite', 'star'])
export const CURATED_SPECIALIST_ROLES = new Set([
  'Defensive Shield', 'Ball Winner', 'Defensive Wingback', 'Balanced Wingback',
  'Defensive Fullback', 'Touchline Winger', 'Sweeper Keeper', 'Big Match Keeper',
])
export function isCuratedActivationMember(adapted) {
  const p = v2PlayerById[adapted.id]
  if (!p) return false
  if (p.era === 'legend') return true
  if (CURATED_PREMIUM_TIERS.has(p.tier)) return true
  return p.tier === 'quality' && CURATED_SPECIALIST_ROLES.has(p.primaryRole)
}

export const CATALOGUES = {
  legacy_v1: {
    id: 'legacy_v1',
    dbVersion: 'v1',
    label: 'Legacy V1',
    source: 'v1',
    // Explicit ordered id list (mirrors the frozen V1 array order).
    orderedIds: V1_PLAYERS.map((p) => p.id),
  },
  modern_mix_v2_2026_07_07: {
    id: 'modern_mix_v2_2026_07_07',
    dbVersion: 'v2',
    label: 'Modern Mix — Full Master (2026-07-07)',
    source: 'v2',
    eras: ['legend', 'modern'],
    // The complete database view (all valid V2 players). Not the activation pool.
    orderedIds: V2_ADAPTED.map((p) => p.id),
  },
  modern_mix_v2_curated: {
    id: 'modern_mix_v2_curated',
    dbVersion: 'v2',
    label: 'Modern Mix — Curated Activation (2026-07-07)',
    source: 'v2',
    eras: ['legend', 'modern'],
    activation: true,
    // Curated subset of the master, kept in explicit master order via filter.
    orderedIds: V2_ADAPTED.filter(isCuratedActivationMember).map((p) => p.id),
  },
  legends_v2: {
    id: 'legends_v2',
    dbVersion: 'v2',
    label: 'Legends V2',
    source: 'v2',
    eras: ['legend'],
    orderedIds: V2_ADAPTED.filter((p) => p.era === 'legend').map((p) => p.id),
  },
}

export const getCatalogue = (id) => CATALOGUES[id] || null

const V2_ADAPTED_BY_ID = Object.fromEntries(V2_ADAPTED.map((p) => [p.id, p]))
const V1_BY_ID = Object.fromEntries(V1_PLAYERS.map((p) => [p.id, p]))
const CATALOGUE_ID_SETS = Object.fromEntries(Object.values(CATALOGUES).map((c) => [c.id, new Set(c.orderedIds)]))

export function catalogueMembers(catalogVersion = DEFAULT_CATALOG_VERSION) {
  const cat = CATALOGUES[catalogVersion]
  if (!cat) return []
  const byId = cat.source === 'v1' ? V1_BY_ID : V2_ADAPTED_BY_ID
  return cat.orderedIds.map((id) => byId[id]).filter(Boolean)
}

// Resolve a player id within a given catalogue version to a legacy-shaped
// object. Old snapshots (no catalogVersion) resolve through legacy_v1 → the
// frozen V1 object, so saves stay byte-identical.
export function resolvePlayer(id, catalogVersion = DEFAULT_CATALOG_VERSION) {
  const cat = CATALOGUES[catalogVersion]
  if (!cat || !CATALOGUE_ID_SETS[catalogVersion]?.has(id)) return null
  return (cat.source === 'v1' ? V1_BY_ID[id] : V2_ADAPTED_BY_ID[id]) || null
}

// Deterministic eligible-player list for a slot, in the catalogue's explicit
// order. legacy_v1 delegates to the exact V1 helper (byte-identical); V2
// catalogues filter the adapted, explicitly-ordered V2 list.
export function catalogueEligiblePlayers(catalogVersion, slotLabel, usedIds, pool = 'modern') {
  if (catalogVersion === 'legacy_v1') return v1Eligible(slotLabel, usedIds, pool)
  const cat = CATALOGUES[catalogVersion]
  if (!cat || cat.source !== 'v2') return []
  return catalogueMembers(catalogVersion).filter(
    (p) =>
      p.eligibleSlots.includes(slotLabel) &&
      !usedIds.includes(p.id) &&
      (pool === 'modern' || p.era === 'legend'),
  )
}

// ---------------------------------------------------------------------------
// Activation (Phase A V2). A NEW normal run drafts from a specific catalogue.
// Modern Mix normal runs are now activated on the CURATED V2 pool; Legends Only
// and Daily Challenge stay on the frozen legacy catalogue (their boundaries and
// deterministic fixtures are unchanged). The full-master V2 catalogue is
// deliberately NOT a live default — it remains a database/audit view only.
// ---------------------------------------------------------------------------
export const ACTIVATION_CATALOG_BY_POOL = {
  modern: 'modern_mix_v2_curated',
  legends: 'legacy_v1',
}
export const ACTIVATION_CATALOG_BY_MODE = {
  random: ACTIVATION_CATALOG_BY_POOL,
  daily: {
    modern: 'legacy_v1',
    legends: 'legacy_v1',
  },
}
export function activationCatalogVersion({ mode = 'random', pool } = {}) {
  return ACTIVATION_CATALOG_BY_MODE[mode]?.[pool] || DEFAULT_CATALOG_VERSION
}

// Catalogue-aware draft offer. Mirrors data.js slotOptions EXACTLY — same daily
// seed derivation, same shuffle+slice — but resolves the eligible pool through
// the given catalogue. For 'legacy_v1' the result is byte-identical to
// slotOptions (catalogueEligiblePlayers('legacy_v1',…) === getEligiblePlayers),
// so legacy/Legends-Only drafts are unchanged. For a V2 catalogue every offered
// id is a catalogue member, so the drafted XI round-trips through resolvePlayer
// on save/restore. Rerolls stay in-catalogue because the same catalogVersion
// drives every call for the run.
export function catalogueSlotOptions({ catalogVersion = DEFAULT_CATALOG_VERSION, mode, slotLabel, slotIndex, rerollCount, usedIds, pool = 'modern' }) {
  const eligible = catalogueEligiblePlayers(catalogVersion, slotLabel, usedIds, pool)
  const rng = mode === 'daily'
    ? makeRng(combineSeed(dateSeed(), slotIndex, rerollCount, pool === 'modern' ? 1 : 0))
    : Math.random
  return shuffle(eligible, rng).slice(0, 3)
}
