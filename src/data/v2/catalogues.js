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

import { PLAYERS as V1_PLAYERS, getEligiblePlayers as v1Eligible } from '../../data'
import { V2_PLAYERS } from './index'
import { adaptPlayerV2ToLegacyShape } from './adapter'

export const DEFAULT_CATALOG_VERSION = 'legacy_v1'

// V2 players adapted once into legacy shape, preserving V2_PLAYERS order.
const V2_ADAPTED = V2_PLAYERS.map(adaptPlayerV2ToLegacyShape)

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
    label: 'Modern Mix (2026-07-07)',
    source: 'v2',
    eras: ['legend', 'modern'],
    orderedIds: V2_ADAPTED.map((p) => p.id),
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
