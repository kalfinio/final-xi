// ---------------------------------------------------------------------------
// Deterministic draft simulation (Phase A remediation).
//
// A pure, seed-driven harness that drafts full XIs from a catalogue under a
// fixed "first-choice" policy (always take the first of the three offered
// players) and reports activation-health metrics: offer strength, XI rating
// spread, formation completion, and tier exposure.
//
// It exists so catalogue changes can be *measured* rather than guessed, and so
// a regression test can fail if a future catalogue edit silently dilutes the
// draft. It never touches the live game; it only reads exported engine helpers.
// ---------------------------------------------------------------------------

import {
  makeRng, shuffle, combineSeed, FORMATIONS, computeRating, playerPoints, getEligiblePlayers,
} from '../../data'
import { catalogueEligiblePlayers, catalogueMembers } from './catalogues'
import { v2PlayerById } from './index'

export const SIM_FORMATIONS = Object.keys(FORMATIONS)
const DEPTH_SLOTS = ['GK', 'RB', 'CB', 'LB', 'RWB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST']

// An "eligible resolver" is (slot, usedIds) => array of legacy-shaped players.
function catalogueResolver(catalogVersion, pool) {
  return catalogVersion === 'legacy_v1'
    ? (slot, usedIds) => getEligiblePlayers(slot, usedIds, pool)
    : (slot, usedIds) => catalogueEligiblePlayers(catalogVersion, slot, usedIds, pool)
}
// Resolver over an explicit ordered member list (for ad-hoc / candidate pools).
export function membersResolver(members, pool = 'modern') {
  return (slot, usedIds) => members.filter(
    (p) => p.eligibleSlots.includes(slot) && !usedIds.includes(p.id) && (pool === 'modern' || p.era === 'legend'),
  )
}

const tierOf = (p) => v2PlayerById[p.id]?.tier || (p.era === 'legend' ? 'elite' : 'unknown')
const isPremium = (t) => t === 'elite' || t === 'goat_candidate' || t === 'goat'

// One deterministic draft under a first-choice policy, given an eligible resolver.
export function simulateDraftWith(eligible, { seed, formation }) {
  const slots = FORMATIONS[formation].slots
  const used = []
  const squad = []
  const offered = []
  let completed = true
  for (let i = 0; i < slots.length; i++) {
    const offer = shuffle(eligible(slots[i], used), makeRng(combineSeed(seed, i))).slice(0, 3)
    if (offer.length === 0) { completed = false; break }
    for (const p of offer) offered.push(p)
    used.push(offer[0].id)
    squad.push({ slot: slots[i], player: offer[0] })
  }
  return { completed, rating: completed ? computeRating(squad).total : null, offered, squad }
}

export function simulateDraft(catalogVersion, { seed, formation, pool = 'modern' }) {
  return simulateDraftWith(catalogueResolver(catalogVersion, pool), { seed, formation })
}

// Per-slot eligible pool sizes for a fresh draft (positional scarcity signal).
export function slotDepthWith(eligible) {
  const out = {}
  for (const slot of DEPTH_SLOTS) out[slot] = eligible(slot, []).length
  return out
}
export function slotDepth(catalogVersion, pool = 'modern') {
  return slotDepthWith(catalogueResolver(catalogVersion, pool))
}

// Core sweep over an eligible resolver → aggregate activation-health metrics.
export function sweep(eligible, { seeds = 500, formations = SIM_FORMATIONS, label = 'pool' } = {}) {
  const ratings = []
  let drafts = 0
  let completedDrafts = 0
  let offeredCount = 0
  let offerPtsSum = 0
  const tierOffers = {}
  let premiumOffers = 0
  let goatOffers = 0
  const offersById = {}

  for (let seed = 1; seed <= seeds; seed++) {
    for (const formation of formations) {
      drafts++
      const r = simulateDraftWith(eligible, { seed, formation })
      if (r.completed) { completedDrafts++; ratings.push(r.rating) }
      for (const p of r.offered) {
        offeredCount++
        offerPtsSum += playerPoints(p)
        offersById[p.id] = (offersById[p.id] || 0) + 1
        const t = tierOf(p)
        tierOffers[t] = (tierOffers[t] || 0) + 1
        if (isPremium(t)) premiumOffers++
        if (t === 'goat') goatOffers++
      }
    }
  }

  const n = ratings.length
  const sorted = [...ratings].sort((a, b) => a - b)
  const mean = n ? ratings.reduce((a, b) => a + b, 0) / n : 0
  const tierPct = {}
  for (const [t, c] of Object.entries(tierOffers)) tierPct[t] = +(100 * c / offeredCount).toFixed(2)
  // Repeated-player concentration: how much of all offers the busiest players soak up.
  const ranked = Object.entries(offersById).sort((a, b) => b[1] - a[1])
  const top10Share = offeredCount ? ranked.slice(0, 10).reduce((a, [, c]) => a + c, 0) / offeredCount : 0

  return {
    catalogVersion: label,
    seeds,
    drafts,
    distinctOffered: ranked.length,
    formationCompletion: +(100 * completedDrafts / drafts).toFixed(2),
    avgOfferPoints: offeredCount ? +(offerPtsSum / offeredCount).toFixed(2) : 0,
    avgXIRating: +mean.toFixed(2),
    minXIRating: sorted[0] ?? null,
    maxXIRating: sorted[n - 1] ?? null,
    medianXIRating: n ? sorted[Math.floor(n / 2)] : null,
    premiumOfferPct: offeredCount ? +(100 * premiumOffers / offeredCount).toFixed(2) : 0,
    goatOfferPct: offeredCount ? +(100 * goatOffers / offeredCount).toFixed(2) : 0,
    concentrationTop10Pct: +(100 * top10Share).toFixed(2),
    topOffered: ranked.slice(0, 8).map(([id, c]) => `${id}:${c}`),
    tierOfferPct: tierPct,
    slotDepth: slotDepthWith(eligible),
  }
}

// Sweep an explicit ordered member list (candidate catalogues).
export function simulateMembers(members, { seeds = 500, pool = 'modern', formations = SIM_FORMATIONS, label = 'members' } = {}) {
  return sweep(membersResolver(members, pool), { seeds, formations, label })
}

// Multi-seed, multi-formation sweep → aggregate activation-health metrics.
export function simulateCatalogue(catalogVersion, { seeds = 500, pool = 'modern', formations = SIM_FORMATIONS } = {}) {
  return sweep(catalogueResolver(catalogVersion, pool), { seeds, formations, label: catalogVersion })
}

// Kept for API parity / potential callers that pass a members array directly.
export { catalogueMembers }
