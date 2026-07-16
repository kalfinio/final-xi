import { describe, expect, it } from 'vitest'
import { computeRating, createRunSimulation, makeRng } from './data'
import { developmentMatchEngineVersion } from './App'
import { buildM1ApproachPreviews } from './matchEngineM1'
import { M1_ARCHETYPE_KEYS, REPRESENTATIVE_OPPONENTS, runM1PlanAudit } from './matchEngineM1Calibration'
import {
  ACTIVE_ENGINE_VERSION,
  LEGACY_ENGINE_VERSION,
  M1_ENGINE_VERSION,
  selectEngineVersionForNewRun,
} from './matchEngineVersions'
import { squadFromPhase3Fixture } from './matchCalibration'
import { approachFeedback, approachMatchupPreviews } from './tacticalApproach'
import { buildSquadTacticalProfile } from './tacticalMatchup'

const squad = squadFromPhase3Fixture(0)

describe('M1 activation policy', () => {
  it('selects m1 for both new Random pools and legacy_v1 for both Daily pools', () => {
    expect(ACTIVE_ENGINE_VERSION).toBe(M1_ENGINE_VERSION)
    for (const pool of ['modern', 'legends']) {
      expect(selectEngineVersionForNewRun({ mode: 'random', pool })).toBe(M1_ENGINE_VERSION)
      expect(selectEngineVersionForNewRun({ mode: 'daily', pool })).toBe(LEGACY_ENGINE_VERSION)
      expect(developmentMatchEngineVersion({ mode: 'daily', pool }, '?engine=m1', true)).toBe(LEGACY_ENGINE_VERSION)
      expect(developmentMatchEngineVersion({ mode: 'daily', pool }, '?engine=m1', false)).toBe(LEGACY_ENGINE_VERSION)
    }
  })

  it('uses m1 by default and keeps one immutable engine for the controller lifetime', () => {
    const ctrl = createRunSimulation({
      rating: computeRating(squad).total,
      difficulty: 'classic',
      squad,
      rng: makeRng(0x1a2b3c4d),
      runSeed: 0x1a2b3c4d,
    })
    expect(ctrl.engineVersion).toBe(M1_ENGINE_VERSION)
    ctrl.prepareNext()
    expect(ctrl.resolveNext('balanced').engineVersion).toBe(M1_ENGINE_VERSION)
    expect(() => { ctrl.engineVersion = LEGACY_ENGINE_VERSION }).toThrow()
    ctrl.prepareNext()
    expect(ctrl.resolveNext('counter').engineVersion).toBe(M1_ENGINE_VERSION)
  })
})

describe('M1 Match Hub evidence', () => {
  it('keeps legacy previews byte-identical and overlays M1-only causal benefits and risks', () => {
    const profile = buildSquadTacticalProfile(squad)
    for (const archetype of M1_ARCHETYPE_KEYS) {
      const opponent = REPRESENTATIVE_OPPONENTS[archetype]
      const legacy = approachMatchupPreviews(profile, opponent)
      const frozen = JSON.stringify(legacy)
      const m1 = buildM1ApproachPreviews({ baseProfile: profile, opponent, legacyPreviews: legacy })
      expect(JSON.stringify(legacy)).toBe(frozen)
      for (const preview of Object.values(m1)) {
        expect(preview.engineVersion).toBe(M1_ENGINE_VERSION)
        expect(preview.m1Preview.archetype).toBe(archetype)
        expect(preview.m1Preview.benefit.length).toBeGreaterThan(20)
        expect(preview.m1Preview.risk.length).toBeGreaterThan(20)
        expect(preview.m1Preview.fit).not.toMatch(/\d+%/)
      }
    }
  })

  it('recommends plans that match the tuned archetype evidence', () => {
    const profile = buildSquadTacticalProfile(squad)
    const recommended = (archetype) => {
      const opponent = REPRESENTATIVE_OPPONENTS[archetype]
      const previews = buildM1ApproachPreviews({
        baseProfile: profile,
        opponent,
        legacyPreviews: approachMatchupPreviews(profile, opponent),
      })
      return Object.entries(previews).filter(([, preview]) => preview.m1Preview.recommended).map(([approach]) => approach)
    }
    expect(recommended('pressing')).toContain('counter')
    expect(recommended('attacking')).toContain('counter')
    expect(recommended('defensive')).toContain('wide')
    expect(recommended('underdog')).toContain('wide')
    expect(recommended('technical')).toContain('control')
  })

  it('keeps full-time feedback tied to causal route and downside evidence', () => {
    const detail = (causalSummary, possession = 55) => ({ finalStats: { home: { possession, shots: 8, bigChances: 2 } }, metadata: { causalSummary } })
    const base = { chances: { us: 5, opp: 3 }, opponent: { archetype: 'elite' } }
    expect(approachFeedback({
      approach: 'counter',
      detail: detail({ ...base, routeShares: { home: { counterattack: 0.3, direct_attack: 0.12, pressing_recovery: 0.05 } }, plan: { influencedEvents: 4, downsideMetric: 1 } }, 42),
    })).toMatch(/fast, direct attacks/i)
    expect(approachFeedback({
      approach: 'counter',
      detail: detail({ ...base, routeShares: { home: { counterattack: 0.08, direct_attack: 0.04, pressing_recovery: 0.03 } }, plan: { influencedEvents: 2, downsideMetric: 3 } }, 42),
    })).toMatch(/little usable transition space/i)
    expect(approachFeedback({
      approach: 'control',
      detail: detail({ ...base, routeShares: { home: { central_buildup: 0.35, one_two: 0.12, switch_of_play: 0.08 } }, plan: { influencedEvents: 5, downsideMetric: 2 } }, 63),
    })).toMatch(/sterile possession/i)
    expect(approachFeedback({
      approach: 'wide',
      detail: detail({ ...base, routeShares: { home: { wide_overlap: 0.2, cross: 0.15, cutback: 0.1 } }, plan: { influencedEvents: 4, downsideMetric: 2 } }),
    })).toMatch(/overlaps and deliveries/i)
  })
})

describe('M1 fast plan-balance regression', () => {
  it('keeps every plan contextually viable without collapsing causal identities', () => {
    const report = runM1PlanAudit({ samplesPerCell: 160 })
    expect(report.failures).toEqual([])
    expect(report.viableCounts.counter).toBeGreaterThan(0)
    expect(report.viableCounts.control).toBeGreaterThan(0)
    expect(report.viableCounts.wide).toBeGreaterThan(0)
    expect(report.viableCounts.balanced).toBeGreaterThan(0)
    expect(report.bestCounts.control).toBeLessThan(11)
    expect(Object.values(report.cells).some((cells) => cells.pressing.viable.includes('counter') || cells.attacking.viable.includes('counter'))).toBe(true)
    expect(Object.values(report.cells).some((cells) => !cells.defensive.viable.includes('counter') || !cells.underdog.viable.includes('counter'))).toBe(true)

    const squads = {
      low: squadFromPhase3Fixture(11),
      medium: squadFromPhase3Fixture(1),
      high: squadFromPhase3Fixture(0),
    }
    for (const [strength, auditSquad] of Object.entries(squads)) {
      const profile = buildSquadTacticalProfile(auditSquad)
      for (const archetype of M1_ARCHETYPE_KEYS) {
        const opponent = REPRESENTATIVE_OPPONENTS[archetype]
        const previews = buildM1ApproachPreviews({
          baseProfile: profile,
          opponent,
          legacyPreviews: approachMatchupPreviews(profile, opponent),
        })
        const recommended = Object.entries(previews)
          .filter(([, preview]) => preview.m1Preview.recommended)
          .map(([approach]) => approach)
        // Match Hub advice is qualitative, not a promised ranking. Keep it
        // within a wider small-sample evidence band while the release audit
        // retains the strict 0.04 PPM viability definition.
        const cell = report.cells[strength][archetype]
        expect(recommended.some((approach) => cell.bestPoints - cell.metrics[approach].pointsPerMatch <= 0.12), `${strength}/${archetype}`).toBe(true)
      }
    }
  }, 30_000)
})
