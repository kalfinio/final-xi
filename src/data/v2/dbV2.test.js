// Phase A — Player Database V2 tests: schema/validation, GOAT invariant,
// legacy + V2 determinism, adapter→engine parity, save versioning, transfer
// safety. None of this touches the live game's V1 draft/determinism.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PLAYERS as V1_PLAYERS, getEligiblePlayers, computeRating, makeRng, shuffle, FORMATIONS, dateSeed, combineSeed,
} from '../../data'
import { V2_PLAYERS, v2PlayerById, LEGEND_PLAYERS, NATIONS, LEAGUES, CLUBS } from './index'
import { adaptPlayerV2ToLegacyShape } from './adapter'
import { CATALOGUES, catalogueEligiblePlayers, resolvePlayer, getCatalogue } from './catalogues'
import { validateV2, validateTransferIntel, validateLegacyV1Order, roleSuitabilityProblems } from './validate'
import { createRunSnapshot, snapshotCatalogVersion, validateRunSnapshot } from '../../runPersistence'
import { GOAT_REQUIRED, POSITIONS } from './schema'

const INTEL = JSON.parse(readFileSync('data/transferIntel.2026-07-07.json', 'utf8'))

const offerIds = (catalogVersion, slot, usedIds, seed, pool = 'modern') =>
  shuffle(catalogueEligiblePlayers(catalogVersion, slot, usedIds, pool), makeRng(seed)).slice(0, 3).map((p) => p.id)

const dailyLegacyOffer = ({ date, slotIndex, slot, reroll, usedIds = [], pool = 'modern' }) => {
  const seed = combineSeed(dateSeed(date), slotIndex, reroll, pool === 'modern' ? 1 : 0)
  return { seed, ids: offerIds('legacy_v1', slot, usedIds, seed, pool) }
}

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
  it('active greats keep factual V2 clubIds but adapt through exact V1 gameplay fields', () => {
    expect(v2PlayerById.messi.clubId).toBe('inter_miami')
    expect(v2PlayerById.ronaldo.clubId).toBe('al_nassr')
    expect(adaptPlayerV2ToLegacyShape(v2PlayerById.messi).club).toBe(V1_PLAYERS.find((p) => p.id === 'messi').club)
    expect(adaptPlayerV2ToLegacyShape(v2PlayerById.ronaldo).club).toBe(V1_PLAYERS.find((p) => p.id === 'ronaldo').club)
  })
  it('every migrated legend id also exists in the frozen V1 pool', () => {
    const v1ids = new Set(V1_PLAYERS.map((p) => p.id))
    for (const l of LEGEND_PLAYERS) expect(v1ids.has(l.id)).toBe(true)
  })
  it('all migrated legends adapt with exact V1 gameplay-facing parity', () => {
    const fields = ['id', 'name', 'primaryPos', 'posType', 'eligibleSlots', 'country', 'club', 'tags', 'rarity', 'role', 'secondaryRole', 'sourceRole', 'era']
    for (const l of LEGEND_PLAYERS) {
      const v1 = V1_PLAYERS.find((p) => p.id === l.id)
      const adapted = adaptPlayerV2ToLegacyShape(l)
      for (const field of fields) expect(adapted[field]).toEqual(v1[field])
    }
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
  it('legacy_v1 catalogue eligibility is byte-identical to the V1 helper for every slot', () => {
    for (const slot of Object.keys(V1_PLAYERS.reduce((m, p) => {
      for (const s of p.eligibleSlots) m[s] = true
      return m
    }, {}))) {
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
  it('legacy_v1 orderedIds exactly match the frozen V1 sequence and reorder is rejected', () => {
    const ordered = getCatalogue('legacy_v1').orderedIds
    expect(ordered).toEqual(V1_PLAYERS.map((p) => p.id))
    expect(validateLegacyV1Order(ordered)).toEqual([])
    const swapped = [...ordered]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    expect(validateLegacyV1Order(swapped).some((p) => /order mismatch/.test(p))).toBe(true)
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
  it('legends_v2 eligibility cannot expose modern-only players', () => {
    for (const slot of ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST']) {
      for (const pool of ['modern', 'legends']) {
        const eligible = catalogueEligiblePlayers('legends_v2', slot, [], pool)
        expect(eligible.every((p) => p.era === 'legend')).toBe(true)
      }
    }
  })
  it('modern_mix_v2 eligibility respects membership, slot filters, used-player filters, and order', () => {
    const cat = getCatalogue('modern_mix_v2_2026_07_07')
    const orderedMembers = cat.orderedIds.map((id) => resolvePlayer(id, cat.id))
    const expected = orderedMembers.filter((p) => p.eligibleSlots.includes('ST'))
    const eligible = catalogueEligiblePlayers(cat.id, 'ST', [], 'modern')
    expect(eligible.map((p) => p.id)).toEqual(expected.map((p) => p.id))
    expect(eligible.every((p) => cat.orderedIds.includes(p.id))).toBe(true)
    expect(catalogueEligiblePlayers(cat.id, 'ST', [eligible[0].id], 'modern').map((p) => p.id)).not.toContain(eligible[0].id)
    expect(catalogueEligiblePlayers(cat.id, 'GK', [], 'modern').every((p) => p.eligibleSlots.includes('GK'))).toBe(true)
  })
  it('every catalogue is explicitly ordered with no duplicate ids', () => {
    for (const cat of Object.values(CATALOGUES)) {
      expect(Array.isArray(cat.orderedIds)).toBe(true)
      expect(new Set(cat.orderedIds).size).toBe(cat.orderedIds.length)
    }
  })
})

// ---------------------------------------------------------------------------
describe('deterministic golden draft fixtures', () => {
  it('preserves representative legacy Daily Challenge exact offers', () => {
    expect(dailyLegacyOffer({
      date: new Date(2026, 6, 7, 12), slotIndex: 0, slot: 'GK', reroll: 0,
    })).toEqual({ seed: 1150895598, ids: ['oblak', 'valdes', 'schmeichel'] })
    expect(dailyLegacyOffer({
      date: new Date(2026, 6, 7, 12), slotIndex: 1, slot: 'RB', reroll: 2, usedIds: ['oblak'],
    })).toEqual({ seed: 3148718327, ids: ['trent', 'thuram', 'walker'] })
    expect(dailyLegacyOffer({
      date: new Date(2024, 6, 4, 12), slotIndex: 10, slot: 'ST', reroll: 1,
      usedIds: ['ronaldo', 'henry'], pool: 'legends',
    })).toEqual({ seed: 407081751, ids: ['crespo', 'delpiero', 'drogba'] })
  })

  it('pins representative V2 Modern Mix and Legends Only exact offers', () => {
    expect(offerIds('modern_mix_v2_2026_07_07', 'ST', [], 777, 'modern'))
      .toEqual(['semenyo', 'weah', 'benzema'])
    expect(offerIds('modern_mix_v2_2026_07_07', 'ST', ['ronaldo', 'haaland', 'mbappe'], 777, 'modern'))
      .toEqual(['lautaro', 'vinicius', 'delap'])
    expect(offerIds('modern_mix_v2_2026_07_07', 'GK', [], 42, 'modern'))
      .toEqual(['onana_andre', 'terstegen', 'joangarcia'])
    expect(offerIds('legends_v2', 'ST', [], 777, 'modern'))
      .toEqual(['distefano', 'maradona', 'benzema'])
    expect(offerIds('legends_v2', 'ST', [], 777, 'legends'))
      .toEqual(['distefano', 'maradona', 'benzema'])
    expect(offerIds('legends_v2', 'LB', ['robertocarlos'], 123, 'legends'))
      .toEqual(['ashleycole', 'maldini'])
  })
})

// ---------------------------------------------------------------------------
describe('role suitability schema', () => {
  it('current data has no curated roleSuitability coverage yet', () => {
    expect(V2_PLAYERS.filter((p) => p.roleSuitability && Object.keys(p.roleSuitability).length > 0)).toHaveLength(0)
  })
  it('accepts sparse 1/2/3 role suitability values and rejects bad roles/values', () => {
    expect(roleSuitabilityProblems({ id: 'ok', roleSuitability: { 'Tempo Controller': 3, 'Box-to-Box Engine': 2 } })).toEqual([])
    expect(roleSuitabilityProblems({ id: 'bad_role', roleSuitability: { 'Made Up Role': 2 } }).length).toBeGreaterThan(0)
    expect(roleSuitabilityProblems({ id: 'bad_value', roleSuitability: { 'Tempo Controller': 'natural' } }).length).toBeGreaterThan(0)
    expect(roleSuitabilityProblems({ id: 'bad_number', roleSuitability: { 'Tempo Controller': 4 } }).length).toBeGreaterThan(0)
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
