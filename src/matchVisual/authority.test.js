import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FORMATIONS, OPPONENTS, computeRating, createRunSimulation, makeRng } from '../data'
import { squadFromPhase3Fixture } from '../matchCalibration'
import { controlledM1Match } from '../matchEngineM1Calibration'
import m1Fixtures from '../matchEngineM1.fixture.json'
import historicalR1 from '../historicalR1Save.fixture.json'
import { catalogueEligiblePlayers } from '../data/v2/catalogues'
import { canonicalMatchSignature, createRunSnapshot, reconstructRun } from '../runPersistence'
import { buildUpgradeContext } from '../runUpgrades'
import { createCanonicalMatchView } from './adapter.js'
import { compileVisualProgram as compileProgram } from './compile.js'
import { VISUAL_V2_1, VISUAL_V2_2 } from './versions.js'
import { sampleVisualProgram } from './sample.js'
import { immutableCopy } from './immutable.js'

const squad = squadFromPhase3Fixture(m1Fixtures.squadFixtureRunIndex)
const opponentById = Object.fromEntries(OPPONENTS.map((opponent) => [opponent.id, opponent]))
const viewOf = (match, xi = squad, extra = {}) => createCanonicalMatchView({ match, squad: xi, formation: '4-3-3', canonicalSignature: canonicalMatchSignature(match, 0), ...extra })

function arbitraryVisualWork(match, xi = squad, visualEngineVersion = VISUAL_V2_1) {
  const compileVisualProgram = (view) => compileProgram(view, { visualEngineVersion })
  const view = viewOf(match, xi)
  const program = compileVisualProgram(view)
  for (const time of [50000, 10000, 40000, 20000, 0, program.durationMs, 500, 0, program.durationMs + 1000]) {
    sampleVisualProgram(program, time)
  }
  expect(compileVisualProgram(view)).toEqual(program)
  expect(compileVisualProgram(viewOf(JSON.parse(JSON.stringify(match)), xi))).toEqual(program)
  return program
}

describe.each([VISUAL_V2_1, VISUAL_V2_2])('canonical authority and historical signatures — %s', (visualEngineVersion) => {
  const compileVisualProgram = (view) => compileProgram(view, { visualEngineVersion })
  it.each(m1Fixtures.fixtures)('retains frozen signature $signature for $name before and after all visual operations', (fixture) => {
    const match = controlledM1Match({
      seed: fixture.seed, squad, opponent: opponentById[fixture.opponentId],
      approach: fixture.approach, kind: fixture.kind, round: fixture.round,
    })
    expect(canonicalMatchSignature(match, 0)).toBe(fixture.signature)
    const frozen = immutableCopy(match)
    const before = JSON.stringify(frozen)
    const program = arbitraryVisualWork(frozen, immutableCopy(squad), visualEngineVersion)
    expect(JSON.stringify(frozen)).toBe(before)
    expect(canonicalMatchSignature(frozen, 0)).toBe(fixture.signature)
    expect(program.canonicalSignature).toBe(fixture.signature)
    const ft = sampleVisualProgram(program, program.durationMs)
    expect(ft.score).toEqual({ us: match.gf, opp: match.ga })
    expect(ft.goals).toEqual(match.events)
    expect(ft.revealedCanonicalEvents).toEqual(match.causalEvents)
    expect(ft.result).toBe(match.result)
    expect(ft.penalties).toEqual(match.pens ?? null)
  })

  it.each([1, 42, 5349495])('consumes zero outer gameplay draws and preserves every future match for seed %s', (runSeed) => {
    const create = () => {
      const stream = makeRng(runSeed)
      const draws = []
      const rng = () => { const value = stream(); draws.push(value); return value }
      const ctrl = createRunSimulation({ rating: computeRating(squad).total, difficulty: 'classic', squad, rng, runSeed, engineVersion: 'm1' })
      return { ctrl, draws }
    }
    const watched = create(), instant = create()
    const plans = ['wide', 'control', 'counter', 'balanced']
    for (let index = 0; index < 4; index++) {
      watched.ctrl.prepareNext(); instant.ctrl.prepareNext()
      const match = watched.ctrl.resolveNext(plans[index])
      const other = instant.ctrl.resolveNext(plans[index])
      expect(match).toEqual(other)
      const count = watched.draws.length
      const signature = canonicalMatchSignature(match, index)
      const before = JSON.stringify(match)
      // Freeze actual controller-owned resolved objects too: downstream
      // progression may read these objects, but must not need to mutate them.
      const freezeInPlace = (value) => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
          Object.values(value).forEach(freezeInPlace); Object.freeze(value)
        }
      }
      freezeInPlace(match)
      const view = viewOf(match)
      expect(watched.draws.length).toBe(count)
      const program = compileVisualProgram(view)
      expect(watched.draws.length).toBe(count)
      sampleVisualProgram(program, 500)
      expect(watched.draws.length).toBe(count)
      // Nonchronological sampling is the seeking API.
      for (const time of [50000, 10000, 40000, 20000, program.durationMs, 0]) {
        sampleVisualProgram(program, time)
        expect(watched.draws.length).toBe(count)
      }
      expect(compileVisualProgram(view)).toEqual(program)
      expect(watched.draws.length).toBe(count)
      expect(watched.draws).toEqual(instant.draws)
      expect(JSON.stringify(match)).toBe(before)
      expect(canonicalMatchSignature(match, index)).toBe(signature)
    }
    watched.ctrl.finishRemaining('balanced'); instant.ctrl.finishRemaining('balanced')
    expect(watched.draws).toEqual(instant.draws)
    expect(watched.ctrl.matches).toEqual(instant.ctrl.matches)
    expect(watched.ctrl.matches.map(canonicalMatchSignature)).toEqual(instant.ctrl.matches.map(canonicalMatchSignature))
    expect(watched.ctrl.finish()).toEqual(instant.ctrl.finish())
  })

  it('reconstructs the frozen historical R1 save into the same visuals without altering its signatures', () => {
    const snapshot = immutableCopy(historicalR1.snapshot)
    const before = JSON.stringify(snapshot)
    const first = reconstructRun(snapshot)
    const refreshed = reconstructRun(JSON.parse(JSON.stringify(snapshot)))
    expect(first.ok).toBe(true)
    expect(refreshed.ok).toBe(true)
    expect(first.ctrl.matches.map(canonicalMatchSignature)).toEqual(snapshot.run.signatures.canonicalMatches)
    for (const [index, match] of first.ctrl.matches.entries()) {
      const inputs = { formation: first.config.formation, catalogVersion: first.catalogVersion, dbVersion: first.dbVersion, canonicalSignature: canonicalMatchSignature(match, index) }
      const a = compileVisualProgram(viewOf(match, first.squad, inputs))
      const b = compileVisualProgram(viewOf(refreshed.ctrl.matches[index], refreshed.squad, inputs))
      expect(a).toEqual(b)
      expect(sampleVisualProgram(a, 12345)).toEqual(sampleVisualProgram(b, 12345))
      expect(canonicalMatchSignature(match, index)).toBe(snapshot.run.signatures.canonicalMatches[index])
    }
    expect(JSON.stringify(snapshot)).toBe(before)
  })

  it('preserves R2 versioned players and same-time visual reconstruction through the actual save/resume boundary', () => {
    const catalogVersion = 'modern_mix_v2_curated_r2'
    const used = []
    const xi = FORMATIONS['4-3-3'].slots.map((slot) => {
      const player = catalogueEligiblePlayers(catalogVersion, slot, used, 'modern')[0]
      used.push(player.id)
      return { slot, player }
    })
    const runSeed = 555
    const ctrl = createRunSimulation({
      rating: computeRating(xi).total, difficulty: 'classic', squad: xi, rng: makeRng(runSeed), runSeed, engineVersion: 'm1',
      upgradeContextFor: (context, profile) => buildUpgradeContext([], context, profile),
    })
    ctrl.prepareNext(); const match = ctrl.resolveNext('wide')
    const snapshot = createRunSnapshot({
      engineVersion: 'm1', config: { formation: '4-3-3', mode: 'random', pool: 'modern', difficulty: 'classic' },
      catalogVersion, dbVersion: 'v2', runSeed, teamName: 'Test XI', squad: xi, rerollsUsed: 0,
      matches: ctrl.matches, upgradeState: { owned: [], offers: [] },
      checkpoint: { screen: 'watch', resolvedMatchCount: 1, currentMatchIndex: 0, selectedApproach: 'wide' },
    })
    const rec = reconstructRun(JSON.parse(JSON.stringify(snapshot)))
    expect(rec.ok).toBe(true)
    const originalView = viewOf(match, xi, { catalogVersion, dbVersion: 'v2' })
    const restoredView = viewOf(rec.currentMatch, rec.squad, { catalogVersion: rec.catalogVersion, dbVersion: rec.dbVersion })
    expect(originalView).toEqual(restoredView)
    expect(originalView.squad.every(({ player }) => player.scoringPolicy === 'ability')).toBe(true)
    const a = compileVisualProgram(originalView), b = compileVisualProgram(restoredView)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (const time of [0, 12345, a.durationMs]) expect(sampleVisualProgram(a, time)).toEqual(sampleVisualProgram(b, time))
    expect(canonicalMatchSignature(rec.currentMatch, 0)).toBe(snapshot.run.signatures.canonicalMatches[0])
    expect(JSON.stringify(snapshot)).not.toContain('visual_v2_1')
  })

  it('keeps runtime dependencies confined to presentation modules and pure seed utilities', () => {
    const directory = new URL('.', import.meta.url)
    for (const name of readdirSync(directory).filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))) {
      const source = readFileSync(new URL(name, directory), 'utf8')
      expect(source).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|localStorage|requestAnimationFrame/)
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
      for (const dependency of imports) expect(dependency.startsWith('./') || dependency === '../seedUtils.js').toBe(true)
    }
    for (const name of ['App.jsx', 'MatchCenter.jsx', 'RunFlow.jsx', 'matchEngineM1.js', 'runPersistence.js']) {
      expect(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')).not.toContain('matchVisual')
    }
  })

  it('reconciles all events and FT statistics across a varied real M1 sample', () => {
    const plans = ['balanced', 'control', 'wide', 'counter']
    const observedRoutes = new Set()
    const observedOutcomes = new Set()
    for (let seed = 1; seed <= 80; seed++) {
      const match = controlledM1Match({ seed, squad, approach: plans[seed % plans.length], opponent: OPPONENTS[seed % OPPONENTS.length] })
      const signature = canonicalMatchSignature(match, 0)
      const program = compileVisualProgram(viewOf(immutableCopy(match)))
      for (const item of program.revealSchedule) {
        observedRoutes.add(item.event.route)
        observedOutcomes.add(item.event.outcome)
        expect(sampleVisualProgram(program, item.atMs).score).toEqual(item.event.scoreAfter)
      }
      const ft = sampleVisualProgram(program, program.durationMs)
      expect(ft.score).toEqual({ us: match.gf, opp: match.ga })
      expect(ft.goals).toEqual(match.events)
      expect(ft.revealedCanonicalEvents).toEqual(match.causalEvents)
      expect(ft.shotTotals.us).toMatchObject({ shots: match.detail.finalStats.home.shots, shotsOnTarget: match.detail.finalStats.home.shotsOnTarget, saves: match.detail.finalStats.home.saves })
      expect(ft.shotTotals.opp).toMatchObject({ shots: match.detail.finalStats.away.shots, shotsOnTarget: match.detail.finalStats.away.shotsOnTarget, saves: match.detail.finalStats.away.saves })
      expect(canonicalMatchSignature(match, 0)).toBe(signature)
    }
    expect(observedRoutes.size).toBe(12)
    expect(observedOutcomes).toEqual(new Set(['goal', 'saved', 'off_target', 'cross_blocked', 'delivery_cleared', 'possession_recycled', 'counter_halted', 'foul_won', 'turnover_created', 'heavy_touch_turnover', 'set_piece_cleared', 'keeper_claim', 'pass_intercepted', 'buildup_stopped']))
  }, 30000)
})
