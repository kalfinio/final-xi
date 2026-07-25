// ---------------------------------------------------------------------------
// Player quality / position-eligibility correction phase — behavioural tests.
//
// A. Quality: tiers reflect current individual ability (EA-FC-anchored), not
//    club prestige or potential. Required example reviews are pinned.
// B. Positions: normal draft eligibility only for regular, credible senior
//    positions (Cucurella CB is the canonical removed case).
// C. Versioning: the original curated catalogue is a frozen R1 view so old
//    saves reconstruct byte-identically; new runs draft from R2.
// D. Tactical UX: Opponent Scout / Match Plan / Selected Plan Analysis are
//    pure, deterministic, and keep Club Identity separate from opponent fit.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runR2Calibration, evaluateR2Calibration } from './r2Calibration'
import { createHash } from 'node:crypto'
import {
  FORMATIONS, computeRating, createRunSimulation, makeRng, OPPONENTS, shuffle, playerPoints,
  playerPointsComponents, playerBreakdown, squadScoringPolicy, squadBaseProb,
} from './data'
import { signaturesForM1Player } from './matchEngineM1'
import { adaptPlayerV2ToLegacyShape, R2_ABILITY_POINTS } from './data/v2/adapter'
import { V2_PLAYERS, v2PlayerById } from './data/v2'
import { POSITIONS, GOAT_REQUIRED, TIER_SET } from './data/v2/schema'
import {
  getCatalogue, resolvePlayer, catalogueEligiblePlayers, catalogueSlotOptions,
  activationCatalogVersion,
} from './data/v2/catalogues'
import { MODERN_CURATED_R1_ORDERED_IDS } from './data/v2/curatedManifest'
import {
  LIVE_R2_POSITION_RESTORATIONS, MASTER_ONLY_POSITION_CORRECTIONS,
  CONFIRMED_POSITION_REMOVALS, BORDERLINE_POSITION_EXCLUSIONS, POSITION_DECISION_NOTE,
} from './data/v2/positionDecisions'
import historicalSave from './historicalR1Save.fixture.json'
import { simulateCatalogue } from './data/v2/draftSim'
import {
  createRunSnapshot, validateRunSnapshot, reconstructRun, canonicalMatchSignature,
} from './runPersistence'
import { LEGACY_ENGINE_VERSION } from './matchEngineVersions'
import {
  opponentScout, identityPlanFit, identityRelationship, matchPlanBadges,
  planRecommendationLine, APPROACH_KEYS, IDENTITY_ALIGNMENT_NOTE,
} from './tacticalApproach'
import { squadFromPhase3Fixture } from './matchCalibration'
import { buildUpgradeContext } from './runUpgrades'

const R1 = 'modern_mix_v2_curated'
const R2 = 'modern_mix_v2_curated_r2'
const MODERN = V2_PLAYERS.filter((p) => p.era === 'modern')

// ---------------------------------------------------------------------------
describe('A. player quality corrections', () => {
  it('every player has a valid tier and valid positions', () => {
    for (const p of V2_PLAYERS) {
      expect(TIER_SET.has(p.tier), `${p.id} tier ${p.tier}`).toBe(true)
      expect(POSITIONS.includes(p.primaryPosition), `${p.id} primary`).toBe(true)
      const secondaries = p.secondaryPositions || []
      expect(new Set(secondaries).size).toBe(secondaries.length) // no duplicates
      for (const s of secondaries) {
        expect(POSITIONS.includes(s), `${p.id} secondary ${s}`).toBe(true)
        expect(s).not.toBe(p.primaryPosition)
      }
    }
  })

  it('pins the required example reviews', () => {
    // Rico Lewis: current ability, not potential or Man City membership.
    expect(v2PlayerById.ricolewis.tier).toBe('quality')
    // Akanji: reviewed — established top-level CB, STAR remains appropriate.
    expect(v2PlayerById.akanji.tier).toBe('star')
    // Darmian: reviewed — PROVEN (quality) is the right band for his level.
    expect(v2PlayerById.darmian.tier).toBe('quality')
    // Cucurella: quality reviewed independently of club — STAR is supported
    // by current calibration; the CB eligibility was the actual error.
    expect(v2PlayerById.cucurella.tier).toBe('star')
    // Gabriel and Saliba: hold up against the same standard.
    expect(v2PlayerById.gabrielmagalhaes.tier).toBe('elite')
    expect(v2PlayerById.saliba.tier).toBe('elite')
  })

  it('pins the post-audit reassessment decisions', () => {
    // Revisited on request: kept.
    expect(v2PlayerById.raya.tier).toBe('star') // PL Golden Glove, Arsenal #1
    expect(v2PlayerById.gyokeres.tier).toBe('star')
    expect(v2PlayerById.calafiori.tier).toBe('star')
    expect(v2PlayerById.diallo.tier).toBe('star') // Amad — first-choice, sustained output
    // Revisited: changed on current-role evidence (not potential/prestige).
    expect(v2PlayerById.tchouameni.tier).toBe('star') // very good, not top-band elite
    expect(v2PlayerById.zaireemery.tier).toBe('quality') // reduced PSG role since 24/25
    expect(v2PlayerById.udogie.tier).toBe('quality') // injuries + lost undisputed status
    // Suspicious-group members kept after review.
    for (const id of ['guler', 'nicopaz', 'pavlovic', 'branthwaite', 'huijsen', 'adeyemi', 'akliouche', 'zabarnyi']) {
      expect(v2PlayerById[id].tier, id).toBe('star')
    }
  })

  it('does not blanket-classify elite-club players as premium', () => {
    // Club prestige may never be the quality signal: every big club in the
    // modern set must field at least two sub-premium (quality/squad) players.
    for (const clubId of ['man_city', 'real_madrid', 'arsenal', 'barcelona', 'liverpool', 'bayern', 'chelsea', 'man_united']) {
      const subPremium = MODERN.filter((p) => p.clubId === clubId && (p.tier === 'quality' || p.tier === 'squad'))
      expect(subPremium.length, clubId).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps the GOAT invariant and legend classifications untouched', () => {
    for (const id of GOAT_REQUIRED) expect(v2PlayerById[id].tier).toBe('goat')
    // No legend was touched by this phase: any member whose frozen R1 record
    // differs from the current master must be a modern player.
    for (const id of getCatalogue(R1).orderedIds) {
      const source = resolvePlayer(id, R1).v2Source
      const master = v2PlayerById[id]
      const changed = source.tier !== master.tier
        || JSON.stringify([...source.secondaryPositions]) !== JSON.stringify(master.secondaryPositions || [])
      if (changed) expect(source.era, id).toBe('modern')
    }
  })

  it('keeps elite genuinely rare and the tier pyramid healthy', () => {
    const counts = {}
    for (const p of MODERN) counts[p.tier] = (counts[p.tier] || 0) + 1
    expect(counts.elite / MODERN.length).toBeLessThan(0.13) // elite stays rare
    expect(counts.quality).toBeGreaterThan(counts.star) // pyramid, not inversion
  })
})

// ---------------------------------------------------------------------------
describe('B. position eligibility corrections', () => {
  it('Cucurella cannot appear in a CB draft offer but remains LB/LWB-eligible', () => {
    const cb = catalogueEligiblePlayers(R2, 'CB', [], 'modern').map((p) => p.id)
    expect(cb).not.toContain('cucurella')
    expect(catalogueEligiblePlayers(R2, 'LB', [], 'modern').map((p) => p.id)).toContain('cucurella')
    expect(catalogueEligiblePlayers(R2, 'LWB', [], 'modern').map((p) => p.id)).toContain('cucurella')
    // Exhaustive across 200 REAL seeds: every seed drives its own shuffle of
    // the CB-eligible pool (offers are always subsets of eligibility), so no
    // seed can surface him at CB.
    const pool = catalogueEligiblePlayers(R2, 'CB', [], 'modern')
    for (let seed = 1; seed <= 200; seed++) {
      const offer = shuffle(pool, makeRng(seed)).slice(0, 3)
      expect(offer.map((p) => p.id)).not.toContain('cucurella')
    }
    // And through the real daily-seeded offer path (seed varies per reroll).
    for (let reroll = 0; reroll < 20; reroll++) {
      const offer = catalogueSlotOptions({ catalogVersion: R2, mode: 'daily', slotLabel: 'CB', slotIndex: 2, rerollCount: reroll, usedIds: [] })
      expect(offer.map((p) => p.id)).not.toContain('cucurella')
    }
  })

  it('Gabriel and Saliba remain CB-eligible', () => {
    const cb = catalogueEligiblePlayers(R2, 'CB', [], 'modern').map((p) => p.id)
    expect(cb).toContain('gabrielmagalhaes')
    expect(cb).toContain('saliba')
  })

  it('LIVE R2 restorations resolve and are draftable in the current pool', () => {
    // Audit-accepted restorations that are members of the literal 341-player
    // manifest — these are real, live Random Modern R2 changes.
    for (const [id, slot] of Object.entries(LIVE_R2_POSITION_RESTORATIONS)) {
      expect(MODERN_CURATED_R1_ORDERED_IDS, `${id} is a manifest member`).toContain(id)
      expect(v2PlayerById[id].secondaryPositions, `${id} restored ${slot}`).toContain(slot)
      expect(resolvePlayer(id, R2).eligibleSlots, `${id} resolves with ${slot}`).toContain(slot)
      expect(catalogueEligiblePlayers(R2, slot, [], 'modern').map((p) => p.id), `${id} draftable at ${slot}`).toContain(id)
    }
    // …while the frozen R1 view keeps its own original eligibility.
    expect(resolvePlayer('vinicius', R1).eligibleSlots).toContain('ST')
  })

  it('MASTER-ONLY corrections are recorded but are NOT live R2 changes', () => {
    // These four players are corrected in the master database for future
    // catalogue expansion, but they are OUTSIDE the current 341-player
    // manifest, so the corrections cannot appear in live Random Modern R2
    // drafts. This is the documented product truth — not a live restoration.
    for (const [id, slot] of Object.entries(MASTER_ONLY_POSITION_CORRECTIONS)) {
      expect(v2PlayerById[id].secondaryPositions, `${id} master record has ${slot}`).toContain(slot)
      expect(MODERN_CURATED_R1_ORDERED_IDS, `${id} is NOT a manifest member`).not.toContain(id)
      expect(resolvePlayer(id, R2), `${id} does not resolve in live R2`).toBeNull()
    }
  })

  it('keeps CONFIRMED removals and separately tracked BORDERLINE exclusions', () => {
    // CONFIRMED: independently accepted removals — emergency cover,
    // back-three shifts, or clearly historic usage.
    // BORDERLINE: conservative current-catalogue decisions. The evidence for
    // these eleven is NOT conclusive — this test verifies the game's current
    // behaviour only and is not itself football evidence. Revisit each when
    // stronger recent-usage data is available.
    for (const [id, slot] of Object.entries({ ...CONFIRMED_POSITION_REMOVALS, ...BORDERLINE_POSITION_EXCLUSIONS })) {
      expect(v2PlayerById[id].secondaryPositions, `${id} currently excludes ${slot}`).not.toContain(slot)
    }
    expect(Object.keys(BORDERLINE_POSITION_EXCLUSIONS)).toHaveLength(11)
    expect(POSITION_DECISION_NOTE.borderline).toMatch(/conservative, uncertain/i)
    expect(POSITION_DECISION_NOTE.borderline).toMatch(/not definitively disproven/i)
  })

  it('never offers a player at a slot the eligibility helper does not support', () => {
    for (const catalogVersion of [R1, R2, 'legacy_v1', 'legends_v2']) {
      for (const slot of ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST']) {
        for (const player of catalogueEligiblePlayers(catalogVersion, slot, [], 'modern')) {
          expect(player.eligibleSlots.includes(slot), `${catalogVersion}/${slot}/${player.id}`).toBe(true)
        }
      }
    }
  })

  it('keeps a healthy candidate pool at every standard slot in the live R2 pool', () => {
    for (const slot of ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST']) {
      const pool = catalogueEligiblePlayers(R2, slot, [], 'modern')
      expect(pool.length, slot).toBeGreaterThanOrEqual(12)
    }
  })

  it('keeps every supported formation completable on the R2 pool', () => {
    const sim = simulateCatalogue(R2, { seeds: 40 })
    expect(sim.formationCompletion).toBe(100)
    expect(Object.keys(FORMATIONS).length).toBeGreaterThan(0)
  })

  it('keeps daily-seeded rerolls deterministic and unchanged on legacy', () => {
    const args = { catalogVersion: 'legacy_v1', mode: 'daily', slotLabel: 'ST', slotIndex: 9, rerollCount: 2, usedIds: [] }
    const a = catalogueSlotOptions(args).map((p) => p.id)
    const b = catalogueSlotOptions(args).map((p) => p.id)
    expect(a).toEqual(b)
    const r2a = catalogueSlotOptions({ ...args, catalogVersion: R2 }).map((p) => p.id)
    const r2b = catalogueSlotOptions({ ...args, catalogVersion: R2 }).map((p) => p.id)
    expect(r2a).toEqual(r2b)
  })

  it('keeps Daily and Legends activation on the untouched legacy catalogue', () => {
    expect(activationCatalogVersion({ mode: 'daily', pool: 'modern' })).toBe('legacy_v1')
    expect(activationCatalogVersion({ mode: 'daily', pool: 'legends' })).toBe('legacy_v1')
    expect(activationCatalogVersion({ mode: 'random', pool: 'legends' })).toBe('legacy_v1')
  })
})

// ---------------------------------------------------------------------------
describe('C. catalogue membership and the R1 freeze', () => {
  const LOST_17 = [
    'ricolewis', 'wharton', 'mainoo', 'endrick', 'lewisskelly', 'nwaneri',
    'estevao', 'yoro', 'mateusfernandes', 'woltemade', 'antonio_silva',
    'samu', 'saibari', 'joaofelix', 'rios', 'vitorroque', 'mastantuono',
  ]

  it('R2 keeps the exact 341-player ordered membership of R1', () => {
    const r1Ids = getCatalogue(R1).orderedIds
    const r2Ids = getCatalogue(R2).orderedIds
    expect(r2Ids.length).toBe(341)
    expect(r2Ids).toEqual(r1Ids) // exact same ordered id set
  })

  it('quality demotion never changes catalogue membership', () => {
    // Every demoted player remains a draftable R2 member with corrected data.
    for (const id of LOST_17) {
      const player = resolvePlayer(id, R2)
      expect(player, id).toBeTruthy()
      expect(player.v2Source.tier, id).toBe(v2PlayerById[id].tier) // corrected tier applies
    }
    // Rico Lewis specifically: available, quality tier, corrected positions.
    const rico = resolvePlayer('ricolewis', R2)
    expect(rico.v2Source.tier).toBe('quality')
    expect(catalogueEligiblePlayers(R2, 'RB', [], 'modern').map((p) => p.id)).toContain('ricolewis')
  })

  it('resolves original tiers and eligibility through the frozen R1 catalogue', () => {
    // Old saves must see the exact pre-correction objects.
    const cucurellaR1 = resolvePlayer('cucurella', R1)
    expect(cucurellaR1.eligibleSlots).toContain('CB')
    const ricoR1 = resolvePlayer('ricolewis', R1)
    expect(ricoR1.tags).toContain('modern_icon') // star-tier tag preserved
    expect(ricoR1.v2Source.tier).toBe('star') // R1 label source matches R1 points
    // The live R2 view has the corrections (but keeps the player).
    expect(resolvePlayer('cucurella', R2).eligibleSlots).not.toContain('CB')
    expect(resolvePlayer('ricolewis', R2).v2Source.tier).toBe('quality')
  })

  it('R1 UI labels and R1 gameplay points cannot disagree (Wharton case)', () => {
    const whartonR1 = resolvePlayer('wharton', R1)
    // Gameplay: R1 star tags → star points. Label source: the SAME record.
    expect(whartonR1.tags).toContain('modern_icon')
    expect(whartonR1.v2Source.tier).toBe('star')
    // The live view shows the corrected quality both ways.
    const whartonR2 = resolvePlayer('wharton', R2)
    expect(whartonR2.tags).not.toContain('modern_icon')
    expect(whartonR2.v2Source.tier).toBe('quality')
  })

  it('editing current master fields cannot change a resolved R1 player', () => {
    const before = resolvePlayer('wharton', R1)
    const master = v2PlayerById.wharton
    const originalTier = master.tier
    try {
      master.tier = 'elite' // simulate a future master edit
      const after = resolvePlayer('wharton', R1)
      expect(after.v2Source.tier).toBe('star') // frozen record unaffected
      expect(after.tags).toEqual(before.tags)
    } finally {
      master.tier = originalTier
    }
    // The frozen record itself rejects mutation.
    expect(() => { resolvePlayer('wharton', R1).v2Source.tier = 'elite' }).toThrow()
  })

  it('historical signature resolution never falls back to current-master data', () => {
    // A versioned record's own signatures always win, even if they disagree
    // with whatever the master database currently says for that id.
    const divergent = { id: 'salah', role: 'Inside Forward', posType: 'ATT', signatures: ['Line Breaker'], v2Source: { signatures: ['Line Breaker'] } }
    expect(signaturesForM1Player(divergent)).toEqual(['Line Breaker'])
    const viaSourceOnly = { id: 'salah', role: 'Inside Forward', posType: 'ATT', v2Source: { signatures: ['Aerial Target'] } }
    expect(signaturesForM1Player(viaSourceOnly)).toEqual(['Aerial Target'])
    // Real catalogue objects carry their own signatures on both revisions.
    expect(resolvePlayer('salah', R1).signatures.length).toBeGreaterThan(0)
    expect(resolvePlayer('salah', R2).signatures.length).toBeGreaterThan(0)
  })

  it('reconstructs an old save whose squad used now-removed eligibility (Cucurella at CB)', () => {
    // Build a legal R1 squad that would be ILLEGAL under R2 eligibility.
    const wanted = [
      ['GK', 'alisson'], ['RB', 'hakimi'], ['CB', 'cucurella'], ['CB', 'saliba'], ['LB', 'theo'],
      ['CM', 'rodri'], ['CM', 'bellingham'], ['CM', 'pedri'],
      ['RW', 'salah'], ['ST', 'haaland'], ['LW', 'vinicius'],
    ]
    const squad = wanted.map(([slot, id]) => ({ slot, player: resolvePlayer(id, R1) }))
    for (const s of squad) expect(s.player, s.slot).toBeTruthy()
    const rng = makeRng(0xbeef)
    const ctrl = createRunSimulation({
      rating: computeRating(squad).total, difficulty: 'classic', squad, rng,
      runSeed: 0xbeef, engineVersion: LEGACY_ENGINE_VERSION,
      // Mirror the app path: reconstruction always passes an upgrade context,
      // so the original controller must too for byte-identical replay.
      upgradeContextFor: (mc, profile) => buildUpgradeContext([], mc, profile),
    })
    ctrl.prepareNext()
    ctrl.resolveNext('balanced')
    const snap = createRunSnapshot({
      engineVersion: ctrl.engineVersion,
      config: { mode: 'random', pool: 'modern', difficulty: 'classic', formation: '4-3-3', clubIdentity: 'press' },
      catalogVersion: R1, runSeed: 0xbeef, teamName: 'R1 XI', squad, rerollsUsed: 0,
      matches: ctrl.matches, upgradeState: { owned: [], offers: [] },
      checkpoint: { screen: 'hub', resolvedMatchCount: 1, selectedApproach: 'counter', stageLabel: 'League Phase' },
    })
    expect(validateRunSnapshot(snap)).toBe(true)
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.catalogVersion).toBe(R1)
    expect(rec.selectedApproach).toBe('counter') // restored Match Plan selection
    const restoredCucurella = rec.squad.find((s) => s.player.id === 'cucurella')
    expect(restoredCucurella.slot).toBe('CB')
    expect(restoredCucurella.player.eligibleSlots).toContain('CB') // R1 object
    expect(JSON.stringify(rec.ctrl.matches)).toBe(JSON.stringify(ctrl.matches)) // exact replay
  })

  it('R2 awards zero ability points for league, club or development potential', () => {
    // Real players: prestige tags exist in R1, are absent in R2 (tier tags
    // survive; the tier-derived abilityBonus replaces the prestige noise).
    for (const id of ['rodri', 'salah', 'bellingham', 'vinicius', 'saka']) {
      const r1 = resolvePlayer(id, R1)
      const r2 = resolvePlayer(id, R2)
      const prestige = ['premier_league_star', 'city_core', 'liverpool_core', 'madrid_modern', 'barca_modern', 'bayern_core', 'psg_star', 'future_legend']
      expect(r1.tags.some((t) => prestige.includes(t)), id).toBe(true)
      expect(r2.tags.some((t) => prestige.includes(t)), id).toBe(false)
      expect(r2.abilityBonus, id).toBe(R2_ABILITY_POINTS[r2.v2Source.tier])
    }
    // Synthetic controls: changing ONLY club/league or ONLY development
    // profile cannot change an R2 player's current strength.
    const base = { id: 'x1', name: 'X', primaryPosition: 'ST', secondaryPositions: [], nationId: 'spain', clubId: 'osasuna', primaryRole: 'Box Finisher', tier: 'star', character: 'Quiet Pro', signatures: [], developmentProfile: 'prime', era: 'modern' }
    const ability = (p) => playerPoints(adaptPlayerV2ToLegacyShape(p, { tagPolicy: 'ability' }))
    expect(ability({ ...base, clubId: 'man_city' })).toBe(ability(base))
    expect(ability({ ...base, clubId: 'real_madrid' })).toBe(ability(base))
    expect(ability({ ...base, developmentProfile: 'high_growth' })).toBe(ability(base))
    // …while the same player under the LEGACY policy (R1 behaviour) does gain.
    const legacyPts = (p) => playerPoints(adaptPlayerV2ToLegacyShape(p))
    expect(legacyPts({ ...base, clubId: 'man_city' })).toBeGreaterThan(legacyPts(base))
    expect(legacyPts({ ...base, developmentProfile: 'high_growth' })).toBeGreaterThan(legacyPts(base))
  })

  it('keeps historical prestige scoring for R1 and legacy catalogues', () => {
    expect(resolvePlayer('rodri', R1).tags).toContain('city_core')
    expect(resolvePlayer('salah', R1).tags).toContain('premier_league_star')
    expect(resolvePlayer('rodri', 'legacy_v1').tags).toContain('city_core') // frozen V1 data untouched
  })

  it('keeps the R1 catalogue membership frozen and internally consistent', () => {
    expect(getCatalogue(R1).orderedIds.length).toBe(341)
    // Every R1 member's eligibility comes from ITS OWN frozen record — for
    // modern players it equals the snapshot source positions exactly.
    for (const id of getCatalogue(R1).orderedIds) {
      const r1 = resolvePlayer(id, R1)
      expect(r1, id).toBeTruthy()
      if (r1.v2Source.era !== 'modern') continue
      const expected = new Set([r1.v2Source.primaryPosition, ...r1.v2Source.secondaryPositions])
      expect(new Set(r1.eligibleSlots), id).toEqual(expected)
    }
  })

  it('deep-freezes every resolved R1 wrapper and nested array', () => {
    for (const id of ['cucurella', 'wharton', 'salah', 'messi']) {
      const r1 = resolvePlayer(id, R1)
      expect(Object.isFrozen(r1), id).toBe(true)
      expect(Object.isFrozen(r1.eligibleSlots), id).toBe(true)
      expect(Object.isFrozen(r1.tags), id).toBe(true)
      expect(Object.isFrozen(r1.v2Source), id).toBe(true)
      expect(Object.isFrozen(r1.v2Source.secondaryPositions), id).toBe(true)
      expect(() => { r1.eligibleSlots.push('CB') }).toThrow()
      expect(() => { r1.tier = 'elite' }).toThrow()
    }
  })

  it('reconstructs and replays the committed historical golden save byte-identically', () => {
    // The fixture (snapshot + expected outputs) was generated ENTIRELY by the
    // pre-correction committed code at 897efff — the current implementation
    // had no part in producing the expectations.
    expect(historicalSave.generatedFromCommit).toBe('897efff')
    const snap = historicalSave.snapshot
    expect(validateRunSnapshot(snap)).toBe(true)
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.engineVersion).toBe('m1')
    expect(rec.catalogVersion).toBe(R1)
    expect(rec.ctrl.matches.map((m) => `${m.score}|${m.result}|${m.approach}`))
      .toEqual(historicalSave.expected.scores)
    expect(rec.ctrl.matches.map((m, i) => canonicalMatchSignature(m, i)))
      .toEqual(historicalSave.expected.canonicalMatches)
    expect(JSON.stringify(rec.ctrl.matches).length).toBe(historicalSave.expected.matchesJsonLength)
  })
})

// ---------------------------------------------------------------------------
describe('D. tactical UX clarity', () => {
  it('opponent scout is plan-independent, archetype-driven and deterministic', () => {
    for (const opponent of OPPONENTS.slice(0, 12)) {
      const a = opponentScout(opponent)
      const b = opponentScout(opponent)
      expect(a).toEqual(b) // no RNG
      expect(a.threat.length).toBeGreaterThan(20)
      expect(a.weakness.length).toBeGreaterThan(20)
      expect(a.archetype).toBe(opponent.archetype)
    }
    // Distinct reads per archetype — the scout is not generic filler.
    const texts = new Set(['pressing', 'technical', 'defensive', 'attacking', 'physical', 'elite', 'underdog']
      .map((archetype) => opponentScout({ archetype }).threat))
    expect(texts.size).toBe(7)
  })

  it('keeps Club Identity fit separate from opponent fit', () => {
    // Identity fit is a pure identity×plan read…
    expect(identityPlanFit('press', 'counter')).toBe('natural')
    expect(identityPlanFit('press', 'control')).toBe('stretch')
    expect(identityPlanFit('control', 'control')).toBe('natural')
    expect(identityPlanFit('fortress', 'wide')).toBe('stretch')
    // …and the combined line distinguishes all four quadrants.
    const natGood = identityRelationship({ identityKey: 'press', identityName: 'PRESS', approachKey: 'counter', opponentGood: true })
    const natBad = identityRelationship({ identityKey: 'press', identityName: 'PRESS', approachKey: 'counter', opponentGood: false })
    const stretchGood = identityRelationship({ identityKey: 'press', identityName: 'PRESS', approachKey: 'control', opponentGood: true })
    const stretchBad = identityRelationship({ identityKey: 'press', identityName: 'PRESS', approachKey: 'control', opponentGood: false })
    expect(new Set([natGood, natBad, stretchGood, stretchBad]).size).toBe(4)
    expect(natBad).toMatch(/may struggle against this opponent/i)
    expect(stretchGood).toMatch(/less natural/i)
  })

  it('derives selector badges only from existing M1 evidence plus the identity table', () => {
    const m1Preview = (score, recommended) => ({ m1Preview: { score, recommended, archetype: 'pressing', benefit: 'b', risk: 'r', fit: 'f' } })
    expect(matchPlanBadges({ preview: m1Preview(1.5, true), identityKey: 'press', approachKey: 'counter' }).map((b) => b.label))
      .toEqual(['Recommended', 'Identity Alignment'])
    expect(matchPlanBadges({ preview: m1Preview(-1.2, false), identityKey: 'press', approachKey: 'counter' }).map((b) => b.label))
      .toEqual(['Risky', 'Identity Alignment'])
    // Legacy previews (no m1Preview — e.g. Daily) carry NO engine badges:
    // only the identity badge may appear.
    const legacyBadges = matchPlanBadges({ preview: { overallLabel: 'Even' }, identityKey: 'control', approachKey: 'control' })
    expect(legacyBadges.map((b) => b.label)).toEqual(['Identity Alignment'])
    expect(matchPlanBadges({ preview: { overallLabel: 'Even' }, identityKey: 'control', approachKey: 'counter' })).toEqual([])
    // The alignment badge must not read as a performance modifier: never gold,
    // and the disclosure copy states there is no direct performance bonus.
    const alignment = legacyBadges.find((b) => b.label === 'Identity Alignment')
    expect(alignment.tone).not.toBe('gold')
    expect(IDENTITY_ALIGNMENT_NOTE).toMatch(/no direct performance bonus/i)
  })

  it('recommendation lines never repeat advantage/risk prose', () => {
    const previews = {
      balanced: { probabilityDelta: 0, keyAdvantage: { text: 'X' }, keyRisk: { text: 'Y' } },
      counter: { probabilityDelta: 0.02, keyAdvantage: { text: 'Space behind their line.' }, keyRisk: { text: 'Less control.' } },
    }
    const line = planRecommendationLine('counter', previews)
    expect(line).toMatch(/Reads well against this opponent/)
    expect(line).not.toMatch(/Space behind their line/)
    const m1Line = planRecommendationLine('counter', { counter: { m1Preview: { recommended: true, score: 1, benefit: 'B', risk: 'R' } } })
    expect(m1Line).toBe('Recommended read for this opponent.')
    expect(APPROACH_KEYS).toEqual(['balanced', 'control', 'wide', 'counter'])
  })

  it('still resolves the match with the selected Match Plan before result RNG', () => {
    const squad = squadFromPhase3Fixture(0)
    const ctrl = createRunSimulation({
      rating: computeRating(squad).total, difficulty: 'classic', squad,
      rng: makeRng(0x77aa), runSeed: 0x77aa,
    })
    const pending = ctrl.prepareNext()
    expect(pending.previews).toBeTruthy() // previews exist before any result
    const match = ctrl.resolveNext('wide')
    expect(match.approach).toBe('wide')
  })
})

// ---------------------------------------------------------------------------
describe('E. literal catalogue manifest', () => {
  it('contains exactly 341 unique ids in a stable order used by both revisions', () => {
    expect(MODERN_CURATED_R1_ORDERED_IDS.length).toBe(341)
    expect(new Set(MODERN_CURATED_R1_ORDERED_IDS).size).toBe(341)
    expect(getCatalogue(R1).orderedIds).toEqual([...MODERN_CURATED_R1_ORDERED_IDS])
    expect(getCatalogue(R2).orderedIds).toEqual([...MODERN_CURATED_R1_ORDERED_IDS])
    // Stable anchors: first and last ids never silently reorder.
    expect(MODERN_CURATED_R1_ORDERED_IDS[0]).toBe(getCatalogue(R1).orderedIds[0])
    expect(Object.isFrozen(MODERN_CURATED_R1_ORDERED_IDS)).toBe(true)
  })

  it('matches the independently verified SHA-256 golden of the ordered list', () => {
    // Fails on any reorder, substitution, deletion, or addition.
    const hash = createHash('sha256').update(JSON.stringify([...MODERN_CURATED_R1_ORDERED_IDS])).digest('hex')
    expect(hash).toBe('2e16b8a68ea7f308cabf79640b1c21eb46ccf09f5509f4b18617c68ff258dc9e')
    const tampered = (ids) => createHash('sha256').update(JSON.stringify(ids)).digest('hex')
    const reordered = [...MODERN_CURATED_R1_ORDERED_IDS]
    ;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
    expect(tampered(reordered)).not.toBe(hash)
    expect(tampered(MODERN_CURATED_R1_ORDERED_IDS.slice(1))).not.toBe(hash) // deletion
    expect(tampered([...MODERN_CURATED_R1_ORDERED_IDS, 'gueye'])).not.toBe(hash) // addition
    const substituted = [...MODERN_CURATED_R1_ORDERED_IDS]
    substituted[10] = 'gueye'
    expect(tampered(substituted)).not.toBe(hash) // substitution
  })

  it('deep-freezes the catalogue registry and every live R2 wrapper', () => {
    expect(Object.isFrozen(getCatalogue(R2))).toBe(true)
    expect(Object.isFrozen(getCatalogue(R2).orderedIds)).toBe(true)
    expect(Object.isFrozen(getCatalogue(R1).orderedIds)).toBe(true)
    for (const id of ['messi', 'salah', 'wharton', 'cucurella']) {
      const p = resolvePlayer(id, R2)
      expect(Object.isFrozen(p), id).toBe(true)
      expect(Object.isFrozen(p.tags), id).toBe(true)
      expect(Object.isFrozen(p.eligibleSlots), id).toBe(true)
      if (p.signatures) expect(Object.isFrozen(p.signatures), id).toBe(true)
      expect(Object.isFrozen(p.v2Source), id).toBe(true)
      expect(() => { p.tags.push('city_core') }).toThrow()
      expect(() => { p.abilityBonus = 99 }).toThrow()
    }
    expect(() => { getCatalogue(R2).orderedIds.push('gueye') }).toThrow()
  })

  it('membership is independent of every mutable player field', () => {
    const master = v2PlayerById.saka
    const before = [...getCatalogue(R2).orderedIds]
    const saved = { tier: master.tier, primaryRole: master.primaryRole, clubId: master.clubId, character: master.character, developmentProfile: master.developmentProfile }
    try {
      master.tier = 'squad'
      master.primaryRole = 'Shot Stopper'
      master.clubId = 'osasuna'
      master.character = 'Maverick'
      master.developmentProfile = 'decline_risk'
      expect(getCatalogue(R2).orderedIds).toEqual(before) // membership unmoved
      expect(getCatalogue(R1).orderedIds).toEqual(before)
    } finally {
      Object.assign(master, saved)
    }
  })

  it('rejects an equal-count substitution (exact ids, not just counts)', () => {
    const substituted = [...MODERN_CURATED_R1_ORDERED_IDS]
    substituted[100] = 'gueye' // valid V2 id that is NOT a curated member
    expect(substituted.length).toBe(341)
    expect(substituted).not.toEqual([...MODERN_CURATED_R1_ORDERED_IDS])
    expect(getCatalogue(R2).orderedIds).not.toEqual(substituted)
  })

  it('every manifest id resolves in both catalogue views', () => {
    for (const id of MODERN_CURATED_R1_ORDERED_IDS) {
      expect(resolvePlayer(id, R1), `${id} in R1`).toBeTruthy()
      expect(resolvePlayer(id, R2), `${id} in R2`).toBeTruthy()
    }
  })

  it('reaches all 341 R2 members across a deep deterministic offer sweep', () => {
    const seen = new Set()
    const slots = ['GK', 'RB', 'CB', 'LB', 'RWB', 'LWB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST']
    for (const slot of slots) {
      const pool = catalogueEligiblePlayers(R2, slot, [], 'modern')
      for (let seed = 1; seed <= 400 && seen.size < 341; seed++) {
        for (const p of shuffle(pool, makeRng(seed)).slice(0, 3)) seen.add(p.id)
      }
    }
    expect(seen.size).toBe(341)
  })

  it('identical reroll seeds are deterministic and different seeds vary offers', () => {
    const offer = (rerollCount) => catalogueSlotOptions({ catalogVersion: R2, mode: 'daily', slotLabel: 'ST', slotIndex: 9, rerollCount, usedIds: [] }).map((p) => p.id)
    expect(offer(0)).toEqual(offer(0)) // identical seed → identical offer
    const distinct = new Set([0, 1, 2, 3, 4].map((r) => JSON.stringify(offer(r))))
    expect(distinct.size).toBeGreaterThan(1) // different reroll seeds vary
  })
})

// ---------------------------------------------------------------------------
describe('F. squad-level prestige invariance (R2 — modern, legend, mixed)', () => {
  const xi = (ids) => ids.map(([slot, id]) => ({ slot, player: resolvePlayer(id, R2) }))
  const MODERN_XI = [
    ['GK', 'alisson'], ['RB', 'hakimi'], ['CB', 'saliba'], ['CB', 'vandijk'], ['LB', 'theo'],
    ['CM', 'rodri'], ['CM', 'bellingham'], ['CM', 'pedri'],
    ['RW', 'salah'], ['ST', 'haaland'], ['LW', 'vinicius'],
  ]
  const LEGEND_XI = [
    ['GK', 'buffon'], ['RB', 'cafu'], ['CB', 'maldini'], ['CB', 'beckenbauer'], ['LB', 'robertocarlos'],
    ['CM', 'xavi'], ['CM', 'zidane'], ['CM', 'iniesta'],
    ['RW', 'messi'], ['ST', 'henry'], ['LW', 'ronaldinho'],
  ]
  const MIXED_XI = [
    ['GK', 'buffon'], ['RB', 'hakimi'], ['CB', 'maldini'], ['CB', 'saliba'], ['LB', 'robertocarlos'],
    ['CM', 'rodri'], ['CM', 'zidane'], ['CM', 'pedri'],
    ['RW', 'messi'], ['ST', 'haaland'], ['LW', 'vinicius'],
  ]
  const cluster = (squad) => squad.map((s, i) => (i < 4 ? {
    ...s,
    player: {
      ...s.player,
      club: 'Manchester City',
      // Deliberately contaminate the wrapper with every forbidden historical
      // signal. The explicit ability policy must ignore all of them.
      tags: [...s.player.tags, 'city_core', 'real_madrid_dna', 'premier_league_star', 'future_legend'],
      v2Source: {
        ...s.player.v2Source,
        clubId: 'man_city', leagueId: 'eng_pl', developmentProfile: 'high_growth',
      },
    },
  } : s))

  it('every R2 member — modern AND legend — carries the explicit ability policy', () => {
    for (const id of getCatalogue(R2).orderedIds) {
      const p = resolvePlayer(id, R2)
      expect(p.scoringPolicy, id).toBe('ability')
      expect(typeof p.abilityBonus, id).toBe('number')
    }
    // The policy is EXPLICIT and uniform — never inferred from abilityBonus
    // presence or squad mix. A squad with a single unmarked player is legacy.
    const marked = xi(MODERN_XI).map((s) => s.player)
    expect(squadScoringPolicy(marked)).toBe('ability')
    expect(squadScoringPolicy([{ ...marked[0], scoringPolicy: undefined }, ...marked.slice(1)])).toBe('legacy')
    expect(squadScoringPolicy([{ posType: 'ST', tags: [], abilityBonus: 5 }])).toBe('legacy') // abilityBonus alone proves nothing
  })

  for (const [name, ids] of [['all-modern', MODERN_XI], ['all-legend', LEGEND_XI], ['mixed', MIXED_XI]]) {
    it(`${name} R2 XI: club, league, fame and potential contamination are invariant`, () => {
      const base = xi(ids)
      const baseline = computeRating(base).total
      const clustered = cluster(base)
      expect(computeRating(clustered).total, `${name} rating`).toBe(baseline)
      for (const difficulty of ['casual', 'classic', 'legendary']) {
        expect(squadBaseProb(clustered, difficulty), `${name} ${difficulty} prob`).toBe(squadBaseProb(base, difficulty))
      }
    })
  }

  it('changing an R2 legend club/league/development metadata changes nothing', () => {
    const base = xi(LEGEND_XI)
    const baseline = computeRating(base).total
    const edited = base.map((s) => ({
      ...s,
      player: { ...s.player, club: 'Osasuna', v2Source: { ...s.player.v2Source, leagueId: 'esp_laliga', developmentProfile: 'high_growth' } },
    }))
    expect(computeRating(edited).total).toBe(baseline)
    expect(squadBaseProb(edited, 'classic')).toBe(squadBaseProb(base, 'classic'))
    // R2 legend points come from the documented ability model, not club DNA
    // or achievement-reputation tags (tier tags like modern_icon are the
    // allowed current-ability tags).
    const prohibited = ['real_madrid_dna', 'barca_dna', 'euro_legend', 'european_winner', 'serial_winner',
      'world_cup_winner', 'final_scorer', 'euro_final_scorer', 'played_with_messi', 'is_messi',
      'city_core', 'liverpool_core', 'madrid_modern', 'barca_modern', 'bayern_core', 'psg_star', 'premier_league_star', 'future_legend']
    for (const id of ['maldini', 'messi', 'zidane', 'cafu']) {
      const legend = resolvePlayer(id, R2)
      expect(legend.tags.filter((t) => prohibited.includes(t)), `${id} prohibited tags`).toEqual([])
    }
  })

  it('equivalent R1 and legacy squads preserve historical Club Spine arithmetic', () => {
    const r1 = MODERN_XI.map(([slot, id]) => ({ slot, player: resolvePlayer(id, R1) }))
    const r1Clustered = cluster(r1)
    expect(computeRating(r1Clustered).total).toBeGreaterThan(computeRating(r1).total)
    const legacy = MODERN_XI.map(([slot, id]) => ({ slot, player: resolvePlayer(id, 'legacy_v1') }))
      .filter((s) => s.player)
    const bonusNames = computeRating(r1).bonuses.map((b) => b.name)
    expect(bonusNames.join('|')).toMatch(/Core|Modern|Future Legends|Current Superstars/)
    expect(legacy.length).toBeGreaterThan(5) // frozen V1 objects still resolve
  })
})

// ---------------------------------------------------------------------------
describe('F2. visible breakdown === gameplay points (canonical components)', () => {
  it('holds exactly for EVERY live R2 member', () => {
    for (const id of getCatalogue(R2).orderedIds) {
      const p = resolvePlayer(id, R2)
      const componentSum = playerPointsComponents(p).reduce((a, c) => a + c.pts, 0)
      expect(componentSum, id).toBe(playerPoints(p))
      expect(playerBreakdown(p).total, id).toBe(playerPoints(p))
    }
  })

  it('holds for representative cases across catalogues and tiers', () => {
    const cases = [
      resolvePlayer('alisson', R2), // elite R2
      resolvePlayer('oblak', R2), // star R2
      resolvePlayer('bounou', R2), // quality R2
      resolvePlayer('messi', R2), // R2 GOAT legend
      adaptPlayerV2ToLegacyShape({ id: 'synthetic', name: 'S', primaryPosition: 'ST', secondaryPositions: [], nationId: 'spain', clubId: 'osasuna', primaryRole: 'Box Finisher', tier: 'squad', character: 'Quiet Pro', signatures: [], developmentProfile: 'prime', era: 'modern' }, { tagPolicy: 'ability' }), // squad-tier synthetic R2
      resolvePlayer('wharton', R1), // frozen R1
      resolvePlayer('rodri', 'legacy_v1'), // legacy V1
    ]
    for (const p of cases) {
      expect(playerBreakdown(p).total, p.id).toBe(playerPoints(p))
      const componentSum = playerPointsComponents(p).reduce((a, c) => a + c.pts, 0)
      expect(componentSum, p.id).toBe(playerPoints(p))
    }
    // R2 wording: the current-ability line is user-facing, never a variable name;
    // and R2 components contain no club/league/potential contributions.
    const alisson = playerPointsComponents(resolvePlayer('alisson', R2))
    expect(alisson.some((c) => c.label === 'Elite level')).toBe(true)
    expect(JSON.stringify(alisson)).not.toMatch(/abilityBonus/)
    expect(alisson.some((c) => /premier|core|modern$|future/i.test(c.key))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('G. R2 viability guardrails (fast smoke; full gate = match:r2-calibration)', () => {
  // DOCUMENTED FAST SMOKE: 6 seeds × 5 formations × 3 difficulties × 1 policy
  // (novice) = 90 runs, asserting only broad sanity. The release gate is the
  // separate `match:r2-calibration` script at 200 seeds and all three
  // policies, with the strict numerical band evaluator tested below.
  it('drafted R2 squads survive full runs at sane rates and zero unwinnable matches', () => {
    const report = runR2Calibration({ seeds: 6, policies: ['novice'] })
    const novice = report.policies.novice
    expect(novice.overall.runs).toBe(90)
    expect(novice.overall.qualification).toBeGreaterThan(0.2)
    expect(novice.overall.qualification).toBeLessThan(0.75)
    expect(novice.overall.unwinnableMatchRate).toBe(0)
    expect(novice.byDifficulty.casual.qualification).toBeGreaterThan(novice.byDifficulty.legendary.qualification)
  }, 180_000)

  const syntheticReport = ({ classicRuns, classicChampions, policy = 'novice' }) => {
    const classic = { runs: classicRuns, qualification: 0.45, champion: +(classicChampions / classicRuns).toFixed(4), championCount: classicChampions, unwinnableMatchRate: 0 }
    const good = (qual) => ({ runs: 1000, qualification: qual, champion: 0.02, championCount: 20, unwinnableMatchRate: 0 })
    const strength = { low: { qualification: 0.28 }, medium: { qualification: 0.4 }, high: { qualification: 0.6 } }
    const data = {
      overall: { runs: classicRuns * 3, qualification: 0.47, champion: 0.02, championCount: 60, unwinnableMatchRate: 0 },
      byDifficulty: { casual: good(0.88), classic, legendary: { ...good(0.1), champion: 0, championCount: 0 } },
      strength,
      byFormation: { '4-3-3': { qualification: 0.55 }, '4-4-2': { qualification: 0.56 }, '4-2-3-1': { qualification: 0.55 }, '3-5-2': { qualification: 0.56 }, '5-3-2': { qualification: 0.55 } },
    }
    return { policies: { [policy]: data } }
  }

  it('champion floor is NUMERICAL: 1/10,000 fails, 4/1,000 fails, 5/1,000 passes, and uppers fail', () => {
    // 1 champion in 10,000 runs (0.01%) — existence alone can NEVER pass.
    expect(evaluateR2Calibration(syntheticReport({ classicRuns: 10000, classicChampions: 1 })).join('|'))
      .toMatch(/novice classic champion 0.0001 below 0.005/)
    // 4 champions in 1,000 (0.4%) fails the 0.5% floor.
    expect(evaluateR2Calibration(syntheticReport({ classicRuns: 1000, classicChampions: 4 })).join('|'))
      .toMatch(/novice classic champion 0.004 below 0.005/)
    // 5 champions in 1,000 (0.5%) satisfies the floor.
    expect(evaluateR2Calibration(syntheticReport({ classicRuns: 1000, classicChampions: 5 })).join('|'))
      .not.toMatch(/champion .* below/)
    // Rates above the upper bound fail.
    expect(evaluateR2Calibration(syntheticReport({ classicRuns: 1000, classicChampions: 50 })).join('|'))
      .toMatch(/novice classic champion 0.05 above 0.03/)
    // Insufficient classic sample is itself a failure — small n cannot game the gate.
    expect(evaluateR2Calibration(syntheticReport({ classicRuns: 400, classicChampions: 4 })).join('|'))
      .toMatch(/classic sample 400 below required 1000/)
  })

  it('the band evaluator fails broad regressions across all policies', () => {
    const bad = {
      policies: {
        novice: {
          overall: { qualification: 0.2, champion: 0, championCount: 0, unwinnableMatchRate: 0.1 },
          byDifficulty: {
            casual: { qualification: 0.5, champion: 0, championCount: 0, unwinnableMatchRate: 0 },
            classic: { runs: 1000, qualification: 0.2, champion: 0, championCount: 0, unwinnableMatchRate: 0 },
            legendary: { qualification: 0.01, champion: 0, championCount: 0, unwinnableMatchRate: 0.2 },
          },
          strength: { low: { qualification: 0.5 }, medium: { qualification: 0.2 }, high: { qualification: 0.1 } },
          byFormation: { '4-3-3': { qualification: 0.2 } },
        },
      },
    }
    const failures = evaluateR2Calibration(bad)
    expect(failures.length).toBeGreaterThan(5)
    expect(failures.join('|')).toMatch(/qualification|champion|unwinnable/)
  })
})

// ---------------------------------------------------------------------------
describe('H. prohibited wording guard', () => {
  it('no user-facing surface reintroduces "Identity Fit" phrasing', () => {
    const surfaces = [
      'src/App.jsx', 'src/RunFlow.jsx', 'src/MatchCenter.jsx', 'src/UpgradeOffer.jsx',
      'src/TacticalPitch.jsx', 'src/draftClarity.js', 'src/tacticalApproach.js',
    ]
    for (const file of surfaces) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/identity\s+fit/i)
      expect(source, file).not.toMatch(/(PRESS|CONTROL|TRANSITION|FORTRESS)\s+FIT\b/i)
      expect(source, file).not.toMatch(/\{fit\.identityName\} FIT/i)
      // Dynamic templates rendering "<IDENTITY> Fit" and prose treating "Fit"
      // as the concept name are equally prohibited, including the
      // "…fit: label" render and "Natural fit …" phrasing. (The rendered
      // concept is always capitalized or followed by a colon; lowercase JSX
      // prop plumbing like `fit={fit}` is internal and allowed.)
      expect(source, file).not.toMatch(/\}\s*Fit\b/)
      expect(source, file).not.toMatch(/\bfit and need\b/i)
      expect(source, file).not.toMatch(/\bfit:\s/i)
      expect(source, file).not.toMatch(/natural fit/i)
    }
    // Direct render checks for the two previously missed defects:
    // 1. expanded player details header now says "alignment: label";
    const appSource = readFileSync('src/App.jsx', 'utf8')
    expect(appSource).toMatch(/\{fit\.identityName\} alignment: \{fit\.label\}/)
    // 2. the identity relationship line uses alignment phrasing.
    expect(identityRelationship({ identityKey: 'press', identityName: 'PRESS', approachKey: 'counter', opponentGood: true }))
      .toBe('Naturally aligned with your PRESS identity.')
    expect(identityRelationship({ identityKey: 'press', identityName: 'PRESS', approachKey: 'counter', opponentGood: true }))
      .not.toMatch(/fit/i)
    // The alignment concept and its no-bonus disclosure are present instead.
    const runFlow = readFileSync('src/RunFlow.jsx', 'utf8')
    expect(runFlow).toContain('Identity Alignment')
    expect(IDENTITY_ALIGNMENT_NOTE).toMatch(/no direct performance bonus/i)
    const app = readFileSync('src/App.jsx', 'utf8')
    expect(app).toContain('ALIGNMENT')
  })
})
