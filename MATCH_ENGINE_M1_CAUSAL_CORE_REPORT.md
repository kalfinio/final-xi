# Final XI Match Engine M1 — Causal Core Implementation Report

Status: **M1 causal core complete and ready for independent audit.** M1 is implemented and explicitly runnable, but remains inactive in normal play and Daily.

## 1. Files changed

- `src/matchEngineM1.js` — causal resolver, schema, substreams, Roles, Signatures, reducers, shootouts.
- `src/matchEngineM1Calibration.js` — deterministic M1 outcome, shape, plan, archetype, Role, Signature, and preserve-band reporting.
- `src/matchEngineM1.test.js` — exact fixtures, invariants, properties, causal-effect tests, isolation tests.
- `src/matchEngineM1.fixture.json` — ten small exact M1 fixtures.
- `scripts/match-m1-calibration.mjs` and `package.json` — read-only `npm run match:m1-calibration` gate.
- `src/matchEngineVersions.js` — M1 is implemented/runnable through explicit dispatch; active remains legacy.
- `src/data.js` — M1 sibling resolver wired into the existing staged run controller; legacy resolver body remains untouched.
- `src/matchEngine.js` — M1 MatchDetail reducer adapter.
- `src/matchTimeline.js` and `src/matchCenterView.js` — causal timeline/sequence presentation adapter and long-range label.
- `src/tacticalApproach.js` — evidence-gated M1 post-match plan feedback.
- `src/runPersistence.js` and `src/runPersistence.test.js` — M1 canonical replay coverage and exact Resume/mixed-engine tests.
- `src/App.jsx` — development-only `?engine=m1` browser entry, ignored in production and Daily.
- `src/matchEngineFoundation.test.js` — registry expectations updated while retaining every legacy freeze.
- `src/data/v2/dbV2.test.js` — pinned an existing date-sensitive catalogue golden to its activation date; production catalogue logic is unchanged.

No audit report was modified. No commit, push, or merge was performed.

## 2. Final architecture

The public staged controller remains `createRunSimulation()` with `prepareNext()` and `resolveNext(approachKey)`. Its run-level engine version is locked at construction. Dispatch selects one sibling resolver:

```text
createRunSimulation
  prepareNext (shared schedule/opponent contract)
  resolveNext
    legacy_v1 -> frozen resolveNextLegacy
    m1        -> resolveNextM1 -> resolveM1Match
```

`resolveM1Match` has no desired result or target score input. It produces six-window causal opportunities, then returns the existing match-result contract plus compact M1 authority fields. The score, goals, statistics, MatchDetail, and timeline all reduce from the same event log.

## 3. Resolver boundary

- `ENGINE_VERSIONS.m1`: `implemented: true`, `runnable: true`.
- `ACTIVE_ENGINE_VERSION`: still `legacy_v1`.
- Normal new controllers and snapshots still receive `legacy_v1`.
- Explicit `{ engineVersion: 'm1' }` controllers run M1.
- Missing and historical `phase6.1` versions resolve only as `legacy_v1`.
- Dispatch has no cross-engine fallback.
- The physically existing `resolveNextLegacy` body and its RNG ordering were not changed.

## 4. Causal event schema

Each meaningful opportunity records:

```js
{
  id, minute, minuteLabel, stoppage,
  side, window, phase, route,
  progression, chanceQuality, xg,
  creatorId, creatorName, shooterId, shooterName,
  defenderId, keeperId,
  outcome, goal, onTarget,
  cornerWon, foulWon, createsTransition,
  dangerousTransition, highTurnover, controlWeight,
  scoreBefore, scoreAfter,
  causes: { plan, roles, signatures, opponent }
}
```

Cause arrays are deduplicated and capped. Debug rolls and large profile payloads are not persisted.

## 5. RNG/substream contract

Contract version: `finalxi.match.m1.rng.v1`.

The match seed hashes the contract, run seed, match number, stage, opponent id, and one controller-supplied match nonce. Every mechanic then uses:

```text
combineSeed(matchSeed, hashString(contract | stable-label | indexes))
```

Named streams include match tempo, window opportunity, timing, stoppage time, side selection, attack route, creator/defender/shooter selection, progression, progression outcome, chance quality, conversion, shot target, penalty shootout, and presentation. Presentation consumption cannot move outcome streams. There is no `Math.random` in the M1 module.

## 6. Opportunity model

Each of six windows owns four normal candidates plus an optional low-probability stoppage candidate in the two half-ending windows. Occurrence uses a bounded hazard multiplied by combined home/away pressure. Pressure includes:

- macro squad/difficulty quality and centred opponent strength;
- Match Plan volume tradeoffs;
- archetype tempo;
- window tempo;
- score state;
- venue;
- exposure created by a failed previous attack.

The attacking side is selected proportionally from the two current pressures. Final calibration averages 15.0214 opportunities and 10.235 chances per match.

## 7. Route model

M1 uses twelve existing-system-aligned routes:

`central_buildup`, `wide_overlap`, `switch_of_play`, `through_ball`, `one_two`, `counterattack`, `cross`, `cutback`, `pressing_recovery`, `direct_attack`, `set_piece`, and `long_range`.

Base weights are modified by the Match Plan, tactical matchup pattern, Role coverage, Signature eligibility, archetype, score state, and prior transition exposure. Role and Signature additions are separately capped.

## 8. Progression model

Route-specific base progression is adjusted by macro quality, the relevant tactical profile dimension, plan-route compatibility, archetype pressure, selected creator/defender, goalkeeper coverage, bounded Role/Signature hooks, and score state. Probabilities are clamped to 0.25–0.90.

Failures remain causal events: blocked/cleared deliveries, recycled possession, halted counters, fouls won, turnovers, intercepted passes, cleared set pieces, keeper claims, and stopped buildup. Relevant failures can create a transition exposure for the other side.

## 9. Chance-quality model

Quality begins with a route xG prior, progression margin, deterministic route-specific jitter, macro quality, plan effects, archetype concession/attack profile, selected participants, defensive coverage, goalkeeper profile, and score state. xG is clamped to 0.025–0.50 and presented through four bands:

- low: below 0.10;
- medium: 0.10–0.19;
- high: 0.20–0.32;
- clear: 0.33 and above.

Final distribution: low 8.85%, medium 43.42%, high 36.55%, clear 11.18%.

## 10. Conversion model

Conversion uses the generated chance xG plus bounded shooter Role/Signature and defending goalkeeper modifiers. The final probability is clamped to 0.015–0.52; combined conversion hooks are capped at ±0.055. Shot-on-target resolution owns a separate substream. No goal can be created outside a successful causal chance.

Level knockout matches use a separate deterministic shootout stream and retain the legacy external `{ won, score, hero }` shape.

## 11. Match Plan effects

All four real keys are retained: `balanced`, `control`, `wide`, `counter`.

| Plan | Own / opponent opportunities | Defining calibrated mix | Volatility | Explicit downside |
|---|---:|---|---:|---:|
| Balanced | 8.9286 / 6.1310 | natural baseline | 1.8397 | no specialization |
| Control Tempo | 8.5565 / 5.4554 | central + one-two + switch = 56.10% | 1.6438 | fast/direct share reduced by 7.61 points |
| Attack the Flanks | 9.4911 / 6.7560 | overlap + cross + cutback = 54.03% | 1.8102 | +0.625 opponent opportunities |
| Play on the Counter | 7.4762 / 6.3869 | counter + direct + high recovery = 39.01% | 1.9047 | -1.4524 own opportunities |

Controlled win rates were Balanced 66.37%, Control 70.24%, Wide 67.56%, Counter 64.88%. These are monitoring values across the fixed archetype matrix, not guaranteed per-match outcomes; each specialized plan also exposes its required cost.

## 12. Opponent-archetype effects

Only the seven existing archetypes are used.

| Archetype | Causal identity evidence | Opp. opportunities | Opp. xG | Volatility |
|---|---|---:|---:|---:|
| Pressing | pressing-recovery route 31.52% | 6.9063 | 0.7109 | 2.6389 |
| Technical | central buildup 29.81% | 6.5000 | 0.6174 | 1.6003 |
| Defensive | counter 27.33%, direct 18.01% | 5.0313 | 0.3567 | 1.6292 |
| Attacking | wide overlap 17.00%, cross 14.45% | 7.3542 | 0.7367 | 2.6041 |
| Physical | direct 28.53%, cross 18.71%, set piece 11.66% | 6.7917 | 0.6077 | 1.9010 |
| Elite | balanced multi-route profile | 5.9271 | 0.6390 | 1.6315 |
| Underdog | counter 28.91%, direct 20.34% | 4.8646 | 0.3518 | 1.4218 |

Opponent strength remains the macro quality axis; archetype controls how that threat is expressed.

## 13. Role hooks

All 24 approved `ROLE_GUIDE` names have explicit bounded mappings. Hooks affect route eligibility, participant weights, progression, defensive pressure, chance quality, conversion, exposure, control, or pressure-only knockout contexts as appropriate. No second Role vocabulary was added.

Controlled evidence with fixed macro quality:

- Defensive Shield danger xG: 0.2992 vs 0.3103; progression 59.65% vs 61.05%.
- Tempo Controller controlled progression: 79.74% vs 78.41%; route share 52.05% vs 49.10%.
- Touchline Winger wide involvement: 1.1510 vs 0.6250 per match; wide share 57.62% vs 54.98%.
- Box Finisher box conversion: 34.87% vs 31.14%; box-shot involvement 1.3594 vs 1.1875.
- Sweeper Keeper opponent transition progression: 54.04% vs 56.98%.
- Shot Stopper opponent conversion: 11.86% vs 15.23%.

## 14. Signature mapping

All 22 controlled Signature names are explicitly present in `M1_SIGNATURE_HOOKS`; active V2 catalogue coverage has no unresolved fallback. Hooks are route/context specific and capped.

Removal evidence:

- Recovery Pace transition progression: 52.17% vs 52.45% removed.
- Aerial Target aerial shot involvement: 0.8698 vs 0.5729 per match.
- Distance Threat long-range player shots: 0.0365 vs 0.0104 per match.
- Final Ball relevant creation xG: 0.1600 vs 0.1196; creations 0.5469 vs 0.4427 per match.

The small Recovery Pace shift is intentional: Signatures alter relevant behaviour without replacing overall player/squad quality.

## 15. Match-state behavior

State is derived for each attacking side as level, leading/trailing by one, or leading/trailing by two or more, combined with early/middle/late phase.

- Late trailing pressure multipliers are 1.11 (one) and 1.19 (two or more).
- Late leading pressure multipliers are 0.92 (one) and 0.82 (two or more).
- Late level is a modest 1.035.
- Trailing sides become more direct and slightly improve urgent-route execution while losing some settled patience.
- Leaders favour control/counter routes and reduce risky high-value combinations.

Calibration still produces non-comebacks, 0-0s, late draws, and no forced winner. Comeback rate is 6.93%; lead-change rate is 7.86%.

## 16. Timing behavior

Windows are 1–15, 16–30, 31–45+, 46–60, 61–75, and 76–90+. Candidate minutes use window-indexed streams and remain chronological. Optional stoppage opportunities use isolated streams. Window tempos rise from 0.90 to 1.12 rather than sampling every goal after the score is known.

Goal shares by band are 15.66%, 16.37%, 16.47%, 16.77%, 17.13%, and 17.60%. Average first goal is 31.24 minutes; late-goal share is 17.60%. The small late lift is probabilistic, not scripted drama.

## 17. Derived statistics

`deriveM1EventMetrics()` is the authority for:

- opportunities, chances, shots, shots on target, goals, saves;
- xG, big chances, fouls, corners, set pieces;
- route counts/shares, dangerous transitions, high turnovers;
- possession estimate from event control weights;
- chance-quality distribution, goal bands, first goal, halftime score, lead changes.

The calibrated scorer distribution is defenders 209, midfielders 649, attackers 1,515. Forwards remain primary scorers, while midfield and set-piece defender goals are material.

## 18. MatchDetail/timeline adaptation

M1 has a dedicated no-RNG MatchDetail adapter. It maps event reductions into the existing final-stat shape and carries compact causal metadata. The M1 timeline filters 5–15 useful highlights where possible, always includes goals, uses the exact causal route/participant/outcome, and attaches existing sequence-animation structures. It never invents a scoring event.

Full-time Match Plan feedback is gated by `causalSummary`; it explicitly says when a selected plan did not produce its intended event evidence. Legacy MatchDetail/timeline paths are unchanged.

## 19. Persistence compatibility

Schema version remains 1. Snapshots persist the immutable engine version, lightweight headline signatures, and a strong canonical match signature. M1 canonical signatures additionally cover the simulation seed, RNG contract, full causal event log, causal summary, and event metrics. The compact log is deterministically regenerated during Resume rather than duplicated in localStorage.

Tests prove:

- M1 snapshots validate and reconstruct only through M1;
- causal events, score, stats, MatchDetail, timeline, and future matches are byte-identical after Resume;
- legacy and M1 snapshots fail canonical replay if their engine labels are swapped;
- missing and `phase6.1` snapshots remain legacy;
- no schema bump and no automatic migration.

## 20. Legacy parity

- Exact legacy match fixtures: 5/5.
- Exact complete-run fixtures: 4/4.
- Historical fixed-seed fixtures: 16/16 through the foundation suite.
- Frozen aggregate signature: **76273921**.
- Canonical legacy replay, Daily behavior, catalogue boundaries, and formation completion remain passing.

## 21. M1 exact fixtures

| Fixture | Result | Canonical signature |
|---|---|---|
| Controlled win | 1-0 | `4fe17d61` |
| Open high draw | 3-3 | `68c737ce` |
| Four-goal side | 4-0 | `c90c71d5` |
| Counter comeback | 5-1 | `03ce492e` |
| Controlled loss | 1-3 | `5bdadc1d` |
| Quarter-final shootout | 3-3, pens 5-3 | `4cacdddf` |
| Control route | 0-1 | `c0c95cb1` |
| Wide route | 2-1 | `351b47b4` |
| Counter route | 1-1 | `4bbb8979` |
| Final Ball scoring event | 2-0 | `13bc6f1f` |

All seeds were found from the production model; no result-forcing branch was added.

## 22. M1 aggregate metrics

Final deterministic calibration signature: **f1c429c7**.

- 1,400 matches: W 70.79%, D 21.57%, L 7.64%.
- GF 1.6950, GA 0.4436, total goals 2.1386.
- 0-0 rate 10.79%; 2-2+ draws 2.64%; one-side 4+ rate 6.71%.
- 28 unique scorelines; observed maximum eight goals by one team.
- 15.0214 opportunities and 10.235 chances per match.
- Run matrix: 5.6328 league wins, 1.8125 draws, 0.5547 losses; qualification 100%; champion 27.34%; penalty-match rate 6.97%.
- Difficulty league wins: Casual 6.0547 > Classic 5.8516 > Legendary 4.3594.
- Low/medium/high squad, weak/mid/strong opponent, and Role-balance orderings all pass.

## 23. Plan effect metrics

The plan table in section 11 is generated by 336 matches per plan across every archetype. Wide shifts the target wide-route share by more than 22 points over Balanced; Counter shifts the target transition/direct share by more than 22 points; Control is less volatile than Counter. Every specialized plan changes own and opponent opportunity volume, chance mix, result distribution, and has a positive downside metric.

## 24. Opponent effect metrics

The archetype table in section 12 is generated by 96 matches per archetype. All seven route-mix JSON signatures are distinct. Pressing, Physical, Defensive, and Attacking identity orderings are enforced as calibration failures if they regress.

## 25. Role and Signature evidence

The paired comparisons in sections 13 and 14 use the same seeds, opponent, and fixed macro quality for active/removed variants. Every reported active hook writes non-zero event-log evidence. Box Finisher's 3.73-point controlled conversion lift remains below the eight-point non-dominance test ceiling; Signature effects remain smaller and contextual.

## 26. Test results

- Full suite: **12 files, 267 tests passed**.
- Focused M1/foundation/persistence suite: **3 files, 75 tests passed**.
- Database validation: 0 problems, 0 warnings.
- Transfer audit: 0 problems.
- Catalogue simulation: 100% formation completion in every catalogue.
- Draft fit audit: passed.
- Legacy calibration: passed, signature 76273921.
- M1 calibration: passed, signature f1c429c7.
- `git diff --check`: passed.

## 27. Build result

`npm run build` passes (56 modules transformed). Vite reports the existing advisory that the main minified chunk is above 500 kB; no build error occurs.

## 28. Browser smoke

The bundled in-app Browser backend (`iab`) was unavailable after the prescribed connection and retry. The same flows were therefore executed in installed Chrome headlessly against the Vite development server:

- Explicit `?engine=m1` draft and run persisted `engineVersion: m1`.
- Wide-plan match finished 2-1; score, 7-3 shots, 4-2 SOT, goal timeline, and causal feedback survived refresh/Resume exactly with the snapshot unchanged.
- Same squad/opponent under all plans produced distinct canonical signatures and event/stat mixes. Counter possession fell to 37% and shots to 4-5; Control rose to 64% possession and 8-3 shots. The final result happened to remain 2-2 in all four cases, confirming plans influence causes rather than force outcomes.
- Technical, Physical, and Pressing opponent styles produced visibly different match stories.
- A controlled specialist XI showed Ribéry, Bale, Inzaghi, Makélélé, Pirlo, and Neuer in the causal timeline; a wide match remained a valid 0-0.
- Normal no-query run persisted `legacy_v1` and rendered the legacy Match Center.
- Missing-version/pre-M0-style snapshot resumed as legacy with unchanged headline signature and score.
- Daily started at `?engine=m1` still persisted `legacy_v1`.
- Desktop 1440px and mobile 375px Match Center rendered without horizontal overflow.
- Browser console/page errors: none.

The independent audit should repeat the same smoke in the in-app Browser when that backend is available.

## 29. Risks/caveats

- M1 is intentionally not public and has not received the independent activation audit.
- Representative high-squad league win rate is strong (70.79%) and qualification is 100%, while champion rate is inside the requested initial band at 27.34%; broader experience tuning may still be desirable before activation.
- Opponent participants remain generic, as scoped.
- Presentation reuses the existing Match Center; richer cause wording is deferred.
- The in-app Browser backend was unavailable in this session; real Chrome fallback passed.
- The production bundle still emits the existing >500 kB chunk-size advisory.

## 30. Deferred M2 items

- M2: richer commentary and causal explanation, stronger full-time narratives, named opponent participants, template variety.
- M3: Opponent Intelligence/scouting and danger-player UI.
- M4: Matchday Management and a halftime decision.
- Also deferred as required: substitutions, injuries, fatigue, form, morale, weather, training, staff, coordinates, and possession/per-second simulation.

## 31. Activation recommendation

**Do not activate M1 yet.** Keep `ACTIVE_ENGINE_VERSION = 'legacy_v1'`, keep Daily on legacy, and do not migrate existing saves. The causal core is ready for an independent architecture, calibration, persistence, and browser audit. Public activation should be a separate declared change only after that audit passes and the in-app Browser smoke is repeated.
