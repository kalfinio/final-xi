import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  FORMATIONS, combineSeed, makeRng, playerBreakdown, playerPoints, playerPointsComponents,
  r2EffectiveStrength, R2_STRENGTH_OFFSET, R2_STRENGTH_PIVOT,
  R2_STRENGTH_TOP_PIVOT, R2_STRENGTH_MID_SLOPE, R2_STRENGTH_TOP_SLOPE,
  shuffle, squadStrengthBreakdown,
} from './data'
import {
  BonusesScreen, DraftGuidance, HowToPlay, PlayerCard, PlayerDetails,
} from './App'
import { MatchHub } from './RunFlow'
import { adaptPlayerV2ToLegacyShape } from './data/v2/adapter'
import {
  CATALOGUES, catalogueEligiblePlayers, catalogueMembers, resolvePlayer,
} from './data/v2/catalogues'
import {
  analyzeSquadNeed, calculateIdentityFit, playerQualityTier,
} from './draftClarity'
import {
  draftR2Squad, observedChampionGateFailures, r2CalibrationMatchSeed,
  reasonableR2DraftScore, R2_REASONABLE_ALIGNMENT_WEIGHT, R2_REASONABLE_NEED_WEIGHT,
  R2_REASONABLE_QUALITY_BAND, R2_VIABILITY_BANDS,
} from './r2Calibration'

const R1 = 'modern_mix_v2_curated'
const R2 = 'modern_mix_v2_curated_r2'
const R2_XI_IDS = [
  ['GK', 'alisson'], ['RB', 'hakimi'], ['CB', 'saliba'], ['CB', 'vandijk'], ['LB', 'theo'],
  ['CM', 'rodri'], ['CM', 'bellingham'], ['CM', 'pedri'],
  ['RW', 'salah'], ['ST', 'haaland'], ['LW', 'vinicius'],
]
const xi = (catalogue, ids = R2_XI_IDS) => ids.map(([slot, id]) => ({ slot, player: resolvePlayer(id, catalogue) }))

describe('R2 explicit canonical player scoring', () => {
  it('branches on scoringPolicy and exposes no prestige/tag arithmetic for all 341 members', () => {
    const players = catalogueMembers(R2)
    expect(players).toHaveLength(341)
    for (const player of players) {
      const components = playerPointsComponents(player)
      expect(components.reduce((sum, component) => sum + component.pts, 0), player.id).toBe(playerPoints(player))
      expect(playerBreakdown(player).total, player.id).toBe(playerPoints(player))
      expect(components.map((component) => component.key), player.id).toContain('current-ability')
      expect(components.every((component) => ['base', 'current-ability', 'big-stage'].includes(component.key)), player.id).toBe(true)
      expect(JSON.stringify(components), player.id).not.toMatch(/club|league|premier|core|future|icon|superstar|reputation/i)
    }
  })

  it('covers elite, star, quality, squad and GOAT/legend wording with exact parity', () => {
    const representatives = ['alisson', 'oblak', 'bounou', 'messi'].map((id) => resolvePlayer(id, R2))
    representatives.push(adaptPlayerV2ToLegacyShape({
      id: 'synthetic-squad', name: 'Synthetic Squad', primaryPosition: 'ST', secondaryPositions: [],
      nationId: 'spain', clubId: 'osasuna', primaryRole: 'Box Finisher', tier: 'squad',
      character: 'Quiet Pro', signatures: [], developmentProfile: 'prime', era: 'modern',
    }, { tagPolicy: 'ability' }))
    for (const player of representatives) {
      expect(playerPointsComponents(player).reduce((sum, component) => sum + component.pts, 0)).toBe(playerPoints(player))
    }
    expect(playerPointsComponents(resolvePlayer('alisson', R2)).map((component) => component.label)).toContain('Elite level')
    expect(playerPointsComponents(resolvePlayer('oblak', R2)).map((component) => component.label)).toContain('Star level')
    expect(playerPointsComponents(resolvePlayer('bounou', R2)).map((component) => component.label)).toContain('Proven level')
    expect(playerPointsComponents(resolvePlayer('messi', R2)).map((component) => component.label)).toContain('All-time-great level')
    expect(playerPointsComponents(representatives.at(-1)).map((component) => component.label)).toContain('Squad level')
  })

  it('never infers the policy from abilityBonus', () => {
    const r2 = resolvePlayer('alisson', R2)
    const markedWithoutValue = { ...r2, abilityBonus: undefined }
    expect(playerPointsComponents(markedWithoutValue).map((component) => component.key)).toEqual(['base', 'current-ability'])
    const unmarkedWithValue = { ...r2, scoringPolicy: undefined, abilityBonus: 999 }
    expect(playerPointsComponents(unmarkedWithValue).map((component) => component.key)).not.toContain('current-ability')
    expect(playerPoints(unmarkedWithValue)).not.toBe(999 + 8)
  })

  it('retains historical component arithmetic for frozen R1 and legacy_v1', () => {
    for (const player of [resolvePlayer('wharton', R1), resolvePlayer('rodri', 'legacy_v1')]) {
      const components = playerPointsComponents(player)
      expect(components.some((component) => component.key.startsWith('tag:'))).toBe(true)
      expect(components.reduce((sum, component) => sum + component.pts, 0)).toBe(playerPoints(player))
    }
  })
})

describe('R2 strength compression contract and disclosure', () => {
  it('implements the exact continuous monotonic schedule at every required boundary', () => {
    // Independent re-implementation of the DOCUMENTED three-segment schedule
    // (slope 1 → mid slope → top slope, one constant offset). If the shipped
    // function ever diverges from the documentation, this fails.
    const expected = (raw) => {
      if (raw <= R2_STRENGTH_PIVOT) return raw - R2_STRENGTH_OFFSET
      if (raw <= R2_STRENGTH_TOP_PIVOT) {
        return R2_STRENGTH_PIVOT + R2_STRENGTH_MID_SLOPE * (raw - R2_STRENGTH_PIVOT) - R2_STRENGTH_OFFSET
      }
      const atTopPivot = R2_STRENGTH_PIVOT + R2_STRENGTH_MID_SLOPE * (R2_STRENGTH_TOP_PIVOT - R2_STRENGTH_PIVOT)
      return atTopPivot + R2_STRENGTH_TOP_SLOPE * (raw - R2_STRENGTH_TOP_PIVOT) - R2_STRENGTH_OFFSET
    }
    const probes = [
      -100, 0, 1,
      R2_STRENGTH_PIVOT - 1, R2_STRENGTH_PIVOT - Number.EPSILON, R2_STRENGTH_PIVOT,
      R2_STRENGTH_PIVOT + Number.EPSILON, R2_STRENGTH_PIVOT + 1,
      R2_STRENGTH_TOP_PIVOT - 1, R2_STRENGTH_TOP_PIVOT - Number.EPSILON, R2_STRENGTH_TOP_PIVOT,
      R2_STRENGTH_TOP_PIVOT + Number.EPSILON, R2_STRENGTH_TOP_PIVOT + 1,
      300, 500,
    ]
    for (const raw of probes) expect(r2EffectiveStrength(raw)).toBeCloseTo(expected(raw), 10)

    // Every segment slope must stay below 1 (it is a compression throughout)
    // and strictly above 0 (strict monotonicity).
    for (const slope of [R2_STRENGTH_MID_SLOPE, R2_STRENGTH_TOP_SLOPE]) {
      expect(slope).toBeGreaterThan(0)
      expect(slope).toBeLessThan(1)
    }
    // Continuity at both breakpoints.
    const tiny = 1e-9
    expect(r2EffectiveStrength(R2_STRENGTH_PIVOT - tiny)).toBeCloseTo(r2EffectiveStrength(R2_STRENGTH_PIVOT), 6)
    expect(r2EffectiveStrength(R2_STRENGTH_TOP_PIVOT - tiny)).toBeCloseTo(r2EffectiveStrength(R2_STRENGTH_TOP_PIVOT), 6)

    let previous = r2EffectiveStrength(-100)
    for (let raw = -99.75; raw <= 600; raw += 0.25) {
      const effective = r2EffectiveStrength(raw)
      expect(effective).toBeGreaterThan(previous)
      previous = effective
    }
  })

  it('is R2-only and reports raw plus effective strength, including a GOAT-heavy XI', () => {
    const r2 = squadStrengthBreakdown(xi(R2))
    const r1 = squadStrengthBreakdown(xi(R1))
    expect(r2.policy).toBe('ability')
    expect(r2.effectiveStrength).toBe(r2EffectiveStrength(r2.rawStrength))
    expect(r1.policy).toBe('legacy')
    expect(r1.effectiveStrength).toBe(r1.rawStrength)

    const goatHeavy = xi(R2, [
      ['GK', 'buffon'], ['RB', 'cafu'], ['CB', 'beckenbauer'], ['CB', 'maldini'], ['LB', 'robertocarlos'],
      ['CM', 'maradona'], ['CM', 'zidane'], ['CM', 'cruyff'],
      ['RW', 'messi'], ['ST', 'ronaldo'], ['LW', 'pele'],
    ])
    const goatStrength = squadStrengthBreakdown(goatHeavy)
    expect(goatStrength.rawStrength).toBeGreaterThan(R2_STRENGTH_PIVOT)
    expect(goatStrength.effectiveStrength).toBe(r2EffectiveStrength(goatStrength.rawStrength))
  })

  it('renders both R2 values and does not mislabel the legacy total as compressed strength', () => {
    const config = { mode: 'random', pool: 'modern', difficulty: 'classic', formation: '4-3-3', clubIdentity: 'press' }
    const r2Markup = renderToStaticMarkup(createElement(BonusesScreen, {
      squad: xi(R2), config, rerollsUsed: 0, onSimulate: () => {}, initialTeamName: 'R2 XI',
    }))
    expect(r2Markup).toContain('Raw Strength')
    expect(r2Markup).toContain('Effective Strength')
    expect(r2Markup).toMatch(/used by the engine&#x27;s win-probability curve/i)

    const r1Markup = renderToStaticMarkup(createElement(BonusesScreen, {
      squad: xi(R1), config, rerollsUsed: 0, onSimulate: () => {}, initialTeamName: 'R1 XI',
    }))
    expect(r1Markup).not.toContain('Effective Strength')
    expect(r1Markup).not.toContain('Raw Strength')
    expect(r1Markup).toContain('Total')
  })
})

describe('three deterministic R2 draft policies', () => {
  it('pins the exact visible reasonable-policy formula, including current Squad Need', () => {
    const formationSlots = FORMATIONS['4-3-3'].slots
    const squad = xi(R2).slice(0, 8)
    const candidates = catalogueEligiblePlayers(R2, formationSlots[8], squad.map((selection) => selection.player.id), 'modern')
    const candidate = candidates.find((player) => analyzeSquadNeed({ squad, candidate: player, pickIndex: 8, formationSlots }))
    expect(candidate).toBeTruthy()
    const need = analyzeSquadNeed({ squad, candidate, pickIndex: 8, formationSlots })
    const qualityBand = R2_REASONABLE_QUALITY_BAND[playerQualityTier(candidate).label] || 2
    const alignment = R2_REASONABLE_ALIGNMENT_WEIGHT[calculateIdentityFit(candidate, 'press').label] || 0
    const expected = qualityBand * 3 + alignment + R2_REASONABLE_NEED_WEIGHT[need.kind]
    expect(reasonableR2DraftScore({ player: candidate, slot: formationSlots[8], identityKey: 'press', squad, pickIndex: 8, formationSlots })).toBe(expected)
    expect(reasonableR2DraftScore({ player: resolvePlayer('alisson', R2), slot: 'ST', identityKey: 'press', squad, pickIndex: 8, formationSlots })).toBe(Number.NEGATIVE_INFINITY)
  })

  it('uses first-display tie-breakers and identical offer seeds across policies', () => {
    const seed = 37
    const formation = '4-3-3'
    const slot = FORMATIONS[formation].slots[0]
    const displayed = shuffle(catalogueEligiblePlayers(R2, slot, [], 'modern'), makeRng(combineSeed(seed, 0))).slice(0, 3)
    expect(draftR2Squad({ seed, formation, policy: 'novice' })[0].player.id).toBe(displayed[0].id)
    const power = displayed.reduce((best, player) => (playerPoints(player) > playerPoints(best) ? player : best), displayed[0])
    expect(draftR2Squad({ seed, formation, policy: 'power' })[0].player.id).toBe(power.id)
    const reasonable = displayed.reduce((best, player) => (
      reasonableR2DraftScore({ player, slot, identityKey: 'press', squad: [], pickIndex: 0, formationSlots: FORMATIONS[formation].slots })
        > reasonableR2DraftScore({ player: best, slot, identityKey: 'press', squad: [], pickIndex: 0, formationSlots: FORMATIONS[formation].slots }) ? player : best
    ), displayed[0])
    // seed 37 maps to PRESS (37 % 4 = 1).
    expect(draftR2Squad({ seed, formation, policy: 'reasonable' })[0].player.id).toBe(reasonable.id)
    expect(r2CalibrationMatchSeed({ difficulty: 'classic', formation, seed }))
      .toBe(r2CalibrationMatchSeed({ difficulty: 'classic', formation, seed }))
  })

  it('enforces the observed numerical Classic champion floor and policy uppers', () => {
    for (const [policy, band] of Object.entries({
      novice: R2_VIABILITY_BANDS.novice.classicChampion,
      reasonable: R2_VIABILITY_BANDS.reasonable.classicChampion,
      power: R2_VIABILITY_BANDS.power.classicChampion,
    })) {
      expect(observedChampionGateFailures({ policy, runs: 10000, championCount: 1, lower: 0.005, upper: band[1] }).join('|')).toMatch(/below 0.005/)
      expect(observedChampionGateFailures({ policy, runs: 1000, championCount: 4, lower: 0.005, upper: band[1] }).join('|')).toMatch(/below 0.005/)
      expect(observedChampionGateFailures({ policy, runs: 1000, championCount: 5, lower: 0.005, upper: band[1] })).toEqual([])
      expect(observedChampionGateFailures({ policy, runs: 1000, championCount: Math.floor(band[1] * 1000) + 1, lower: 0.005, upper: band[1] }).join('|')).toMatch(/above/)
    }
  })
})

describe('direct Identity Alignment rendering coverage', () => {
  const forbidden = /identity\s+fit|(?:press|control|transition|fortress)\s+fit|natural\s+fit|fit\s+and\s+need|fit:\s/i

  it('renders How to Play, draft guidance, player cards and expanded details without prohibited wording', () => {
    const player = resolvePlayer('alisson', R2)
    const alignment = calculateIdentityFit(player, 'press')
    const markup = [
      renderToStaticMarkup(createElement(HowToPlay)),
      renderToStaticMarkup(createElement(DraftGuidance, { identityKey: 'press', onClose: () => {} })),
      renderToStaticMarkup(createElement(PlayerCard, { player, onPick: () => {}, slot: 'GK', identityKey: 'press', squadNeed: null })),
      renderToStaticMarkup(createElement(PlayerDetails, { player, slot: 'GK', fit: alignment, tradeoff: null })),
    ].join('\n')
    expect(markup).toContain('Identity Alignment')
    expect(markup).toContain('PRESS ALIGNMENT')
    expect(markup).toContain('PRESS alignment:')
    expect(markup).toContain('Elite level')
    expect(markup).not.toMatch(forbidden)
  })

  it('renders Selected Plan Analysis and keeps Daily/legacy free of M1 recommendation badges', () => {
    const legacyPreview = { overallLabel: 'Even', probabilityDelta: 0, keyAdvantage: { text: 'Keeps the shape compact.' }, keyRisk: { text: 'Offers less width.' } }
    const m1Preview = (score, recommended) => ({ ...legacyPreview, m1Preview: { score, recommended, benefit: 'Targets open space.', risk: 'Concedes territory.', read: 'Viable.' } })
    const baseProps = {
      teamName: 'Alignment XI', record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 }, matchNumber: 1,
      firstTime: false, squadProfile: {}, clubIdentityKey: 'press', upgrades: [], initialApproach: 'balanced',
      onApproachChange: () => {}, onWatch: () => {}, onQuick: () => {}, onSimAll: () => {},
    }
    const pending = {
      kind: 'league', matchNo: 1, leagueTotal: 8,
      opponentMeta: { name: 'Mersey Reds', archetype: 'pressing', strength: 88, style: 'pressing high' },
      previews: { balanced: m1Preview(1, true), control: m1Preview(0, false), wide: m1Preview(0, false), counter: m1Preview(0.5, false) },
    }
    const markup = renderToStaticMarkup(createElement(MatchHub, { ...baseProps, pending }))
    expect(markup).toContain('Selected Plan Analysis')
    expect(markup).toContain('Identity Alignment')
    expect(markup).not.toMatch(forbidden)

    const dailyMarkup = renderToStaticMarkup(createElement(MatchHub, {
      ...baseProps,
      pending: { ...pending, previews: { balanced: legacyPreview, control: legacyPreview, wide: legacyPreview, counter: legacyPreview } },
    }))
    expect(dailyMarkup).not.toContain('Recommended</span>')
    expect(dailyMarkup).not.toContain('Strong Matchup</span>')
    expect(dailyMarkup).not.toContain('Viable</span>')
    expect(dailyMarkup).not.toContain('Risky</span>')
  })
})

describe('selected Match Plan matchup wording regressions', () => {
  function renderPlan({ identityKey = 'control', approach = 'control', score, recommended, opponent = 'Eindhoven Lights' }) {
    const legacyPreview = { overallLabel: 'Even', probabilityDelta: 0, keyAdvantage: { text: 'Keeps the shape compact.' }, keyRisk: { text: 'Offers less width.' } }
    const preview = { ...legacyPreview, m1Preview: { score, recommended, benefit: 'Targets open space.', risk: 'Concedes territory.' } }
    return renderToStaticMarkup(createElement(MatchHub, {
      teamName: 'Wording XI', record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 }, matchNumber: 1,
      firstTime: false, squadProfile: {}, clubIdentityKey: identityKey, upgrades: [], initialApproach: approach,
      onApproachChange: () => {}, onWatch: () => {}, onQuick: () => {}, onSimAll: () => {},
      pending: {
        kind: 'league', matchNo: 1, leagueTotal: 8,
        opponentMeta: { name: opponent, archetype: 'pressing', strength: 88, style: 'pressing high' },
        previews: { balanced: legacyPreview, control: legacyPreview, wide: legacyPreview, counter: legacyPreview, [approach]: preview },
      },
    }))
  }

  it.each([
    { name: 'aligned + Recommended', score: 0.8, recommended: true, badge: 'Recommended', wording: 'Matches your CONTROL squad identity and is strongly suited to this opponent.' },
    { name: 'aligned + Strong, not recommended (Eindhoven regression)', score: 0.49, recommended: false, badge: 'Strong Matchup', wording: 'Matches your CONTROL squad identity and is a strong option for this opponent.' },
    { name: 'aligned + Viable, not recommended (Belgian regression)', identityKey: 'press', approach: 'counter', opponent: 'Belgian Royals', score: -0.07, recommended: false, badge: 'Viable', wording: 'Matches your PRESS squad identity and remains a viable option for this opponent.' },
    { name: 'aligned + Risky', score: -0.5, recommended: false, badge: 'Risky', wording: 'Matches your CONTROL squad identity, but may struggle against this opponent.' },
    { name: 'less aligned + Strong', approach: 'counter', score: 0.49, recommended: false, badge: 'Strong Matchup', wording: 'Less aligned with your CONTROL squad identity, but a strong option for this opponent.' },
    { name: 'less aligned + Viable', approach: 'counter', score: -0.07, recommended: false, badge: 'Viable', wording: 'Less aligned with your CONTROL squad identity, but still a viable approach here.' },
    { name: 'less aligned + Risky', approach: 'counter', score: -0.5, recommended: false, badge: 'Risky', wording: 'Less aligned with your CONTROL squad identity and a difficult matchup here.' },
    { name: 'less aligned + Recommended', approach: 'counter', score: 0.8, recommended: true, badge: 'Recommended', wording: 'Less aligned with your CONTROL squad identity, but strongly suited to this opponent.' },
  ])('$name', (scenario) => {
    const markup = renderPlan(scenario)
    expect(markup).toContain(`${scenario.badge}</span>`)
    expect(markup).toContain(scenario.wording)
    expect(markup).toContain('Identity Alignment: squad-style alignment only — no direct performance bonus.')
    if (scenario.score > -0.35) expect(markup).not.toMatch(/may struggle|difficult matchup here/i)
    else expect(markup).toMatch(/may struggle|difficult matchup here/i)
  })

  it.each(['control', 'balanced', 'counter'])('recommendation alone cannot change matchup quality for %s (natural/neutral/stretch)', (approach) => {
    // Include both exact existing tier boundaries and the reported failures.
    for (const score of [-0.5, -0.35, -0.349, -0.07, 0.349, 0.35, 0.49]) {
      for (const recommended of [true, false]) {
        const markup = renderPlan({ approach, score, recommended })
        const analysis = markup.split('Selected Plan Analysis')[1]
        expect(analysis).toBeTruthy()
        if (score >= 0.35) {
          expect(analysis).toMatch(/strongly suited|strong option/i)
          expect(analysis).not.toMatch(/may struggle|difficult matchup here/i)
        } else if (score > -0.35) {
          expect(analysis).toMatch(/viable option|viable approach/i)
          expect(analysis).not.toMatch(/may struggle|difficult matchup here|strongly suited/i)
        } else {
          expect(analysis).toMatch(/may struggle|difficult matchup here/i)
        }
      }
    }
  })
})

describe('deep immutability and developer-only artifact verifier', () => {
  it('deep-freezes the registry, ordered ids, every R2 wrapper and every nested versioned value', () => {
    expect(Object.isFrozen(CATALOGUES)).toBe(true)
    for (const catalogue of Object.values(CATALOGUES)) {
      expect(Object.isFrozen(catalogue)).toBe(true)
      expect(Object.isFrozen(catalogue.orderedIds)).toBe(true)
      if (catalogue.eras) expect(Object.isFrozen(catalogue.eras)).toBe(true)
    }
    for (const player of catalogueMembers(R2)) {
      expect(Object.isFrozen(player), player.id).toBe(true)
      expect(Object.isFrozen(player.tags), `${player.id}:tags`).toBe(true)
      expect(Object.isFrozen(player.eligibleSlots), `${player.id}:eligibleSlots`).toBe(true)
      if (player.signatures) expect(Object.isFrozen(player.signatures), `${player.id}:signatures`).toBe(true)
      expect(Object.isFrozen(player.v2Source), `${player.id}:source`).toBe(true)
      expect(Object.isFrozen(player.v2Source.secondaryPositions), `${player.id}:secondaryPositions`).toBe(true)
      expect(Object.isFrozen(player.v2Source.signatures), `${player.id}:sourceSignatures`).toBe(true)
      if (player.v2Source.roleSuitability) expect(Object.isFrozen(player.v2Source.roleSuitability), `${player.id}:roleSuitability`).toBe(true)
    }
  })

  it('rejects the active worktree as an artifact source and leaves no helper/output files behind', () => {
    const forbiddenFiles = ['gen-verify.mjs', 'r1-verify-snapshot.json', 'r1-verify-fixture.json']
    for (const file of forbiddenFiles) expect(existsSync(file)).toBe(false)
    const result = spawnSync(process.execPath, ['scripts/verify-r1-artifacts.mjs', '--source=.'], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/active working tree is never a valid source/i)
    for (const file of forbiddenFiles) expect(existsSync(file)).toBe(false)
  })

  it('keeps the developer verifier outside every production source import', () => {
    const runtimeFiles = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(full)
        else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) runtimeFiles.push(full)
      }
    }
    walk('src')
    for (const file of runtimeFiles) expect(readFileSync(file, 'utf8'), file).not.toContain('verify-r1-artifacts')
  })
})
