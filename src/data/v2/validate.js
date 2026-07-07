// ---------------------------------------------------------------------------
// Player Database V2 — validation + audit (Phase A).
//
// validateV2() returns { problems, warnings }. `problems` are hard schema /
// referential-integrity failures (build should fail). `warnings` are content
// anomalies worth a human look but not necessarily wrong. auditV2() returns
// distribution counts used by the audit script + content-quality report.
// Pure; imports only data + schema.
// ---------------------------------------------------------------------------

import {
  POSITIONS, ROLE_KEY_SET, SIGNATURE_SET, CHARACTER_SET, DEV_PROFILE_SET,
  ERA_SET, TIER_SET, GOAT_REQUIRED, posTypeOf, TRANSFER_STATUSES, CONFIDENCE_BANDS, SOURCE_TYPES,
  ROLE_SUITABILITY_SET,
} from './schema'
import { NATIONS, LEAGUES, CLUBS, V2_PLAYERS, nationById, leagueById, clubById, leagueOfClub, v2PlayerById } from './index'
import { CATALOGUES } from './catalogues'
import { PLAYERS as V1_PLAYERS } from '../../data'

const POS_SET = new Set(POSITIONS)

function dupes(ids) {
  const seen = new Set()
  const out = []
  for (const id of ids) { if (seen.has(id)) out.push(id); seen.add(id) }
  return out
}

export function validateLegacyV1Order(orderedIds = CATALOGUES.legacy_v1?.orderedIds) {
  const problems = []
  const expected = V1_PLAYERS.map((p) => p.id)
  if (!Array.isArray(orderedIds)) return ['legacy_v1 orderedIds must be an array']

  const duplicates = dupes(orderedIds)
  if (duplicates.length) problems.push(`legacy_v1 duplicate ids: ${duplicates.join(', ')}`)
  if (orderedIds.length !== expected.length) {
    problems.push(`legacy_v1 length ${orderedIds.length} does not match V1 length ${expected.length}`)
  }

  const actualSet = new Set(orderedIds)
  for (const id of expected) if (!actualSet.has(id)) problems.push(`legacy_v1 missing id: ${id}`)
  const expectedSet = new Set(expected)
  for (const id of orderedIds) if (!expectedSet.has(id)) problems.push(`legacy_v1 unexpected id: ${id}`)

  const n = Math.min(orderedIds.length, expected.length)
  for (let i = 0; i < n; i++) {
    if (orderedIds[i] !== expected[i]) {
      problems.push(`legacy_v1 order mismatch at ${i}: expected ${expected[i]}, got ${orderedIds[i]}`)
    }
  }
  return problems
}

export function roleSuitabilityProblems(p) {
  const map = p.roleSuitability
  if (map == null) return []
  if (typeof map !== 'object' || Array.isArray(map)) return [`${p.id} roleSuitability must be an object`]
  const problems = []
  for (const [role, value] of Object.entries(map)) {
    if (!ROLE_KEY_SET.has(role)) problems.push(`${p.id} roleSuitability has bad role ${role}`)
    if (!ROLE_SUITABILITY_SET.has(value)) problems.push(`${p.id} roleSuitability ${role} has bad value ${value}`)
  }
  return problems
}

export function validateV2(transferIntel = null) {
  const problems = []
  const warnings = []
  const P = (m) => problems.push(m)
  const W = (m) => warnings.push(m)

  // 1–4: unique ids
  for (const [label, arr] of [['nation', NATIONS], ['league', LEAGUES], ['club', CLUBS], ['player', V2_PLAYERS]]) {
    for (const d of dupes(arr.map((x) => x.id))) P(`Duplicate ${label} id: ${d}`)
  }

  // league → nation ref (free league has null nation, allowed)
  for (const l of LEAGUES) {
    if (l.nationId != null && !nationById[l.nationId]) P(`League ${l.id} bad nationId ${l.nationId}`)
  }
  // 8–9: club → league + nation refs (free_agent club → null nation, allowed)
  for (const c of CLUBS) {
    if (!leagueById[c.leagueId]) P(`Club ${c.id} bad leagueId ${c.leagueId}`)
    if (c.nationId != null && !nationById[c.nationId]) P(`Club ${c.id} bad nationId ${c.nationId}`)
  }

  // 5–20: per-player integrity
  for (const p of V2_PLAYERS) {
    // 5–7 refs
    if (!nationById[p.nationId]) P(`${p.id} bad nationId ${p.nationId}`)
    if (!clubById[p.clubId]) P(`${p.id} bad clubId ${p.clubId}`)
    else if (!leagueOfClub(p.clubId)) P(`${p.id} club ${p.clubId} has no resolvable league`)
    // 10–12 positions
    if (!POS_SET.has(p.primaryPosition)) P(`${p.id} bad primaryPosition ${p.primaryPosition}`)
    const sec = p.secondaryPositions || []
    for (const s of sec) if (!POS_SET.has(s)) P(`${p.id} bad secondaryPosition ${s}`)
    if (dupes(sec).length) P(`${p.id} duplicate secondaryPositions`)
    if (sec.includes(p.primaryPosition)) P(`${p.id} secondaryPositions repeats primary`)
    // 13–14 role
    if (!ROLE_KEY_SET.has(p.primaryRole)) P(`${p.id} bad primaryRole ${p.primaryRole}`)
    // 15–16 signatures
    if (!Array.isArray(p.signatures) || p.signatures.length === 0) P(`${p.id} has no signatures`)
    else {
      for (const s of p.signatures) if (!SIGNATURE_SET.has(s)) P(`${p.id} bad signature ${s}`)
      if (dupes(p.signatures).length) P(`${p.id} duplicate signatures`)
      if (p.signatures.length > 5) W(`${p.id} has ${p.signatures.length} signatures (expected a small set)`)
    }
    // 17–20 character / dev / era / tier
    if (!CHARACTER_SET.has(p.character)) P(`${p.id} bad character ${p.character}`)
    if (!DEV_PROFILE_SET.has(p.developmentProfile)) P(`${p.id} bad developmentProfile ${p.developmentProfile}`)
    if (!ERA_SET.has(p.era)) P(`${p.id} bad era ${p.era}`)
    if (!TIER_SET.has(p.tier)) P(`${p.id} bad tier ${p.tier}`)
    for (const msg of roleSuitabilityProblems(p)) P(msg)

    // --- anomaly checks ---
    const pt = posTypeOf(p.primaryPosition)
    const gkRole = p.primaryRole === 'Shot Stopper' || p.primaryRole === 'Sweeper Keeper' || p.primaryRole === 'Big Match Keeper'
    if (pt === 'GK' && !gkRole) W(`Anomaly: GK ${p.id} has non-GK role ${p.primaryRole}`)
    if (pt !== 'GK' && gkRole) W(`Anomaly: outfield ${p.id} has GK role ${p.primaryRole}`)
    // CB with pure winger suitability (no explicit exception yet)
    if (p.primaryPosition === 'CB' && sec.some((s) => ['RW', 'LW', 'RM', 'LM'].includes(s))) {
      W(`Anomaly: CB ${p.id} lists winger secondary ${sec}`)
    }
  }

  // possible duplicate players under spelling variations (same name)
  for (const d of dupes(V2_PLAYERS.map((p) => p.name.toLowerCase()))) W(`Anomaly: duplicate player name "${d}"`)

  // 21: GOAT set exactly the required four
  const goats = V2_PLAYERS.filter((p) => p.tier === 'goat').map((p) => p.id).sort()
  const required = [...GOAT_REQUIRED].sort()
  if (goats.length !== required.length || goats.some((id, i) => id !== required[i])) {
    P(`GOAT set must be exactly [${required.join(', ')}] but is [${goats.join(', ')}]`)
  }

  // 22–25: catalogue integrity + determinism (explicit ordering)
  for (const cat of Object.values(CATALOGUES)) {
    if (!Array.isArray(cat.orderedIds)) { P(`Catalogue ${cat.id} has no orderedIds`); continue }
    if (dupes(cat.orderedIds).length) P(`Catalogue ${cat.id} duplicate ids: ${dupes(cat.orderedIds)}`)
    if (cat.id === 'legacy_v1') for (const msg of validateLegacyV1Order(cat.orderedIds)) P(msg)
    if (cat.source === 'v2') {
      for (const id of cat.orderedIds) if (!v2PlayerById[id]) P(`Catalogue ${cat.id} references missing V2 player ${id}`)
      // modern player accidentally in legends_v2 / legend in modern set anomalies
      if (cat.id === 'legends_v2') {
        for (const id of cat.orderedIds) if (v2PlayerById[id]?.era !== 'legend') W(`Anomaly: non-legend ${id} in legends_v2`)
      }
    }
  }

  // 26–29: transfer-intel safety (if supplied)
  if (transferIntel) validateTransferIntel(transferIntel, { P, W })

  return { problems, warnings }
}

// Transfer-intel rules: targets resolve, evidence present, rumours don't touch
// canonical club, confirmed moves ARE reflected in canonical club, no target ==
// current club, no source after the research cutoff.
export function validateTransferIntel(intel, sink = null) {
  const problems = []
  const warnings = []
  const P = sink ? sink.P : (m) => problems.push(m)
  const W = sink ? sink.W : (m) => warnings.push(m)
  const cutoff = intel.researchCutoffUtc ? Date.parse(intel.researchCutoffUtc) : null

  for (const e of intel.entries || []) {
    const player = v2PlayerById[e.playerId]
    if (!player) { P(`transferIntel: unknown playerId ${e.playerId}`); continue }
    if (!TRANSFER_STATUSES.includes(e.status)) P(`transferIntel ${e.playerId}: bad status ${e.status}`)
    if (e.confidenceBand && !CONFIDENCE_BANDS.includes(e.confidenceBand)) P(`transferIntel ${e.playerId}: bad confidenceBand`)
    if (e.targetClubId && !clubById[e.targetClubId]) P(`transferIntel ${e.playerId}: bad targetClubId ${e.targetClubId}`)
    if (e.canonicalClubId && !clubById[e.canonicalClubId]) P(`transferIntel ${e.playerId}: bad canonicalClubId ${e.canonicalClubId}`)
    if (e.canonicalClubId && e.canonicalClubId !== player.clubId) {
      P(`transferIntel ${e.playerId}: canonicalClubId ${e.canonicalClubId} does not match player clubId ${player.clubId}`)
    }
    // A PENDING rumour whose target is already the player's club is contradictory.
    if (e.status !== 'confirmed' && e.targetClubId && e.targetClubId === player.clubId) {
      W(`transferIntel ${e.playerId}: pending target equals current club`)
    }
    if (!Array.isArray(e.sources) || e.sources.length === 0) P(`transferIntel ${e.playerId}: no evidence`)
    for (const s of e.sources || []) {
      if (!SOURCE_TYPES.includes(s.sourceType)) P(`transferIntel ${e.playerId}: bad sourceType ${s.sourceType}`)
      if (cutoff && s.publishedAt && Date.parse(s.publishedAt) > cutoff) P(`transferIntel ${e.playerId}: source published after research cutoff`)
    }
    // rumours must NOT have moved the canonical club to the target
    if (['here_we_go', 'advanced', 'high_confidence_rumour'].includes(e.status)) {
      if (e.targetClubId && player.clubId === e.targetClubId) {
        P(`transferIntel ${e.playerId}: ${e.status} must not change canonical club (player is already at target)`)
      }
    }
    // confirmed must be reflected in canonical club
    if (e.status === 'confirmed' && e.targetClubId && player.clubId !== e.targetClubId) {
      P(`transferIntel ${e.playerId}: confirmed move not reflected in canonical clubId (${player.clubId} != ${e.targetClubId})`)
    }
  }
  return { problems, warnings }
}

// ---------------------------------------------------------------------------
// Content audit — distributions for anomaly detection + the Phase A report.
// ---------------------------------------------------------------------------
export function auditV2() {
  const count = (arr, key) => {
    const m = {}
    for (const x of arr) { const k = typeof key === 'function' ? key(x) : x[key]; m[k] = (m[k] || 0) + 1 }
    return m
  }
  const modern = V2_PLAYERS.filter((p) => p.era === 'modern')
  const legends = V2_PLAYERS.filter((p) => p.era === 'legend')
  const sigCounts = {}
  for (const p of V2_PLAYERS) for (const s of p.signatures || []) sigCounts[s] = (sigCounts[s] || 0) + 1
  return {
    players: V2_PLAYERS.length,
    modern: modern.length,
    legends: legends.length,
    clubs: CLUBS.length,
    leagues: LEAGUES.length,
    nations: NATIONS.length,
    byPrimaryPosition: count(V2_PLAYERS, 'primaryPosition'),
    byPosType: count(V2_PLAYERS, (p) => posTypeOf(p.primaryPosition)),
    byPrimaryRole: count(V2_PLAYERS, 'primaryRole'),
    byCharacter: count(V2_PLAYERS, 'character'),
    byDevProfile: count(V2_PLAYERS, 'developmentProfile'),
    byTier: count(V2_PLAYERS, 'tier'),
    byEra: count(V2_PLAYERS, 'era'),
    bySignature: sigCounts,
    roleSuitabilityCoverage: V2_PLAYERS.filter((p) => p.roleSuitability && Object.keys(p.roleSuitability).length > 0).length,
    nationsUsed: new Set(V2_PLAYERS.map((p) => p.nationId)).size,
    leaguesUsed: new Set(modern.map((p) => leagueOfClub(p.clubId))).size,
    catalogueSizes: Object.fromEntries(Object.values(CATALOGUES).map((c) => [c.id, c.orderedIds.length])),
  }
}
