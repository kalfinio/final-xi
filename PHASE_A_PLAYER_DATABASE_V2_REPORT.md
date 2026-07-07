# Phase A — Player Database V2 (implementation report)

Snapshot date: **2026-07-07** · Research cutoff (UTC): **2026-07-07T13:25:05Z**
Baseline before Phase A: 121/121 tests, clean tree. After Phase A: **142/142 tests, build clean.**

> Scope note (read first): the brief targets ~500–700 researched modern players. Accurately verifying that many individual players against live sources in one session is not achievable without fabrication, which the brief forbids. This phase therefore delivers the **complete, correct, tested V2 architecture**, migrates **all** legends faithfully, and ships a **curated, verified-core modern set (163)** with the marquee summer-2026 moves applied and sourced. The architecture scales to the 500–700 range by appending to `playersModern.js` with zero structural change. See *Known limitations*.

---

## 1. Architecture implemented

```
src/data/v2/
  schema.js        controlled vocabularies (positions, roles, signatures,
                   characters, dev profiles, tiers, eras, transfer enums, GOAT)
  nations.js       normalized nations (id, name, code)
  leagues.js       normalized leagues (id, name, nationId, level)
  clubs.js         normalized clubs (id, name, leagueId, nationId, aliases)
  playersModern.js curated modern players (factual + game-design fields)
  index.js         MASTER assembly: migrates V1 legends → V2 (frozen source),
                   concatenates modern; builds lookups; leagueOfClub()
  adapter.js       adaptPlayerV2ToLegacyShape() → the exact V1 engine shape
  catalogues.js    versioned, explicitly-ordered draft pools + resolvePlayer()
  validate.js      validateV2() / validateTransferIntel() / auditV2()
  dbV2.test.js     21 Phase A tests
data/
  transferIntel.2026-07-07.json   research artifact (outside the client bundle)
scripts/
  validate-player-db.mjs · audit-player-db.mjs · audit-transfer-intel.mjs
```

The authority chain: **master DB (normalized) → catalogue (curated, ordered) → adapter (legacy shape) → existing engine.** V2 is *parallel infrastructure*; the live game is untouched.

## 2. Files added
`src/data/v2/{schema,nations,leagues,clubs,playersModern,index,adapter,catalogues,validate}.js`, `src/data/v2/dbV2.test.js`, `data/transferIntel.2026-07-07.json`, `scripts/{validate-player-db,audit-player-db,audit-transfer-intel}.mjs`, this report.

## 3. Files changed
- `src/runPersistence.js` — additive `dbVersion`/`catalogVersion` on new snapshots (legacy default) + `snapshotCatalogVersion()` + tolerant validation.
- `package.json` — `db:validate`, `db:audit`, `db:audit:transfers` scripts.
- **No** change to `data.js`, the draft, the simulation, or any UI. The V1 `PLAYERS` array is frozen (order, IDs, tags untouched).

## 4–7. Counts
Players **246** (modern **163**, legends **83**) · Clubs **79** · Leagues **16** · Nations **59** · Nations used **41** · Modern leagues used **9** (top-5 + Primeira, Saudi, MLS, Süper Lig, etc.).

## 8. Catalogue structure
- `legacy_v1` (134 ids) — the frozen V1 pool, sourced directly from `data.js`; draft byte-identical.
- `modern_mix_v2_2026_07_07` (246) — V2 legends (historical order) + V2 modern (authored order), adapted.
- `legends_v2` (83) — V2 legends only.
Ordering is always an explicit `orderedIds` array — never `Object.keys`, filesystem, or a mutable sort.

## 9. Legacy compatibility strategy
V1 `PLAYERS` is the frozen `legacy_v1` catalogue. Legends migrate into V2 **programmatically from that frozen array** (preserving IDs/names/positions), so no legend is re-authored or can drift. The live draft/simulation/persistence continue on V1 unchanged (verified: Modern Mix and Legends Only drafts still show V1 players with V1 tags). A handful of V1 "legend"-classified active players (only **van Dijk** here) are re-authored as modern; the migration skips any legend id present in the modern set to avoid duplicates.

## 10. Save-version strategy
New snapshots stamp `dbVersion:'v1'`, `catalogVersion:'legacy_v1'` (the live game drafts legacy). Old snapshots have no field → `snapshotCatalogVersion()` interprets them as `legacy_v1`. Reconstruction resolves squads **by ID** from the frozen V1 objects, so **existing saves remain byte-identical and recoverable** (browser-verified: mid-watch refresh → Resume restored the same canonical match). `resolvePlayer(id, catalogVersion)` is catalogue-aware and ready for a future phase to route V2 saves; today all runs are legacy_v1.

## 11. Transfer snapshot cutoff
`RESEARCH_CUTOFF_UTC = 2026-07-07T13:25:05Z`, recorded in the artifact. The validator rejects any source `publishedAt` after the cutoff (tested).

## 12. Transfer source policy
Hierarchy enforced by design + validator: official club > Transfermarkt completed > Fabrizio "here we go" > advanced > high-confidence rumour. **Canonical `clubId` = official current club; rumours live only in `transferIntel` and never move the canonical club** (tested both directions). Factual fields are researched; game-design fields (tier/role/character/signatures/dev) are Final XI judgements — market value and transfer fee are never used as quality.

## 13. Confirmed transfer updates applied (13)
Cucurella, Bernardo Silva, Konaté, Dumfries → **Real Madrid**; Olise, Xavi Simons, Kimmich, Gordon, Jonathan David → **Barcelona**; Frenkie de Jong → **Man United**; Christensen → **Bayern**; Lewandowski → **Chicago Fire**; Jackson → **Chelsea**. All reflected in canonical `clubId` (test-asserted) and sourced in the artifact. Still-active greats given current clubs via override: Messi → Inter Miami, Ronaldo → Al Nassr, Suárez → Inter Miami, Neymar → Santos, Benzema → Al Ittihad.

## 14. Pending transfer-intel by status
here_we_go **0**, advanced **0**, high_confidence_rumour **0**. Conservative by choice: no pending rumour for an included player met the Level-3/4/5 bar with corroboration at the cutoff, so none were fabricated. The pending-path schema + validators are implemented and unit-tested with synthetic entries.

## 15. Unresolved research conflicts
- **Confirmed-departure, unknown destination** (Carvajal, Alaba left Real Madrid): destinations not established at cutoff → represented as `free_agent` (Alba/Vázquez/Mudryk similar) rather than guessing a club.
- **Retired-era legends' "current" club**: non-active legends keep their historical club (a documented representation choice, not a factual claim about 2026).

## 16. Validation results
`npm run db:validate` → **0 problems, 0 warnings** (30-point schema/referential suite + anomaly checks: GK/role, CB/winger, duplicate-name, positions, roles, signatures, character, dev, era, tier, GOAT-exactly-4, catalogue ordering/dupes, transfer-target resolves, evidence present, rumour-vs-confirmed contamination, cutoff violations).

## 17. Determinism test results
- **Legacy determinism**: `catalogueEligiblePlayers('legacy_v1', …)` is byte-identical to `getEligiblePlayers(…)` for GK/CB/CM/ST × modern/legends; `resolvePlayer('messi','legacy_v1')` returns the frozen V1 object. ✅
- **V2 determinism**: V2 eligible lists + a seeded `shuffle().slice(3)` reproduce identically. ✅
- **Adapter parity**: an 11-man adapted-V2 XI is a valid `computeRating` input (finite, >0) with valid `posType`/tags/rarity/eligibleSlots; a non-overridden legend (`xavi`) round-trips name/position/eligibility/role/club. ✅
- **Save versioning**: field stamping + legacy default + malformed-type rejection. ✅
- **Transfer safety**: confirmed reflected; rumour-to-different-club leaves canonical unchanged; rumour-to-current-club and confirmed-not-reflected and after-cutoff all flagged. ✅

## 18. Full test suite result
**142/142 passed** (9 files) — the 121 pre-existing tests unchanged + 21 new Phase A tests.

## 19. Build result
`npm run build` clean. Bundle **362.82 kB** (gzip 109.83) vs 362.60 baseline — **+0.22 kB**. V2 data is **not** in the client bundle (nothing in the live app imports it; Vite tree-shakes it). Research JSON lives outside `src/`.

## 20. Browser verification result
Modern Mix draft (legacy pool, versioned snapshot), Legends Only draft (completes to Set XI), Begin Run, Watch Match, **mid-watch refresh → Resume** (same canonical match from kickoff, resolved identically), Continue, Sim All → Result. **Zero console errors.**

## 21. Known limitations
- **Modern count 163 vs 500–700 aspiration** — curated verified-core; scales by appending, no structural change.
- **Transfer verification depth** — marquee confirmed moves are individually researched + sourced; the long tail of canonical clubs reflects curated football knowledge as of the cutoff, not per-player live verification. Flagged honestly rather than claimed.
- **No pending-status intel populated** (conservative); schema/tests exist for when it's added.
- **V2 not wired into the live draft** — deliberate. The live game stays byte-identical on `legacy_v1`; the deterministic V2 draft path exists and is tested, ready for a gated future phase (recommended after the Codex audit).
- **Legend game-design fields** (character/signatures) are deterministically derived defaults, not hand-curated (they don't affect Phase A gameplay).

## 22. Recommended Codex audit targets
1. **Schema integrity** — every enum in `schema.js` vs `validate.js` coverage; any field validated on modern but not legends (or vice-versa).
2. **Duplicate detection** — IDs across nations/leagues/clubs/players and *within* catalogues; near-duplicate player names/spelling variants.
3. **Broken references** — player→club→league→nation chains; free-agent/`free` league null handling.
4. **Role/position anomalies** — GK-with-outfield-role, CB-with-winger-suitability, zero-usable-role, and whether `secondaryPositions` are all football-credible.
5. **Transfer source consistency** — every entry's `sourceType`/`publishedAt`/`url`; confirmed-reflected-in-canonical; rumour-not-in-canonical.
6. **Snapshot-cutoff violations** — any source dated after `2026-07-07T13:25:05Z`.
7. **Rumour/confirmed contamination** — canonical `clubId` never equals a pending target; no player at two clubs.
8. **Catalogue ordering** — `orderedIds` explicit + stable; no reliance on object iteration; legacy_v1 mirrors V1 order exactly.
9. **Legacy deterministic parity** — `legacy_v1` eligibility == `getEligiblePlayers` for all slots/pools; V1 `PLAYERS` untouched (order/ids/tags).
10. **Save reconstruction** — old snapshots (no version) still validate + reconstruct; new snapshots carry version; by-ID resolution.
11. **Catalogue version migration** — `snapshotCatalogVersion` default; `resolvePlayer` routing.
12. **Distribution anomalies** — re-run `db:audit`; check for accidental clustering (character, per-role signatures, tier).
13. **Dead/unreachable players** — any V2 player not in any catalogue; any catalogue id not resolvable.
14. **Bundle-size impact** — confirm V2 stays out of the client bundle; research JSON out of `src/`.

---

### Codex audit checklist (copy/paste)
- [ ] `npm run test` → 142/142
- [ ] `npm run db:validate` → 0 problems
- [ ] `npm run db:audit` → distributions sane, no clustering
- [ ] `npm run db:audit:transfers` → 0 problems, statuses as reported
- [ ] `npm run build` clean; bundle delta ≈ +0.2 kB; V2 not bundled
- [ ] GOAT set == {messi, ronaldo, maradona, pele}, no fifth
- [ ] V1 `src/data.js` `PLAYERS` diff == empty (frozen)
- [ ] legacy_v1 eligibility == V1 helper (all slots/pools)
- [ ] old snapshot (no catalogVersion) resolves + reconstructs
- [ ] transfer intel: no source after cutoff; confirmed reflected; rumours not in canonical
- [ ] browser: Modern Mix draft, Legends Only draft, run, resume, watch refresh, zero console errors
