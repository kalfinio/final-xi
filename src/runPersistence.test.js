// Phase 6.1 test suite — deterministic run persistence.
import { describe, it, expect, beforeEach } from 'vitest'
import baseline from './simBaseline.fixture.json'
import { PLAYERS, FORMATIONS, computeRating, createRunSimulation, makeRng } from './data'
import { buildUpgradeContext, shouldOfferUpgrade, generateUpgradeOffer, UPGRADES_BY_ID } from './runUpgrades'
import { catalogueEligiblePlayers } from './data/v2/catalogues'
import {
  SCHEMA_VERSION, ENGINE_VERSION, STORAGE_KEY,
  createRunSnapshot, serializeRunSnapshot, parseRunSnapshot, validateRunSnapshot,
  saveRunSnapshot, loadRunSnapshot, clearRunSnapshot, snapshotSummary,
  reconstructRun, matchSignature,
} from './runPersistence'

// Minimal localStorage polyfill (vitest runs in node).
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
})

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const squadFromFixture = (run) => run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))
const sigList = (ctrl) => ctrl.matches.map((m, i) => matchSignature(m, i))
const cfgOf = (run) => ({ mode: run.daily ? 'daily' : 'random', formation: run.config.formation, pool: run.config.pool, difficulty: run.config.difficulty, dateKey: run.daily ? '2026-07-05' : null })

// App-faithful driver that can stop at any checkpoint and emit a snapshot.
function drive(run, { approachFor = () => 'balanced', chooseFn = () => null, stopAfter = Infinity, stopAtOffer = false } = {}) {
  const squad = squadFromFixture(run)
  const { total } = computeRating(squad)
  const state = { owned: [], offers: [] }
  const ctrl = createRunSimulation({
    rating: total, difficulty: run.config.difficulty, squad,
    rng: makeRng(run.seed), runSeed: run.seed,
    upgradeContextFor: (mc, p) => buildUpgradeContext(state.owned, mc, p),
  })
  let i = 0
  while (!ctrl.isDone && i < stopAfter) {
    const pending = ctrl.prepareNext()
    if (!pending) break
    const match = ctrl.resolveNext(approachFor(pending, i))
    i++
    if (shouldOfferUpgrade(match, ctrl, state.offers.length) && !state.offers.some((o) => o.afterMatch === ctrl.resolvedCount)) {
      const offerIndex = state.offers.length + 1
      const offer = { offerIndex, afterMatch: ctrl.resolvedCount, optionIds: generateUpgradeOffer({ runSeed: run.seed, offerIndex, owned: state.owned }), chosenId: null }
      state.offers.push(offer)
      if (stopAtOffer) return { ctrl, state, squad, checkpoint: 'upgrade' }
      const pick = chooseFn(offer.optionIds, state)
      offer.chosenId = pick || 'skipped'
      if (pick) {
        const ex = state.owned.find((o) => o.id === pick)
        if (ex) ex.stacks = Math.min((ex.stacks || 1) + 1, UPGRADES_BY_ID[pick].stackMax)
        else state.owned.push({ id: pick, stacks: 1, acquiredAfterMatch: offer.afterMatch })
      }
    }
  }
  return { ctrl, state, squad }
}

function snapFor(run, drv, screen) {
  return createRunSnapshot({
    config: cfgOf(run), runSeed: run.seed, teamName: 'Test XI', squad: drv.squad, rerollsUsed: 1,
    matches: drv.ctrl.matches, upgradeState: drv.state,
    checkpoint: { screen, resolvedMatchCount: drv.ctrl.resolvedCount, selectedApproach: 'balanced', stageLabel: 'League Phase' },
  })
}

function v2Squad(catalogVersion = 'modern_mix_v2_2026_07_07', { preferV2Only = true } = {}) {
  const used = []
  return FORMATIONS['4-3-3'].slots.map((slot) => {
    const eligible = catalogueEligiblePlayers(catalogVersion, slot, used, 'modern')
    const player = (preferV2Only ? eligible.find((p) => !byId[p.id]) : eligible[0]) || eligible[0]
    used.push(player.id)
    return { slot, player }
  })
}

function v2Snap({ screen = 'hub', resolved = 0, catalogVersion = 'modern_mix_v2_2026_07_07' } = {}) {
  const squad = v2Squad(catalogVersion, { preferV2Only: catalogVersion !== 'modern_mix_v2_curated' })
  const { total } = computeRating(squad)
  const state = { owned: [], offers: [] }
  const ctrl = createRunSimulation({
    rating: total, difficulty: 'classic', squad,
    rng: makeRng(24680), runSeed: 24680,
    upgradeContextFor: (mc, p) => buildUpgradeContext(state.owned, mc, p),
  })
  for (let i = 0; i < resolved; i++) {
    ctrl.prepareNext()
    ctrl.resolveNext('balanced')
  }
  return createRunSnapshot({
    config: { mode: 'random', formation: '4-3-3', pool: 'modern', difficulty: 'classic' },
    dbVersion: 'v2',
    catalogVersion,
    runSeed: 24680,
    teamName: 'V2 XI',
    squad,
    rerollsUsed: 0,
    matches: ctrl.matches,
    upgradeState: state,
    checkpoint: { screen, resolvedMatchCount: ctrl.resolvedCount, selectedApproach: 'balanced', stageLabel: 'League Phase' },
  })
}

// ---------------------------------------------------------------------------
describe('A. snapshot round trip', () => {
  it('create → serialize → parse → validate preserves reconstruction data', () => {
    const run = baseline.runs[0]
    const drv = drive(run, { stopAfter: 5, approachFor: (_, i) => ['balanced', 'control', 'wide', 'counter'][i % 4], chooseFn: (ids) => ids[0] })
    const snap = snapFor(run, drv, 'hub')
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION)
    expect(snap.engineVersion).toBe(ENGINE_VERSION)
    const round = parseRunSnapshot(serializeRunSnapshot(snap))
    expect(validateRunSnapshot(round)).toBe(true)
    expect(round.run.squadSelections).toHaveLength(11)
    expect(round.run.signatures.resolvedMatches).toEqual(sigList(drv.ctrl))
    expect(round.run.approachHistory.map((a) => a.approachKey)).toEqual(drv.ctrl.matches.map((m) => m.approach))
  })

  it('save/load/clear via localStorage round-trips a valid snapshot', () => {
    const run = baseline.runs[0]
    const snap = snapFor(run, drive(run, { stopAfter: 3 }), 'hub')
    expect(saveRunSnapshot(snap)).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    expect(validateRunSnapshot(loadRunSnapshot())).toBe(true)
    clearRunSnapshot()
    expect(loadRunSnapshot()).toBeNull()
  })

  it('snapshotSummary reads record + upgrades without reconstruction', () => {
    const run = baseline.runs[0]
    const drv = drive(run, { stopAfter: 4, chooseFn: (ids) => ids[0] })
    const s = snapshotSummary(snapFor(run, drv, 'hub'))
    expect(s.record.w + s.record.d + s.record.l).toBe(4)
    expect(s.upgradeCount).toBe(drv.state.owned.length)
    expect(s.resolvedMatchCount).toBe(4)
  })
})

// ---------------------------------------------------------------------------
describe('B. corruption handling — all fail safely', () => {
  const good = () => snapFor(baseline.runs[0], drive(baseline.runs[0], { stopAfter: 3 }), 'hub')
  it('malformed / missing / invalid values are rejected', () => {
    expect(parseRunSnapshot('{not json')).toBeNull()
    expect(parseRunSnapshot(null)).toBeNull()
    expect(validateRunSnapshot(null)).toBe(false)
    expect(validateRunSnapshot({})).toBe(false)
    expect(validateRunSnapshot({ ...good(), schemaVersion: 99 })).toBe(false)
    expect(validateRunSnapshot({ ...good(), engineVersion: 'phase9' })).toBe(false)
    const mut = (fn) => { const s = good(); fn(s.run); return s }
    expect(validateRunSnapshot(mut((r) => { r.mode = 'coop' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.config.formation = '9-9-9' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.config.pool = 'aliens' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.config.difficulty = 'nightmare' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.catalogVersion = 'unknown_catalogue' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.runSeed = 'abc' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.squadSelections[0].playerId = 'nobody' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.squadSelections[1] = { ...r.squadSelections[0] } }))).toBe(false) // dup player
    expect(validateRunSnapshot(mut((r) => { r.squadSelections[2].slot = 'ZZ' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.squadSelections.pop() }))).toBe(false) // wrong XI size
    expect(validateRunSnapshot(mut((r) => { r.approachHistory[0].approachKey = 'parkthebus' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.upgradeState.owned = [{ id: 'fake', stacks: 1 }] }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.upgradeState.owned = [{ id: 'midfield-triangle', stacks: 9 }] }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.upgradeState.offers = [{ offerIndex: 1, afterMatch: 3, optionIds: ['x', 'y', 'z'], chosenId: null }] }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.checkpoint.screen = 'draft' }))).toBe(false)
    expect(validateRunSnapshot(mut((r) => { r.checkpoint.resolvedMatchCount = 99 }))).toBe(false)
  })

  it('loadRunSnapshot returns null for corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    expect(loadRunSnapshot()).toBeNull()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 2 }))
    expect(loadRunSnapshot()).toBeNull()
  })

  it('reconstructRun rejects a signature-tampered snapshot', () => {
    const snap = snapFor(baseline.runs[0], drive(baseline.runs[0], { stopAfter: 4 }), 'hub')
    snap.run.signatures.resolvedMatches[2] = '2|L3|Fake FC|9-0|win'
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(false)
    expect(rec.reason).toBe('signature-mismatch')
  })
})

// ---------------------------------------------------------------------------
describe('B2. catalogue-aware player resolution', () => {
  it('old snapshots without catalogVersion default to legacy_v1 and reconstruct', () => {
    const snap = snapFor(baseline.runs[0], drive(baseline.runs[0], { stopAfter: 2 }), 'hub')
    delete snap.run.catalogVersion
    delete snap.run.dbVersion
    expect(validateRunSnapshot(snap)).toBe(true)
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.catalogVersion).toBe('legacy_v1')
  })

  it('old snapshots without catalogVersion are not migrated to V2 when re-saved', () => {
    const original = snapFor(baseline.runs[0], drive(baseline.runs[0], { stopAfter: 2 }), 'hub')
    delete original.run.catalogVersion
    delete original.run.dbVersion
    saveRunSnapshot(original)
    const rec = reconstructRun(loadRunSnapshot())
    expect(rec.ok).toBe(true)
    expect(rec.catalogVersion).toBe('legacy_v1')

    const reSaved = createRunSnapshot({
      config: rec.config,
      catalogVersion: rec.catalogVersion,
      dbVersion: rec.dbVersion,
      runSeed: rec.runSeed,
      teamName: rec.teamName,
      squad: rec.squad,
      rerollsUsed: rec.rerollsUsed,
      matches: rec.ctrl.matches,
      upgradeState: rec.upgradeState,
      checkpoint: { screen: rec.screen, resolvedMatchCount: rec.ctrl.resolvedCount, selectedApproach: rec.selectedApproach, stageLabel: 'League Phase' },
    })
    expect(reSaved.run.catalogVersion).toBe('legacy_v1')
    expect(reSaved.run.dbVersion).toBe('v1')
  })

  it('explicit legacy_v1 snapshots remain legacy through save/load/reconstruct/re-save', () => {
    const snap = snapFor(baseline.runs[1], drive(baseline.runs[1], { stopAfter: 3 }), 'hub')
    snap.run.catalogVersion = 'legacy_v1'
    snap.run.dbVersion = 'v1'
    saveRunSnapshot(snap)

    const rec = reconstructRun(loadRunSnapshot())
    expect(rec.ok).toBe(true)
    expect(rec.catalogVersion).toBe('legacy_v1')
    const reSaved = createRunSnapshot({
      config: rec.config,
      catalogVersion: rec.catalogVersion,
      dbVersion: rec.dbVersion,
      runSeed: rec.runSeed,
      teamName: rec.teamName,
      squad: rec.squad,
      rerollsUsed: rec.rerollsUsed,
      matches: rec.ctrl.matches,
      upgradeState: rec.upgradeState,
      checkpoint: { screen: rec.screen, resolvedMatchCount: rec.ctrl.resolvedCount, selectedApproach: rec.selectedApproach, stageLabel: 'League Phase' },
    })
    expect(reSaved.run.catalogVersion).toBe('legacy_v1')
    expect(reconstructRun(reSaved).catalogVersion).toBe('legacy_v1')
  })

  it('curated V2 snapshots persist catalogue and restore the exact watch checkpoint', () => {
    const snap = v2Snap({ screen: 'watch', resolved: 1, catalogVersion: 'modern_mix_v2_curated' })
    expect(snap.run.catalogVersion).toBe('modern_mix_v2_curated')
    expect(snap.run.dbVersion).toBe('v2')
    saveRunSnapshot(snap)

    const loaded = loadRunSnapshot()
    expect(loaded.run.catalogVersion).toBe('modern_mix_v2_curated')
    const rec = reconstructRun(loaded)
    expect(rec.ok).toBe(true)
    expect(rec.catalogVersion).toBe('modern_mix_v2_curated')
    expect(rec.screen).toBe('watch')
    expect(rec.ctrl.resolvedCount).toBe(1)
    expect(matchSignature(rec.currentMatch, 0)).toBe(snap.run.signatures.resolvedMatches[0])

    const reSaved = createRunSnapshot({
      config: rec.config,
      catalogVersion: rec.catalogVersion,
      dbVersion: rec.dbVersion,
      runSeed: rec.runSeed,
      teamName: rec.teamName,
      squad: rec.squad,
      rerollsUsed: rec.rerollsUsed,
      matches: rec.ctrl.matches,
      upgradeState: rec.upgradeState,
      checkpoint: { screen: rec.screen, resolvedMatchCount: rec.ctrl.resolvedCount, currentMatchIndex: 0, selectedApproach: rec.selectedApproach, stageLabel: 'League Phase' },
    })
    expect(reSaved.run.catalogVersion).toBe('modern_mix_v2_curated')
    expect(matchSignature(reconstructRun(reSaved).currentMatch, 0)).toBe(snap.run.signatures.resolvedMatches[0])
  })

  it('known V2 catalogue snapshots resolve V2-only ids and reconstruct', () => {
    const snap = v2Snap()
    const v2OnlyIds = snap.run.squadSelections.map((s) => s.playerId).filter((id) => !byId[id])
    expect(v2OnlyIds.length).toBeGreaterThan(0)
    expect(validateRunSnapshot(snap)).toBe(true)
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.catalogVersion).toBe('modern_mix_v2_2026_07_07')
    expect(rec.squad.map((s) => s.player.id)).toEqual(snap.run.squadSelections.map((s) => s.playerId))
  })

  it('unknown catalogue and corrupted V2 ids fail gracefully', () => {
    const unknown = v2Snap()
    unknown.run.catalogVersion = 'missing_catalogue'
    expect(validateRunSnapshot(unknown)).toBe(false)
    expect(reconstructRun(unknown)).toEqual({ ok: false, reason: 'invalid' })

    const corrupt = v2Snap()
    corrupt.run.squadSelections[0].playerId = 'not_a_player'
    expect(validateRunSnapshot(corrupt)).toBe(false)
    expect(reconstructRun(corrupt)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('V2 watch checkpoint refresh preserves deterministic match signature', () => {
    const snap = v2Snap({ screen: 'watch', resolved: 1 })
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.screen).toBe('watch')
    expect(matchSignature(rec.currentMatch, 0)).toBe(snap.run.signatures.resolvedMatches[0])
  })
})

// ---------------------------------------------------------------------------
describe('C. reconstruction parity (resumed === uninterrupted)', () => {
  const approachFor = (_, i) => ['balanced', 'control', 'wide', 'counter'][i % 4]
  const chooseFn = (ids) => ids[0]

  it('snapshot at hub after k matches reconstructs the exact controller + pending, and continues identically', () => {
    for (const run of baseline.runs) {
      const full = drive(run, { approachFor, chooseFn })
      const k = Math.min(5, full.ctrl.matches.length - 1)
      if (k < 1) continue
      const partial = drive(run, { approachFor, chooseFn, stopAfter: k })
      const snap = snapFor(run, partial, 'hub')
      const rec = reconstructRun(snap)
      expect(rec.ok).toBe(true)
      // resolved matches identical
      expect(sigList(rec.ctrl)).toEqual(sigList(full.ctrl).slice(0, k))
      // pending opponent is the same as the full run's next match
      expect(rec.pending.opponent).toBe(full.ctrl.matches[k].opponent)
      // owned/offers reconstructed to the partial live state
      expect(rec.upgradeState.owned).toEqual(partial.state.owned)
      expect(rec.upgradeState.offers.map((o) => o.optionIds)).toEqual(partial.state.offers.map((o) => o.optionIds))
      // continue the reconstructed run exactly as App would (same approach +
      // offer handling) and reach the same finish
      let i = k
      const st = rec.upgradeState
      while (!rec.ctrl.isDone) {
        const p = rec.ctrl.prepareNext(); if (!p) break
        const m = rec.ctrl.resolveNext(approachFor(p, i)); i++
        if (shouldOfferUpgrade(m, rec.ctrl, st.offers.length) && !st.offers.some((o) => o.afterMatch === rec.ctrl.resolvedCount)) {
          const offerIndex = st.offers.length + 1
          const offer = { offerIndex, afterMatch: rec.ctrl.resolvedCount, optionIds: generateUpgradeOffer({ runSeed: run.seed, offerIndex, owned: st.owned }), chosenId: null }
          st.offers.push(offer)
          const pick = chooseFn(offer.optionIds, st)
          offer.chosenId = pick || 'skipped'
          if (pick) {
            const ex = st.owned.find((o) => o.id === pick)
            if (ex) ex.stacks = Math.min((ex.stacks || 1) + 1, UPGRADES_BY_ID[pick].stackMax)
            else st.owned.push({ id: pick, stacks: 1, acquiredAfterMatch: offer.afterMatch })
          }
        }
      }
      expect(sigList(rec.ctrl)).toEqual(sigList(full.ctrl))
      expect(rec.ctrl.finish().exitStage).toBe(full.ctrl.finish().exitStage)
    }
  })

  it('mechanical equality: uninterrupted matchup/detail/approach/activeUpgrades == reconstructed', () => {
    const run = baseline.runs[3]
    const full = drive(run, { approachFor, chooseFn })
    const snap = snapFor(run, drive(run, { approachFor, chooseFn, stopAfter: 6 }), 'hub')
    const rec = reconstructRun(snap)
    for (let i = 0; i < 6; i++) {
      const a = full.ctrl.matches[i]
      const b = rec.ctrl.matches[i]
      expect(b.approach).toBe(a.approach)
      expect(b.matchup.probabilityDelta).toBe(a.matchup.probabilityDelta)
      expect(b.detail.finalStats).toEqual(a.detail.finalStats)
      expect(b.activeUpgrades).toEqual(a.activeUpgrades)
    }
  })
})

// ---------------------------------------------------------------------------
describe('D. every checkpoint restores correctly', () => {
  it('watch / postmatch restore the just-resolved match, no pending, no re-resolve', () => {
    const run = baseline.runs[0]
    for (const screen of ['watch', 'postmatch']) {
      const drv = drive(run, { stopAfter: 4, chooseFn: (ids) => ids[0] })
      const rec = reconstructRun(snapFor(run, drv, screen))
      expect(rec.ok).toBe(true)
      expect(rec.screen).toBe(screen)
      expect(rec.currentMatch).toBe(rec.ctrl.matches[3])
      expect(rec.pending).toBeNull()
      expect(rec.ctrl.resolvedCount).toBe(4) // did not resolve a 5th match
    }
  })

  it('upgrade checkpoint restores the exact stored offer without regeneration', () => {
    // drive until the MD3 offer is created (chosenId null)
    const run = baseline.runs[0]
    const drv = drive(run, { stopAtOffer: true })
    expect(drv.checkpoint).toBe('upgrade')
    const snap = snapFor(run, drv, 'upgrade')
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.screen).toBe('upgrade')
    const offer = rec.upgradeState.offers[rec.upgradeState.offers.length - 1]
    expect(offer.optionIds).toEqual(drv.state.offers[drv.state.offers.length - 1].optionIds)
    expect(offer.chosenId).toBeNull()
    expect(rec.upgradeState.owned).toEqual([]) // not yet chosen
  })

  it('result checkpoint restores the finished run + result', () => {
    const run = baseline.runs[0]
    const drv = drive(run, { chooseFn: (ids) => ids[0] }) // full run
    expect(drv.ctrl.isDone).toBe(true)
    const rec = reconstructRun(snapFor(run, drv, 'result'))
    expect(rec.ok).toBe(true)
    expect(rec.screen).toBe('result')
    expect(rec.result.exitStage).toBe(drv.ctrl.finish().exitStage)
  })
})

// ---------------------------------------------------------------------------
describe('E. Sim All + Daily persistence', () => {
  it('a Sim All run round-trips via chronological replay (no second Sim All)', () => {
    const run = baseline.runs[1]
    const squad = squadFromFixture(run)
    const { total } = computeRating(squad)
    const state = { owned: [], offers: [] }
    const ctrl = createRunSimulation({ rating: total, difficulty: run.config.difficulty, squad, rng: makeRng(run.seed), runSeed: run.seed, upgradeContextFor: (mc, p) => buildUpgradeContext(state.owned, mc, p) })
    ctrl.prepareNext(); ctrl.resolveNext('wide'); ctrl.finishRemaining('balanced')
    const snap = snapFor(run, { ctrl, state, squad }, 'result')
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(sigList(rec.ctrl)).toEqual(sigList(ctrl))
    expect(rec.ctrl.matches[0].approach).toBe('wide')
    expect(rec.ctrl.matches[1]?.approach).toBe('balanced')
  })

  it('Daily context is preserved and reconstructs identically (calendar-independent)', () => {
    const run = baseline.runs.find((r) => r.daily) || { ...baseline.runs[0], daily: true }
    const drv = drive(run, { stopAfter: 5, approachFor: (_, i) => ['balanced', 'control'][i % 2] })
    const snap = snapFor(run, drv, 'hub')
    expect(snap.run.mode).toBe('daily')
    expect(snap.run.dailyContext.dateKey).toBe('2026-07-05')
    const rec = reconstructRun(snap)
    expect(rec.ok).toBe(true)
    expect(rec.config.mode).toBe('daily')
    expect(sigList(rec.ctrl)).toEqual(sigList(drv.ctrl))
  })
})
