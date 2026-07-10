# A.5 Draft Clarity & Casual Understanding V1

## 1. Executive verdict

**A.5 REMEDIATED - READY FOR TARGETED OPUS RE-AUDIT.**

The draft now teaches a decision model of individual value, Club Identity fit, and developing squad need without changing player values, catalogue content/order, offer generation, match formulas, seeds, or canonical match state. The default card is beginner-facing; existing advanced Role and rating evidence remain available under Details.

## 2. Initial repo state

- Branch: `main`
- Worktree before editing: clean (`main...origin/main`)
- Activation commit at `HEAD`: `64f474c activate curated player database v2`
- Prior commits confirmed: `11686e2`, `d47c643`, `5783875`, `f4c36fd`
- Live catalogue wiring confirmed before work: Random Modern Mix -> `modern_mix_v2_curated`; Daily and Legends Only -> `legacy_v1`

## 3. Current draft UX diagnosis

Before A.5, setup chose mode, pool, difficulty, and formation. The card then led with advanced Role, badges, chemistry/achievement tags, raw `N pts`, and historical pick rate. Its only expansion answered "Why these points?". It did not explain player function in casual language, style fit, opportunity cost, current squad context, or the reason a selected player helped. The first-run guide described rules and Final Rating but did not teach that the highest visible number could be the wrong profile for the developing XI.

Offer generation was already correctly isolated in `catalogueSlotOptions`: Daily used the existing date/slot/reroll seed path, random retained the existing random offer path, and every reroll used the run's pinned catalogue. European Run persistence began only after XI confirmation; draft-progress persistence did not exist and was not added.

## 4. Points / Player Quality decision

The default player-facing signal is now **PLAYER QUALITY** plus a broad source-backed label such as `ELITE`, `STAR`, `PROVEN`, or `PROSPECT`. GOAT aura overrides produce `ALL-TIME GREAT` / `WORLD CLASS`; otherwise the label comes from the existing V2 tier. Legacy-only records without a V2 tier use explicit existing classification tags or legend era and never receive an invented elite claim.

The raw Points number is removed from the default card. It remains under Details as secondary **DRAFT VALUE**, explicitly described as an internal game value rather than a football rating. No 0-99 conversion was added.

## 5. Rating mapping methodology

No presentation mapping is used. Audited min/Q1/median/Q3/max values are:

| Catalogue | Min | Q1 | Median | Q3 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `legacy_v1` | 8 | 11 | 13 | 16 | 40 |
| `modern_mix_v2_curated` | 6 | 11 | 13 | 15 | 40 |

The UI preserves the exact engine value only in Details. It is not mapped, normalized, or presented as standalone player quality.

## 6. Archetype translation methodology

`src/draftClarity.js` is a deterministic presentation layer. Existing primary Role maps to one plain-language uppercase archetype. Examples include `Defensive Shield -> MIDFIELD ANCHOR`, `Tempo Controller -> CREATIVE CONTROLLER`, `Box-to-Box Engine -> TRANSITION ENGINE`, and `Direct Runner -> TRANSITION RUNNER`. A position fallback exists for defensive safety, but tests prove no active catalogue player resolves to the generic fallback.

The existing Role remains authoritative and appears under Details. For a legacy record whose ID also has a differently re-authored V2 primary Role, the visible legacy Role is authoritative so Daily/Legends explanations cannot contradict the card.

## 7. Strength translation methodology

Every active draft player receives exactly two unique strengths. Resolution order is:

1. Existing V2 Signatures translated through a controlled phrase map.
2. Existing primary Role translated through a controlled two-strength map.
3. Position-family fallback only if needed.

Examples include `Tempo Setter -> Controls possession`, `Final Ball -> Creates decisive chances`, `Recovery Pace -> Recovers ground quickly`, and `Box Guardian -> Protects the penalty area`. No random prose or player biography table is used. Legacy records whose visible Role differs from the re-authored V2 primary Role do not consume the mismatched V2 Signatures.

## 8. Tradeoff methodology

One tradeoff is shown only when supported by one of three sources, in priority order:

1. Actual squad duplication (`Similar profile already covered`).
2. A calculated `WEAK` Club Identity fit.
3. A controlled opportunity-cost statement supported by the primary Role.

Roles without an honest concise opportunity cost omit it. Tradeoffs never use result knowledge and never describe a player as bad.

## 9. Club Identity architecture

Exactly four run-philosophy choices were added before formation/start: `CONTROL`, `PRESS`, `TRANSITION`, and `FORTRESS`. Each setup option contains a slogan, plain explanation, five valued qualities, one tradeoff, and a style reference. Start is disabled until both Identity and formation are chosen.

Identity is metadata used by draft communication. It does not enter `computeRating`, offer generation, `buildSimSeed`, `buildTactics`, tactical approach selection, tactical matchup, or match resolution. Match Plan remains opponent-specific.

## 10. Identity Fit calculation

Fit is deterministic and presentation-only:

- Each identity has a small explicit Role affinity table on a 0-3 scale.
- The visible natural primary Role contributes `affinity * 2` and is always the dominant Role input.
- At most one level-2 Role can add up to `0.75` support, and only when it is more identity-compatible than the primary Role.
- Up to three matching Signatures contribute `0.35` each.
- Labels are `EXCELLENT >= 6.35`, `GOOD >= 4.75`, `MODERATE >= 3`, otherwise `WEAK`.

Only the label is shown; no decimal score is exposed. The score has no gameplay bonus.

## 11. Identity Fit explanation path

Details shows the same primary Role, optional supporting level-2 Role, and matching Signatures used by the score. Every explanation contributor carries its source key, suitability level, and value. Tests recompute the score from those displayed contributors exactly.

## 12. Squad Need methodology

Squad Need is conservative and derives only from selected players:

- Picks 1-4: always silent.
- Mid-draft: may state that a candidate adds a currently uncovered functional profile or that two matching archetypes are already selected.
- Picks 9-11: may state `FILLS A WEAKNESS` only when a priority function is absent from the selected squad and the candidate actually provides it.

Goalkeeping, defensive structure, and midfield protection are separate functions. Only `Defensive Shield` and `Ball Winner` satisfy `midfield-protection`; a keeper or back line no longer suppresses the late `DEFENSIVE PROTECTION` need. Width is only a late priority when the formation contains wide slots. One candidate receives at most one need result.

## 13. First-run teaching behavior

The first draft shows a compact inline lesson: star power is not always the best pick; compare Player Quality, Identity Fit, and Squad Need. `SHOW ME AN EXAMPLE` expands one short opportunity-cost example. `GOT IT` stores `finalxi.draftClaritySeen.v1` in local storage. It does not repeat after acknowledgement and creates no backend/account dependency.

## 14. Post-pick feedback behavior

Each pick produces a non-modal inline selection summary on the next offer: player added, up to two deduplicated positives, and at most one tradeoff. The draft advances immediately. The final pick summary is deterministically rebuilt from the completed XI on Set Your XI, so it survives the draft component unmount without delaying the flow.

## 15. Persistence changes

`run.config.clubIdentity` is persisted as optional run metadata inside the existing schema/version. New runs store one of the four lowercase keys. Resume reconstructs it into App config and the intro summary displays it. No `catalogVersion`, schema version, engine version, or checkpoint architecture changed.

During browser validation, the initial hub checkpoint was also fixed to persist the already-sanitized team name directly rather than the pre-React-update value. This is a checkpoint fidelity fix only.

## 16. Backward compatibility

Snapshots without `run.config.clubIdentity` remain valid and reconstruct with `clubIdentity: null`. They resume directly at their saved European Run checkpoint, are not routed through setup, and keep their exact catalogue version. On a later save, the field becomes explicit `null`; this is neutral metadata and does not affect reconstruction or simulation.

## 17. Daily verification

- Activation remains `legacy_v1` for both Daily pools.
- Existing exact Daily offer tests remain unchanged and pass.
- Browser check on 2026-07-10 produced the same first offer across CONTROL and PRESS: Valdes, Van der Sar, Ter Stegen.
- Reroll 1 also matched across identities: Neuer, Kahn, Schmeichel.
- Daily header, Rating, archetype, strengths, and three PRESS fit labels rendered correctly.

## 18. Legends verification

- Activation remains `legacy_v1`; legend filtering remains in the existing catalogue helper.
- Browser offer contained only legacy legends: Van der Sar, Kahn, Casillas.
- All three cards rendered Rating, archetype, exactly two strengths, FORTRESS Fit, and advanced Details with no unresolved values.

## 19. Deterministic behavior verification

No descriptive path uses `Math.random`. Archetype, strengths, fit, tradeoff, squad need, and feedback are pure translations of player/config/squad state. Identity is absent from offer and simulation seed inputs. Existing fixed-seed, Daily, catalogue containment, reroll, canonical match, and reconstruction fixtures all pass unchanged.

## 20. Automated test results

- `npm run db:validate`: pass, 0 problems / 0 warnings
- `npm run db:audit`: pass, 544 players / 341 curated activation members
- `npm run db:audit:transfers`: pass, 0 problems
- `npm run db:sim`: pass, all catalogue/formation completion 100%; curated averages unchanged at offer 12.47 / XI 145.09
- `npm run draft:fit-audit`: pass, 341 curated players
- `npm test`: pass, **10 files / 215 tests**
- `git diff --check`: pass (only Git's existing LF-to-CRLF warnings)

New focused coverage includes source-backed quality, absence of draft-card football ratings, unchanged Points, deterministic archetypes/strengths, legacy Role/Signature authority, Recovery Pace wording, fit-distribution sanity, exact contributor-score integrity, identity offer/seed invariance, realistic goalkeeper-inclusive midfield protection, false-positive prevention, persistence, and existing canonical fixtures.

## 21. Build result

`npm run build`: pass with Vite 6.4.3, 54 modules transformed. Output JS is 496.20 kB (139.79 kB gzip); CSS is 23.97 kB (5.60 kB gzip).

## 22. Browser smoke results

Local automated smoke used Playwright Core with installed headless Edge against `http://127.0.0.1:5173`; the in-app browser backend was unavailable. The temporary Playwright install was outside the repository and added no project dependency.

- All four identities: selectable; correct header and three valid fit labels; acknowledged guidance did not repeat.
- Desktop 1440x1000: default cards show a 14px source-backed quality word; no Points number or `PLAYER RATING` appears; archetype and fit are at least equally legible.
- Mobile 390x844: no horizontal overflow; card text and controls fit.
- Random Modern Mix: reroll changed offers, eleven picks completed, post-pick feedback rendered, mid-draft `ADDS` and late `FILLS A WEAKNESS` / `ROLE ALREADY COVERED` appeared from actual state, XI completed, European Run entered.
- Exact refresh/resume: `Exact A5 XI`, `CONTROL`, `modern_mix_v2_curated`, `hub`, resolved count 0, and rendered hub all matched before/after refresh.
- PRESS: a first goalkeeper offer rendered `WEAK / GOOD / WEAK`; later rounds retained meaningful variation.
- TRANSITION: multiple rounds rendered all four fit labels across appropriate profiles.
- Defensive protection: a real `5-3-2` with Maignan, a complete back line, and two non-protective midfielders correctly showed Tchouameni `FILLS A WEAKNESS / DEFENSIVE PROTECTION`.
- Daily: initial and rerolled offers matched across CONTROL and TRANSITION.
- Legends: legend-only offer and sensible corrected strength output rendered.
- Legacy snapshot: missing identity resumed without setup, retained `modern_mix_v2_curated`, and re-saved with neutral `null`.
- Browser console/page errors: none.

## 23. Caveats

- Raw Points remain available only as secondary internal Draft Value in Details; broad quality labels deliberately avoid numerical precision.
- Identity Fit is a small explicit communication model, not a gameplay modifier or scouting system.
- Squad Need V1 is deliberately conservative. It does not rank offers, forecast results, or claim detailed formation-specific needs beyond functional coverage and width relevance.
- Draft progress itself is still not persisted; A.5 did not expand checkpoint architecture.
- No player database, transfer, Role/Signature/Character/development, point value, catalogue, match engine, European Run, or canonical MatchDetail data was changed.

## 24. Exact recommendation for Codex audit

Re-audit only the five remediated findings. Review `src/draftClarity.js` for quality-source resolution, primary-Role fit inputs, contributor correspondence, midfield protection, and the legacy Signature guard. Review `src/App.jsx` for the absence of a default numeric Rating. Run the required commands, `npm run draft:fit-audit`, and the seven targeted browser flows. Do not reopen Player Database V2 or recalibrate values.

## 25. Independent Audit Remediation

### 25.1 Audit findings reproduced

All five requested findings were reproduced before remediation: raw 6-40 Points dominated the default card under the misleading `PLAYER RATING` label; PRESS and TRANSITION had almost no WEAK profiles because the maximum suitability Role controlled fit; goalkeeper protection made late defensive protection unreachable; `Recovery Pace` read as possession recovery; and legacy Role mismatches inherited V2 Signatures.

### 25.2 P1 fixes

1. Replaced default numeric Rating with source-backed Player Quality and moved raw Points to secondary Draft Value in Details.
2. Replaced maximum-suitability fit with primary-Role-led scoring, limited level-2 support, smaller Signature modifiers, and selective thresholds.
3. Split goalkeeper security, defensive structure, and midfield defensive protection so the taught opportunity cost is reachable.

### 25.3 Specified P2 fixes

- `Recovery Pace` now reads `Recovers ground quickly`, including on attackers.
- `playerSignatures` now applies the same legacy primary-Role mismatch guard as `playerRoleSuitability`; Rodri, Van Dijk, Pedri, and Mbappe fall back to their visible legacy Role strengths.

### 25.4 Quality presentation decision

Default cards show no Points number and make no football-rating claim. Quality resolution order is GOAT aura, V2 tier, explicit legacy classification tag, then legend era. Labels are controlled translations of those sources. The exact engine value is unchanged and only appears under Details as internal Draft Value.

### 25.5 Fit model revision

The natural primary Role contributes `affinity * 2`. One more-compatible level-2 Role may add at most `0.75`. Up to three identity-valued Signatures add `0.35` each. Identity-averse primary Roles have low explicit affinity and therefore remain weak unless actual supporting data moves them. `SHOW ME WHY` is generated only from these contributing inputs.

### 25.6 New fit distributions

Exact `modern_mix_v2_curated` results across 341 players:

| Identity | EXCELLENT | GOOD | MODERATE | WEAK |
| --- | ---: | ---: | ---: | ---: |
| CONTROL | 86 (25.2%) | 83 (24.3%) | 157 (46.0%) | 15 (4.4%) |
| PRESS | 54 (15.8%) | 117 (34.3%) | 138 (40.5%) | 32 (9.4%) |
| TRANSITION | 83 (24.3%) | 80 (23.5%) | 132 (38.7%) | 46 (13.5%) |
| FORTRESS | 59 (17.3%) | 59 (17.3%) | 176 (51.6%) | 47 (13.8%) |

Every identity uses all four labels. PRESS and TRANSITION now contain meaningful WEAK populations, and EXCELLENT remains below 26% for every identity.

### 25.7 Defensive-protection function revision

Keeper Roles provide `goalkeeping`; defender Roles provide `defensive-structure`; only Defensive Shield and Ball Winner provide `midfield-protection`. A realistic goalkeeper-inclusive `5-3-2` test proves a late Defensive Shield can fill `DEFENSIVE PROTECTION`, while a Ball Winner already in the XI prevents that claim.

### 25.8 Legacy Signature safety

When a frozen legacy card's visible Role differs from its V2 profile's primary Role, V2 Signatures are not used by beginner-facing strengths or fit modifiers. Player data and both catalogues remain unchanged.

### 25.9 Remediation test results

- Database validation/audit/transfer audit/simulation: pass
- Curated fit distribution audit: pass, 341 players
- Vitest: 10 files / 215 tests pass
- Production build: pass
- Diff check: pass

### 25.10 Remediation browser verification

- CONTROL: default quality is truthful and compact; no numeric Rating dominates; first offer showed meaningful fit differentiation.
- PRESS: first offer `WEAK / GOOD / WEAK`; multiple rounds checked.
- TRANSITION: WEAK, MODERATE, GOOD, and EXCELLENT observed across rounds.
- Defensive protection: real `5-3-2` state surfaced the repaired signal.
- Daily: identical initial and rerolled legacy offers across identities.
- Legends: legend-only offers and sensible strengths.
- Resume: identity, catalogue, unresolved signature count, checkpoint, and rendered hub preserved exactly.
- Mobile: no horizontal overflow; console/page errors: none.

### 25.11 Intentionally deferred P2 items

No remediation changes were made for slot-blind archetypes, Touchline Winger `CENTRAL CREATION` wording, null-identity defensive guards, broader/tautological test cleanup, or quartile-test cleanup. No additional team-name persistence cleanup was performed; the existing uncommitted behavior was left unchanged.
