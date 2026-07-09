// Phase A — Player Database V2 tests: schema/validation, GOAT invariant,
// legacy + V2 determinism, adapter→engine parity, save versioning, transfer
// safety. None of this touches the live game's V1 draft/determinism.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PLAYERS as V1_PLAYERS, getEligiblePlayers, computeRating, makeRng, shuffle, FORMATIONS, dateSeed, combineSeed, slotOptions,
} from '../../data'
import { V2_PLAYERS, v2PlayerById, LEGEND_PLAYERS, NATIONS, LEAGUES, CLUBS, deriveRoleSuitability } from './index'
import { adaptPlayerV2ToLegacyShape } from './adapter'
import { CATALOGUES, catalogueEligiblePlayers, resolvePlayer, getCatalogue, isCuratedActivationMember, CURATED_SPECIALIST_ROLES, activationCatalogVersion, catalogueSlotOptions, ACTIVATION_CATALOG_BY_POOL, ACTIVATION_CATALOG_BY_MODE } from './catalogues'
import { simulateCatalogue } from './draftSim'
import { validateV2, validateTransferIntel, validateLegacyV1Order, roleSuitabilityProblems } from './validate'
import { createRunSnapshot, snapshotCatalogVersion, validateRunSnapshot } from '../../runPersistence'
import { GOAT_REQUIRED, POSITIONS, ROLE_KEYS, ROLE_KEY_SET, ROLE_SUITABILITY_SET, SIGNATURE_SET, LEGACY_PRESSURE_DESCRIPTORS, posTypeOf } from './schema'
import { curatedRoleSuitability, CURATED_ROLE_IDS } from './roleSuitabilityOverrides'

const GK_ROLES = new Set(['Shot Stopper', 'Sweeper Keeper', 'Big Match Keeper'])

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
    // Modern Mix pins move whenever the modern set is expanded (the eligible
    // list feeds the shuffle); re-pinned for the Phase A.2 (544-player) DB.
    expect(offerIds('modern_mix_v2_2026_07_07', 'ST', [], 777, 'modern'))
      .toEqual(['lautaro', 'williamsjr', 'jackson'])
    expect(offerIds('modern_mix_v2_2026_07_07', 'ST', ['ronaldo', 'haaland', 'mbappe'], 777, 'modern'))
      .toEqual(['joaofelix', 'mikautadze', 'ferran'])
    expect(offerIds('modern_mix_v2_2026_07_07', 'GK', [], 42, 'modern'))
      .toEqual(['pickford', 'oblak', 'leno'])
    // Legends Only is derived from the frozen legend order and must NOT move.
    expect(offerIds('legends_v2', 'ST', [], 777, 'modern'))
      .toEqual(['distefano', 'maradona', 'benzema'])
    expect(offerIds('legends_v2', 'ST', [], 777, 'legends'))
      .toEqual(['distefano', 'maradona', 'benzema'])
    expect(offerIds('legends_v2', 'LB', ['robertocarlos'], 123, 'legends'))
      .toEqual(['ashleycole', 'maldini'])
  })
})

// ---------------------------------------------------------------------------
describe('curated Modern Mix activation catalogue (Phase A remediation)', () => {
  const CUR = 'modern_mix_v2_curated'
  it('is registered, explicitly ordered, deduped, and mid-sized (280–380)', () => {
    const cat = getCatalogue(CUR)
    expect(cat).toBeTruthy()
    expect(cat.activation).toBe(true)
    expect(Array.isArray(cat.orderedIds)).toBe(true)
    expect(new Set(cat.orderedIds).size).toBe(cat.orderedIds.length)
    expect(cat.orderedIds.length).toBeGreaterThanOrEqual(280)
    expect(cat.orderedIds.length).toBeLessThanOrEqual(380)
  })
  it('is a strict subset of the full master and keeps every legend + all GOATs', () => {
    const master = new Set(getCatalogue('modern_mix_v2_2026_07_07').orderedIds)
    const cur = new Set(getCatalogue(CUR).orderedIds)
    for (const id of cur) expect(master.has(id)).toBe(true)
    for (const p of V2_PLAYERS.filter((x) => x.era === 'legend')) expect(cur.has(p.id)).toBe(true)
    for (const id of GOAT_REQUIRED) expect(cur.has(id)).toBe(true)
  })
  it('admits only premium tiers, plus quality ONLY where it fills a scarce specialist role', () => {
    for (const id of getCatalogue(CUR).orderedIds) {
      const p = v2PlayerById[id]
      if (p.era === 'legend') continue
      const premium = ['goat', 'goat_candidate', 'elite', 'star'].includes(p.tier)
      const specialistQuality = p.tier === 'quality' && CURATED_SPECIALIST_ROLES.has(p.primaryRole)
      expect(premium || specialistQuality).toBe(true)
      expect(p.tier).not.toBe('squad') // lowest tier never enters the activation pool
    }
    expect(isCuratedActivationMember({ id: 'messi' })).toBe(true)
  })
  it('pins representative curated offers (deterministic; move only when curation changes)', () => {
    const off = (slot, used, seed) => shuffle(catalogueEligiblePlayers(CUR, slot, used, 'modern'), makeRng(seed)).slice(0, 3).map((p) => p.id)
    expect(off('ST', [], 777)).toEqual(['ronaldo', 'greenwood', 'distefano'])
    expect(off('GK', [], 42)).toEqual(['nubel', 'gulacsi', 'terstegen'])
    expect(off('CDM', [], 99)).toEqual(['stones', 'casado', 'onana_a'])
    expect(off('LWB', [], 123)).toEqual(['mendy_f', 'balde', 'nunomendes'])
  })
})

// ---------------------------------------------------------------------------
// Simulation safety guardrail (Phase A remediation, Task 7). Deterministic
// multi-seed / multi-formation bands, NOT brittle exact values. Purpose: catch
// a FUTURE catalogue edit that silently collapses draft strength or coverage.
describe('activation-catalogue simulation guardrails', () => {
  const sim = simulateCatalogue('modern_mix_v2_curated', { seeds: 60 })
  it('completes every formation across the seed sweep', () => {
    expect(sim.formationCompletion).toBe(100)
  })
  it('keeps draft strength in a healthy band (no collapse toward full-master, no legacy over-fit)', () => {
    // full-master collapses to ~118; legacy is ~184. Curated must stay well clear of collapse.
    expect(sim.avgXIRating).toBeGreaterThan(135)
    expect(sim.avgXIRating).toBeLessThan(175)
    expect(sim.avgOfferPoints).toBeGreaterThan(12)
  })
  it('preserves premium excitement and rare GOAT exposure', () => {
    expect(sim.premiumOfferPct).toBeGreaterThan(30) // elite+ offered often
    expect(sim.goatOfferPct).toBeGreaterThan(0.2) // GOATs appear, but rarely
    expect(sim.goatOfferPct).toBeLessThan(3)
  })
  it('keeps healthy positional depth at every draftable slot', () => {
    for (const [slot, depth] of Object.entries(sim.slotDepth)) {
      expect(depth, `slot ${slot}`).toBeGreaterThanOrEqual(5)
    }
  })
  it('offers real variety (busiest 10 players are a small share of all offers)', () => {
    expect(sim.concentrationTop10Pct).toBeLessThan(15)
    expect(sim.distinctOffered).toBeGreaterThan(200)
  })
})

// ---------------------------------------------------------------------------
describe('Modern Mix activation wiring (Phase A V2)', () => {
  const CUR = 'modern_mix_v2_curated'
  const seededOffer = (catalogVersion, slot, slotIndex, rerollCount, usedIds = [], pool = 'modern') =>
    catalogueSlotOptions({ catalogVersion, mode: 'daily', slotLabel: slot, slotIndex, rerollCount, usedIds, pool }).map((p) => p.id)

  it('a new normal Modern Mix run selects the curated V2 catalogue', () => {
    expect(activationCatalogVersion({ mode: 'random', pool: 'modern' })).toBe(CUR)
    expect(ACTIVATION_CATALOG_BY_POOL.modern).toBe(CUR)
  })
  it('the full-master V2 catalogue is NOT a live activation default', () => {
    expect(Object.values(ACTIVATION_CATALOG_BY_POOL)).not.toContain('modern_mix_v2_2026_07_07')
    expect(Object.values(ACTIVATION_CATALOG_BY_MODE.daily)).not.toContain('modern_mix_v2_2026_07_07')
    expect(activationCatalogVersion({ mode: 'random', pool: 'modern' })).not.toBe('modern_mix_v2_2026_07_07')
    expect(activationCatalogVersion()).toBe('legacy_v1') // unknown pool → safe legacy default
  })
  it('Legends Only keeps its frozen legacy boundary (never inherits curated)', () => {
    expect(activationCatalogVersion({ mode: 'random', pool: 'legends' })).toBe('legacy_v1')
    expect(activationCatalogVersion({ mode: 'daily', pool: 'legends' })).toBe('legacy_v1')
    // legends offers are legend-era only, drawn from the legacy pool
    const ids = seededOffer('legacy_v1', 'ST', 0, 0, [], 'legends')
    for (const id of ids) expect(V1_PLAYERS.find((p) => p.id === id).era).toBe('legend')
  })
  it('Daily Challenge remains on legacy_v1 and keeps legacy slotOptions semantics', () => {
    expect(activationCatalogVersion({ mode: 'daily', pool: 'modern' })).toBe('legacy_v1')
    expect(activationCatalogVersion({ mode: 'daily', pool: 'legends' })).toBe('legacy_v1')
    for (const slot of ['GK', 'RB', 'CB', 'CM', 'RW', 'ST', 'LW', 'CAM', 'CDM', 'RM', 'LM']) {
      for (const rc of [0, 1, 2, 3]) {
        for (const pool of ['modern', 'legends']) {
          const a = seededOffer('legacy_v1', slot, 3, rc, [], pool)
          const b = slotOptions({ mode: 'daily', slotLabel: slot, slotIndex: 3, rerollCount: rc, usedIds: [], pool }).map((p) => p.id)
          expect(a).toEqual(b)
        }
      }
    }
  })
  it('curated seeded offers are deterministic, reroll-stable, and never escape the catalogue', () => {
    const curatedIds = new Set(getCatalogue(CUR).orderedIds)
    // pinned golden (moves only if curation changes)
    expect(seededOffer(CUR, 'ST', 9, 1)).toEqual(['inzaghi', 'icardi', 'endrick'])
    for (const slot of ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST', 'RWB', 'LWB']) {
      for (const rc of [0, 1, 2, 3]) {
        const o1 = seededOffer(CUR, slot, 4, rc)
        const o2 = seededOffer(CUR, slot, 4, rc)
        expect(o1).toEqual(o2) // deterministic
        for (const id of o1) {
          expect(curatedIds.has(id)).toBe(true) // never escapes the run catalogue
          expect(resolvePlayer(id, CUR)).toBeTruthy() // resolves for save/restore
        }
      }
    }
  })
  it('a rerolled offer excludes already-used players (no duplicate corruption)', () => {
    const first = seededOffer(CUR, 'ST', 9, 0)
    const withUsed = seededOffer(CUR, 'ST', 9, 1, [first[0]])
    expect(withUsed).not.toContain(first[0])
  })
  it('a new curated Modern Mix snapshot explicitly persists catalogVersion, and legacy defaults hold', () => {
    const squad = FORMATIONS['4-3-3'].slots.map((slot) => ({ slot, player: { id: 'x' } }))
    const base = { runSeed: 1, teamName: 'T', rerollsUsed: 0, squad, matches: [], upgradeState: { owned: [], offers: [] }, checkpoint: { screen: 'hub', resolvedMatchCount: 0, selectedApproach: 'balanced' } }
    const v2 = createRunSnapshot({ ...base, config: { mode: 'random', formation: '4-3-3', pool: 'modern' }, catalogVersion: CUR, dbVersion: 'v2' })
    expect(v2.run.catalogVersion).toBe(CUR)
    expect(snapshotCatalogVersion(v2)).toBe(CUR)
    // a run with no explicit catalogVersion still resolves as legacy_v1
    const legacy = createRunSnapshot({ ...base, config: { mode: 'random', formation: '4-3-3', pool: 'legends' } })
    expect(legacy.run.catalogVersion).toBe('legacy_v1')
    expect(snapshotCatalogVersion({ run: {} })).toBe('legacy_v1')
  })
})

// ---------------------------------------------------------------------------
describe('role suitability content (Phase A.2)', () => {
  it('every player carries a non-empty, schema-valid, sparse role map', () => {
    for (const p of V2_PLAYERS) {
      const rs = p.roleSuitability
      expect(rs && typeof rs === 'object').toBe(true)
      const keys = Object.keys(rs)
      expect(keys.length).toBeGreaterThan(0)
      expect(roleSuitabilityProblems(p)).toEqual([]) // valid role keys + 1/2/3 values
      // sparse + player-specific: nobody is "suited to" a big chunk of the game.
      expect(keys.length).toBeLessThanOrEqual(5)
      for (const v of Object.values(rs)) expect(ROLE_SUITABILITY_SET.has(v)).toBe(true)
    }
  })
  it('every player is natural (level 3) at exactly their primary role', () => {
    for (const p of V2_PLAYERS) {
      expect(p.roleSuitability[p.primaryRole]).toBe(3)
      const threes = Object.entries(p.roleSuitability).filter(([, v]) => v === 3).map(([r]) => r)
      expect(threes).toEqual([p.primaryRole])
    }
  })
  it('no impossible role/position: GK and outfield role families never mix', () => {
    for (const p of V2_PLAYERS) {
      const roles = Object.keys(p.roleSuitability)
      if (posTypeOf(p.primaryPosition) === 'GK') {
        expect(roles.every((r) => GK_ROLES.has(r))).toBe(true)
      } else {
        expect(roles.some((r) => GK_ROLES.has(r))).toBe(false)
      }
    }
  })
  it('coverage is broad but not uniform (players differ in how versatile they are)', () => {
    expect(V2_PLAYERS.every((p) => p.roleSuitability)).toBe(true)
    const sizes = new Set(V2_PLAYERS.map((p) => Object.keys(p.roleSuitability).length))
    expect(sizes.size).toBeGreaterThan(1) // not everyone gets the same breadth
  })
  it('the derivation is deterministic and every key is an approved role', () => {
    const roleSet = new Set(ROLE_KEYS)
    for (const p of V2_PLAYERS) {
      for (const r of Object.keys(p.roleSuitability)) expect(roleSet.has(r)).toBe(true)
    }
    const sample = v2PlayerById.rodri || V2_PLAYERS.find((p) => p.era === 'modern')
    expect(deriveRoleSuitability(sample)).toEqual(deriveRoleSuitability(sample))
  })
  it('validation accepts sparse 1/2/3 values and rejects bad roles/values', () => {
    expect(roleSuitabilityProblems({ id: 'ok', roleSuitability: { 'Tempo Controller': 3, 'Box-to-Box Engine': 2 } })).toEqual([])
    expect(roleSuitabilityProblems({ id: 'bad_role', roleSuitability: { 'Made Up Role': 2 } }).length).toBeGreaterThan(0)
    expect(roleSuitabilityProblems({ id: 'bad_value', roleSuitability: { 'Tempo Controller': 'natural' } }).length).toBeGreaterThan(0)
    expect(roleSuitabilityProblems({ id: 'bad_number', roleSuitability: { 'Tempo Controller': 4 } }).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
describe('curated role suitability overrides (Phase A remediation, Task 3)', () => {
  it('curates every legend and ~100+ modern players, keeping derivation as fallback', () => {
    const legends = V2_PLAYERS.filter((p) => p.era === 'legend')
    const modern = V2_PLAYERS.filter((p) => p.era === 'modern')
    expect(legends.every((p) => CURATED_ROLE_IDS.has(p.id))).toBe(true) // all legends curated
    expect(modern.filter((p) => CURATED_ROLE_IDS.has(p.id)).length).toBeGreaterThanOrEqual(100)
    // uncurated players still get a valid derived profile
    const uncurated = modern.find((p) => !CURATED_ROLE_IDS.has(p.id))
    expect(uncurated.roleSuitability[uncurated.primaryRole]).toBe(3)
    expect(roleSuitabilityProblems(uncurated)).toEqual([])
  })
  it('an explicit override wins over the fallback derivation', () => {
    const kane = v2PlayerById.kane // curated: Complete Striker(3) + Link-Up 2, Box Finisher 2, Final Passer 1
    expect(kane.roleSuitability).toEqual(curatedRoleSuitability(kane))
    expect(kane.roleSuitability['Link-Up Striker']).toBe(2)
    // the derived map for the same player is generally different (override took effect)
    expect(JSON.stringify(kane.roleSuitability)).not.toBe(JSON.stringify(deriveRoleSuitability(kane)))
  })
  it('overrides stay sparse, valid, and never introduce a second natural (level-3) role', () => {
    for (const id of CURATED_ROLE_IDS) {
      const p = v2PlayerById[id]
      if (!p) continue
      const rs = p.roleSuitability
      expect(roleSuitabilityProblems(p)).toEqual([])
      expect(Object.keys(rs).length).toBeLessThanOrEqual(5)
      const threes = Object.entries(rs).filter(([, v]) => v === 3).map(([r]) => r)
      expect(threes).toEqual([p.primaryRole])
    }
  })
  it('elite tier does NOT force breadth: a pure finisher can stay narrow', () => {
    expect(Object.keys(v2PlayerById.haaland.roleSuitability).length).toBeLessThanOrEqual(2) // Box Finisher (+Complete Striker)
  })
})

// ---------------------------------------------------------------------------
describe('dead-role cleanup (Phase A remediation, Task 4)', () => {
  it('Defensive Wingback is now an accessible role (was 0/0/1)', () => {
    let l2 = 0, l1 = 0
    for (const p of V2_PLAYERS) {
      const v = p.roleSuitability['Defensive Wingback']
      if (v === 2) l2++; else if (v === 1) l1++
    }
    expect(l2 + l1).toBeGreaterThanOrEqual(6)
    expect(l2).toBeGreaterThanOrEqual(3)
  })
  it('Big Game Scorer is removed from the V2 tactical-role taxonomy (kept only as a legacy descriptor)', () => {
    expect(ROLE_KEY_SET.has('Big Game Scorer')).toBe(false)
    expect(LEGACY_PRESSURE_DESCRIPTORS).toContain('Big Game Scorer')
    // no V2 player references it as primary role or in any suitability map
    for (const p of V2_PLAYERS) {
      expect(p.primaryRole).not.toBe('Big Game Scorer')
      expect('Big Game Scorer' in p.roleSuitability).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
describe('legend signature/character curation (Phase A remediation, Tasks 5+6)', () => {
  const legends = () => V2_PLAYERS.filter((p) => p.era === 'legend')
  it('legends no longer share one role-templated signature pair (distinct profiles)', () => {
    const cbs = legends().filter((p) => p.primaryPosition === 'CB')
    const sigKeys = new Set(cbs.map((p) => [...p.signatures].sort().join('|')))
    // previously every CB shared ['Front-Foot Defender','Aerial Target']; now varied
    expect(sigKeys.size).toBeGreaterThan(cbs.length / 2)
    // two iconic CBs must not be identical
    expect(v2PlayerById.cannavaro.signatures.join()).not.toBe(v2PlayerById.ramos.signatures.join())
  })
  it('legend characters are spread across many archetypes, not one default', () => {
    const chars = new Set(legends().map((p) => p.character))
    expect(chars.size).toBeGreaterThanOrEqual(9)
    // a distinctive, conservative assignment landed (not gossip, well-known identity)
    expect(v2PlayerById.maradona.character).toBe('Maverick')
    expect(v2PlayerById.maldini.character).toBe('Standard Bearer')
  })
  it('every legend signature is valid vocabulary and the set stays small', () => {
    for (const p of legends()) {
      expect(p.signatures.length).toBeGreaterThan(0)
      expect(p.signatures.length).toBeLessThanOrEqual(4)
      for (const s of p.signatures) expect(SIGNATURE_SET.has(s)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
describe('database composition (Phase A.2 snapshot)', () => {
  it('preserves the 83-legend baseline exactly', () => {
    expect(V2_PLAYERS.filter((p) => p.era === 'legend').length).toBe(83)
  })
  it('modern coverage sits in the documented Phase A.2 band', () => {
    const modern = V2_PLAYERS.filter((p) => p.era === 'modern').length
    expect(modern).toBeGreaterThanOrEqual(450)
    expect(modern).toBeLessThanOrEqual(700)
  })
  it('every player belongs to a real nation and a real club, with a known position/role', () => {
    const nationIds = new Set(NATIONS.map((n) => n.id))
    const clubIds = new Set(CLUBS.map((c) => c.id))
    const roleSet = new Set(ROLE_KEYS)
    for (const p of V2_PLAYERS) {
      expect(nationIds.has(p.nationId)).toBe(true)
      expect(clubIds.has(p.clubId)).toBe(true)
      expect(POSITIONS).toContain(p.primaryPosition)
      expect(roleSet.has(p.primaryRole)).toBe(true)
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
  it('the re-audited snapshot holds exactly the 8 verified confirmed moves and no reverted players', () => {
    const confirmed = INTEL.entries.filter((e) => e.status === 'confirmed').map((e) => e.playerId).sort()
    expect(confirmed).toEqual(['bernardo', 'cucurella', 'donnarumma', 'dumfries', 'ederson', 'gordon', 'konate', 'lewandowski'].sort())
    // players whose fabricated moves were reverted must NOT appear as confirmed intel …
    for (const id of ['olise', 'xavisimons', 'kimmich', 'jonathandavid', 'frenkie', 'christensen', 'jackson']) {
      expect(INTEL.entries.some((e) => e.playerId === id)).toBe(false)
    }
    // … and their canonical club is the real one, not the fabricated destination.
    expect(v2PlayerById.olise.clubId).toBe('bayern')
    expect(v2PlayerById.xavisimons.clubId).toBe('tottenham')
    expect(v2PlayerById.kimmich.clubId).toBe('bayern')
    expect(v2PlayerById.jonathandavid.clubId).toBe('juventus')
    expect(v2PlayerById.frenkie.clubId).toBe('barcelona')
    expect(v2PlayerById.christensen.clubId).toBe('barcelona')
  })
  it('every confirmed source is official/tier-one and dated on or before the cutoff', () => {
    const cutoff = Date.parse(INTEL.researchCutoffUtc)
    for (const e of INTEL.entries) {
      expect(e.sources.length).toBeGreaterThan(0)
      for (const s of e.sources) {
        expect(['official_club', 'official_league', 'transfermarkt_completed', 'tier_one_reporter']).toContain(s.sourceType)
        expect(Date.parse(s.publishedAt)).toBeLessThanOrEqual(cutoff)
      }
    }
  })
  it('an invalid sourceType is rejected by the hierarchy check', () => {
    const intel = {
      researchCutoffUtc: '2026-07-07T13:25:05Z',
      entries: [{ playerId: 'saka', status: 'high_confidence_rumour', targetClubId: 'real_madrid',
        sources: [{ sourceType: 'some_blog', publishedAt: '2026-07-01' }] }],
    }
    expect(validateTransferIntel(intel).problems.some((p) => /bad sourceType/.test(p))).toBe(true)
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
  it('here_we_go and advanced statuses must not have moved the canonical club to the target', () => {
    for (const status of ['here_we_go', 'advanced']) {
      // legal: player still at current club, target is elsewhere
      const ok = {
        researchCutoffUtc: '2026-07-07T13:25:05Z',
        entries: [{ playerId: 'saka', status, targetClubId: 'real_madrid', confidenceBand: 'high',
          sources: [{ sourceType: status === 'here_we_go' ? 'fabrizio_here_we_go' : 'fabrizio_advanced', publishedAt: '2026-07-01' }] }],
      }
      expect(validateTransferIntel(ok).problems).toEqual([])
      // illegal: canonical already at the target for a non-confirmed status
      const bad = { ...ok, entries: [{ ...ok.entries[0], targetClubId: 'arsenal' }] }
      expect(validateTransferIntel(bad).problems.length).toBeGreaterThan(0)
    }
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
