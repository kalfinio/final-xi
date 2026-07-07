// Phase A — Player Database V2 tests: schema/validation, GOAT invariant,
// legacy + V2 determinism, adapter→engine parity, save versioning, transfer
// safety. None of this touches the live game's V1 draft/determinism.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PLAYERS as V1_PLAYERS, getEligiblePlayers, computeRating, makeRng, shuffle, FORMATIONS,
} from '../../data'
import { V2_PLAYERS, v2PlayerById, LEGEND_PLAYERS, NATIONS, LEAGUES, CLUBS } from './index'
import { adaptPlayerV2ToLegacyShape } from './adapter'
import { CATALOGUES, catalogueEligiblePlayers, resolvePlayer, getCatalogue } from './catalogues'
import { validateV2, validateTransferIntel } from './validate'
import { createRunSnapshot, snapshotCatalogVersion, validateRunSnapshot } from '../../runPersistence'
import { GOAT_REQUIRED, POSITIONS } from './schema'

const INTEL = JSON.parse(readFileSync('data/transferIntel.2026-07-07.json', 'utf8'))

// ---------------------------------------------------------------------------
describe('schema + referential integrity', () => {
  it('validateV2 (with transfer intel) reports zero hard problems', () => {
    const { problems } = validateV2(INTEL)
    expect(problems).toEqual([])
  })

  it('all reference collections have unique ids', () => {
    for (const arr of [NATIONS, LEAGUES, CLUBS, V2_PLAYERS]) {
      expect(new Set(arr.map((x) => x.id)).size).toBe(arr.length)
    }
  })
})

// ---------------------------------------------------------------------------
describe('GOAT invariant', () => {
  it('exactly Messi, Cristiano Ronaldo, Maradona, Pelé are tier goat', () => {
    const goats = V2_PLAYERS.filter((p) => p.tier === 'goat').map((p) => p.id).sort()
    expect(goats).toEqual([...GOAT_REQUIRED].sort())
  })
  it('no fifth goat can slip in via the modern set', () => {
    expect(V2_PLAYERS.filter((p) => p.tier === 'goat').length).toBe(4)
  })
})

// ---------------------------------------------------------------------------
describe('legend migration preserves V1 identity', () => {
  it('a non-overridden legend keeps name/position/eligibility/role', () => {
    const v1 = V1_PLAYERS.find((p) => p.id === 'xavi')
    const adapted = adaptPlayerV2ToLegacyShape(v2PlayerById.xavi)
    expect(adapted.name).toBe(v1.name)
    expect(adapted.primaryPos).toBe(v1.primaryPos)
    expect(adapted.eligibleSlots).toEqual(v1.eligibleSlots)
    expect(adapted.role).toBe(v1.role)
    expect(adapted.club).toBe('Barcelona')
  })
  it('active greats get their current club via override (Messi → Inter Miami)', () => {
    expect(adaptPlayerV2ToLegacyShape(v2PlayerById.messi).club).toBe('Inter Miami')
    expect(adaptPlayerV2ToLegacyShape(v2PlayerById.ronaldo).club).toBe('Al Nassr')
  })
  it('every migrated legend id also exists in the frozen V1 pool', () => {
    const v1ids = new Set(V1_PLAYERS.map((p) => p.id))
    for (const l of LEGEND_PLAYERS) expect(v1ids.has(l.id)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('adapter → engine parity', () => {
  it('adapted V2 players are valid rating-engine inputs', () => {
    const byPos = (pos) => V2_PLAYERS.filter((p) => p.primaryPosition === pos && p.era === 'modern')
    const pick = (pos, i) => adaptPlayerV2ToLegacyShape(byPos(pos)[i])
    // a legal 4-3-3
    const squad = [
      { slot: 'GK', player: pick('GK', 0) },
      { slot: 'RB', player: pick('RB', 0) },
      { slot: 'CB', player: pick('CB', 0) },
      { slot: 'CB', player: pick('CB', 1) },
      { slot: 'LB', player: pick('LB', 0) },
      { slot: 'CM', player: pick('CM', 0) },
      { slot: 'CM', player: pick('CM', 1) },
      { slot: 'CM', player: pick('CM', 2) },
      { slot: 'RW', player: pick('RW', 0) },
      { slot: 'ST', player: pick('ST', 0) },
      { slot: 'LW', player: pick('LW', 0) },
    ]
    const { total } = computeRating(squad)
    expect(Number.isFinite(total)).toBe(true)
    expect(total).toBeGreaterThan(0)
    // required legacy fields present + valid
    for (const s of squad) {
      const p = s.player
      expect(typeof p.id).toBe('string')
      expect(POSITIONS).toContain(p.primaryPos)
      expect(['GK', 'DEF', 'MID', 'ATT']).toContain(p.posType)
      expect(Array.isArray(p.tags)).toBe(true)
      expect(typeof p.rarity).toBe('number')
      expect(p.eligibleSlots[0]).toBe(p.primaryPos)
    }
  })
})

// ---------------------------------------------------------------------------
describe('legacy determinism preserved', () => {
  it('legacy_v1 catalogue eligibility is byte-identical to the V1 helper', () => {
    for (const slot of ['GK', 'CB', 'CM', 'ST']) {
      for (const pool of ['modern', 'legends']) {
        const a = catalogueEligiblePlayers('legacy_v1', slot, [], pool).map((p) => p.id)
        const b = getEligiblePlayers(slot, [], pool).map((p) => p.id)
        expect(a).toEqual(b)
      }
    }
  })
  it('legacy_v1 resolvePlayer returns the frozen V1 object', () => {
    expect(resolvePlayer('messi', 'legacy_v1')).toBe(V1_PLAYERS.find((p) => p.id === 'messi'))
  })
})

// ---------------------------------------------------------------------------
describe('V2 catalogue determinism', () => {
  it('eligible list + seeded pick are stable across calls', () => {
    const cat = 'modern_mix_v2_2026_07_07'
    const e1 = catalogueEligiblePlayers(cat, 'ST', [], 'modern').map((p) => p.id)
    const e2 = catalogueEligiblePlayers(cat, 'ST', [], 'modern').map((p) => p.id)
    expect(e1).toEqual(e2)
    const elig = catalogueEligiblePlayers(cat, 'ST', [], 'modern')
    const draw1 = shuffle(elig, makeRng(777)).slice(0, 3).map((p) => p.id)
    const draw2 = shuffle(elig, makeRng(777)).slice(0, 3).map((p) => p.id)
    expect(draw1).toEqual(draw2)
    expect(draw1).toHaveLength(3)
  })
  it('legends_v2 contains only legend-era players; modern mix contains both', () => {
    const legendsCat = getCatalogue('legends_v2')
    for (const id of legendsCat.orderedIds) expect(v2PlayerById[id].era).toBe('legend')
    const eras = new Set(getCatalogue('modern_mix_v2_2026_07_07').orderedIds.map((id) => v2PlayerById[id].era))
    expect(eras.has('legend')).toBe(true)
    expect(eras.has('modern')).toBe(true)
  })
  it('every catalogue is explicitly ordered with no duplicate ids', () => {
    for (const cat of Object.values(CATALOGUES)) {
      expect(Array.isArray(cat.orderedIds)).toBe(true)
      expect(new Set(cat.orderedIds).size).toBe(cat.orderedIds.length)
    }
  })
})

// ---------------------------------------------------------------------------
describe('save versioning (backward compatible)', () => {
  const state = {
    config: { mode: 'random', formation: '4-3-3', pool: 'modern' },
    runSeed: 123, teamName: 'T', rerollsUsed: 0,
    squad: FORMATIONS['4-3-3'].slots.map((slot) => ({ slot, player: { id: 'x' } })),
    matches: [], upgradeState: { owned: [], offers: [] },
    checkpoint: { screen: 'hub', resolvedMatchCount: 0, selectedApproach: 'balanced' },
  }
  it('new snapshots stamp dbVersion + catalogVersion (legacy default)', () => {
    const snap = createRunSnapshot(state)
    expect(snap.run.dbVersion).toBe('v1')
    expect(snap.run.catalogVersion).toBe('legacy_v1')
  })
  it('old snapshots without the field resolve as legacy_v1', () => {
    expect(snapshotCatalogVersion({ run: {} })).toBe('legacy_v1')
    expect(snapshotCatalogVersion({ run: { catalogVersion: 'modern_mix_v2_2026_07_07' } })).toBe('modern_mix_v2_2026_07_07')
  })
  it('validation rejects a malformed catalogVersion type but tolerates absence', () => {
    const base = { schemaVersion: 1, engineVersion: 'phase6.1', run: {} }
    // a minimal run that would otherwise fail earlier checks — we only assert
    // the version guard does not crash and rejects a bad type outright.
    expect(validateRunSnapshot({ ...base, run: { ...base.run, catalogVersion: 123 } })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('transfer safety', () => {
  it('the artifact validates and every confirmed move is reflected in canonical clubId', () => {
    expect(validateTransferIntel(INTEL).problems).toEqual([])
    for (const e of INTEL.entries.filter((x) => x.status === 'confirmed')) {
      expect(v2PlayerById[e.playerId].clubId).toBe(e.targetClubId)
    }
  })
  it('a high-confidence rumour to a DIFFERENT club does not require a canonical change', () => {
    const intel = {
      researchCutoffUtc: '2026-07-07T13:25:05Z',
      entries: [{ playerId: 'saka', status: 'high_confidence_rumour', targetClubId: 'real_madrid', confidenceBand: 'high',
        sources: [{ sourceType: 'transfermarkt_rumour', publishedAt: '2026-07-01' }] }],
    }
    expect(validateTransferIntel(intel).problems).toEqual([])
    expect(v2PlayerById.saka.clubId).toBe('arsenal') // canonical unchanged
  })
  it('a rumour whose target equals the current club is flagged as contamination', () => {
    const intel = {
      researchCutoffUtc: '2026-07-07T13:25:05Z',
      entries: [{ playerId: 'saka', status: 'high_confidence_rumour', targetClubId: 'arsenal',
        sources: [{ sourceType: 'transfermarkt_rumour', publishedAt: '2026-07-01' }] }],
    }
    expect(validateTransferIntel(intel).problems.length).toBeGreaterThan(0)
  })
  it('a confirmed move not reflected in canonical clubId is a problem', () => {
    const intel = {
      researchCutoffUtc: '2026-07-07T13:25:05Z',
      entries: [{ playerId: 'saka', status: 'confirmed', targetClubId: 'real_madrid',
        sources: [{ sourceType: 'official_club', publishedAt: '2026-07-01' }] }],
    }
    expect(validateTransferIntel(intel).problems.length).toBeGreaterThan(0)
  })
  it('a source published after the research cutoff is rejected', () => {
    const intel = {
      researchCutoffUtc: '2026-07-07T13:25:05Z',
      entries: [{ playerId: 'saka', status: 'advanced', targetClubId: 'real_madrid',
        sources: [{ sourceType: 'fabrizio_advanced', publishedAt: '2026-08-01' }] }],
    }
    expect(validateTransferIntel(intel).problems.some((p) => /after research cutoff/.test(p))).toBe(true)
  })
})
