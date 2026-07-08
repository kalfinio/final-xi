# Phase A.2 — Player Database V2: Content Completion & Activation Readiness

Snapshot date: **2026-07-07** · Research cutoff (UTC): **2026-07-07T13:25:05Z**
Branch: **phase-a-v2-wip** (no commit, no deploy — per guardrails).

Baseline entering Phase A.2: **154 tests, build clean, 403 players (320 modern / 83 legends), bundle 430 kB / 125.78 kB gzip.**
After Phase A.2: **161 tests pass, build clean, 544 players (461 modern / 83 legends), roleSuitability 544/544, bundle 454.49 kB / 130.30 kB gzip.**

> This phase is **content + activation readiness**, not a new gameplay phase. No Tactical HQ, Evolutions, or transfer gameplay was built. The live game still runs entirely on the frozen V1 `data.js`; V2 remains parallel infrastructure that is validated, tested, and browser-verified but not yet wired into play.

---

## 1. Headline outcome

| Metric | Phase A end | Phase A.2 end | Δ |
|---|---:|---:|---:|
| Total players | 403 | **544** | +141 |
| Modern players | 320 | **461** | +141 |
| Legends (frozen baseline) | 83 | **83** | 0 |
| Clubs | 114 | **114** | 0 |
| Leagues (used) | 16 (—) | **16 (15)** | — |
| Nations (used) | 76 | **76 (55)** | — |
| roleSuitability coverage | 0 / 403 | **544 / 544** | +544 |
| Tests | 154 | **161** | +7 |
| Bundle (raw / gzip) | 430 / 125.78 kB | **454.49 / 130.30 kB** | +24.5 / +4.5 kB |

**The two structural wins:** (1) roleSuitability went from the single largest content blocker (0% coverage) to 100% via a maintainable, player-specific derivation; (2) modern coverage grew 44% with targeted fixes to the scarce positional/role families identified in the brief.

---

## 2. Final modern count and the honest reasoning

**Final modern count: 461. Total DB: 544.** This lands **below** the 550–650 aspiration in the brief, and that is a deliberate, documented choice rather than a shortfall to paper over.

- The brief's hard rule is "do not pad with obscure filler," and it forbids fabrication. Every one of the 461 modern players is a real, identifiable footballer placed at a real 2026 club. Reaching 650 in one session would have required inventing or half-remembering ~190 more players and their clubs — exactly the failure mode the brief prohibits.
- 461 is enough to fully populate every position and role family with genuine names (see §4), which was the *functional* goal behind the number. The catalogue is architecturally open-ended: appending to `playersModern.js` needs zero structural change, so the 550–650 target is a content top-up, not an engineering task.
- Recommended follow-up (Phase A.3 or a research pass): add ~90–190 more via league-by-league squad sweeps (Eredivisie/Primeira/Süper Lig/Championship depth, more Saudi/MLS/Liga MX, South-American domestic). This is bounded, low-risk appending.

---

## 3. roleSuitability — the blocker, solved

**Problem:** 0/403 players had `roleSuitability`. Hand-authoring 24-role maps for 500+ players is fragile and unmaintainable, and tier-driven "versatility" was explicitly rejected by the brief.

**Solution (in `src/data/v2/index.js`, `deriveRoleSuitability`):** a sparse, *player-specific* map derived from data already curated per player — never from tier alone:
- **Level 3 (natural / defining):** exactly the player's `primaryRole`.
- **Level 2 (accomplished):** the natural role of each real `secondaryPosition`, plus a signature-driven sibling of the primary position (e.g. a `CB` with `Line Breaker` earns `Ball-Playing Defender`).
- **Level 1 (plausible secondary):** only for genuine utility players (tier quality/squad/prospect, or ≥2 secondary positions) — one plausible neighbour role, and only if the map is still narrow.

**Result — coverage 544/544, and it is player-specific, not uniform:**

| Map size (roles per player) | Players |
|---|---:|
| 1 (pure specialist) | 83 |
| 2 | 234 |
| 3 | 168 |
| 4 | 59 |
| 5+ | 0 |

Elite specialists stay narrow (83 players are single-role); genuinely versatile players earn breadth (up to 4 roles). No player is "suitable" for a large slice of the game. Values are strictly {1,2,3}; no severe penalties; **no gameplay effect** — the adapter ignores `roleSuitability`, so determinism and old saves are untouched. It is pure data for the future Tactical HQ.

**Natural (L3) vs accomplished (L2) vs plausible (L1) by role** (abridged, most-natural first): Box-to-Box Engine 59/34/0 · Inside Forward 56/45/23 · Defensive Leader 48/16/12 · Ball-Playing Defender 40/8/22 · Creative Magician 40/46/0 · Box Finisher 38/16/0 · Tempo Controller 28/5/9 · Direct Runner 27/5/34 · Balanced Fullback 21/34/17 · Complete Striker 21/52/25 · Attacking Fullback 20/31/0 · Final Passer 19/43/23 · Ball Winner 18/29/29 · Attacking Wingback 18/25/0 · Defensive Shield 16/25/9 · Touchline Winger 11/38/0.

---

## 4. Positional & role scarcity — before → after

The brief flagged specific thin families. Natural (L3, i.e. primary-role) counts now, with accomplished (L2) coverage in parentheses:

| Family | Phase A (natural) | Phase A.2 natural | + accomplished |
|---|---:|---:|---:|
| Touchline Winger | 5 | **11** | +38 |
| Defensive Shield | 6 | **16** | +25 |
| Attacking Wingback | 6 | **18** | +25 |
| Attacking Fullback | 15 | **20** | +31 |
| Balanced Fullback | — | **21** | +34 |
| Defensive Fullback | — | **6** | +9 |
| Direct Runner | — | **27** | +34 (plausible) |

**Full-backs / wing-backs by primary position:** RB 30, LB 25, RWB 4, LWB 6 (59 natural), and dozens more full-backs carry `RWB`/`LWB` secondaries so they resolve as *accomplished* wing-backs. Named additions include Dimarco, Cambiaso, Spinazzola, Zappacosta, Dodô, Nuno Mendes, Raum, Udogie, Muñoz, plus a full-back/prospect depth block (Rico Lewis, O'Reilly, Gusto, Hall, Livramento, Maatsen, Spence, Cash, Mykolenko, Olivera, Ryerson, Stanišić).

**Defensive-midfield diversity** is now spread across Defensive Shield / Ball Winner / Tempo Controller rather than clustering: Locatelli, Højbjerg, Zakaria, André, Torreira, Rúben Neves, Brozović, Fabinho, Morita, Hjulmand, Schouten, Wieffer.

**By position (all 544):** GK 38 · RB 30 · CB 89 · LB 25 · CDM 50 · CM 76 · CAM 54 · RW 48 · LW 33 · ST 91 · RWB 4 · LWB 6. **By type:** GK 38 · DEF 144 · MID 190 · ATT 172.

---

## 5. Signature / Character / Development curation

The brief warned against clustering ("every winger = Inside Threat", "70% Quiet Pro"). Post-expansion distributions are spread:

**Characters (12):** Quiet Pro 101 · Career Climber 88 · Competitor 71 · Relentless 52 · Confidence Player 51 · Standard Bearer 38 · Big Stage 30 · Club Heart 28 · Free Spirit 28 · Mentor 27 · Firebrand 16 · Maverick 14. Quiet Pro is the largest but at **19%** of the DB — not the 70% the brief cautioned about.

**Development profiles (5):** prime 292 · veteran 93 · developing 75 · high_growth 48 · decline_risk 36 — a realistic pyramid with genuine prospect/development depth (123 developing+high_growth).

**Signatures (top):** Recovery Pace 152 · Line Breaker 138 · Composed Finisher 117 · Aerial Target 109 · Final Ball 86 · Pocket Finder 85 · Duel Hunter 77 · Inside Threat 65 (i.e. **not** every wide player) · Front-Foot Defender 61 · Distance Threat 54 · … down to Sweeper Instinct 4. Signatures are assigned from the player's real profile, so the long tail is intentional.

**Tiers:** goat 4 (invariant) · goat_candidate 7 · elite 125 · star 167 · quality 235 · squad 6.

---

## 6. Transfer landscape (2026-07-07)

`data/transferIntel.2026-07-07.json` — **15 confirmed entries, 0 validation problems.** Policy is conservative: only completed/officially-corroborated moves update the canonical `clubId`; weak rumours are excluded entirely; every source is captured with `publishedAt`/`checkedAt` at or before the research cutoff.

Confirmed and reflected in canonical `clubId`: Cucurella→Real Madrid, Bernardo Silva→Real Madrid, Konaté→Real Madrid, Dumfries→Real Madrid, Olise→Barcelona, Xavi Simons→Barcelona, Kimmich→Barcelona, Gordon→Barcelona, Jonathan David→Barcelona, Frenkie de Jong→Man United, Christensen→Bayern, Lewandowski→Chicago Fire, Jackson→Chelsea, **Donnarumma→Man City**, **Ederson→Fenerbahçe** (the last two added this phase, sourced to Man City official + Sky Sports). Non-canonical corrections also applied in the DB: Éderson (M.) club, Chevalier added at PSG, Nico Paz→Como, Zabarnyi→PSG, Gakpo, Mastantuono→Real Madrid.

The validator (`validateTransferIntel`) enforces: confirmed ⇒ canonical `clubId` matches; rumours never overwrite canonical; a rumour whose target equals the current club is flagged as contamination; sources dated after the cutoff are rejected. All four rules have dedicated tests.

---

## 7. Catalogue semantics (decision)

Three explicitly-ordered catalogues, sizes: `legacy_v1` **134** (frozen V1 pool, byte-identical draft), `modern_mix_v2_2026_07_07` **544**, `legends_v2` **83**.

**Decision — Modern Mix = the full master catalogue.** `modern_mix_v2_2026_07_07` deliberately contains **all 544 players (both eras)**, mirroring the legacy `modern` pool semantics (which also mixes legends + modern) and the UI copy "Legends + modern stars." There is intentionally no separate "trimmed active set" vs "master DB" split at this stage: keeping the active catalogue identical to the master DB avoids a second source of truth and a curation surface that could drift. If a curated/marquee subset is ever wanted, it becomes a new catalogue id with its own `orderedIds` — additive, non-breaking. `legends_v2` is strictly era==='legend'.

---

## 8. Bundle-size decision (reviewed, documented as acceptable)

Bundle grew 430→**454.49 kB raw / 125.78→130.30 kB gzip** (+24.5 kB raw / +4.5 kB gzip) because the +141 modern players and their derived `roleSuitability` are pulled into the runtime.

**Why V2 is in the runtime at all:** the only non-test import path is `src/runPersistence.js` → `src/data/v2/catalogues.js` (for `DEFAULT_CATALOG_VERSION`, `getCatalogue`, `resolvePlayer`). Catalogue-aware save reconstruction must be able to resolve any V2 catalogue **synchronously and deterministically**.

**Why not code-split it now:** the natural split point is making `resolvePlayer` async (dynamic `import()` on catalogue selection). But `resolvePlayer` sits on the deterministic run-reconstruction path, and turning it async would destabilize the exact guarantee the brief says not to break ("Do not break legacy deterministic order or old saves," "Do not destabilize these guarantees"). A `manualChunks` split alone gives no benefit while the import stays static (the chunk still loads eagerly).

**Verdict: acceptable.** 130 kB gzip is well within norms for an SPA carrying two complete player databases; Vite emits **no chunk-size warning** (raw 454 kB < the 500 kB threshold). The clean lazy-load boundary appears for free in Phase B, when catalogue *selection* becomes an explicit user action and can await a dynamic import — that is the right time to split, not now.

---

## 9. Validation, tests, build

- `npm run db:validate` → **✅ 0 problems, 0 warnings** (schema, referential integrity, GOAT invariant, roleSuitability keys+values, legacy V1 order).
- `npm run db:audit` → counts in §1/§4/§5 (used to author this report).
- `npm run db:audit:transfers` → **✅ 0 problems**, 15 confirmed entries.
- `npm test` → **✅ 161 passed (9 files)**. The V2 suite grew to **36 tests** (was 29), adding:
  - roleSuitability: full non-empty coverage; schema-valid (roles + {1,2,3}); sparse (≤5); primary role is the *only* level-3; **no impossible role/position** (GK and outfield role families never mix); breadth is non-uniform; derivation deterministic.
  - composition: 83-legend baseline preserved exactly; modern count in the documented 450–700 band; every player maps to a real nation/club/position/role.
  - re-pinned deterministic golden Modern-Mix offers (they move when the modern set grows); confirmed Legends-Only golden offers are **unchanged** (frozen legend order).
- `npm run build` → **✅ built in ~2.2s**, `index.js` 454.49 kB / gzip 130.30 kB, no warnings.

---

## 10. Browser verification (preview, 2026-07-07)

Full playthrough, **zero console errors throughout**:
Random Run → GK draft → **reroll** (3→2, fresh options) → auto-pick full XI (11/11) → **Set XI** (swap screen) → rating (183, identity "Old Meets New") → name team → **European Run** (Match 1/8, tactical matchup + 4 approaches) → **Watch Match** (Live Match Center, real-name commentary "Touré BIG SAVE", speed x1/x2/x4) → **FT** (2–0, "Composed win", key player Bale, post-match notes) → **Sim All** to completion → **Result** (Quarter-final exit, 16th/13 pts, 3W-4D-1L) → **Report** (top scorer Benzema 4, top assist Silva 2) → reload → **Resume** banner ("A2 Verify FC · Run complete · 5W-4D-2L") restores correctly → **Daily Challenge** + **Legends Only** pool draft (Casillas/Ricardo — legends only, no modern leakage).

This confirms the V2 changes do not affect the live game: gameplay runs on `legacy_v1`/V1 data, and the V2 DB (reached only through the persistence layer's catalogue import) initializes and round-trips saves cleanly.

---

## 11. Guardrails honoured

No commit · no deploy · no TypeScript migration · branch unchanged (`phase-a-v2-wip`) · GOAT set is **exactly** Messi/Ronaldo/Maradona/Pelé (test-enforced, no fifth) · market value/fee/rarity never used for quality or versatility · legacy deterministic order and old saves preserved (legacy golden fixtures unchanged; save-versioning defaults to `legacy_v1`) · stabilization guarantees intact · 83-legend baseline + adapter parity preserved · **no Phase B / Tactical HQ / Evolutions / transfer gameplay started.**

---

## 12. Codex audit checklist

1. **Counts:** `npm run db:audit` → 544 / 461 modern / 83 legends; matches §1.
2. **GOAT invariant:** `V2_PLAYERS` tier==='goat' is exactly the 4 required ids (test: "GOAT invariant").
3. **roleSuitability integrity:** every player non-empty, ≤5 roles, values ⊆ {1,2,3}, sole level-3 is `primaryRole`, no GK/outfield role mixing (test block "role suitability content").
4. **No gameplay effect:** confirm `adapter.js` never reads `roleSuitability`; determinism tests unchanged.
5. **Legacy determinism:** `legacy_v1` eligibility byte-identical to V1 helper for every slot/pool; legacy golden Daily offers unchanged.
6. **Transfer safety:** `npm run db:audit:transfers` → 0 problems; each confirmed entry's `targetClubId` equals `v2PlayerById[id].clubId`; sources ≤ cutoff.
7. **Legend fidelity:** all 83 migrated legends adapt with exact V1 gameplay-field parity (test: "all migrated legends adapt with exact V1 gameplay-facing parity").
8. **Save compat:** new snapshots stamp `dbVersion:v1` / `catalogVersion:legacy_v1`; field-absent old saves resolve to `legacy_v1`.
9. **Build:** `npm run build` clean, no chunk-size warning; bundle §8.
10. **Scope:** diff touches only `src/data/v2/*`, `data/transferIntel.*.json`, `src/data/v2/dbV2.test.js`, this report — no `data.js`, engine, or UI changes.
