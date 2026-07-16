# Final XI Match Engine M1 Activation Report

Date: 2026-07-14  
Branch: `match-engine-m1-activation`  
Status: ready for independent audit; not committed, pushed, or merged

## 1. Files changed

- `src/matchEngineM1.js` — causal Counter/Control tuning, M1 preview evidence adapter, and evidence-backed downside accounting.
- `src/matchEngineVersions.js` — centralized new-run activation policy.
- `src/App.jsx` — new-run engine selection routed through the centralized policy; development query handling remains isolated.
- `src/data.js` — engine-aware Match Hub previews and M1 resolution using the selected M1 preview/matchup object.
- `src/tacticalApproach.js` — M1 preview fit and evidence-gated full-time feedback alignment.
- `src/matchEngineM1Calibration.js` — expanded plan metrics and paired plan-audit API.
- `scripts/match-m1-plan-audit.mjs` — deterministic deep plan-balance release audit.
- `scripts/match-m1-calibration.mjs` — activation-status wording.
- `package.json` — `match:m1-plan-audit` command.
- `src/matchEngineM1Activation.test.js` — activation, Daily isolation, preview truth, feedback, and fast plan-balance regression coverage.
- `src/matchEngineM1.test.js`, `src/matchEngineFoundation.test.js` — activation expectations and exact M1 fixture coverage.
- `src/matchEngineM1.fixture.json` — post-tuning exact M1 signatures (`m1-activation-v1`).
- `src/runPersistence.test.js`, `src/runUpgrades.test.js`, `src/tacticalApproach.test.js` — historical legacy scenarios now request `legacy_v1` explicitly so active-default changes cannot reinterpret their intent.
- `MATCH_ENGINE_M1_ACTIVATION_REPORT.md` — this report.

No player data, Role data, Signature data, catalogue data, persistence schema, or frozen legacy resolver code was changed.

## 2. Fable P1 reproduced

The reported dominance problem was reproduced before tuning with an independent, paired 84,000-match matrix:

- 3 squad bands × 7 opponent archetypes × 4 plans × 1,000 shared seeds.
- Best-plan cells: Balanced 0, Control 15, Wide 5, Counter 1.
- Best-or-within-0.04-PPM cells: Balanced 2, Control 17, Wide 10, Counter 1.
- Counter was only viable for the low-strength squad against Pressing.
- Control led 15/21 cells and combined the lowest concessions/losses with too little attacking cost.

The representative pre-tuning plan calibration also showed the expectation problem:

| Plan | PPM | W/D/L | Own/Opp opportunities | Own/Opp xG | Volatility |
|---|---:|---|---|---|---:|
| Balanced | 2.214 | 66.37/22.32/11.31 | 8.93/6.13 | 1.481/0.558 | 1.840 |
| Control | 2.313 | 70.24/20.54/9.23 | 8.56/5.46 | 1.506/0.497 | 1.644 |
| Wide | 2.268 | 67.56/24.11/8.33 | 9.49/6.76 | 1.621/0.631 | 1.810 |
| Counter | 2.193 | 64.88/24.70/10.42 | 7.48/6.39 | 1.366/0.574 | 1.905 |

## 3. Counter tuning

Counter was tuned only through causal opportunity, progression, and chance mechanics:

- Base own opportunity-volume multiplier increased from `0.84` to `0.91`.
- Opponent-volume exposure increased slightly from `1.05` to `1.06`.
- Own volume receives a bounded `1.05` multiplier against Pressing/Attacking, but a `0.91` multiplier against Defensive/Underdog blocks.
- Counter/direct progression receives contextual help against Attacking (`+0.045`) and Elite (`+0.025`) opponents.
- Counterattack chance-quality reward increased from `+0.045` to `+0.060` xG before caps.
- Pressing and Attacking space-behind rewards receive small Counter-only increments; direct and press-recovery routes also benefit against Attacking.
- Compact opponents retain lower transition space, lower own volume, and fewer settled chances.

There is no flat win, result, comeback, or scoreline bonus. Counter remains lower-possession, lower-volume, higher-variance, and more dependent on route success.

## 4. Control tuning

Control's safety was priced through the same causal layer:

- Base own volume changed from `0.96` to `0.94`.
- Opponent suppression changed from `0.88` to `0.94`, removing under-priced universal protection.
- Own opportunity pressure receives a `0.90` multiplier against Defensive/Underdog blocks.
- Central buildup, one-two, and through-ball progression receive a bounded `-0.030` compact-block penalty.
- Generic settled-route quality reward reduced from `+0.012` to `+0.004` xG.
- Compact-block central routes receive a further `-0.025` chance-quality penalty and canonical `control:sterile-possession` evidence.
- Control's downside metric now counts actual sterile-possession events instead of unrelated fast-route frequency.

Control retains high possession, central-combination identity, lower transition frequency, and lower volatility. It remains viable against Technical/Physical opponents without being both safest and strongest everywhere.

## 5. Wide and Balanced verification

Wide and Balanced causal constants were not retuned.

- Wide remains the leading compact-block answer: best in every Defensive and Underdog cell in the 1,000-seed matrix.
- Wide retains its concession downside: 7.42 opponent opportunities per match versus Balanced's 6.71 in the deep matrix, with greater dangerous-transition exposure.
- Balanced remains the stable baseline, wins the high-squad/Technical cell, and is within the 0.04-PPM viability band in 8/21 cells.
- Neither plan is universally optimal or strictly dominated.

## 6. Before/after plan metrics

Representative M1 calibration, 336 deterministic matches per plan:

| Plan | PPM before | PPM after | W/D/L after | Own/Opp opportunities after | Own/Opp xG after | Possession after | Volatility after |
|---|---:|---:|---|---|---|---:|---:|
| Balanced | 2.214 | 2.214 | 66.37/22.32/11.31 | 8.93/6.13 | 1.481/0.558 | 60.67% | 1.840 |
| Control | 2.313 | 2.226 | 66.67/22.62/10.71 | 8.20/5.82 | 1.396/0.527 | 64.33% | 1.605 |
| Wide | 2.268 | 2.268 | 67.56/24.11/8.33 | 9.49/6.76 | 1.621/0.631 | 60.03% | 1.810 |
| Counter | 2.193 | 2.268 | 67.56/24.11/8.33 | 8.01/6.42 | 1.512/0.575 | 49.96% | 2.103 |

Paired deep-matrix change:

| Measure | Balanced | Control | Wide | Counter |
|---|---:|---:|---:|---:|
| Best cells before | 0 | 15 | 5 | 1 |
| Best cells after | 1 | 3 | 9 | 8 |
| Viable cells before | 2 | 17 | 10 | 1 |
| Viable cells after | 8 | 9 | 12 | 10 |

The deep-matrix post-tuning aggregate identities were:

- Balanced: 2.062 PPM, 57.70% possession, 8.38/6.71 opportunities, volatility 1.721.
- Control: 2.014 PPM, 61.98% possession, 7.72/6.27 opportunities, volatility 1.602.
- Wide: 2.088 PPM, 57.11% possession, 8.98/7.42 opportunities, volatility 1.894.
- Counter: 2.078 PPM, 46.85% possession, 7.55/7.08 opportunities, volatility 1.857.

## 7. Per-archetype plan rankings

Exact 1,000-seed paired PPM matrix (84,000 matches total):

| Squad | Archetype | Balanced | Control | Wide | Counter | Ranking |
|---|---|---:|---:|---:|---:|---|
| Low | Pressing | 2.069 | 1.981 | 2.057 | 2.234 | Counter > Balanced > Wide > Control |
| Low | Technical | 1.852 | 1.854 | 1.880 | 1.892 | Counter > Wide > Control > Balanced |
| Low | Defensive | 1.980 | 1.815 | 2.039 | 1.921 | Wide > Balanced > Counter > Control |
| Low | Attacking | 2.050 | 2.046 | 2.042 | 2.301 | Counter > Balanced > Control > Wide |
| Low | Physical | 1.950 | 1.950 | 1.981 | 1.956 | Wide > Counter > Balanced > Control |
| Low | Elite | 1.815 | 1.822 | 1.786 | 1.827 | Counter > Control > Balanced > Wide |
| Low | Underdog | 2.045 | 1.849 | 2.176 | 2.005 | Wide > Balanced > Counter > Control |
| Medium | Pressing | 2.042 | 2.033 | 2.048 | 2.249 | Counter > Wide > Balanced > Control |
| Medium | Technical | 1.910 | 1.982 | 1.915 | 1.907 | Control > Wide > Balanced > Counter |
| Medium | Defensive | 1.942 | 1.763 | 2.029 | 1.854 | Wide > Balanced > Counter > Control |
| Medium | Attacking | 2.079 | 2.050 | 2.070 | 2.207 | Counter > Balanced > Wide > Control |
| Medium | Physical | 1.958 | 1.981 | 1.984 | 1.931 | Wide > Control > Balanced > Counter |
| Medium | Elite | 1.922 | 1.956 | 1.925 | 1.931 | Control > Counter > Wide > Balanced |
| Medium | Underdog | 2.116 | 1.949 | 2.159 | 2.011 | Wide > Balanced > Counter > Control |
| High | Pressing | 2.243 | 2.223 | 2.247 | 2.365 | Counter > Wide > Balanced > Control |
| High | Technical | 2.248 | 2.224 | 2.199 | 2.137 | Balanced > Control > Wide > Counter |
| High | Defensive | 2.165 | 1.982 | 2.240 | 2.028 | Wide > Balanced > Counter > Control |
| High | Attacking | 2.233 | 2.240 | 2.249 | 2.404 | Counter > Wide > Control > Balanced |
| High | Physical | 2.236 | 2.268 | 2.245 | 2.198 | Control > Wide > Balanced > Counter |
| High | Elite | 2.160 | 2.182 | 2.184 | 2.108 | Wide > Control > Balanced > Counter |
| High | Underdog | 2.289 | 2.136 | 2.398 | 2.179 | Wide > Balanced > Counter > Control |

Best counts: Balanced 1, Control 3, Wide 9, Counter 8.  
Best-or-within-0.04-PPM counts: Balanced 8, Control 9, Wide 12, Counter 10.  
No plan is best everywhere; every plan is viable somewhere.

## 8. Preview alignment

`buildM1ApproachPreviews` is an M1-only adapter layered over the existing legacy preview object:

- Legacy runs retain the Phase-3 preview path byte-for-byte.
- M1 advice uses opponent archetype plus the current XI's buildup, control, width, transition, and defensive profile.
- Each plan exposes a benefit, a risk, a qualitative fit label, and a recommendation flag.
- No fake result percentage is shown.
- Fast regression tests compare recommendations with the paired causal matrix; the release audit retains the strict 0.04-PPM balance tolerance, while qualitative UI advice uses a documented 0.12-PPM small-sample evidence band.

Browser evidence:

- Pressing/Attacking: Counter — space for counter/direct attacks; risk is lower possession and fewer settled attacks.
- Defensive/Underdog: Wide — width, crosses, and cutbacks stretch the block; risk is central-transition exposure.
- Technical: Control — settled central buildup and fewer open transitions; risk is reduced direct threat.
- Balanced: stable route mix; risk is the absence of a specialist edge.

## 9. Full-time feedback alignment

M1 full-time feedback remains gated by `detail.metadata.causalSummary`:

- Counter credit requires sufficient counter/direct/press-recovery share and influenced events.
- Control credit requires settled central routes and possession; compact-block sterile evidence adds explicit downside language.
- Wide credit requires wide-overlap/cross/cutback evidence.
- Failure text now states the causal tradeoff instead of crediting the selected plan automatically.

Browser Watch Match evidence showed a Wide-plan 0-1 result crediting actual overlaps/deliveries. The canonical timeline contained one opponent goal, the score was 0-1, and displayed shots/saves agreed with the event-derived statistics.

## 10. Global balance decision

Decision: preserve the existing M1 macro balance.

Post-tuning representative aggregate:

- W/D/L: 70.79% / 21.57% / 7.64%.
- Goals per match: 2.1386.
- Champion rate: 27.34% (accepted target: 25%–35%).
- Qualification rate: 100% on the representative elite/classic baseline.
- Scoreless matches: 10.79%.
- One side scoring 4+: 6.71%.
- 2-2-or-higher draws: 2.64%.
- Unique scorelines: 28; maximum team goals in the sweep: 8.
- Comeback rate: 6.93%; late-goal rate: 17.60%.
- Losses, 0-0, higher draws, and rare high scores all remain possible.

No global quality or result-probability correction was added. The post-tuning macro output is effectively unchanged from the audited baseline, so further tuning would be unnecessary overfit.

## 11. Activation policy

`selectEngineVersionForNewRun` is the single policy boundary:

| New-run context | Engine |
|---|---|
| Random Modern | `m1` |
| Random Legends | `m1` |
| Daily Modern | `legacy_v1` |
| Daily Legends | `legacy_v1` |
| Development explicit override on Random | requested runnable version |
| Unknown/non-run mode | safe `legacy_v1` fallback |

`ACTIVE_ENGINE_VERSION` is now `m1`, but only the centralized selector creates App runs. Production ignores query overrides. Resume does not call this selector.

## 12. Daily isolation

- Daily is checked before environment or requested-version handling and always returns `legacy_v1`.
- Both pools are covered by unit tests.
- Development browser smoke launched Daily Legends from `?engine=m1`; the persisted engine remained `legacy_v1`.
- Production browser smoke repeated `?engine=m1`; the persisted engine remained `legacy_v1`.
- Daily Modern and Legends seeds, scores, and canonical signatures survived refresh/Resume exactly.

## 13. Persistence compatibility

- New Random Modern and Random Legends snapshots persist `m1`.
- Daily snapshots persist `legacy_v1`.
- Explicit M1 and legacy snapshots reconstruct through their persisted resolver only.
- A browser snapshot with the top-level engine version removed restored as `legacy_v1`, continued without score drift, and re-saved explicitly as `legacy_v1`.
- Engine version remains immutable on the run controller.
- No schema bump was required.
- Completed matches reconstruct from run seed, approach history, and canonical signatures; they are never regenerated through the active default.

Browser exact Resume evidence:

- Random Modern: canonical signature `3cddc985`; 0-1 score, 65/35 possession, 3-3 shots, 1-3 shots on target, and the 60' goal timeline reproduced exactly.
- Random Legends: canonical signature `0e078cf7`; 1-0 score reproduced exactly.
- Daily Modern: seed `2814971513`, signature `3fbe9f9f`, 2-1 score reproduced exactly.
- Daily Legends: seed `727038986`, 1-1 score and canonical signature reproduced exactly.

## 14. Legacy parity

- Exact legacy match fixtures: 5/5.
- Exact complete-run fixtures: 4/4.
- Historical fixed-seed fixtures: 16/16.
- Frozen aggregate signature: `76273921`.
- Canonical legacy replay, penalties, old-save fallback, catalogue boundaries, formation completion, and RNG order all pass.
- `resolveNextLegacy` behavior was not changed.

## 15. M1 calibration

`npm run match:m1-calibration` passed.

- Calibration signature: `304571c4`.
- Samples: 1,400 matches, 128 runs, 48 tactic samples/cell, 128 ordering runs/cell, 192 Role/Signature pair samples.
- Opportunities/chances: 15.02 / 10.24 per match.
- Champion rate: 27.34%.
- Penalties remain possible at run level (6.97% of knockout matches in the representative sweep).
- Difficulty, squad strength, opponent strength, and Role-balance orderings pass.
- Role and Signature controlled effects remain directionally correct and bounded.
- Event invariants, deterministic equality, score reduction, replay, Resume, timing, and scoreline-diversity gates remain green.

## 16. Test results

- `npm test`: 13 files, 273 tests, all passed.
- New activation suite covers:
  - centralized Random/Daily policy for both pools;
  - immutable controller engine;
  - production/development query isolation;
  - M1 preview benefits, risks, and recommendations;
  - legacy-preview non-mutation;
  - evidence-gated full-time feedback;
  - fast paired plan-balance regression and preview-to-model alignment.
- Exact M1 activation fixtures: 10/10.
- Database validation: 0 problems, 0 warnings.
- Transfer audit: 0 problems.
- Catalogue simulation: 100% formation completion.
- Draft fit audit: passed.

## 17. Build

`npm run build` passed with Vite 6.4.3:

- 56 modules transformed.
- CSS: 23.99 kB (5.61 kB gzip).
- JavaScript: 552.89 kB (156.41 kB gzip).
- Existing non-blocking warning: the main minified chunk exceeds 500 kB.

## 18. Browser smoke

Development and production bundles were tested with an isolated Chromium profile because the in-app browser backend was unavailable after its prescribed bootstrap/troubleshooting workflow.

- Random Modern: normal start persisted `m1`; draft, plan preview, Watch Match, event-derived score/stats/timeline, refresh, and exact Resume passed.
- Random Legends: normal start persisted `m1`; legend-only catalogue boundary, resolution, refresh, and exact Resume passed.
- Daily Modern: persisted `legacy_v1`; deterministic seed/result and refresh passed.
- Daily Legends: persisted `legacy_v1`, including under `?engine=m1`; legend-only boundary and refresh passed.
- Old missing-version snapshot: restored and re-saved as `legacy_v1`.
- M1 previews were visually checked for Pressing, Technical, Defensive, Attacking, and Underdog opponents.
- Control, Wide, Counter, and Balanced displayed distinct benefits/risks; watched Wide events and full-time feedback agreed.
- Production Random under `?engine=legacy_v1` still persisted `m1`.
- Production Daily under `?engine=m1` still persisted `legacy_v1`.
- Desktop and 375×812 mobile passed; mobile document/body width remained exactly 375 px with no horizontal overflow.
- Browser warnings: 0. Page errors: 0.

## 19. Risks and caveats

- Counter is deliberately strong against exposed Pressing/Attacking teams; it is not recommended against compact blocks and remains lower-volume/lower-control overall.
- Wide leads more deep-matrix cells than any other plan, but those cells are concentrated in its intended compact-block contexts and it retains the highest concession exposure.
- M1 preview advice is qualitative. It intentionally does not expose noisy win percentages.
- Preview archetype evidence is protected by a causal-matrix regression; future plan-mechanic changes must update both evidence and tests together.
- Daily still uses the frozen legacy catalogue/engine path by product decision.
- The existing production bundle-size warning remains a P2 performance concern, not an engine-safety issue.

## 20. Remaining P2 items

- Richer causal commentary and template variety.
- More detailed full-time cause/effect presentation.
- Opponent player naming and later Opponent Intelligence UI.
- Bundle code-splitting/performance cleanup.
- Halftime decisions, substitutions, and Matchday Management remain deferred to their declared later phases.

No deferred feature was pulled into this activation phase.

## 21. Public activation recommendation

Recommend independent audit, then release M1 for newly-created Random Modern and Random Legends runs.

Keep Daily Modern and Daily Legends permanently on `legacy_v1` until a separate dated Daily ruleset migration is explicitly designed and audited. Preserve all existing saves on their persisted engine version; do not bulk-migrate or reinterpret historical runs.
