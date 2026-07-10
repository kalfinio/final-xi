import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FORMATIONS, auraLabel, buildSimSeed, playerPoints } from './data'
import { getV2PlayerById } from './data/v2'
import { activationCatalogVersion, catalogueMembers, catalogueSlotOptions } from './data/v2/catalogues'
import {
  CLUB_IDENTITY_KEYS,
  IDENTITY_FIT_LABELS,
  acknowledgeDraftGuidance,
  analyzeSquadNeed,
  buildPickFeedback,
  calculateIdentityFit,
  hasSeenDraftGuidance,
  playerArchetype,
  playerFunctions,
  playerKeyStrengths,
  playerQualityTier,
  playerRoleSuitability,
  playerSignatures,
} from './draftClarity'

const activePlayers = [
  ...catalogueMembers('legacy_v1'),
  ...catalogueMembers('modern_mix_v2_curated'),
]
const curatedPlayers = catalogueMembers('modern_mix_v2_curated')
const playerWithRole = (role) => activePlayers.find((player) => player.role === role)
const selection = (player, slot = player.primaryPos) => ({ slot, player })

function uniquePlayersWithRoles(roles) {
  const used = new Set()
  return roles.map((role) => {
    const player = curatedPlayers.find((candidate) => candidate.role === role && !used.has(candidate.id))
    used.add(player.id)
    return player
  })
}

describe('draft clarity translation layer', () => {
  it('keeps internal Points unchanged without a fake 0-99 conversion', () => {
    const summary = Object.fromEntries(['legacy_v1', 'modern_mix_v2_curated'].map((catalogue) => {
      const values = catalogueMembers(catalogue).map(playerPoints).sort((a, b) => a - b)
      const q = (fraction) => values[Math.floor((values.length - 1) * fraction)]
      return [catalogue, { min: values[0], q25: q(0.25), median: q(0.5), q75: q(0.75), max: values[values.length - 1] }]
    }))
    expect(summary).toEqual({
      legacy_v1: { min: 8, q25: 11, median: 13, q75: 16, max: 40 },
      modern_mix_v2_curated: { min: 6, q25: 11, median: 13, q75: 15, max: 40 },
    })
  })

  it('derives every active player quality label from real aura or tier data', () => {
    for (const player of activePlayers) {
      const quality = playerQualityTier(player)
      const aura = auraLabel(player)
      const profile = getV2PlayerById(player.id)
      expect(quality.label, player.id).not.toBe('PROFILE UNAVAILABLE')
      if (aura === 'GOAT' || aura === 'GOAT Candidate') {
        expect(quality.source, player.id).toBe('aura')
        expect(quality.sourceValue, player.id).toBe(aura)
      } else {
        expect(['tier', 'legacy-tag', 'era'], player.id).toContain(quality.source)
        if (quality.source === 'tier') expect(quality.sourceValue, player.id).toBe(profile.tier)
        if (quality.source === 'legacy-tag') expect(player.tags, player.id).toContain(quality.sourceValue)
        if (quality.source === 'era') expect(player.era, player.id).toBe(quality.sourceValue)
      }
    }
  })

  it('does not present Points as a standalone football rating on draft cards', () => {
    const appSource = readFileSync('src/App.jsx', 'utf8')
    const cardSource = appSource.slice(appSource.indexOf('function PlayerCard'), appSource.indexOf('function DraftGuidance'))
    expect(appSource).not.toMatch(/player rating/i)
    expect(cardSource).toContain('Player Quality')
    expect(cardSource).not.toContain('playerPoints(')
    expect(appSource).toContain('Draft value')
  })

  it('translates archetypes deterministically', () => {
    for (const player of activePlayers) {
      expect(playerArchetype(player)).toBe(playerArchetype(player))
    }
  })

  it('has no unresolved archetypes for active catalogue players', () => {
    for (const player of activePlayers) {
      expect(playerArchetype(player), player.id).toMatch(/^[A-Z][A-Z -]+$/)
      expect(playerArchetype(player), player.id).not.toBe('VERSATILE PLAYER')
    }
  })

  it('returns exactly two deterministic, valid strengths for every active player', () => {
    for (const player of activePlayers) {
      const first = playerKeyStrengths(player)
      const second = playerKeyStrengths(player)
      expect(first, player.id).toEqual(second)
      expect(first, player.id).toHaveLength(2)
      expect(new Set(first).size, player.id).toBe(2)
      expect(first.every((strength) => typeof strength === 'string' && strength.length > 3), player.id).toBe(true)
    }
  })

  it('keeps the visible catalogue role in every suitability profile', () => {
    for (const player of activePlayers) {
      expect(playerRoleSuitability(player)[player.role], player.id).toBeTruthy()
    }
  })

  it('uses clear Recovery Pace wording for attacking players', () => {
    const attackers = ['henry', 'bale', 'etoo', 'torres', 'owen', 'weah']
      .map((id) => activePlayers.find((player) => player.id === id))
      .filter((player) => playerSignatures(player).includes('Recovery Pace'))
    expect(attackers.length).toBeGreaterThan(0)
    for (const player of attackers) {
      expect(playerKeyStrengths(player), player.id).toContain('Recovers ground quickly')
      expect(playerKeyStrengths(player), player.id).not.toContain('Recovers quickly')
    }
  })

  it('blocks mismatched V2 Signatures from legacy Role translations', () => {
    for (const id of ['rodri', 'vandijk', 'pedri', 'mbappe']) {
      const legacy = catalogueMembers('legacy_v1').find((player) => player.id === id)
      expect(getV2PlayerById(id).primaryRole, id).not.toBe(legacy.role)
      expect(playerSignatures(legacy), id).toEqual([])
      expect(playerKeyStrengths(legacy), id).toHaveLength(2)
    }
  })
})

describe('Club Identity fit', () => {
  it('is deterministic and valid across all four identities', () => {
    for (const identity of CLUB_IDENTITY_KEYS) {
      for (const player of activePlayers) {
        const first = calculateIdentityFit(player, identity)
        const second = calculateIdentityFit(player, identity)
        expect(first, `${identity}:${player.id}`).toEqual(second)
        expect(IDENTITY_FIT_LABELS).toContain(first.label)
        expect(Number.isFinite(first.score)).toBe(true)
      }
    }
  })

  it('only explains data that contributed to the fit score', () => {
    for (const identity of CLUB_IDENTITY_KEYS) {
      for (const player of activePlayers) {
        const fit = calculateIdentityFit(player, identity)
        const suitability = playerRoleSuitability(player)
        const signatures = playerSignatures(player)
        for (const contributor of fit.contributors) {
          if (contributor.source === 'primary-role') {
            expect(contributor.key).toBe(player.role)
            expect(contributor.level).toBe(3)
          }
          if (contributor.source === 'supporting-role') {
            expect(suitability[contributor.key]).toBe(2)
            expect(contributor.key).not.toBe(player.role)
          }
          if (contributor.source === 'signature') expect(signatures).toContain(contributor.key)
          expect(contributor.value).toBeGreaterThan(0)
        }
        expect(fit.score).toBe(Number(fit.contributors.reduce((sum, contributor) => sum + contributor.value, 0).toFixed(2)))
        expect(fit.why).toHaveLength(Math.min(3, fit.contributors.length))
      }
    }
  })

  it('produces a meaningful curated-catalogue spread with selective EXCELLENT labels', () => {
    for (const identity of CLUB_IDENTITY_KEYS) {
      const counts = Object.fromEntries(IDENTITY_FIT_LABELS.map((label) => [label, 0]))
      for (const player of curatedPlayers) counts[calculateIdentityFit(player, identity).label]++
      for (const label of IDENTITY_FIT_LABELS) expect(counts[label], `${identity}:${label}`).toBeGreaterThan(0)
      expect(counts.EXCELLENT / curatedPlayers.length, identity).toBeLessThan(0.35)
      expect((counts.EXCELLENT + counts.GOOD) / curatedPlayers.length, identity).toBeLessThan(0.7)
      if (identity === 'press' || identity === 'transition') expect(counts.WEAK, identity).toBeGreaterThan(0)
    }
  })

  it('does not let Club Identity change Daily offers or simulation seeds', () => {
    const offerArgs = { catalogVersion: 'legacy_v1', mode: 'daily', slotLabel: 'CM', slotIndex: 5, rerollCount: 2, usedIds: [], pool: 'modern' }
    const controlOffer = catalogueSlotOptions({ ...offerArgs, clubIdentity: 'control' }).map((player) => player.id)
    const pressOffer = catalogueSlotOptions({ ...offerArgs, clubIdentity: 'press' }).map((player) => player.id)
    expect(controlOffer).toEqual(pressOffer)

    const seedArgs = { dateKey: '2026-07-10', formation: '4-3-3', ids: ['a', 'b'], slots: ['GK', 'ST'], difficulty: 'classic', pool: 'modern', rerollsUsed: 1 }
    expect(buildSimSeed({ ...seedArgs, clubIdentity: 'control' })).toBe(buildSimSeed({ ...seedArgs, clubIdentity: 'transition' }))
    expect(activationCatalogVersion({ mode: 'random', pool: 'modern', clubIdentity: 'fortress' })).toBe('modern_mix_v2_curated')
  })
})

describe('contextual Squad Need', () => {
  const formationSlots = FORMATIONS['4-3-3'].slots

  it('never makes a Squad Need claim in the first four picks', () => {
    const candidate = playerWithRole('Final Passer')
    const squad = [playerWithRole('Shot Stopper'), playerWithRole('Defensive Leader')].map(selection)
    expect(analyzeSquadNeed({ squad, candidate, pickIndex: 2, formationSlots })).toBeNull()
  })

  it('a realistic GK-inclusive squad can still lack midfield defensive protection', () => {
    const candidate = playerWithRole('Defensive Shield')
    const drafted = uniquePlayersWithRoles([
      'Shot Stopper', 'Attacking Fullback', 'Defensive Leader', 'Defensive Leader',
      'Ball-Playing Defender', 'Balanced Fullback', 'Tempo Controller', 'Final Passer',
    ])
    const squad = drafted.map(selection)
    expect(playerFunctions(drafted[0])).not.toContain('midfield-protection')
    expect(new Set(drafted.flatMap(playerFunctions)).has('midfield-protection')).toBe(false)
    const need = analyzeSquadNeed({ squad, candidate, pickIndex: 8, formationSlots: FORMATIONS['5-3-2'].slots })
    expect(need).toEqual({ kind: 'weakness', label: 'FILLS A WEAKNESS', detail: 'DEFENSIVE PROTECTION', source: 'midfield-protection' })
  })

  it('does not claim missing defensive protection when a Ball Winner already supplies it', () => {
    const candidate = playerWithRole('Defensive Shield')
    const drafted = uniquePlayersWithRoles([
      'Shot Stopper', 'Attacking Fullback', 'Defensive Leader', 'Defensive Leader',
      'Ball-Playing Defender', 'Balanced Fullback', 'Tempo Controller', 'Ball Winner',
    ])
    const need = analyzeSquadNeed({ squad: drafted.map(selection), candidate, pickIndex: 8, formationSlots: FORMATIONS['5-3-2'].slots })
    expect(need?.source).not.toBe('midfield-protection')
  })

  it('role-covered warnings require two matching profiles already selected', () => {
    const candidate = playerWithRole('Tempo Controller')
    const controllers = activePlayers.filter((player) => playerArchetype(player) === playerArchetype(candidate)).slice(0, 2)
    const filler = ['Shot Stopper', 'Defensive Leader'].map(playerWithRole)
    const squad = [...controllers, ...filler].map(selection)
    const need = analyzeSquadNeed({ squad, candidate, pickIndex: 5, formationSlots })
    expect(need?.kind).toBe('covered')
    expect(need?.source).toBe(playerArchetype(candidate))
  })

  it('pick feedback contains no duplicated recommendations', () => {
    const player = playerWithRole('Defensive Shield')
    const squad = ['Tempo Controller', 'Final Passer', 'Inside Forward', 'Box Finisher'].map(playerWithRole).map(selection)
    const feedback = buildPickFeedback({ player, identityKey: 'control', squad, pickIndex: 5, formationSlots })
    expect(new Set(feedback.positives).size).toBe(feedback.positives.length)
    expect(feedback.positives.length).toBeLessThanOrEqual(2)
  })
})

describe('first-run draft guidance persistence', () => {
  function memoryStorage() {
    const values = new Map()
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
  }

  it('does not repeat after acknowledgement', () => {
    const storage = memoryStorage()
    expect(hasSeenDraftGuidance(storage)).toBe(false)
    expect(acknowledgeDraftGuidance(storage)).toBe(true)
    expect(hasSeenDraftGuidance(storage)).toBe(true)
  })
})
