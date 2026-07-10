# Final XI Match Engine M0 Foundation Report

## 1. Files changed

Repository preflight was performed on `match-engine-m0-foundation` at `e63b82c` (`improve draft clarity and club identity`, the closed A.5 work). `git diff --check` was clean. The only pre-existing untracked files were `MATCH_ENGINE_FORENSIC_AUDIT.md` and `MATCH_ENGINE_M1_ARCHITECTURE_VERIFICATION.md`; both were preserved. `scratch_reaudit.mjs` and `scratch_side.mjs` were confirmed tracked diagnostics and left untouched.

Production/infrastructure:

- `src/matchEngineVersions.js` — engine registry, active version, historical alias, runnable guard, and dispatch boundary.
- `src/data.js` — immutable controller-level engine lock and the smallest legacy `resolveNext` dispatch wrapper.
- `src/runPersistence.js` — version persistence/fallback/validation, canonical re-save behavior, strong optional canonical match signatures, and version-aware reconstruction.
- `src/App.jsx` — explicit new-run assignment and save-from-controller version persistence.
- `package.json` — `npm run match:calibration`.

Fixtures/tooling/tests:

- `src/matchEngineLegacy.fixture.json` — exact pre-M0.1 legacy match/run captures.
- `src/matchCalibration.fixture.json` — aggregate baseline, metric definitions, classifications, and tolerances.
- `src/matchCalibration.js` — deterministic read-only exact and aggregate harness.
- `scripts/match-calibration.mjs` — CLI calibration gate.
- `src/matchEngineFoundation.test.js` — version, dispatch, parity, Daily, diversity, formation/catalogue, and aggregate coverage.
- `src/runPersistence.test.js` — missing/alias/explicit version, invalid version, re-save, checkpoint, knockout, Watch replay, and canonical-signature coverage.
- `MATCH_ENGINE_M0_FOUNDATION_REPORT.md` — this report.

No M1 resolver, chance model, score logic, timing model, plan effect, Role/Signature hook, commentary change, or match-state feature was added.

## 2. Calibration fixture design

The freeze has two layers:

1. **Exact deterministic parity**
   - Five representative matches: league win, Final, penalty shootout, play-off elimination, and Daily.
   - Exact goals, minutes, scorer IDs, assister IDs, legacy stats, score/result, and penalties.
   - Exact signatures for tactical metadata, `MatchDetail`, full deterministic timeline, and the combined canonical replay.
   - Four representative complete runs: champion, shootout exit, play-off exit, and Daily; each freezes opponent order, results, scorelines, qualification, league record/position, knockout path, champion state, resolved count, checkpoint, and full run signature.
   - The pre-existing 16-run Phase 3 fixture remains authoritative across all five formations and is now also executed explicitly through `legacy_v1`.

2. **Aggregate fixed-seed calibration**
   - 128 deterministic runs per cell using the documented seed domain `m0-calibration|<cell>|<1-based-index>`.
   - Run level, match level, five formations, five Role-balance squads, three difficulties, three opponent bands, three squad-strength bands, and four Match Plans.
   - Match Plan results are reported but deliberately excluded from the preservation failure gate.

The CLI is read-only, has no browser dependency, never touches local storage, requests `legacy_v1` explicitly, and exits non-zero with field-level failure messages. The shared sweep accepts an engine version so the same matrix can compare `m1` after a real M1 resolver exists; today the registry safely rejects `m1`.

## 3. Preserve / intentionally change / monitor classification

### PRESERVE

- Same-seed exact equality inside `legacy_v1`.
- Legacy resolver outputs and RNG consumption order.
- Canonical `MatchDetail` and Watch replay equality.
- Daily input/offer/run determinism.
- Resume/refresh equality and no reroll.
- Difficulty, squad-strength, opponent-strength, and Role-balance orderings.
- Viable run progression, champion band, resolved-count band, and deterministic penalties.
- Catalogue boundaries and formation completion.
- Existing `resolveNext` consumer contract.

### INTENTIONALLY CHANGE IN M1

- Eleven-scoreline structural limit.
- No side scoring four or more.
- No draw of 2-2 or higher.
- Uniform/flat legacy goal timing.
- Post-hoc statistics.
- Signatures being absent from simulation.
- Weak visible Match Plan effect.
- Non-causal events generated after the score.

### MONITOR ONLY

- Exact commentary wording.
- Exact sequence frequency.
- Exact individual scorer frequency.
- Exact current Match Plan W/D/L delta.

These lists are checked into `matchCalibration.fixture.json`, so future work cannot treat known legacy defects as M1 design requirements by accident.

## 4. Engine version design

Canonical versions are:

- `LEGACY_ENGINE_VERSION = 'legacy_v1'`
- `M1_ENGINE_VERSION = 'm1'`
- `ACTIVE_ENGINE_VERSION = 'legacy_v1'`

`ENGINE_VERSIONS` registers both. `legacy_v1` is implemented/runnable; `m1` is known but explicitly non-runnable. New controllers receive the active version and expose it through a getter backed by an immutable closure value. External assignment cannot switch a run.

M1 is not active. Calling controller creation or dispatch with `m1` throws before result RNG is consumed or pending match state is changed. Unknown versions also throw/reject rather than downgrading.

## 5. Legacy fallback behavior

Snapshot interpretation is:

| Persisted value | Canonical resolver |
| --- | --- |
| missing top-level `engineVersion` | `legacy_v1` |
| historical `phase6.1` | `legacy_v1` |
| explicit `legacy_v1` | `legacy_v1` |
| `m1` while unimplemented | reject safely |
| unknown/malformed value | reject safely |

An old valid snapshot restores through `legacy_v1`. Its controller remains locked to `legacy_v1`, and the next save writes canonical `engineVersion: 'legacy_v1'`; it is never rewritten to the current app default or to `m1`.

`schemaVersion` remains `1`. This is an additive semantic interpretation of an already-present top-level field, not an incompatible snapshot-shape change. Historical snapshots without the new strong canonical signature remain valid. New snapshots add `signatures.canonicalMatches`; when present, reconstruction checks goals, timing, participants, stats, tactics, and `MatchDetail`, not only the historical headline signature.

## 6. Resolver dispatch architecture

`createRunSimulation().resolveNext(approachKey)` remains the public contract.

Inside the controller:

1. The current implementation is retained in place as `resolveNextLegacy`.
2. Public `resolveNext` calls `resolveMatchByEngineVersion` with the immutable run version.
3. `legacy_v1` calls the unchanged legacy closure.
4. `m1` has no fake fallback and throws as unimplemented.

This is the smallest safe boundary: no large engine copy, no RNG refactor, no field rename/removal, and no change to Watch/Quick Sim/Sim All consumers. A future M1 resolver can replace only the inner version branch while the run state machine and outer return shape remain stable.

## 7. Fixed-seed parity results

- Exact representative match fixtures: **5/5 passed**.
- Exact representative complete-run fixtures: **4/4 passed**.
- Historical Phase 3 complete-run fixtures: **16/16 passed**.
- Same-seed complete match/run serialization: byte-identical.
- Different-seed sample: multiple results and scorelines observed.
- Penalty fixture: `0-0 (pens 5-4)`, deterministic `pens-loss`.
- Frozen aggregate signature: `76273921`.

The dispatch wrapper did not change any captured opponent, result, score, goal minute, scorer, assist, stat, tactical metadata, `MatchDetail`, timeline, canonical replay, run checkpoint, or champion outcome.

## 8. Aggregate calibration results

Fast calibration uses 128 fixed-seed runs per cell.

Run-level balanced/classic baseline:

| Metric | Legacy baseline |
| --- | ---: |
| Average league W-D-L | 6.2578-1.6406-0.1016 |
| Qualification rate | 100.00% |
| Champion rate | 36.72% |
| Runs with penalties | 43.75% |
| Penalty matches / resolved matches | 4.04% |
| Average resolved count | 11.2188 |

Progression/exit distribution is League Phase 0.00%, Play-Off 0.78%, Round of 16 11.72%, Quarter-final 13.28%, Semi-final 20.31%, and Final 53.91% (champions are included in the Final exit-stage bucket and reported separately).

Difficulty ordering:

| Difficulty | Avg league wins | Champion rate |
| --- | ---: | ---: |
| Casual | 6.5781 | 36.72% |
| Classic | 6.5234 | 35.16% |
| Legendary | 5.3203 | 14.06% |

Role-balance ordering:

| Squad | Base win probability | Avg league wins | Champion rate | Expected weakness |
| --- | ---: | ---: | ---: | --- |
| Balanced | 0.7853 | 6.1484 | 34.38% | none |
| No natural width | 0.7318 | 5.7578 | 25.00% | No Natural Width |
| Over-creative midfield | 0.6860 | 5.4063 | 21.88% | Too Many Creators + no holder |
| No midfield holder | 0.6484 | 5.2344 | 13.28% | No Defensive Shield / Ball Winner |
| Weak defensive structure | 0.4265 | 3.2500 | 0.00% | Weak Defense + no holder |

Opponent win-rate ordering (`weak <=77`, `mid 78-87`, `strong >=88`) is preserved in every squad band:

| Squad band | Weak opponent | Mid opponent | Strong opponent |
| --- | ---: | ---: | ---: |
| Low | 69.57% | 69.17% | 62.76% |
| Medium | 76.18% | 72.69% | 68.98% |
| High | 83.09% | 76.53% | 71.57% |

The fixture also records goals for/against, clean sheets, 0-0s, failed-to-score rate, one-goal margins, and 2+ margins for all nine squad/opponent cells. All five formation cells completed and remained inside their documented bands.

Match Plan baseline (MONITOR ONLY) average league W-D-L:

- Balanced: 5.9375-1.6797-0.3828
- Control: 6.0469-1.6406-0.3125
- Wide: 5.9141-1.6641-0.4219
- Counter: 5.9063-1.6719-0.4219

Tolerance design:

- Exact fixtures: zero tolerance.
- Run level: average W/D/L ±0.15 matches, rates ±4 percentage points, average resolved count ±0.25.
- Match level: rates ±5 percentage points, GF/GA means ±0.15.
- Formation/Role/difficulty cells: average W/D/L ±0.25, rates ±7 percentage points, resolved count ±0.40.
- Ratings/fixture identities are exact; Role base probability tolerance is ±0.0001.
- Match Plan deltas are not a failure condition.

Fixed seeds eliminate sampling flakiness; tolerances express the intended contract for later engine comparison.

## 9. Persistence compatibility

Covered and passing:

- New `legacy_v1` run.
- Old snapshot with no engine field.
- Historical `phase6.1` snapshot.
- Explicit `legacy_v1` snapshot.
- Invalid, malformed, unknown, and unimplemented versions.
- Hub, Watch, post-match, upgrade, knockout, result, and simulation checkpoints.
- Already-resolved match and pending opponent reconstruction.
- Curated V2 and frozen legacy catalogue reconstruction.
- Exact squad, club identity, catalogue/DB version, seed, resolved count, checkpoint, approach history, upgrade state, headline signature, and strong canonical signature.
- Old snapshot re-save to canonical `legacy_v1` without schema bump or destructive migration.

No snapshot is resimulated under the app default. Reconstruction first resolves the snapshot version and passes it explicitly to the controller.

## 10. Daily safety

Daily remains on the frozen `legacy_v1` catalogue and `legacy_v1` match engine. Same date/configuration/first-choice draft produced the same 11 player IDs, run seed, engine version, opponent, score, result, and match signature across two browser runs. Refresh did not change the post-match checkpoint or signature.

Future rule: Daily may switch to M1 only at an explicit calendar-date or ruleset-version boundary. A Daily run begun before that boundary must resume with its persisted legacy version. No activation date or ruleset switch is implemented in M0/M0.1.

## 11. Resume / replay safety

- Watch and Quick Sim still resolve once and consume the same stored/reconstructed match.
- Refresh returns to the saved checkpoint; Resume does not reroll.
- Watch replay starts again at kickoff for presentation but finishes at the same stored score, verdict, stats, detail, and timeline signature.
- A resolved legacy match keeps its exact headline and strong canonical signatures after refresh and Resume.
- Presentation generation retains its independent deterministic seed and cannot alter simulation outcome.
- A missing-version snapshot continued to the next hub, re-saved as `legacy_v1`, and retained the exact prior match signature.

## 12. Test results

Required automated gates:

| Command | Result |
| --- | --- |
| `npm run db:validate` | PASS — 0 problems, 0 warnings |
| `npm run db:audit` | PASS |
| `npm run db:audit:transfers` | PASS — 0 problems |
| `npm run db:sim` | PASS — 100% formation completion for all catalogues |
| `npm run draft:fit-audit` | PASS |
| `npm run match:calibration` | PASS |
| `npm test` | PASS — 11 files, 237 tests |
| `git diff --check` | PASS |

Normal tests remain fast (about three seconds in the final local run). No deep calibration command was added; the deterministic 128-run-per-cell matrix completes quickly enough for development while covering all required dimensions.

## 13. Browser results

Browser smoke ran against the real Vite app on `127.0.0.1`:

- **Flow A — Random Modern Mix:** drafted XI, began European Run, confirmed `engineVersion: legacy_v1`, curated catalogue, hub checkpoint, resolved and watched match, refreshed, resumed Watch, and reproduced `Catalan Kings 3-0` / `0|L1|Catalan Kings|3-0|win` with no drift; next hub kept resolved count 1 and the same signature.
- **Flow B — Daily:** two independent same-date (`2026-07-10`) first-choice drafts produced identical offers/selections, seed `1578313147`, `legacy_v1`, and `0|L1|Bavarian Giants|3-1|win`; refresh preserved the post-match checkpoint.
- **Flow C — Legends:** snapshot retained `pool: legends`, `catalogVersion: legacy_v1`, and `engineVersion: legacy_v1` at hub, after resolution, and after refresh.
- **Flow D — Old snapshot:** removed top-level engine version, restored without crash at the exact post-match result, continued to hub, re-saved as `legacy_v1`, and retained `0|L1|Zagreb Blues|0-1|loss`.
- **Post-signature check:** a new resolved run wrote canonical signature `68cee18f`; refresh/Resume reproduced it exactly. A synthetic historical snapshot with both `engineVersion` and `canonicalMatches` removed restored successfully, then gained `legacy_v1` and the same canonical signature on its next save.
- Browser console/page errors observed: **0**.

Environment caveat: the installed in-app Browser automation surface reported unavailable after two connection attempts. Following its documented fallback path, the smoke used local headless Google Chrome through Playwright against localhost only. No external site or user data was involved.

## 14. Risks / caveats

- `simulate()` remains the historical eager reference simulator and is not a live persistence path. Version authority is implemented at the actual live boundary, `createRunSimulation().resolveNext`. M1 must not bypass that boundary.
- The legacy inner resolver remains physically in `data.js` to avoid a high-risk copy/extraction that could alter closure state or RNG order. It is logically isolated behind `resolveNextLegacy` and version dispatch.
- Canonical snapshot signatures are deterministic 32-bit regression guards, not cryptographic integrity proofs. Historical headline-only snapshots remain accepted by design.
- The fast aggregate matrix is a regression/calibration gate, not a claim of population-level statistical precision. A later independent M1 tuning audit should run a larger sweep without changing the checked-in fast fixture.
- M1 is registered but deliberately unusable. Any attempt to persist or run `m1` before implementation fails safely.

## 15. Exact handoff for M1

Do not begin M1 until this foundation passes independent audit.

When approved:

1. Add the real causal resolver as a new implementation behind `resolveMatchByEngineVersion`; do not modify or re-stream `resolveNextLegacy`.
2. Keep `ACTIVE_ENGINE_VERSION = 'legacy_v1'` during implementation and calibration.
3. Make the M1 resolver return the existing match object / `resolveNext` contract; add only genuinely required optional M1 fields.
4. Run `runCalibrationSweep({ engineVersion: 'm1' })` against the same cells, preserving the **PRESERVE** contracts while allowing the checked-in **INTENTIONALLY CHANGE** metrics to move.
5. Keep old/missing/`phase6.1` saves routed permanently to `legacy_v1`, including unresolved future matches in those runs.
6. Add M1-specific save/resume and causal-event tests before marking `m1` runnable.
7. Activate new Random/Legends runs only through a deliberate active-version change after audit.
8. Activate Daily only at an explicit date/ruleset boundary, never mid-date and never mid-run.

No M1 logic was implemented in this phase.
