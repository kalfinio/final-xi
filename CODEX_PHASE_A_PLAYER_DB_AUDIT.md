# CODEX PHASE A PLAYER DB AUDIT

Audit date: 2026-07-07  
Branch: `phase-a-v2-wip`  
Auditor: Codex, independent of the Phase A.2 implementation

## 1. Executive Verdict

**YES - ACTIVATE AFTER LISTED P0/P1 FIXES**

The Phase A.2 codebase is structurally valid, tests pass, build passes, browser smoke passes, legacy determinism appears preserved, and the V2 catalogue boundaries resolve correctly. It is not activation-ready yet because the transfer snapshot contains confirmed-status/source-hierarchy errors that affect canonical club identity, and Modern Mix as the full master database materially changes draft strength versus the current live legacy experience.

## 2. Baseline Reproduction

Repository state before this report file:

| Check | Result |
| --- | --- |
| Branch | `phase-a-v2-wip...origin/phase-a-v2-wip` |
| Uncommitted files | `data/transferIntel.2026-07-07.json`, `src/data/v2/dbV2.test.js`, `src/data/v2/index.js`, `src/data/v2/playersModern.js`, `src/data/v2/validate.js`, `PHASE_A2_CONTENT_COMPLETION_REPORT.md` |
| Recent base | `d47c643 stabilize player database v2 foundation`, previous `5783875`, base `f4c36fd` |
| A.2 diff scope | V2 data, roleSuitability derivation/tests/audit output, transfer intel; no persistence/runtime draft UI code changed |

Command results:

| Command | Result |
| --- | --- |
| `npm run db:validate` | Pass, `0 problems, 0 warnings` |
| `npm run db:audit` | Pass, counts reproduced below |
| `npm run db:audit:transfers` | Pass, `15` schema-valid confirmed entries, `0 problems` |
| `npm test` | Pass, `9` files, `161` tests |
| `npm run build` | Pass, 51 modules, JS `454.49 kB`, JS gzip `130.30 kB`, CSS `23.75 kB`, CSS gzip `5.54 kB` |

Note: initial sandboxed Vite/test invocations hit Windows access restrictions; reruns with approved command execution passed. This was an environment permission issue, not a repo failure.

## 3. P0 Correctness Findings

### P0-1 - Transfer snapshot overstates confirmed moves and changes canonical clubs on unsupported sources

Files:

- `data/transferIntel.2026-07-07.json:38`
- `data/transferIntel.2026-07-07.json:48`
- `data/transferIntel.2026-07-07.json:58`
- `data/transferIntel.2026-07-07.json:68`
- `data/transferIntel.2026-07-07.json:88`
- `data/transferIntel.2026-07-07.json:98`
- `data/transferIntel.2026-07-07.json:108`

Evidence:

- `dumfries` is marked `confirmed` to `real_madrid`, but accessible Real Madrid transfer summaries distinguish him from confirmed signings and describe him as not yet announced / expected imminently. The cited OneFootball URL could not be independently verified in the browser tool, so the current evidence does not meet the report's own hierarchy for canonical overwrite.
- The cited SportsMole Barcelona confirmed-transfer page supports Anthony Gordon in and Robert Lewandowski out, but not `olise`, `xavisimons`, or other Barcelona canonical changes.
- The cited Teamtalk Barcelona page supports Gordon and Lewandowski in/out lists, but did not expose supporting evidence for `kimmich`, `jonathandavid`, or `frenkie`.
- The cited Bavarian Football Works rolling Bayern page did not provide confirmed-transfer support for `christensen` to Bayern or a meaningful confirmed update for `jackson`. It is a rolling rumors/updates source, not an official completion source.
- `donnarumma` and `ederson` canonical clubs are supported by Man City/Sky source evidence, but their `publishedAt` metadata in the transfer intel says `2026-06-20` while the source material is dated September 2025.
- `cucurella` has `sourceType: official_club` pointing to an SI article, not an official club source.

Risk:

- This breaks the audit rule that only official/completed moves should overwrite canonical `clubId`.
- It directly affects canonical player identity and league membership in V2.
- The schema validator passes because it validates shape, not source truth.

Fix direction:

- Re-review every transfer entry against the stated hierarchy.
- Keep only officially completed or strongly corroborated completed transfers as canonical `clubId`.
- Downgrade unsupported entries to non-canonical intel or remove them from `transferIntel`.
- Correct `sourceType` and `publishedAt` metadata.
- For unconfirmed / Here We Go / advanced-talk cases, do not overwrite `player.clubId`.

## 4. P1 Data-Quality Findings

### P1-1 - Modern Mix full-master activation materially changes draft strength

Evidence from deterministic 2,000-seed formation sweep, first-choice policy:

| Pool | Avg offer points | Avg full XI rating | Min XI | Max XI |
| --- | ---: | ---: | ---: | ---: |
| Legacy Modern | 13.28 | 183.32 | 104 | 279 |
| V2 Modern Mix | 11.00 | 118.00 | 57 | 201 |
| Legacy Legends | 12.50 | 175.66 | n/a | n/a |
| V2 Legends | 12.55 | 177.51 | n/a | n/a |

Risk:

- V2 Modern Mix is structurally draftable, but activation would likely make squads much weaker than the current live Modern Mix experience unless match odds/scoring expectations are recalibrated.
- This is not a catalogue correctness bug; it is an activation balance blocker.

Fix direction:

- Decide before activation whether Modern Mix should be full DB, a curated activation subset, or full DB with weighting/tier scoring calibration.
- Add simulation thresholds so future expansions cannot silently dilute the draft.

### P1-2 - Role suitability coverage is complete but still mostly derived, not curated

Files:

- `src/data/v2/index.js:144`
- `src/data/v2/index.js:150`
- `src/data/v2/index.js:151`
- `src/data/v2/index.js:153`
- `src/data/v2/validate.js:54`
- `src/data/v2/dbV2.test.js:230`

Evidence:

- Coverage is `544/544`.
- The derivation is deterministic and sparse: primary role level 3, secondary-position role level 2, signature-driven sibling level 2, optional utility neighbor level 1.
- Validator catches bad role IDs and invalid values, but does not judge football plausibility.
- Size distribution: `1 role: 83`, `2 roles: 234`, `3 roles: 168`, `4 roles: 59`.

Risk:

- Good enough as a Phase A scaffold, but not a final Tactical HQ foundation for all players.
- Legends and elite players often receive generic suitability/signature profiles from broad positional rules.

Fix direction:

- Keep derivation as fallback.
- Curate roleSuitability manually for high-impact modern players, legends, and all roles intended for Tactical HQ decisions.

### P1-3 - Two role definitions are effectively unavailable

Evidence from `npm run db:audit`:

| Role | L3 | L2 | L1 | Finding |
| --- | ---: | ---: | ---: | --- |
| Defensive Wingback | 0 | 0 | 1 | Effectively unavailable |
| Big Game Scorer | 0 | 0 | 0 | Registered role has no player suitability |

Risk:

- Formations can complete, but Tactical HQ role selection would expose dead or near-dead roles.
- If role bonuses or assistant explanations later assume every registered role is draft-accessible, these become user-facing gaps.

Fix direction:

- Either curate players into these roles or keep them out of active Tactical HQ surfaces until populated.

### P1-4 - Signature distribution is schema-valid but visibly clustered

Top signature frequencies:

| Signature | Count |
| --- | ---: |
| Recovery Pace | 152 |
| Line Breaker | 138 |
| Composed Finisher | 117 |
| Aerial Target | 109 |
| Final Ball | 86 |
| Pocket Finder | 85 |
| Duel Hunter | 77 |
| Inside Threat | 65 |

Risk:

- Not invalid, but many legends and broad position groups become profile-similar.
- Signature-driven role suitability can overstate secondary tactical identities for some specialists.

Fix direction:

- Curate signatures for legends and top modern players first.
- Add distribution review in DB audit, not hard equality targets.

### P1-5 - Club/league concentration remains high

Top league concentration:

| League | Players |
| --- | ---: |
| eng_pl | 180 |
| esp_laliga | 111 |
| ita_seriea | 93 |
| ger_bundesliga | 54 |
| fra_ligue1 | 31 |

Top clubs:

| Club | Players |
| --- | ---: |
| real_madrid | 42 |
| barcelona | 35 |
| milan | 25 |
| bayern | 24 |
| man_united | 23 |
| man_city | 23 |

Risk:

- This is acceptable for Phase A activation if intended, but it will limit future international/league-mode variety.
- It should not block architecture work, but it should be visible before V2 activation.

## 5. False Positives

- The exact normalized-name collision `ederson` is not a duplicate identity. It corresponds to Ederson the goalkeeper and Ederson/Ederson M the Atalanta midfielder.
- Catalogue resolution is valid. No unresolved members were found in `legacy_v1`, `modern_mix_v2_2026_07_07`, or `legends_v2`.
- All players are reachable through at least one supported slot in at least one catalogue/formation context.
- Legacy determinism fixtures remained stable in sampled checks.
- Persistence files were not changed by A.2; stabilized catalogue-aware reconstruction remains in place.
- Transfer metadata is not bundled into the production asset by direct string search for source URLs/metadata keys.

## 6. Player Count and Coverage Audit

Counts reproduced from project audit and independent scripts:

| Entity | Count |
| --- | ---: |
| Total V2 players | 544 |
| Modern | 461 |
| Legends | 83 |
| Clubs | 114 |
| Leagues | 16 |
| Nations | 76 |
| Nations used by players | 55 |
| Leagues used by players | 15 |

Catalogue sizes:

| Catalogue | Size |
| --- | ---: |
| `legacy_v1` | 134 |
| `modern_mix_v2_2026_07_07` | 544 |
| `legends_v2` | 83 |

## 7. Duplicate/Alias Audit

Probable duplicate identities found: none.

One normalized collision should be documented but not removed:

| Normalized name | IDs | Verdict |
| --- | --- | --- |
| `ederson` | `ederson`, `ederson_m` | Valid distinct players; consider display/alias clarity only |

No duplicate catalogue memberships or unresolved catalogue IDs were found.

## 8. Role Suitability Audit

Coverage claim verified: `544/544`.

Representative mechanical samples across GK, CB, full-back/wing-back, DM, CM, AM, wide players, strikers, high-growth players, veterans, elite specialists, and utility players found no hard position-family nonsense such as GK inside-forward suitability.

Observed quality issues:

- Specialists generally remain sparse, which is good.
- Utility players can reach four roles, generally plausibly.
- The derivation is broad enough that some pure finishers receive `Complete Striker` L2 from signature/position rules.
- Legends are not deeply hand-curated; several legend profiles look generic.
- `Big Game Scorer` and `Defensive Wingback` are role-coverage gaps.

## 9. Role Scarcity Audit

Selected role counts:

| Role | L3 | L2 | L1 |
| --- | ---: | ---: | ---: |
| Defensive Shield | 16 | 25 | 9 |
| Touchline Winger | 11 | 38 | 0 |
| Defensive Wingback | 0 | 0 | 1 |
| Big Match Keeper | 6 | 0 | 0 |
| Ball Winner | 18 | 29 | 29 |
| Tempo Controller | 28 | 5 | 9 |
| Creative Magician | 40 | 46 | 0 |
| Inside Forward | 56 | 45 | 23 |
| Complete Striker | 21 | 52 | 25 |
| Box Finisher | 38 | 16 | 0 |

Claude's reported scarce-role improvement is partly true:

- `Defensive Shield` improved from the previous audited baseline of 4 primary-role players to 16 L3 / 50 total suitability.
- `Touchline Winger` improved from 4 primary-role players to 11 L3 / 49 total suitability.
- Full-back/wing-back depth improved materially.

Remaining issue:

- `Defensive Wingback` and `Big Game Scorer` are not activation-ready as active tactical roles.

## 10. Position/Formation Coverage Audit

Primary position distribution:

| Position | Count |
| --- | ---: |
| GK | 38 |
| RB | 30 |
| CB | 89 |
| LB | 25 |
| CDM | 50 |
| CM | 76 |
| CAM | 54 |
| RW | 48 |
| LW | 33 |
| ST | 91 |
| RWB | 4 |
| LWB | 6 |

Slot pool availability for V2 Modern Mix, including eligibility:

| Slot | Eligible pool |
| --- | ---: |
| GK | 38 |
| RB | 51 |
| LB | 54 |
| CB | 101 |
| RWB | 32 |
| LWB | 31 |
| CDM | 99 |
| CM | 155 |
| CAM | 116 |
| RM | 16 |
| LM | 7 |
| RW | 77 |
| LW | 94 |
| ST | 128 |

Formation verdict:

| Formation | Verdict |
| --- | --- |
| 4-3-3 | Supported |
| 4-4-2 | Supported, but LM/RM are shallow |
| 4-2-3-1 | Supported |
| 3-5-2 | Supported |
| 5-3-2 | Supported |

## 11. Modern Mix Catalogue Simulation

V2 Modern Mix 5,000-seed offer sweep, all formations:

| Tier | Offer frequency |
| --- | ---: |
| quality | 43.75% |
| star | 31.15% |
| elite | 22.39% |
| goat_candidate | 0.96% |
| squad | 1.31% |
| goat | 0.44% |

Other measured signals:

| Metric | Value |
| --- | ---: |
| GOAT offer-slot frequency | 1.30% |
| Elite/goat_candidate/goat offer-slot frequency | 55.60% |
| All-quality-or-below offer slots | 9.32% |

Most repeated players were versatile full-backs/defenders and multi-position players, led by `guerreiro`, `maatsen`, `stanisic`, `bale`, `davies`, `grimaldo`, `ericgarcia`, `darmian`, `maldini`, `kounde`, `walker`, `theo`, `cucurella`, `timber`, and `tchouameni`.

Verdict:

- V2 still offers recognizable/elite players frequently.
- It is nevertheless materially weaker by current `playerPoints`/rating output than legacy Modern Mix.
- Activation should not be a blind switch to the full master DB without a balance decision.

## 12. Signature Audit

Schema integrity passed.

No hard invalid assignment pattern was found in mechanical samples, but signature de-clustering is incomplete:

- Recovery/line-breaking/aerial/finisher signatures are heavily repeated.
- Legends often inherit generic signatures from broad position/role heuristics.
- Wingers are not all `Inside Threat`, midfielders are not all `Final Ball`, CBs are not all `Box Guardian`, and strikers are not all `Composed Finisher`, so the issue is clustering, not complete monoculture.

## 13. Character Audit

Character distribution:

| Character | Count |
| --- | ---: |
| Quiet Pro | 101 |
| Career Climber | 88 |
| Competitor | 71 |
| Relentless | 52 |
| Confidence Player | 51 |
| Standard Bearer | 38 |
| Big Stage | 30 |
| Free Spirit | 28 |
| Club Heart | 28 |
| Mentor | 27 |
| Firebrand | 16 |
| Maverick | 14 |

Verdict:

- Schema-valid and no obviously defamatory systematic issue found in samples.
- `Quiet Pro` and `Career Climber` are high enough to deserve football review.
- The model lacks DOB/age, so age coherence can only be inferred from player knowledge and development profile.

## 14. Development Profile Audit

Distribution:

| Development profile | Count |
| --- | ---: |
| prime | 292 |
| veteran | 93 |
| developing | 75 |
| high_growth | 48 |
| decline_risk | 36 |

Verdict:

- Good enough as a sparse Phase A future hook.
- No prospect tier exists in player tiers despite future Academy/Evolutions needs.
- Without DOB/season-age data, future Evolutions will need either curated age bands or a date-of-birth/age-season field.

## 15. Transfer Snapshot Audit

Snapshot file: `data/transferIntel.2026-07-07.json`

Schema result: valid, 15 confirmed entries.

Source-truth result: not activation-ready.

Confirmed or mostly supported:

| Player | Current snapshot | Verdict |
| --- | --- | --- |
| `donnarumma` | Man City | Canonical supported; metadata date appears wrong |
| `ederson` | Fenerbahce | Canonical supported; metadata date appears wrong |
| `gordon` | Barcelona | Supported by accessible completed-transfer lists |
| `lewandowski` | Chicago Fire | Barcelona exit supported; destination should be rechecked against official/registration source |
| `cucurella` | Real Madrid | Likely supported by secondary sources; `sourceType` is wrong |
| `bernardo` | Real Madrid | Needs recheck if official source required |
| `konate` | Real Madrid | Some secondary support; cited source mismatch should be cleaned |

Unsupported or over-confirmed in current evidence:

| Player | Snapshot club | Issue |
| --- | --- | --- |
| `dumfries` | Real Madrid | Marked confirmed despite accessible sources saying not announced/imminent |
| `olise` | Barcelona | Cited SportsMole Barcelona confirmed list did not support this |
| `xavisimons` | Barcelona | Cited SportsMole Barcelona confirmed list did not support this |
| `kimmich` | Barcelona | Cited Teamtalk page did not support this in accessible content |
| `jonathandavid` | Barcelona | Cited Teamtalk page did not support this in accessible content |
| `frenkie` | Man United | Cited Teamtalk page did not support this in accessible content |
| `christensen` | Bayern | Cited Bayern rolling page did not support confirmed canonical change |

Relevant source URLs checked:

- Man City Donnarumma official: https://www.mancity.com/news/mens/manchester-city-sign-psg-goalkeeper-gianluigi-donnarumma-63892398
- Sky Donnarumma/Ederson: https://www.skysports.com/football/news/11095/13423571/gianluigi-donnarumma-joins-man-city-goalkeeper-signs-for-lb26m-from-paris-saint-germain-as-ederson-moves-to-fenerbahce
- SportsMole Barcelona: https://www.sportsmole.co.uk/football/barcelona/transfer-talk/feature/barcelona-summer-transfers-all-confirmed-ins-and-outs-for-2026_599077.html
- Teamtalk Barcelona: https://www.teamtalk.com/news/every-completed-barcelona-transfer-summer-2026-signings-sales-loans
- SportsMole Real Madrid: https://www.sportsmole.co.uk/football/real-madrid/transfer-talk/feature/real-madrid-summer-transfers-all-confirmed-ins-and-outs-for-2026_599076.html
- SI Real Madrid: https://www.si.com/soccer/real-madrid-2026-27-transfers-new-signings-targets-outgoings
- Bavarian Football Works Bayern: https://www.bavarianfootballworks.com/bayern-munich-transfer-news-rumors/201663/bayern-munichs-2026-summer-transfer-window-all-updates

## 16. Determinism Audit

Representative fixed checks:

| Scenario | Seed/date | Offered IDs |
| --- | --- | --- |
| Legacy daily GK | 2026-07-07 / `1150895598` | `oblak`, `valdes`, `schmeichel` |
| Legacy ST | `777` | `inzaghi`, `raul`, `vannistelrooy` |
| V2 Modern ST | `777` | `lautaro`, `williamsjr`, `jackson` |
| V2 Modern GK | `42` | `pickford`, `oblak`, `leno` |
| V2 Legends ST | `777` | `distefano`, `maradona`, `benzema` |

Verdict:

- Legacy behavior appears preserved in sampled fixtures.
- V2 fixtures changed from the stabilized baseline where expected because the modern array expanded.
- The risk is not accidental legacy drift; the risk is future V2 ordering changes if authors reorder data casually.

## 17. Persistence Audit

A.2 did not modify persistence files. Diff from `d47c643` for `src/runPersistence.js`, `src/data/v2/catalogues.js`, `src/data/v2/legacyAdapter.js`, and legacy player data was empty except normal git ignore warnings.

Current stabilized behavior remains:

- Old snapshots without `catalogVersion` default to `legacy_v1`.
- Known V2 snapshots resolve through catalogue-aware lookup.
- Unknown catalogue versions and corrupt IDs are covered by tests.
- Browser watch refresh resumed the same saved run without console/page errors.

Verdict: persistence is not an A.2 regression area.

## 18. Bundle Audit

Build output:

| Asset | Size | Gzip |
| --- | ---: | ---: |
| JS | 454.49 kB | 130.30 kB |
| CSS | 23.75 kB | 5.54 kB |

Bundle string search:

- V2 player/runtime catalogue data is bundled, expected under current synchronous draft/resume architecture.
- Transfer source metadata and source URLs were not found in `dist/assets`.

Verdict:

- Bundle size is acceptable for Phase A activation readiness, but no lazy-loading boundary exists yet.
- Further optimization can defer unless mobile performance proves poor.

## 19. Browser Verification

In-app browser was unavailable in this session. I used local headless Chromium through Playwright against `http://127.0.0.1:5173`.

Verified flows:

| Flow | Result |
| --- | --- |
| Random Run | Pass |
| Modern Mix | Pass |
| Reroll | Pass |
| Complete XI | Pass |
| Confirm XI | Pass |
| European Run | Pass |
| Approach selection | Pass |
| Watch Match | Pass |
| Refresh Watch Match | Pass |
| Resume Run | Pass |
| Sim All | Pass |
| Result | Pass |
| Report | Pass |
| Daily Challenge | Pass, drafted to Set XI |
| Legends Only | Pass, drafted to Set XI |
| Upgrade Offer | Present/reachable at result path; no crash |

Console/page errors: none observed.

## 20. Activation Readiness Verdict

Not ready for immediate activation.

The code path is stable enough to continue Phase A work, but activation should wait for:

1. Transfer canonical/source corrections.
2. A Modern Mix activation-balance decision.
3. Role suitability/role registry cleanup for unavailable roles.

## 21. Must Fix Before Activation

P0:

- Correct or revert unsupported canonical club changes in `playersModern.js`.
- Correct `transferIntel.2026-07-07.json` so `confirmed` only means completed/officially corroborated.
- Fix false source metadata: source type, publication dates, and unsupported cited URLs.

P1:

- Decide Modern Mix activation strategy: full DB with recalibrated scoring/weights, or curated activation catalogue.
- Populate or hide `Big Game Scorer` and `Defensive Wingback`.

## 22. Should Fix Soon

- Curate roleSuitability for legends and top modern players instead of relying entirely on fallback derivation.
- Review heavy signature clusters.
- Add simulation thresholds for average rating/tier exposure before enabling V2 live.
- Add a transfer-source audit checklist that requires official/registration evidence for canonical overwrite.

## 23. Safe to Defer

- Bundle code splitting.
- Broad league/nation expansion beyond activation needs.
- Prospect tier population.
- DOB/age model, unless Evolutions starts immediately after Phase B.
- Full transfer rumor taxonomy for non-canonical intel.

## 24. Recommended Claude Fix List

Smallest precise next pass:

1. Re-audit the 15 transfer entries. Keep supported completed moves, downgrade/remove unsupported ones, and update `playersModern.js` club IDs accordingly.
2. Correct source metadata for Donnarumma/Ederson and Cucurella.
3. Decide whether `modern_mix_v2_2026_07_07` should remain full master DB for activation. If yes, add balance calibration; if no, create a curated activation catalogue without deleting the full master DB.
4. Populate or deactivate `Big Game Scorer` and `Defensive Wingback`.
5. Add one regression test/simulation that fails if V2 activation average XI rating drops far below the agreed target.
6. Curate roleSuitability/signatures for legends and the top 100 most recognizable modern players.

Final answer: **YES - ACTIVATE AFTER LISTED P0/P1 FIXES**.
