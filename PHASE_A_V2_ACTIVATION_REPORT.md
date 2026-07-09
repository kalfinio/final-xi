# Phase A — Player Database V2 Activation Report

## 1. Executive Verdict

**ACTIVATION COMPLETE — READY FOR INDEPENDENT AUDIT.**

New normal Modern Mix runs now draft from `modern_mix_v2_curated`. Daily Challenge and Legends Only remain on the frozen `legacy_v1` boundary. Legacy snapshots without `catalogVersion` still resolve as `legacy_v1` and are not silently migrated. The full master catalogue `modern_mix_v2_2026_07_07` remains available for validation/audit only and is not a live default.

No player data, catalogue membership/order, match engine, MatchDetail, scoring, roles, signatures, character, development profiles, transfer records, or unrelated UI were changed.

## 2. Initial Git Status

Initial branch/status:

```text
## phase-a-v2-wip...origin/phase-a-v2-wip
 M src/App.jsx
 M src/data/v2/catalogues.js
 M src/data/v2/dbV2.test.js
?? PHASE_A_V2_ACTIVATION_REPORT.md
```

Git also warned that `C:\Users\30697/.config/git/ignore` was permission denied.

## 3. Branch Confirmed

`phase-a-v2-wip`

## 4. Previous Catalogue-Selection Path

- New-run config was created in `IntroScreen.requestStart` as `{ formation, mode, difficulty, pool }`, with no catalogue.
- `DraftScreen` called `slotOptions(...)`, which used `getEligiblePlayers(...)` from `src/data.js`.
- That meant live draft offers/rerolls came from the frozen legacy V1 pool.
- `createRunSnapshot(...)` already had a safe default: absent `state.catalogVersion` persisted as `legacy_v1`.
- Restore was already catalogue-aware through `snapshotCatalogVersion(...)` and `resolvePlayer(...)`.

## 5. Exact Activation Change

- Added mode-aware activation in `src/data/v2/catalogues.js`:
  - `random + modern -> modern_mix_v2_curated`
  - `random + legends -> legacy_v1`
  - `daily + modern -> legacy_v1`
  - `daily + legends -> legacy_v1`
- Added `catalogueSlotOptions(...)`, mirroring `slotOptions(...)` while resolving eligibility through the run catalogue.
- `IntroScreen.requestStart` now fixes `catalogVersion` once at run creation.
- `DraftScreen` now uses `catalogueSlotOptions(...)`.
- `persistRun(...)` now explicitly stores `catalogVersion` and `dbVersion`.
- `resumeRun(...)` restores `catalogVersion` into active config so future checkpoints preserve it.

## 6. Files Changed

- `src/App.jsx`
- `src/data/v2/catalogues.js`
- `src/data/v2/dbV2.test.js`
- `src/runPersistence.js`
- `src/runPersistence.test.js`
- `PHASE_A_V2_ACTIVATION_REPORT.md`

## 7. New Modern Mix Behavior

Fresh normal Modern Mix uses `modern_mix_v2_curated`. Browser smoke verified a live normal Modern Mix snapshot at the hub:

```json
{
  "catalogVersion": "modern_mix_v2_curated",
  "dbVersion": "v2",
  "mode": "random",
  "pool": "modern"
}
```

Observed curated draft/reroll offers included V2 modern players such as `Alexander Nübel`, `Manuel Akanji`, `Botman`, `Schouten`, `Lewis-Skelly`, `Endrick`, and `Raphinha`.

## 8. Snapshot Persistence Behavior

New normal Modern Mix snapshots explicitly persist:

```json
"catalogVersion": "modern_mix_v2_curated"
```

Persistence-side tests verify save/load/reconstruct/re-save for curated V2 watch checkpoints, preserving catalogue and match signature.

## 9. Legacy Fallback Verification

Old snapshots without `catalogVersion` still resolve as `legacy_v1`.

Browser smoke Flow D injected a valid old-style snapshot with `catalogVersion` and `dbVersion` removed. After Resume Run and Quick Sim, the next saved checkpoint was:

```json
{
  "catalogVersion": "legacy_v1",
  "dbVersion": "v1",
  "screen": "postmatch",
  "pool": "legends"
}
```

It did not migrate to curated.

## 10. Explicit Legacy Run Verification

`src/runPersistence.test.js` now verifies an explicit `legacy_v1` snapshot remains `legacy_v1` through save, load, reconstruct, and re-save.

## 11. Legends Only Verification

Legends Only remains `legacy_v1`.

Browser smoke Flow B:

- Initial offers: `Víctor Valdés`, `Oliver Kahn`, `Edwin van der Sar`
- Saved snapshot: `catalogVersion: legacy_v1`, `dbVersion: v1`, `pool: legends`
- No curated V2 catalogue was used.

## 12. Daily Challenge Verification

Daily Challenge remains `legacy_v1` to preserve existing deterministic semantics.

Browser smoke Flow C:

- Same-date repeated offers matched exactly:
  - `Víctor Valdés`
  - `Edwin van der Sar`
  - `Marc-André ter Stegen`
- Saved snapshot:

```json
{
  "catalogVersion": "legacy_v1",
  "dbVersion": "v1",
  "mode": "daily",
  "pool": "modern",
  "dailyContext": { "dateKey": "2026-07-10" }
}
```

Unit tests also verify `catalogueSlotOptions('legacy_v1', daily...)` is byte-identical to `slotOptions(...)` across slots, rerolls, and pools.

## 13. Reroll Verification

- Normal Modern Mix rerolls remain inside `modern_mix_v2_curated`.
- Seeded curated reroll fixtures are deterministic and resolve all IDs.
- Used players are excluded from rerolled offers.
- Daily/legacy rerolls remain byte-identical to existing `slotOptions(...)`.

Browser Flow A reroll:

- Initial GK offers: `Ricardo`, `André Onana`, `Oliver Kahn`
- Reroll offers: `Alexander Nübel`, `Oliver Kahn`, `Mike Maignan`

## 14. Slot-Filtering Verification

`catalogueEligiblePlayers(...)` remains the single slot-filtering boundary. Tests verify curated seeded offers across GK/RB/CB/LB/CDM/CM/CAM/RW/LW/ST/RWB/LWB:

- all IDs are members of `modern_mix_v2_curated`
- all IDs resolve via `resolvePlayer(id, modern_mix_v2_curated)`
- used IDs are excluded

## 15. Formation Completion Verification

`npm run db:sim` verified `formationDone: 100%` for:

- `legacy_v1`
- `modern_mix_v2_2026_07_07`
- `modern_mix_v2_curated`

## 16. Canonical Match Refresh Verification

No MatchDetail or match simulation architecture was changed.

Browser Flow A:

- Watch Match saved signature: `0|L1|Zagreb Blues|3-0|win`
- Selected approach: `control`
- After refresh + Resume Run, the snapshot still had the same catalogue, approach, resolved count, and signature.
- Result checkpoint before/after refresh stayed unchanged:
  - screen: `result`
  - resolved: `11`
  - final signature: `10|Quarter-final|Paris Tower FC|1-2|loss`

## 17. Resume Run Verification

Resume Run restores `catalogVersion` into active config. Browser and unit tests verified:

- curated Modern Mix resumes as `modern_mix_v2_curated`
- old missing-catalog snapshots resume as `legacy_v1`
- explicit `legacy_v1` resumes and re-saves as `legacy_v1`
- watch/result checkpoints restore exact signatures

## 18. Automated Command Results

`npm run db:validate`

```text
V2 database valid (0 problems, 0 warnings).
```

`npm run db:audit`

```text
players: 544
modern: 461
legends: 83
catalogueSizes:
  legacy_v1: 134
  modern_mix_v2_2026_07_07: 544
  modern_mix_v2_curated: 341
  legends_v2: 83
```

`npm run db:audit:transfers`

```text
snapshot=2026-07-07 cutoff=2026-07-07T13:25:05Z
entries by status: {"confirmed":8}
transfer intel valid (0 problems).
```

`npm run db:sim`

```text
legacy_v1: avgXIRating 184.91, formationDone 100%
modern_mix_v2_2026_07_07: avgXIRating 118.65, formationDone 100%
modern_mix_v2_curated: avgXIRating 145.09, formationDone 100%
```

`npm test`

```text
Test Files  9 passed (9)
Tests       193 passed (193)
```

`npm run build`

```text
vite v6.4.3 built in 2.35s
dist/assets/index-CctR599P.js 473.54 kB / gzip 133.61 kB
```

## 19. Browser Smoke Results

Browser smoke was run against `http://127.0.0.1:5173/` using Playwright with installed Chrome. The in-app `iab` browser surface was unavailable in this session, so standalone Playwright was used after attempting the required browser setup path.

No console errors or page errors were observed in any flow.

Flow A — Fresh Modern Mix:

- Fresh normal Modern Mix draft used curated V2.
- Reroll worked and remained catalogue-contained.
- XI completed, European Run started, approach selected, Watch Match opened.
- Refresh + Resume restored same watch checkpoint.
- Result refresh + Resume restored same result checkpoint and final signature.

Flow B — Legends Only:

- Draft offers were legends only.
- Snapshot persisted `legacy_v1`.
- No curated contamination.

Flow C — Daily Challenge:

- Same-date repeated offers matched.
- Snapshot persisted `legacy_v1`.
- Daily date key persisted as `2026-07-10`.

Flow D — Legacy Snapshot:

- Old missing-catalog snapshot loaded.
- Resume worked through `legacy_v1` fallback.
- Continuing the run re-saved as `legacy_v1`, not curated.

## 20. Risks Or Caveats

- Daily Modern Mix intentionally remains `legacy_v1` in this activation to preserve Daily Challenge behaviour. Moving Daily to curated should be a separate, explicit product decision.
- Normal random draft offers still use `Math.random` as before; deterministic assertions cover seeded catalogue fixtures and Daily behaviour. Catalogue selection and containment are stable.
- Browser smoke used installed Chrome because the in-app browser target was unavailable. It still exercised the real app in a real browser.
- Starting Vite required escalation because the sandbox blocked Vite/esbuild from loading `vite.config.js`; the dev server was stopped afterward.

## 21. Recommendation For Independent Re-Audit

Audit these points independently:

1. `activationCatalogVersion({ mode: 'random', pool: 'modern' }) === 'modern_mix_v2_curated'`.
2. Daily and Legends activation paths remain `legacy_v1`.
3. `modern_mix_v2_2026_07_07` is not present in live activation defaults.
4. `catalogueSlotOptions(...)` mirrors legacy `slotOptions(...)` for `legacy_v1`.
5. New Modern Mix snapshots stamp `modern_mix_v2_curated` and restore through `resolvePlayer(...)`.
6. Missing `catalogVersion` snapshots resolve as `legacy_v1` and do not migrate.
7. Resume Run preserves catalogue and checkpoint.
8. Watch/result refreshes use stored canonical match signatures.
9. Diff does not touch player records, match engine, balance, roles, signatures, transfers, catalogue membership, or catalogue ordering.
