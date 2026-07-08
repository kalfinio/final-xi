# CODEX PHASE A TARGETED RE-AUDIT

Audit date: 2026-07-08  
Branch: `phase-a-v2-wip`  
Scope: targeted verification of Claude's remediation for the previous Codex P0/P1 activation blockers.

## 1. Executive Verdict

**YES - ACTIVATE V2 CURATED CATALOGUE**

The previous P0 transfer-truth blocker is resolved. The curated activation catalogue materially fixes the full-master dilution issue while preserving deterministic ordering, catalogue boundaries, and formation completion. Role-suitability remediation is real: 202 explicit overrides are present, all legends are curated, scarce roles improved, and `Big Game Scorer` is removed from the V2 tactical taxonomy while legacy behavior remains intact.

Important caveat: the live UI has not yet been switched to V2 in this working tree. Browser smoke therefore verifies the current live legacy path plus persistence/runtime stability. Activation should wire new runs to `modern_mix_v2_curated`, not `modern_mix_v2_2026_07_07`.

## 2. Baseline Reproduction

Repository state before this report file:

| Check | Result |
| --- | --- |
| Branch | `phase-a-v2-wip...origin/phase-a-v2-wip` |
| Modified files | `data/transferIntel.2026-07-07.json`, `package.json`, `src/data/v2/catalogues.js`, `src/data/v2/dbV2.test.js`, `src/data/v2/index.js`, `src/data/v2/playersModern.js`, `src/data/v2/schema.js`, `src/data/v2/validate.js` |
| New files | `scripts/sim-catalogues.mjs`, `scripts/sim-curate-experiment.mjs`, `src/data/v2/draftSim.js`, `src/data/v2/legendProfiles.js`, `src/data/v2/roleSuitabilityOverrides.js`, remediation reports |
| Unexpected production changes | None found in `src/App.jsx`, `src/data.js`, or `src/runPersistence.js` |

Command results:

| Command | Actual result |
| --- | --- |
| `npm run db:validate` | Pass, `0 problems, 0 warnings` |
| `npm run db:audit` | Pass; 544 players, 461 modern, 83 legends, curated catalogue 341 |
| `npm run db:audit:transfers` | Pass; 8 confirmed entries, `0 problems` |
| `npm run db:sim` | Pass; reports legacy/full-master/curated simulation |
| `npm test` | Pass; 9 files, 183 tests |
| `npm run build` | Pass; JS `472.86 kB`, gzip `133.40 kB` |

## 3. Transfer Truth Verdict

**Verdict: fixed. No remaining P0 found.**

Remaining confirmed entries: `donnarumma`, `ederson`, `cucurella`, `bernardo`, `konate`, `dumfries`, `gordon`, `lewandowski`.

The six previously unsupported canonical moves are no longer in transfer intel and now resolve to:

| Player | Canonical club now | Verdict |
| --- | --- | --- |
| Olise | `bayern` | Correct |
| Xavi Simons | `tottenham` | Correct |
| Kimmich | `bayern` | Correct |
| Jonathan David | `juventus` | Correct |
| Frenkie de Jong | `barcelona` | Correct |
| Christensen | `barcelona` | Correct |

Remaining confirmed moves:

| Player | Canonical club | Source verdict |
| --- | --- | --- |
| Donnarumma | `man_city` | Supported by Man City official and Sky; dates corrected to 2025-09-02 |
| Ederson | `fenerbahce` | Supported by Man City official and Sky; dates corrected to 2025-09-02 |
| Cucurella | `real_madrid` | Supported by Real Madrid official announcement |
| Bernardo | `real_madrid` | Supported by Real Madrid official announcement |
| Konate | `real_madrid` | Supported by Real Madrid official announcement |
| Dumfries | `real_madrid` | Supported by Real Madrid official announcement |
| Gordon | `barcelona` | Supported by AP/Reuters via Al Jazeera; ESPN page is JS-blocked but redundant |
| Lewandowski | `chicago_fire` | Supported by Chicago Fire official announcement |

Source hierarchy behavior:

- Unsupported moves were reverted.
- Jackson no-op intel was removed.
- No rumours/advanced/Here We Go entries overwrite canonical clubs.
- Validator now rejects source types outside the known hierarchy, source dates after cutoff, non-confirmed canonical contamination, and confirmed moves not reflected in canonical `clubId`.

## 4. Curated Modern Mix Simulation

Catalogue status:

| Catalogue | Size | Duplicates | Unresolved | Activation |
| --- | ---: | ---: | ---: | --- |
| `legacy_v1` | 134 | 0 | 0 | no |
| `modern_mix_v2_2026_07_07` | 544 | 0 | 0 | no |
| `modern_mix_v2_curated` | 341 | 0 | 0 | yes |
| `legends_v2` | 83 | 0 | 0 | no |

The curated catalogue is an explicit deterministic filtered subset of the master order. `modern_mix_v2_2026_07_07` remains available as the full master DB view.

`npm run db:sim` output:

| Catalogue | Avg offer | Avg XI | Min | Median | Max | Completion | Premium offer | GOAT offer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Legacy | 13.30 | 184.91 | 114 | 183 | 290 | 100% | 73.34% | 2.33% |
| Full-master V2 | 10.99 | 118.65 | 65 | 118 | 212 | 100% | 24.05% | 0.45% |
| Curated V2 | 12.47 | 145.09 | 93 | 144 | 220 | 100% | 38.56% | 0.77% |

Independent 60-seed guardrail check:

| Catalogue | Passes guardrails | Avg XI | Avg offer | Premium | GOAT | Top-10 concentration | Distinct offered |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Curated | yes | 146.91 | 12.44 | 39.20% | 0.78% | 8.91% | 340 |
| Full master | no | 118.01 | 11.02 | 24.48% | 0.45% | 5.37% | 540 |

Slot depth for curated:

`GK 32`, `RB 22`, `CB 62`, `LB 30`, `RWB 15`, `LWB 18`, `CDM 68`, `CM 101`, `CAM 80`, `RM 12`, `LM 5`, `RW 47`, `LW 55`, `ST 77`.

Verdict:

- Curated V2 materially solves full-master dilution.
- It preserves formation viability across all current formations.
- LM remains the shallowest slot at 5, but not dangerously shallow under the current formation set.
- Premium exposure is lower than legacy but no longer collapsed; this is acceptable for activation because distinct-offer variety is much higher.

## 5. Role Override Verdict

**Verdict: fixed.**

Verified:

| Metric | Result |
| --- | ---: |
| Explicit override IDs | 202 |
| Legend override coverage | 83 / 83 |
| Modern override coverage | 119 |
| Curated overrides differing from fallback | 190 |
| Fallback example | `sommer` uses deterministic derived profile |

Override precedence is real: `kane.roleSuitability` equals `curatedRoleSuitability(kane)` and differs from fallback derivation. Uncurated players still receive schema-valid fallback maps.

Manual/mechanical samples for Messi, Cristiano Ronaldo, Maradona, Pele, Zidane, Ronaldinho, Maldini, Beckenbauer, Xavi, Iniesta, Ronaldo Nazario, Henry, Haaland, Mbappe, Salah, Vinicius, Saka, Kane, Lautaro, Rodri, Bellingham, Pedri, De Bruyne, Valverde, Rice, Van Dijk, Saliba, Hakimi, Theo Hernandez, Alisson, and Donnarumma showed no hard-invalid role/position mappings.

Minor football-review note: a few versatile profiles are generous, especially wide forwards with striker/winger alternates and Timber as L2 Defensive Wingback. These are plausible enough and not activation blockers.

## 6. Defensive Wingback Verdict

**Verdict: fixed enough for activation.**

Reported remediation verified exactly:

| Level | Count |
| --- | ---: |
| L3 | 0 |
| L2 | 4 |
| L1 | 6 |

L2 players: Ashley Cole, Marc Cucurella, Jurrien Timber, Javier Zanetti.  
L1 players: Andrea Cambiaso, Matteo Darmian, Federico Dimarco, Denzel Dumfries, David Raum, Destiny Udogie.

The role is now accessible without pretending anyone is a natural L3 Defensive Wingback. Assignments are broadly plausible; Timber L2 is the only one I would flag for later football review, not a blocker.

## 7. Big Game Scorer Taxonomy Verdict

**Verdict: fixed.**

Verified:

- `Big Game Scorer` is absent from V2 `ROLE_KEYS`.
- No V2 player has it as `primaryRole`.
- No V2 `roleSuitability` map references it.
- `LEGACY_PRESSURE_DESCRIPTORS` preserves it as a legacy-only descriptor.
- Legacy engine data still contains `Big Game Scorer` and `big_game_player` behavior; legacy determinism tests pass.
- V2 adapter maps `Big Stage` to the legacy `big_game_player` tag, not to a tactical role.

## 8. Signature Verdict

**Verdict: fixed enough for activation.**

All legends now have authored signature profiles through `legendProfiles.js`; schema validation passes.

Heavy clusters still exist because the DB is large:

| Signature | Count |
| --- | ---: |
| Recovery Pace | 174 |
| Line Breaker | 140 |
| Composed Finisher | 116 |
| Aerial Target | 106 |
| Pocket Finder | 83 |
| Final Ball | 81 |

This is no longer the old generic legend-by-position clustering. Representative legends now differ: e.g. Beckenbauer, Maldini, Cannavaro, Ramos, Xavi, Iniesta, Zidane, Ronaldinho, Messi, Cristiano Ronaldo, Pele, Ronaldo Nazario, and Henry all have distinct plausible sets.

No famous-player misprofile strong enough to block activation was found.

## 9. Character Verdict

**Verdict: fixed enough for activation.**

Legend character assignments are authored and spread across many archetypes. They are not all `Big Stage` or `Mentor`.

Distribution after remediation:

| Character | Count |
| --- | ---: |
| Quiet Pro | 102 |
| Career Climber | 88 |
| Competitor | 76 |
| Confidence Player | 60 |
| Standard Bearer | 45 |
| Relentless | 42 |
| Free Spirit | 34 |
| Big Stage | 28 |
| Firebrand | 23 |
| Club Heart | 23 |
| Mentor | 15 |
| Maverick | 8 |

No defamatory or unsupported controversy label was found in the sampled legend set. `Maverick` for Maradona/Cruyff/Romario/Ibrahimovic-style profiles is subjective but not inappropriate.

## 10. Simulation Guardrail Verdict

**Verdict: fixed.**

Verified:

- `src/data/v2/draftSim.js` is deterministic and uses seeded game helpers.
- `npm run db:sim` is present.
- Tests use threshold bands, not exact output pins.
- Formation completion, average XI rating, offer points, premium/GOAT exposure, slot depth, top-10 concentration, and distinct-offered count are monitored.
- All current formations are included through `SIM_FORMATIONS`.
- A synthetic full-master check fails the same guardrail bands, so the tests detect the known dilution failure mode.

Remaining limitation: the guardrail uses a first-choice policy. That is reasonable for regression detection but not a full player-choice model.

## 11. Determinism Verdict

**Verdict: preserved.**

Representative exact fixtures:

| Scenario | Result |
| --- | --- |
| Legacy daily GK, 2026-07-07 | seed `1150895598`, IDs `oblak`, `valdes`, `schmeichel` |
| Legacy ST seed 777 | `inzaghi`, `raul`, `vannistelrooy` |
| Legends ST seed 777 | `distefano`, `maradona`, `benzema` |
| Curated ST seed 777 | `ronaldo`, `greenwood`, `distefano` |
| Curated ST seed 777 with used IDs | `henry`, `vanbasten`, `havertz` |
| Curated GK seed 42 | `nubel`, `gulacsi`, `terstegen` |

Slot filtering, used-player filtering, and legends boundary checks passed. V2 curated fixtures are expected to differ from full-master because catalogue membership changed.

## 12. Persistence Verdict

**Verdict: preserved.**

Verified:

- No diff in `src/runPersistence.js`.
- Old snapshots without `catalogVersion` default to `legacy_v1`.
- Known V2 snapshots can resolve V2 IDs via selected catalogue.
- Unknown catalogue resolve returns `null`; unknown snapshot validation returns false.
- Corrupt V2 ID resolve returns `null`.
- Browser Watch Match refresh and Resume smoke passed with no console/page errors.

## 13. Browser Verdict

**Verdict: current runtime smoke passes.**

In-app browser was unavailable, so I used local headless Chromium against `http://127.0.0.1:5173`.

Verified:

- Random Run
- Modern Mix
- reroll
- full XI draft
- Confirm XI
- European Run
- Watch Match
- Watch Match refresh
- Resume
- Sim All
- Result
- Report
- Daily Challenge
- Legends Only
- Upgrade Offer / run-upgrade surface reachable at Result

Console/page errors: none.

Note: because the live app has not been switched to V2, Modern Mix in this browser smoke still uses the legacy live catalogue. After wiring activation to `modern_mix_v2_curated`, rerun this same smoke once.

## 14. Remaining P0

None found.

## 15. Remaining P1

None blocking activation.

Watch item:

- Curated V2 average XI rating (`~145`) is still materially below legacy (`~185`), but it is far above the full-master collapse (`~118`), passes the new guardrail band, and offers much higher player variety. This is an activation balance decision, not a remaining blocker.

## 16. P2 / Safe to Defer

- Re-run browser smoke after the actual activation wiring.
- Review Timber's Defensive Wingback L2 if doing football-profile polishing.
- Continue signature/character curation for modern long-tail players.
- Consider a future simulation model beyond first-choice selection.
- Bundle grew to `472.86 kB` JS / `133.40 kB` gzip; acceptable for now.

## 17. Final Activation Recommendation

**YES - ACTIVATE V2 CURATED CATALOGUE**

Activate new-run Modern Mix against `modern_mix_v2_curated`. Do not activate the full-master `modern_mix_v2_2026_07_07` as the default draft pool.

Legacy saves and deterministic legacy behavior are preserved.

## 18. Exact Claude Fix List, If Any

No P0/P1 code/data fixes required before activation.

Activation checklist:

1. Wire new-run Modern Mix to `modern_mix_v2_curated`.
2. Keep `legacy_v1` as the default for old snapshots and legacy reconstruction.
3. Keep full-master V2 as a DB/audit catalogue, not the default activation pool.
4. Re-run `npm run db:validate`, `npm run db:audit`, `npm run db:audit:transfers`, `npm run db:sim`, `npm test`, `npm run build`, and browser smoke after the activation wiring.
