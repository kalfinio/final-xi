// ---------------------------------------------------------------------------
// Run persistence (Phase 6.1) — deterministic save/resume for a European Run.
//
// CORE PRINCIPLE: never persist derived simulation objects. A run is fully
// determined by its seed + config + confirmed XI + the ordered list of
// per-match tactical approaches + the ordered upgrade choices/skips. We store
// exactly that minimal snapshot, then reconstruct the run by REPLAYING those
// decisions through the real Phase 4 staged controller (createRunSimulation).
// No second simulator, no fabricated match objects, no RNG object stored.
//
// Reconstruction determinism holds because:
//   • both run modes now seed the sim RNG (App uses makeRng(runSeed)); the
//     controller consumes RNG only in prepareNext (opponent + home) and
//     resolveNext (roll + goals + stats), in that fixed order;
//   • upgrade offers use a SEPARATE seeded stream and consume zero sim RNG;
//   • replaying prepareNext()/resolveNext(storedApproach) for each resolved
//     match, applying stored upgrade picks between them exactly as App does,
//     reproduces the identical controller state.
// Lightweight per-match signatures are checked during replay; any divergence
// aborts the restore safely.
// ---------------------------------------------------------------------------

import { FORMATIONS, DIFFICULTIES, computeRating, makeRng, createRunSimulation } from './data'
import { APPROACH_KEYS } from './tacticalApproach'
import { buildUpgradeContext, shouldOfferUpgrade, generateUpgradeOffer, UPGRADES_BY_ID, MAX_UPGRADES_PER_RUN } from './runUpgrades'
import { DEFAULT_CATALOG_VERSION, getCatalogue, resolvePlayer } from './data/v2/catalogues'

export const SCHEMA_VERSION = 1
export const ENGINE_VERSION = 'phase6.1'
export const STORAGE_KEY = 'finalxi.activeRun.v1'

const VALID_POOLS = new Set(['modern', 'legends'])
const VALID_MODES = new Set(['random', 'daily'])
// Checkpoints we can safely restore to.
const VALID_SCREENS = new Set(['hub', 'watch', 'postmatch', 'upgrade', 'result', 'sim'])

// Compact deterministic per-match signature (validated during reconstruction).
export function matchSignature(m, i) {
  const stage = m.type === 'league' ? `L${m.matchNo}` : m.round
  return `${i}|${stage}|${m.opponent}|${m.gf}-${m.ga}|${m.result}`
}

// ---------------------------------------------------------------------------
// Snapshot construction (pure). `state` is gathered by App at a checkpoint.
// ---------------------------------------------------------------------------
export function createRunSnapshot(state) {
  const { config, runSeed, teamName, squad, rerollsUsed, matches, upgradeState, checkpoint } = state
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    savedAt: Date.now(),
    run: {
      mode: config.mode,
      runSeed: runSeed >>> 0,
      // Player-DB / catalogue version this run was drafted from (Phase A). The
      // live game still drafts from the frozen legacy pool, so current runs are
      // 'legacy_v1'. Old snapshots have no field → interpreted as legacy_v1.
      dbVersion: state.dbVersion || 'v1',
      catalogVersion: state.catalogVersion || 'legacy_v1',
      dailyContext: config.mode === 'daily' ? { dateKey: config.dateKey || null } : null,
      config: { formation: config.formation, pool: config.pool, difficulty: config.difficulty },
      teamName,
      squadSelections: squad.map((s) => ({ slot: s.slot, playerId: s.player.id })),
      rerollsUsed: rerollsUsed | 0,
      // Approach per resolved match comes straight off the stored match objects.
      approachHistory: matches.map((m, i) => ({ matchIndex: i, approachKey: m.approach || 'balanced' })),
      upgradeState: {
        owned: upgradeState.owned.map((o) => ({ id: o.id, stacks: o.stacks || 1, acquiredAfterMatch: o.acquiredAfterMatch ?? null })),
        offers: upgradeState.offers.map((o) => ({
          offerIndex: o.offerIndex, afterMatch: o.afterMatch, optionIds: [...o.optionIds],
          chosenId: o.chosenId ?? null, viaSimAll: !!o.viaSimAll,
        })),
      },
      checkpoint: {
        screen: checkpoint.screen,
        resolvedMatchCount: checkpoint.resolvedMatchCount,
        currentMatchIndex: checkpoint.currentMatchIndex ?? null,
        selectedApproach: checkpoint.selectedApproach || 'balanced',
        stageLabel: checkpoint.stageLabel || null,
      },
      signatures: { resolvedMatches: matches.map((m, i) => matchSignature(m, i)) },
    },
  }
}

export function serializeRunSnapshot(snapshot) {
  return JSON.stringify(snapshot)
}

export function parseRunSnapshot(raw) {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Validation — never trust localStorage. Returns true only for a snapshot we
// can safely attempt to reconstruct.
// ---------------------------------------------------------------------------
export function validateRunSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return false
  if (snap.schemaVersion !== SCHEMA_VERSION) return false
  if (snap.engineVersion !== ENGINE_VERSION) return false
  const r = snap.run
  if (!r || typeof r !== 'object') return false
  const catalogVersion = snapshotCatalogVersion(snap)
  if (typeof catalogVersion !== 'string' || !catalogVersion || !getCatalogue(catalogVersion)) return false
  if (!VALID_MODES.has(r.mode)) return false
  if (!Number.isFinite(r.runSeed)) return false
  const c = r.config
  if (!c || !FORMATIONS[c.formation] || !VALID_POOLS.has(c.pool) || !DIFFICULTIES[c.difficulty]) return false

  // squad: exact XI size, valid players, valid slots for the formation
  const slots = FORMATIONS[c.formation].slots
  if (!Array.isArray(r.squadSelections) || r.squadSelections.length !== slots.length) return false
  const seenPlayers = new Set()
  for (let i = 0; i < r.squadSelections.length; i++) {
    const sel = r.squadSelections[i]
    if (!sel || !resolvePlayer(sel.playerId, catalogVersion)) return false
    if (seenPlayers.has(sel.playerId)) return false // no duplicate players in an XI
    seenPlayers.add(sel.playerId)
    if (sel.slot !== slots[i]) return false
  }

  if (!Array.isArray(r.approachHistory)) return false
  for (const a of r.approachHistory) if (!APPROACH_KEYS.includes(a.approachKey)) return false

  const u = r.upgradeState
  if (!u || !Array.isArray(u.owned) || !Array.isArray(u.offers)) return false
  if (u.owned.length > MAX_UPGRADES_PER_RUN) return false
  for (const o of u.owned) {
    const def = UPGRADES_BY_ID[o.id]
    if (!def) return false
    if (!(o.stacks >= 1 && o.stacks <= def.stackMax)) return false
  }
  if (u.offers.length > MAX_UPGRADES_PER_RUN) return false
  for (const off of u.offers) {
    if (!Array.isArray(off.optionIds) || off.optionIds.length !== 3) return false
    if (off.optionIds.some((id) => !UPGRADES_BY_ID[id])) return false
    if (off.chosenId != null && off.chosenId !== 'skipped' && !off.optionIds.includes(off.chosenId)) return false
    if (!(off.afterMatch >= 1)) return false
  }

  const cp = r.checkpoint
  if (!cp || !VALID_SCREENS.has(cp.screen)) return false
  if (!(cp.resolvedMatchCount >= 0 && cp.resolvedMatchCount <= 15)) return false
  if (!r.signatures || !Array.isArray(r.signatures.resolvedMatches)) return false
  if (r.signatures.resolvedMatches.length !== cp.resolvedMatchCount) return false
  if (r.approachHistory.length !== cp.resolvedMatchCount) return false
  if (cp.selectedApproach && !APPROACH_KEYS.includes(cp.selectedApproach)) return false
  // Catalogue/db version are optional (absent → legacy_v1); if present they
  // must be non-empty strings. Reconstruction resolves squads by id, so a
  // legacy snapshot without these fields still restores exactly.
  if (r.catalogVersion != null && (typeof r.catalogVersion !== 'string' || !r.catalogVersion)) return false
  if (r.dbVersion != null && (typeof r.dbVersion !== 'string' || !r.dbVersion)) return false
  return true
}

// Catalogue version a snapshot was drafted from. Missing field (pre-Phase-A
// saves) is interpreted as the frozen legacy catalogue.
export function snapshotCatalogVersion(snap) {
  return snap?.run?.catalogVersion || DEFAULT_CATALOG_VERSION
}

// ---------------------------------------------------------------------------
// localStorage boundary (only place that touches storage).
// ---------------------------------------------------------------------------
export function saveRunSnapshot(snapshot) {
  try { localStorage.setItem(STORAGE_KEY, serializeRunSnapshot(snapshot)); return true } catch { return false }
}

export function loadRunSnapshot() {
  try {
    const snap = parseRunSnapshot(localStorage.getItem(STORAGE_KEY))
    return validateRunSnapshot(snap) ? snap : null
  } catch {
    return null
  }
}

export function clearRunSnapshot() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function hasRunSnapshot() {
  return loadRunSnapshot() != null
}

// Lightweight intro summary — no reconstruction, just reads persisted fields.
export function snapshotSummary(snap) {
  if (!snap) return null
  const r = snap.run
  let w = 0, d = 0, l = 0
  for (const sig of r.signatures.resolvedMatches) {
    const res = sig.split('|')[4]
    if (res === 'win' || res === 'pens-win') w++
    else if (res === 'loss' || res === 'pens-loss') l++
    else d++
  }
  return {
    teamName: r.teamName,
    mode: r.mode,
    dateKey: r.dailyContext?.dateKey || null,
    stageLabel: r.checkpoint.stageLabel || (r.checkpoint.screen === 'result' || r.checkpoint.screen === 'sim' ? 'Run complete' : 'European Run'),
    record: { w, d, l },
    upgradeCount: r.upgradeState.owned.length,
    resolvedMatchCount: r.checkpoint.resolvedMatchCount,
  }
}

// ---------------------------------------------------------------------------
// Deterministic reconstruction. Replays the stored decisions through the real
// controller and stops at the saved checkpoint. Returns everything App needs
// to restore its refs + screen, or { ok:false, reason } on any divergence.
// ---------------------------------------------------------------------------
export function reconstructRun(snap) {
  if (!validateRunSnapshot(snap)) return { ok: false, reason: 'invalid' }
  const r = snap.run
  try {
    const catalogVersion = snapshotCatalogVersion(snap)
    const squad = r.squadSelections.map((s) => ({ slot: s.slot, player: resolvePlayer(s.playerId, catalogVersion) }))
    if (squad.some((s) => !s.player)) return { ok: false, reason: 'unknown-player' }
    const { total } = computeRating(squad)
    const upgradeState = { owned: [], offers: [] }
    const ctrl = createRunSimulation({
      rating: total, difficulty: r.config.difficulty, squad,
      rng: makeRng(r.runSeed), runSeed: r.runSeed,
      upgradeContextFor: (mc, profile) => buildUpgradeContext(upgradeState.owned, mc, profile),
    })

    const offersByAfter = new Map(r.upgradeState.offers.map((o) => [o.afterMatch, o]))
    const target = r.checkpoint.resolvedMatchCount

    for (let i = 0; i < target; i++) {
      const pending = ctrl.prepareNext()
      if (!pending) return { ok: false, reason: 'run-shorter-than-snapshot' }
      const approachKey = r.approachHistory[i]?.approachKey || 'balanced'
      const match = ctrl.resolveNext(approachKey)
      // signature check — abort on any divergence from the stored run
      if (matchSignature(match, i) !== r.signatures.resolvedMatches[i]) {
        return { ok: false, reason: 'signature-mismatch' }
      }
      // Apply the upgrade offer that triggers after this match, exactly as App
      // does (offer created after post-match, applied before the next match).
      const off = offersByAfter.get(ctrl.resolvedCount)
      if (off) {
        // Re-generate to confirm determinism, but the stored offer is authority.
        const regen = generateUpgradeOffer({ runSeed: r.runSeed, offerIndex: off.offerIndex, owned: upgradeState.owned })
        void regen // validated in tests; UI uses the stored offer verbatim
        upgradeState.offers.push({ ...off, optionIds: [...off.optionIds] })
        if (off.chosenId && off.chosenId !== 'skipped') {
          const ex = upgradeState.owned.find((o) => o.id === off.chosenId)
          if (ex) ex.stacks = Math.min((ex.stacks || 1) + 1, UPGRADES_BY_ID[off.chosenId].stackMax)
          else upgradeState.owned.push({ id: off.chosenId, stacks: 1, acquiredAfterMatch: off.afterMatch })
        }
      }
    }

    const screen = r.checkpoint.screen
    const out = { ok: true, ctrl, upgradeState, squad, config: { ...r.config, mode: r.mode, dateKey: r.dailyContext?.dateKey || null }, catalogVersion, dbVersion: r.dbVersion || getCatalogue(catalogVersion)?.dbVersion || null, teamName: r.teamName, runSeed: r.runSeed, rerollsUsed: r.rerollsUsed, screen, pending: null, currentMatch: null, matchNo: target, selectedApproach: r.checkpoint.selectedApproach || 'balanced', result: null }

    if (screen === 'hub') {
      out.pending = ctrl.prepareNext() // same rng position → same opponent
      if (!out.pending) return { ok: false, reason: 'no-pending-for-hub' }
      out.matchNo = target + 1
    } else if (screen === 'watch' || screen === 'postmatch') {
      out.currentMatch = ctrl.matches[target - 1] || null
      if (!out.currentMatch) return { ok: false, reason: 'no-current-match' }
    } else if (screen === 'upgrade') {
      // The pending offer is the last stored offer (chosenId null); replay
      // pushed it already if afterMatch === target.
      out.currentMatch = ctrl.matches[target - 1] || null
      if (!upgradeState.offers.length) return { ok: false, reason: 'no-offer' }
    } else if (screen === 'result' || screen === 'sim') {
      if (!ctrl.isDone) return { ok: false, reason: 'run-not-finished' }
      out.result = ctrl.finish()
    }
    return out
  } catch (e) {
    return { ok: false, reason: 'exception' }
  }
}
