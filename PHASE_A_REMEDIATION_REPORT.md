# Phase A — Remediation Pass (post-Codex audit)

Branch: **phase-a-v2-wip** · Snapshot: **2026-07-07** · Research cutoff (UTC): **2026-07-07T13:25:05Z**
Scope: fix only the validated P0/P1 activation blockers from `CODEX_PHASE_A_PLAYER_DB_AUDIT.md`. No Phase B, no engine changes, no commit.

Entry state: 544 players, 161 tests, build clean.
Exit state: **544 players (master DB intact), 183 tests pass, build clean, 0 validation problems, browser smoke clean.**

---

## 1. Transfer corrections (P0)

Every one of the 15 previously-"confirmed" entries was re-verified individually against the source hierarchy via live web research (July 2026). The audit was right that the *cited sources/metadata were wrong*, but it was **not** right that all seven flagged moves were unsupported — several are genuine completed 2026 transfers. Each case was decided on evidence, not on the audit's assumption:

**Kept as confirmed (8) — verified official / tier-one, canonical `clubId` correct:**

| Player | Canonical | From | Completed | Primary source |
|---|---|---|---|---|
| donnarumma | man_city | PSG | 2025-09-02 | mancity.com official |
| ederson | fenerbahce | Man City | 2025-09-02 | mancity.com official + Sky |
| cucurella | real_madrid | Chelsea | 2026-06-15 | realmadrid.com official |
| bernardo | real_madrid | Man City (free) | 2026-06-17 | realmadrid.com official + Sky |
| konate | real_madrid | Liverpool (free) | 2026-06-18 | realmadrid.com official + ESPN |
| dumfries | real_madrid | Inter (€20m) | 2026-07-05 | realmadrid.com official + ESPN |
| gordon | barcelona | Newcastle (€70m) | 2026-05-30 | ESPN + Al Jazeera |
| lewandowski | chicago_fire | Barcelona (free) | 2026-06-29 | Chicago Fire official + ESPN/MLS |

**Reverted (6) — reporting did NOT support a completed move; canonical returned to the real club:**

| Player | Was (fabricated) | Corrected to | Evidence for revert |
|---|---|---|---|
| olise | barcelona | **bayern** | Under contract at Bayern to 2029; Bayern won't sell (ESPN/TNT). Barca "arrivals" list was unreliable. |
| xavisimons | barcelona | **tottenham** | At Spurs since Aug 2025; no 2026 move (FootballTransfers/FOX). |
| kimmich | barcelona | **bayern** | Extended at Bayern to 2029 (BarcaBlaugranes/WorldSoccerTalk). |
| jonathandavid | barcelona | **juventus** | At Juventus (free from Lille, 2025) — official Juventus. |
| frenkie | man_united | **barcelona** | United move never materialised; stayed Barcelona (The Peoples Person/Goal). |
| christensen | bayern | **barcelona** | Renewed at Barcelona to 2028; the "confirmed" was his extension (Yahoo). |

**Removed (1):** `jackson` (chelsea→chelsea) — a nonsensical no-op. Jackson's Bayern loan ended and he returned to Chelsea (July 2026), so his `clubId` is correctly `chelsea`; the intel entry was deleted.

## 2. Canonical club reversions/changes

`playersModern.js` canonical `clubId` edits: christensen→barcelona, kimmich→bayern, frenkie→barcelona, xavisimons→tottenham, olise→bayern, jonathandavid→juventus. The 8 confirmed destinations were already correct and unchanged. Master DB count unaffected (544).

## 3. Intel status changes

Entries dropped from confirmed: 6 reverts + 1 no-op removed → **15 → 8 confirmed entries, 0 problems.** No rumours were promoted to canonical; interest/speculation is excluded entirely (conservative policy).

## 4. Source metadata corrections

- **Dates fixed:** Donnarumma/Ederson `2026-06-20` → real **2025-09-02**; Cucurella/Bernardo/Konaté/Dumfries given real official-announcement dates (2026-06-15/-06-17/-06-18/-07-05); Gordon 2026-05-30; Lewandowski 2026-06-29. All ≤ research cutoff.
- **sourceType fixed:** Cucurella's bogus `official_club`→SI corrected; official club announcements now point to `mancity.com` / `realmadrid.com` / `chicagofirefc.com` with `sourceType: official_club`; aggregator/Sky/ESPN entries are `tier_one_reporter`.
- Each entry now carries a `note` naming the selling club + fee for auditability.

Tests added: confirmed-canonical parity; here_we_go / advanced / rumour non-overwrite; source-after-cutoff rejection; invalid-sourceType rejection; a guard asserting the 8 confirmed ids and that all 6 reverted players are absent from intel and sit at their real clubs.

## 5. Master DB size

**544 players (461 modern, 83 legends) — unchanged.** No player was deleted; only canonical clubs corrected and profile data curated.

## 6. Activation catalogue strategy

The full-master Modern Mix drafts far weaker XIs than the live legacy pool (avg XI ~118 vs ~184) because ~240 quality/squad players with thin chemistry tags dilute every offer. Rather than inflate points or retune the engine (both forbidden), the **activation** pool is a curated subset while the full master remains available as a database view. Selection rule (deterministic, explicit master order preserved via filter):

> all legends + all elite/star modern + quality-tier players **only** where they fill a scarce, tactically-important role (Defensive Shield, Ball Winner, Defensive/Balanced Wingback, Defensive Fullback, Touchline Winger, Sweeper/Big-Match Keeper).

Four candidates were simulated (below); **Rule C** was chosen on evidence: strongest strength recovery among the coverage-complete options, resolves the scarce-role gaps, keeps premium/GOAT excitement, 100% formation completion, mid-range size, and *more* variety than legacy.

## 7. Activation catalogue size

`modern_mix_v2_curated` = **341 players** (within the 280–380 investigation band). Catalogues now: legacy_v1 **134**, modern_mix_v2_2026_07_07 (full master) **544**, **modern_mix_v2_curated 341**, legends_v2 **83**.

## 8. Simulation comparison

Deterministic sweep, 400 seeds × 5 formations (4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2), first-choice policy (`npm run db:sim`):

| Pool | Size | Avg offer pts | Avg XI | min / med / max | Formation done | Premium offer% | GOAT offer% |
|---|---:|---:|---:|---:|---:|---:|---:|
| Legacy Modern | 134 | 13.30 | 184.9 | 114 / 183 / 290 | 100% | 73.3% | 2.33% |
| Full-master V2 | 544 | 10.99 | 118.7 | 65 / 118 / 212 | 100% | 24.1% | 0.45% |
| **Curated V2 (final)** | **341** | **12.47** | **145.1** | 93 / 144 / 220 | **100%** | 38.6% | 0.77% |

Candidate rules considered (300 seeds):

| Rule | Size | Offer | XI | Def.Shield L3 | Touch.Wing L3 | Verdict |
|---|---:|---:|---:|---:|---:|---|
| A legends+elite+star | 303 | 12.9 | 148 | 6 | 4 | Strong, but thin roles/width |
| B A+thin-slot quality | 356 | 12.3 | 136 | 6 | 7 | Good width, weaker |
| **C A+specialist quality** | **341** | **12.5** | **145** | **16** | **11** | **Chosen — strength + role access** |
| D A+both | 379 | 12.1 | 138 | 16 | 11 | Best depth, lower strength/excitement |

Curated offer points (12.47) essentially match legacy (13.3); the residual XI gap vs legacy is legacy's dense chemistry-tag stacking, which broader variety intentionally trades away. Repetition is *lower* than legacy (busiest-10 share 7.5% vs 15.6%). Not a blind switch to the full DB.

## 9. Role-suitability override coverage

Curated explicit overrides now attached to **202 players (37% of the DB)**; the deterministic derivation remains the fallback for the rest. Resolution order: explicit field → curated override → derivation. Overrides author only accomplished(2)/plausible(1) secondaries; the primary role is forced natural(3) in code, so the "sole level-3 == primaryRole" invariant is structurally guaranteed.

## 10. Legend curation coverage

**83 / 83 legends** curated for role suitability, and **all 83** given hand-authored distinctive signatures + a conservative character (previously role-templated/hash-seeded).

## 11. Top-modern curation coverage

**119 modern players** curated (all 53 elite + ~66 recognisable stars/specialists) — exceeds the "~top 100" target.

## 12. Specialist curation coverage

Scarce tactical roles explicitly seeded via specialists (e.g. Locatelli/Rúben Neves/Zubimendi/Kanté/Zakaria for shielding & ball-winning; Doku/Nico/Trincão touchline; wing-back specialists for width). Curated Defensive Shield L3=16/L2=31, Touchline Winger L3=11/L2=38.

## 13. Defensive Wingback resolution

Was 0/0/1 (effectively unavailable). Populated with genuinely appropriate defensively-oriented wing-backs (Cucurella, Timber, Zanetti, Ashley Cole at L2; Dumfries, Di Marco, Cambiaso, Udogie, Raum at L1) → **now L3=0, L2=4, L1=6** (accessible). No player was reassigned artificially; it is offered as a secondary tactical function to players who genuinely fit it.

## 14. Big Game Scorer taxonomy decision

**Decision: it is NOT a tactical role — removed from the V2 role taxonomy (schema `ROLE_KEYS`), kept only as a legacy descriptor.** A role must describe tactical *function*; "Big Game Scorer" describes clutch/pressure *behaviour* (when a player delivers), which V2 already models via the Character **Big Stage** + the derived `big_game_player` tag. It was confirmed unused in V2 data (0 primaryRole, 0 suitability). It survives untouched inside the frozen legacy engine (data.js/sequenceEngine/tactics), where it is a real V1 role with scoring dependencies — so legacy determinism is preserved. It is now listed in `LEGACY_PRESSURE_DESCRIPTORS` and excluded from the V2 Tactical HQ role surface. The dead `ROLE_NEIGHBOR` entry was removed.

## 15. Signature curation result

The primary clustering source — legends inheriting one generic role-templated pair (all 25 CBs identical) — is fixed: every legend now has a distinctive 2–3 signature set from real playing identity. The signature→role coupling the audit worried about is moot for the 202 curated players, whose roleSuitability is now hand-authored rather than signature-derived. Distribution (top): Recovery Pace 174, Line Breaker 140, Composed Finisher 116, Aerial Target 106, Duel Hunter 88, Pocket Finder 83 — high counts reflect genuinely common attributes; per the brief we did not force equal frequency, we made profiles distinctive.

## 16. Character review result

Legends given conservative, well-known-identity characters (e.g. Maradona **Maverick**, Maldini **Standard Bearer**, Gattuso **Firebrand**), spread across ≥9 archetypes. Modern concentration in **Quiet Pro (102)** and **Career Climber (88)** is retained deliberately: these are the neutral defaults, and the brief calls for conservative classification where public evidence of a stronger persona is weak. No defamatory or gossip-based assignment. Character remains data-only (no gameplay effect).

## 17. Simulation threshold design

New reusable module `src/data/v2/draftSim.js` (deterministic, multi-seed, multi-formation) + `npm run db:sim`. A guardrail test block asserts **threshold bands, not brittle exact values**, on the curated catalogue: formation completion = 100%; avg XI in (135, 175); avg offer pts > 12; premium offer% > 30; GOAT offer% in (0.2, 3); every draftable slot depth ≥ 5; busiest-10 concentration < 15% and > 200 distinct players offered. Purpose: fail loudly if a future catalogue edit silently dilutes the draft.

## 18. Deterministic regression result

Legacy golden fixtures **unchanged** (legacy daily/legends offers still byte-identical; `validateLegacyV1Order` passes). V2 Modern-Mix golden pins were re-pinned only where curation legitimately changed membership; a new curated-catalogue golden pin was added. GOAT invariant (exactly Messi/Ronaldo/Maradona/Pelé) intact. No legacy re-pin was done casually — only where V2 data genuinely changed.

## 19. Persistence regression result

`runPersistence` untouched. Browser test: a completed run saved and restored via the catalogue-aware reconstruction after reload ("Continue where you left off"), no console/page errors. Old-snapshot default to `legacy_v1` preserved.

## 20. Full test result

**183 tests pass (9 files)** — up from 161. New coverage: transfer truth (+4), curated activation catalogue + simulation guardrails (+9), role-suitability overrides (+4), dead-role cleanup (+2), legend signature/character curation (+3).

## 21. Build result

`npm run build` clean, no chunk-size warning. `index.js` **472.86 kB / 133.40 kB gzip** (+18 kB raw vs Phase A.2, from the curated override/profile data now in the runtime graph via `runPersistence → catalogues → index`). `draftSim.js` is test/script-only and not bundled. Acceptable (see PHASE_A2 report §8; a lazy-load boundary belongs in Phase B when catalogue selection becomes an explicit user action).

## 22. Browser verification

Full playthrough, **zero console/page errors**: Random Run → reroll → full XI → Set XI → rating → European Run → Watch Match (real-name commentary) → approach selection → mid-run Upgrade offers → Sim All → knockouts → Result (Round of 16) → Report → reload → Resume ("Run complete · 4W…") → Daily Challenge + Legends Only draft (Casillas — legends only, no modern leakage). The live game runs on the legacy V1 pool and is unaffected by all V2 changes (V2 enters the bundle only through the persistence catalogue import and initialises cleanly).

## 23. Activation recommendation

**Activate Modern Mix using `modern_mix_v2_curated` (341), not the full master.** All listed P0/P1 blockers are resolved: transfer canonical/source truth corrected, curated activation catalogue removes the strength collapse (avg XI 118→145, offer pts 11.0→12.5) while tripling variety and completing every formation, dead roles resolved (Defensive Wingback populated, Big Game Scorer deactivated from the V2 taxonomy), high-impact roleSuitability/signatures/characters curated with derivation retained as fallback, and a simulation guardrail now protects against future dilution. The full master DB remains intact for database/reference use. Nothing is wired into live gameplay yet (Phase A guardrail); the curated catalogue is activation-*ready*.

## 24. Precise Codex re-audit targets

1. **Transfer truth:** `npm run db:audit:transfers` → 8 confirmed, 0 problems. Verify each canonical `clubId` matches its (real) source; confirm the 6 reverts (olise→bayern, xavisimons→tottenham, kimmich→bayern, jonathandavid→juventus, frenkie→barcelona, christensen→barcelona) and that no reverted player appears in intel.
2. **Source metadata:** confirm every `publishedAt` ≤ cutoff and `official_club` entries point to real club domains.
3. **Curated catalogue:** `npm run db:sim` → curated avg XI ~145, offer ~12.5, 100% completion, all slots ≥5. Confirm it is a strict subset of the 544 master, contains all legends + GOATs, and admits quality only via specialist roles.
4. **Determinism:** legacy golden fixtures unchanged; curated golden pins deterministic across runs.
5. **roleSuitability:** 202 curated, derivation fallback covers the rest; every map's sole level-3 is the primary role; Defensive Wingback accessible; Big Game Scorer absent from `ROLE_KEYS` but present in `LEGACY_PRESSURE_DESCRIPTORS` and still intact in the legacy engine.
6. **Guardrails honoured:** master DB size 544; GOAT set exactly the four; legacy engine/scoring untouched; no commit.
7. **Residual (non-blocking):** curated modern coverage is 119 (>100 target); league/nation concentration unchanged from Phase A.2 (documented, acceptable for activation); bundle lazy-loading deferred to Phase B.
