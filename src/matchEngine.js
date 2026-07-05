// ---------------------------------------------------------------------------
// Canonical MatchDetail layer (Phase 1).
//
// simulate() in data.js remains the single source of truth for match OUTCOMES
// (result, score, goal events, and the legacy `stats` object — its RNG stream
// is untouched). This module builds, per finished match, ONE canonical
// statistics object that every post-result view must read:
//
//   simulate() → match result (unchanged) → buildMatchDetail() → MatchDetail
//     → constrained timeline (matchTimeline.js)
//     → progressive live Match Center stats
//     → exact canonical totals at full time
//     → Post Match Card / European Run Report
//
// Hard invariants guaranteed for every MatchDetail:
//   home.possession + away.possession === 100        (away is derived)
//   goals <= shotsOnTarget <= shots                  (both sides)
//   home.saves === max(0, away.shotsOnTarget - awayGoals)   (derived, never
//   away.saves === max(0, home.shotsOnTarget - homeGoals)    independently
//                                                             randomized)
//   bigChances <= shots                              (both sides)
//
// Convention (documented): every on-target shot that is not a goal is a save
// for the defending team. "Blocked" is a presentation-only visual outcome in
// the 2D viewer and never a separate statistical category.
//
// Determinism: MatchDetail uses its OWN seeded RNG derived from a stable
// presentation seed (run seed + stable match number + stage + opponent +
// score). It never touches the simulation RNG, Math.random(), or any UI
// state, so the same match always produces a byte-equivalent MatchDetail.
// ---------------------------------------------------------------------------

import { makeRng, hashString } from './seedUtils'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round1 = (v) => Math.round(v * 10) / 10

// Stable per-match presentation seed. `matchNumber` is the 1-based position in
// the run's fixed match order (league 1..8, then play-off, then knockouts) —
// assigned once at simulation time and never re-derived from UI arrays. Stage,
// opponent and score are included so future rematch-style features cannot
// collide two different matches onto one seed.
export function presentationSeedFor({ runSeed, matchNumber, stage, opponent, gf, ga }) {
  return hashString([runSeed >>> 0, matchNumber, stage, opponent, `${gf}-${ga}`].join('|'))
}

// A short, deterministic one-line verdict for a single match. Single canonical
// implementation — matchTimeline.js re-exports it, so every screen that shows
// a verdict for the same match shows the same string.
export function matchVerdict(tl) {
  if (!tl) return ''
  const { gf, ga, result, pens } = tl
  if (pens) return pens.won ? 'Survived the shootout' : 'Heartbreak on penalties'
  const diff = gf - ga
  if (diff > 0 || result === 'win') return diff >= 3 ? 'Statement victory' : diff === 1 ? 'Hard-fought win' : 'Composed win'
  if (diff < 0 || result === 'loss') return diff <= -3 ? 'Outclassed on the night' : diff === -1 ? 'Narrow defeat' : 'Beaten on the night'
  return 'Honours even'
}

// Build the canonical MatchDetail for a completed match object produced by
// simulate(). Called strictly AFTER the match result is final; consumes only
// its own seeded RNG. Home headline numbers (possession / shots / SOT) are
// carried over from the legacy sim stats (clamped into the invariants) so the
// player-visible numbers stay familiar; away stats, saves, big chances, xG and
// fouls are generated/derived here — canonically, once, for all views.
export function buildMatchDetail({ match, runSeed = 1, matchNumber = 0 }) {
  const gf = match.gf ?? 0
  const ga = match.ga ?? 0
  const stage = match.type === 'league' ? 'League Phase' : (match.round || 'Knockout')
  const opponent = match.opponent || 'Opponent'
  const presentationSeed = presentationSeedFor({ runSeed, matchNumber, stage, opponent, gf, ga })
  const rng = makeRng(presentationSeed)
  const s = match.stats || {}

  // --- home side: carry over sim numbers, enforce goals <= SOT <= shots ----
  const hShots = Math.max(s.shots ?? Math.max(gf, 6), gf, 1)
  const hSot = clamp(s.shotsOnTarget ?? Math.max(gf, 3), gf, hShots)
  const hPoss = clamp(Math.round(s.possession ?? 52), 20, 80)

  // --- away side: synthesized deterministically (same shape the old timeline
  //     used, now canonical). Stronger opponents carry a touch more threat. ---
  const strength = match.opponentMeta?.strength
  const strengthFactor = typeof strength === 'number' ? clamp(0.82 + (strength - 72) / 70, 0.82, 1.2) : 1
  const aShots = clamp(Math.round(hShots * (0.5 + rng() * 0.4) * strengthFactor), Math.max(ga, 3), hShots + 4)
  const aSot = clamp(Math.round(Math.max(ga, aShots * (0.3 + rng() * 0.2))), ga, aShots)

  // --- saves: strictly derived from the other side's on-target shots --------
  const hSaves = Math.max(0, aSot - ga)
  const aSaves = Math.max(0, hSot - gf)

  // --- big chances: goals + a share of saved efforts (+ occasional wasted
  //     sitter), never exceeding total shots ---------------------------------
  const hBig = clamp(gf + Math.round((hSot - gf) * (0.45 + rng() * 0.3)) + (rng() < 0.35 ? 1 : 0), gf, hShots)
  const aBig = clamp(ga + Math.round((aSot - ga) * (0.45 + rng() * 0.3)) + (rng() < 0.3 ? 1 : 0), ga, aShots)

  // --- xG: deterministic, plausible against the stat mix --------------------
  const xgOf = (goals, big, sot, shots) =>
    round1(Math.max(goals * 0.4, goals * 0.55 + Math.max(0, big - goals) * 0.28 + Math.max(0, sot - goals) * 0.1 + Math.max(0, shots - sot) * 0.04 + rng() * 0.2))
  const hXg = xgOf(gf, hBig, hSot, hShots)
  const aXg = xgOf(ga, aBig, aSot, aShots)

  // --- fouls: deterministic plausible range ---------------------------------
  const hFouls = 6 + Math.floor(rng() * 9)
  const aFouls = 6 + Math.floor(rng() * 9)

  const usEvents = (match.events || []).filter((e) => e.side === 'us')

  return {
    round: stage,
    opponent,
    homeGoals: gf,
    awayGoals: ga,
    pens: match.pens || null,
    result: match.result,
    scorers: usEvents.map((e) => e.scorer),
    assists: usEvents.filter((e) => e.assist).map((e) => e.assist),
    finalStats: {
      home: { possession: hPoss, shots: hShots, shotsOnTarget: hSot, saves: hSaves, bigChances: hBig, xg: hXg, fouls: hFouls },
      away: { possession: 100 - hPoss, shots: aShots, shotsOnTarget: aSot, saves: aSaves, bigChances: aBig, xg: aXg, fouls: aFouls },
    },
    presentationSeed,
    keyPlayer: s.potm || null,
    verdict: matchVerdict({ gf, ga, result: match.result, pens: match.pens || null }),
    metadata: {
      stage,
      matchNumber,
      opponent,
      opponentStyle: match.opponentMeta?.style || null,
    },
  }
}
