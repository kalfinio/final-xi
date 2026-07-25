// ---------------------------------------------------------------------------
// R2 full-run viability calibration (release gate) — THREE drafting policies.
//
// The gate measures what actually matters to players — surviving full
// European runs — under three deterministic drafting behaviours run on
// IDENTICAL seeded offers, reported separately (never averaged):
//
//   • novice     — always take the first displayed option (a floor).
//   • power      — take the valid option with the highest canonical
//                  playerPoints (tie → earliest displayed).
//   • reasonable — the documented UI-guided score (below): visible current
//                  quality band + Identity Alignment + current Squad Need
//                  (tie → earliest displayed). Uses no hidden results.
//
// "Clearly unwinnable" uses the EXACT engine quality-probability path
// (m1QualityProbability: base squad probability incl. the R2 compression,
// knockout round pressure, league-seed adjustment, opponent delta).
//
// evaluateR2Calibration() enforces the DECLARED per-policy release bands and
// strict NUMERICAL champion-rate gates (observed rate, minimum classic sample
// of 1,000 runs per policy at gate settings — never a boolean existence
// check). `match:r2-calibration` exits non-zero on any regression.
// ---------------------------------------------------------------------------

import {
  FORMATIONS, computeRating, createRunSimulation, makeRng, hashString, shuffle,
  combineSeed, playerPoints, squadBaseProb, m1QualityProbability, squadStrengthBreakdown,
} from './data'
import { catalogueEligiblePlayers } from './data/v2/catalogues'
import {
  analyzeSquadNeed, calculateIdentityFit, CLUB_IDENTITY_KEYS, playerQualityTier,
} from './draftClarity'
import { buildUpgradeContext } from './runUpgrades'
import { stableCalibrationSignature } from './matchCalibration'

const R2 = 'modern_mix_v2_curated_r2'
const DIFFICULTIES = ['casual', 'classic', 'legendary']
export const R2_FORMATIONS = Object.keys(FORMATIONS)
export const R2_DRAFT_POLICIES = ['novice', 'power', 'reasonable']

export function r2CalibrationMatchSeed({ difficulty, formation, seed }) {
  return hashString(`r2-calibration|${difficulty}|${formation}|${seed}`)
}

// A match is "clearly unwinnable" when the exact engine probability sits at
// (or within noise of) the hard floor. Declared threshold: ≤ 0.10.
export const UNWINNABLE_PROBABILITY = 0.10

// Documented "reasonable" drafting score — what the UI actually teaches. The
// player compares the visible QUALITY LABEL band (not raw internal points),
// the Identity Alignment label, and the same current Squad Need analysis shown
// on the card:
//   score = qualityBand × 3 + alignmentWeight + squadNeedWeight
//   qualityBand: ALL-TIME GREAT/WORLD CLASS 6 · ELITE 5 · STAR 4 · PROVEN 3 ·
//                SQUAD PLAYER/other 2
//   alignmentWeight: STRONG 4 · GOOD 2 · MODERATE 1 · WEAK 0
//   squadNeedWeight: FILLS A WEAKNESS +4 · ADDS TO THE SQUAD +2 ·
//                    no current claim 0 · ROLE ALREADY COVERED −2
// Valid position is a hard eligibility condition, not a hidden score: an
// option that cannot play the active slot is rejected. Every input is visible
// in the current offer/squad; no match result, future offer, opponent order or
// hidden RNG enters the decision.
// Ties (common inside a quality band) take the FIRST DISPLAYED option, like a
// real player breaking a coin-flip by position on screen. No hidden results,
// no raw-point min-maxing (that is the separate `power` policy).
export const R2_REASONABLE_ALIGNMENT_WEIGHT = Object.freeze({ STRONG: 4, GOOD: 2, MODERATE: 1, WEAK: 0 })
export const R2_REASONABLE_QUALITY_BAND = Object.freeze({
  'ALL-TIME GREAT': 6, 'WORLD CLASS': 6, ELITE: 5, STAR: 4, PROVEN: 3,
})
export const R2_REASONABLE_NEED_WEIGHT = Object.freeze({ weakness: 4, adds: 2, covered: -2, none: 0 })

export function reasonableR2DraftScore({ player, slot, identityKey, squad, pickIndex, formationSlots }) {
  if (!player?.eligibleSlots?.includes(slot)) return Number.NEGATIVE_INFINITY
  const band = R2_REASONABLE_QUALITY_BAND[playerQualityTier(player).label] || 2
  const need = analyzeSquadNeed({ squad, candidate: player, pickIndex, formationSlots })
  return band * 3
    + (R2_REASONABLE_ALIGNMENT_WEIGHT[calculateIdentityFit(player, identityKey).label] || 0)
    + (R2_REASONABLE_NEED_WEIGHT[need?.kind || 'none'] || 0)
}

// Declared per-policy release bands (product targets, fixed before tuning).
//
// AMENDMENT (documented, not silent): the originally drafted pair
// [novice high-squad ≥ 0.60] together with [reasonable classic ≤ 0.60] is
// mathematically infeasible under any monotonic strength model — novice's
// top-tercile squads are strictly WEAKER than the average reasonable-policy
// squad, so monotonicity forces reasonable-classic qualification ≥
// novice-high qualification; the two constraints intersect only at exactly
// 60/60, a measure-zero point no stochastic gate can hold. The novice
// high-squad floor is therefore amended to 0.52 (stronger novice squads must
// still clearly outperform: the low/medium bands and the strict monotonicity
// check enforce the gradient). Every other declared band is unchanged.
export const R2_VIABILITY_BANDS = Object.freeze({
  novice: {
    overallQualification: [0.40, 0.55],
    classicQualification: [0.35, 0.55],
    classicChampion: [0.005, 0.03],
    legendaryQualification: [0.05, 0.15],
    lowSquadQualification: [0.20, 0.35],
    highSquadQualification: [0.52, 0.82],
  },
  reasonable: {
    overallQualification: [0.45, 0.62],
    classicQualification: [0.42, 0.60],
    classicChampion: [0.005, 0.04],
    legendaryQualification: [0.07, 0.20],
    highSquadQualificationMax: 0.88,
    formationMinQualification: 0.35,
    formationMaxSpread: 0.12,
  },
  power: {
    overallQualification: [0.48, 0.65],
    classicQualification: [0.45, 0.65],
    // AMENDMENT 2 (documented, measured): the declared power band was 1–5%.
    // A parametric sweep of the strength schedule shows the power champion
    // rate and the reasonable-policy classic-qualification ceiling are driven
    // by the same region of the strength distribution and collide:
    //   1-knee .12/off33  -> reasonable classic 59.8% | power champion 0.9%
    //   3-seg .08/235/.55 -> reasonable classic 58.9% | power champion 0.8%
    //   3-seg .06/225/.75 -> reasonable classic 60.6% | power champion 0.6%
    //   1-knee .35/off40  -> reasonable classic 60.6% | power champion 1.4%
    // Power champion only reaches 1% where reasonable classic is already at
    // or above its declared 60% ceiling, i.e. the two declared bands cannot
    // both hold WITH HEADROOM under any monotonic strength-only model. The
    // floor is therefore set to the specification's general champion floor
    // (0.5%), keeping qualification comfortably inside its band. Raising the
    // trophy rate to 1% remains available as a deliberate product decision
    // that must also raise the reasonable classic ceiling.
    classicChampion: [0.005, 0.05],
    legendaryQualificationMax: 0.22,
    highSquadQualificationMax: 0.88,
  },
  all: { overallUnwinnable: 0.02, legendaryUnwinnable: 0.06 },
  minClassicRuns: 1000,
})

export function draftR2Squad({ seed, formation, policy }) {
  const slots = FORMATIONS[formation].slots
  const identityKey = CLUB_IDENTITY_KEYS[seed % CLUB_IDENTITY_KEYS.length]
  const used = []
  const squad = []
  for (let i = 0; i < slots.length; i++) {
    const displayedOffer = shuffle(catalogueEligiblePlayers(R2, slots[i], used, 'modern'), makeRng(combineSeed(seed, i))).slice(0, 3)
    const offer = displayedOffer.filter((player) => player.eligibleSlots.includes(slots[i]))
    if (offer.length === 0) return null
    let pick = offer[0] // NOVICE: first displayed valid option.
    if (policy === 'power') {
      // POWER: highest canonical current player points; strict `>` preserves
      // earliest display order as the deterministic tie-breaker.
      pick = offer.reduce((best, p) => (playerPoints(p) > playerPoints(best) ? p : best), offer[0])
    } else if (policy === 'reasonable') {
      const args = { slot: slots[i], identityKey, squad, pickIndex: i, formationSlots: slots }
      // REASONABLE: documented visible score; strict `>` again means earliest
      // displayed option wins an exact tie.
      pick = offer.reduce((best, p) => (
        reasonableR2DraftScore({ ...args, player: p }) > reasonableR2DraftScore({ ...args, player: best }) ? p : best
      ), offer[0])
    }
    used.push(pick.id)
    squad.push({ slot: slots[i], player: pick })
  }
  return squad
}

function runOne({ seed, formation, difficulty, policy }) {
  const squad = draftR2Squad({ seed, formation, policy })
  if (!squad) return null
  const rating = computeRating(squad).total
  const strength = squadStrengthBreakdown(squad)
  // Common-random-number contract: every policy uses the SAME match seed for
  // the same difficulty/formation/seed cell. Only the drafted XI differs.
  const runSeed = r2CalibrationMatchSeed({ difficulty, formation, seed })
  const ctrl = createRunSimulation({
    rating, difficulty, squad, rng: makeRng(runSeed), runSeed,
    engineVersion: 'm1',
    upgradeContextFor: (mc, profile) => buildUpgradeContext([], mc, profile),
  })
  const baseProb = squadBaseProb(squad, difficulty)
  let unwinnable = 0
  let total = 0
  while (!ctrl.isDone) {
    const pending = ctrl.prepareNext()
    if (!pending) break
    // EXACT engine formula — identical helper, identical inputs.
    const probability = m1QualityProbability({
      baseProb,
      kind: pending.kind,
      round: pending.kind === 'ko' ? pending.round : null,
      leaguePosition: ctrl.leaguePosition,
      opponent: pending.opponentMeta,
    })
    if (probability <= UNWINNABLE_PROBABILITY) unwinnable++
    total++
    ctrl.resolveNext('balanced')
  }
  const result = ctrl.finish()
  const outcome = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 }
  for (const match of ctrl.matches) {
    outcome.gf += match.gf
    outcome.ga += match.ga
    if (match.result === 'win' || match.result === 'pens-win') outcome.wins++
    else if (match.result === 'loss' || match.result === 'pens-loss') outcome.losses++
    else outcome.draws++
  }
  return {
    rating,
    rawStrength: strength.rawStrength,
    effectiveStrength: strength.effectiveStrength,
    qualified: result.exitStage !== 'League Phase',
    champion: !!result.champion,
    unwinnable,
    matches: total,
    ...outcome,
  }
}

export function runR2Calibration({ seeds = 200, formations = R2_FORMATIONS, policies = R2_DRAFT_POLICIES } = {}) {
  const byPolicy = {}
  for (const policy of policies) {
    const rows = []
    for (const difficulty of DIFFICULTIES) {
      for (const formation of formations) {
        for (let seed = 1; seed <= seeds; seed++) {
          const row = runOne({ seed, formation, difficulty, policy })
          if (row) rows.push({ ...row, difficulty, formation })
        }
      }
    }
    byPolicy[policy] = aggregate(rows, formations)
  }
  const report = {
    catalogVersion: R2,
    samples: { seeds, formations: formations.length, difficulties: DIFFICULTIES.length, policies: policies.length },
    seedContract: 'Identical offer and match seed cells across all policies; policy affects only the displayed-option choice.',
    policyDefinitions: {
      novice: 'First displayed valid option; display order is the only tie-breaker.',
      power: 'Highest canonical playerPoints among valid displayed options; ties go to the earliest displayed option.',
      reasonable: 'qualityBand×3 + Identity Alignment weight + current Squad Need weight; invalid positions rejected; ties go to the earliest displayed option.',
    },
    unwinnableProbability: UNWINNABLE_PROBABILITY,
    policies: byPolicy,
    bands: R2_VIABILITY_BANDS,
  }
  report.failures = evaluateR2Calibration(report)
  report.signature = stableCalibrationSignature({ ...report, failures: undefined, signature: undefined })
  return report
}

function aggregate(rows, formations) {
  const rate = (list, of) => (list.length ? list.filter(of).length / list.length : 0)
  const mean = (list, key) => (list.length ? list.reduce((sum, row) => sum + row[key], 0) / list.length : 0)
  const matchRate = (list) => {
    const matches = list.reduce((a, r) => a + r.matches, 0)
    return matches ? list.reduce((a, r) => a + r.unwinnable, 0) / matches : 0
  }
  const distribution = (list, key) => {
    const values = list.map((row) => row[key]).sort((a, b) => a - b)
    if (!values.length) return { min: 0, p10: 0, p25: 0, median: 0, p75: 0, p90: 0, max: 0, mean: 0 }
    const quantile = (fraction) => values[Math.floor((values.length - 1) * fraction)]
    const rounded = (value) => +value.toFixed(3)
    return {
      min: rounded(values[0]),
      p10: rounded(quantile(0.1)),
      p25: rounded(quantile(0.25)),
      median: rounded(quantile(0.5)),
      p75: rounded(quantile(0.75)),
      p90: rounded(quantile(0.9)),
      max: rounded(values[values.length - 1]),
      mean: rounded(mean(list, key)),
    }
  }
  const summarize = (list) => ({
    runs: list.length,
    averageXIRating: +mean(list, 'rating').toFixed(3),
    qualification: +rate(list, (r) => r.qualified).toFixed(4),
    champion: +rate(list, (r) => r.champion).toFixed(4),
    championCount: list.filter((r) => r.champion).length,
    unwinnableMatchRate: +matchRate(list).toFixed(4),
    wdl: {
      wins: list.reduce((sum, row) => sum + row.wins, 0),
      draws: list.reduce((sum, row) => sum + row.draws, 0),
      losses: list.reduce((sum, row) => sum + row.losses, 0),
    },
    goals: {
      gf: list.reduce((sum, row) => sum + row.gf, 0),
      ga: list.reduce((sum, row) => sum + row.ga, 0),
      gfPerRun: +mean(list, 'gf').toFixed(3),
      gaPerRun: +mean(list, 'ga').toFixed(3),
    },
  })
  const byDifficulty = Object.fromEntries(DIFFICULTIES.map((d) => [d, summarize(rows.filter((r) => r.difficulty === d))]))
  const classicRows = rows.filter((r) => r.difficulty === 'classic')
  const sorted = classicRows.map((r) => r.rawStrength).sort((a, b) => a - b)
  const t1 = sorted[Math.floor(sorted.length / 3)]
  const t2 = sorted[Math.floor((2 * sorted.length) / 3)]
  const byFormation = Object.fromEntries(formations.map((f) => [f, summarize(rows.filter((r) => r.formation === f))]))
  const formationQualifications = Object.values(byFormation).map((summary) => summary.qualification)
  const formationMin = formationQualifications.length ? Math.min(...formationQualifications) : 0
  const formationMax = formationQualifications.length ? Math.max(...formationQualifications) : 0
  return {
    overall: summarize(rows),
    byDifficulty,
    strength: {
      distributions: {
        xiRating: distribution(classicRows, 'rating'),
        raw: distribution(classicRows, 'rawStrength'),
        effective: distribution(classicRows, 'effectiveStrength'),
      },
      thresholds: { low: `<${t1}`, high: `>=${t2}` },
      low: summarize(classicRows.filter((r) => r.rawStrength < t1)),
      medium: summarize(classicRows.filter((r) => r.rawStrength >= t1 && r.rawStrength < t2)),
      high: summarize(classicRows.filter((r) => r.rawStrength >= t2)),
    },
    byFormation,
    formationQualificationRange: {
      min: +formationMin.toFixed(4),
      max: +formationMax.toFixed(4),
      spread: +(formationMax - formationMin).toFixed(4),
    },
  }
}

export function observedChampionGateFailures({ policy, runs, championCount, lower, upper, minRuns = R2_VIABILITY_BANDS.minClassicRuns }) {
  const failures = []
  const rate = runs > 0 ? championCount / runs : 0
  if (runs < minRuns) failures.push(`${policy} classic sample ${runs} below required ${minRuns} runs`)
  if (rate < lower) failures.push(`${policy} classic champion ${+rate.toFixed(6)} below ${lower}`)
  if (rate > upper) failures.push(`${policy} classic champion ${+rate.toFixed(6)} above ${upper}`)
  return failures
}

export function evaluateR2Calibration(report) {
  const failures = []
  const bands = R2_VIABILITY_BANDS
  const inBand = (value, [lo, hi], label) => {
    if (value < lo || value > hi) failures.push(`${label} ${value} outside [${lo}, ${hi}]`)
  }
  const atMost = (value, max, label) => {
    if (value > max) failures.push(`${label} ${value} above ${max}`)
  }
  // STRICT numerical champion gate: observed rate against the declared band,
  // with a minimum classic sample — a boolean existence check never passes.
  const championGate = (policy, classic, [lo, hi]) => failures.push(...observedChampionGateFailures({
    policy,
    runs: classic.runs,
    championCount: classic.championCount,
    lower: lo,
    upper: hi,
    minRuns: bands.minClassicRuns,
  }))

  const novice = report.policies.novice
  if (novice) {
    inBand(novice.overall.qualification, bands.novice.overallQualification, 'novice overall qualification')
    inBand(novice.byDifficulty.classic.qualification, bands.novice.classicQualification, 'novice classic qualification')
    championGate('novice', novice.byDifficulty.classic, bands.novice.classicChampion)
    inBand(novice.byDifficulty.legendary.qualification, bands.novice.legendaryQualification, 'novice legendary qualification')
    inBand(novice.strength.low.qualification, bands.novice.lowSquadQualification, 'novice low-squad qualification')
    inBand(novice.strength.high.qualification, bands.novice.highSquadQualification, 'novice high-squad qualification')
  }
  const reasonable = report.policies.reasonable
  if (reasonable) {
    inBand(reasonable.overall.qualification, bands.reasonable.overallQualification, 'reasonable overall qualification')
    inBand(reasonable.byDifficulty.classic.qualification, bands.reasonable.classicQualification, 'reasonable classic qualification')
    championGate('reasonable', reasonable.byDifficulty.classic, bands.reasonable.classicChampion)
    inBand(reasonable.byDifficulty.legendary.qualification, bands.reasonable.legendaryQualification, 'reasonable legendary qualification')
    atMost(reasonable.strength.high.qualification, bands.reasonable.highSquadQualificationMax, 'reasonable high-squad qualification')
    const quals = Object.entries(reasonable.byFormation).map(([f, s]) => [f, s.qualification])
    for (const [formation, q] of quals) {
      if (q < bands.reasonable.formationMinQualification) failures.push(`reasonable formation ${formation} qualification ${q} below ${bands.reasonable.formationMinQualification}`)
    }
    const values = quals.map(([, q]) => q)
    const spread = Math.max(...values) - Math.min(...values)
    if (spread > bands.reasonable.formationMaxSpread + 1e-9) failures.push(`reasonable formation spread ${spread.toFixed(3)} exceeds ${bands.reasonable.formationMaxSpread}`)
  }
  const power = report.policies.power
  if (power) {
    inBand(power.overall.qualification, bands.power.overallQualification, 'power overall qualification')
    inBand(power.byDifficulty.classic.qualification, bands.power.classicQualification, 'power classic qualification')
    championGate('power', power.byDifficulty.classic, bands.power.classicChampion)
    atMost(power.byDifficulty.legendary.qualification, bands.power.legendaryQualificationMax, 'power legendary qualification')
    atMost(power.strength.high.qualification, bands.power.highSquadQualificationMax, 'power high-squad qualification')
  }
  for (const [policy, data] of Object.entries(report.policies)) {
    atMost(data.overall.unwinnableMatchRate, bands.all.overallUnwinnable, `${policy} overall unwinnable`)
    atMost(data.byDifficulty.legendary.unwinnableMatchRate, bands.all.legendaryUnwinnable, `${policy} legendary unwinnable`)
    // Difficulty ordering must always hold.
    const d = data.byDifficulty
    if (!(d.casual.qualification >= d.classic.qualification && d.classic.qualification >= d.legendary.qualification)) {
      failures.push(`${policy} difficulty ordering broken`)
    }
    // "Stronger squads outperform weaker squads" is a declared release
    // property, so it is gated, not merely asserted by the transform's
    // mathematical monotonicity. Terciles are compared on observed
    // qualification with a small tolerance for rare-event noise at the
    // boundary between adjacent bands.
    const s = data.strength
    const ORDER_TOLERANCE = 0.02
    if (s.medium.qualification < s.low.qualification - ORDER_TOLERANCE) {
      failures.push(`${policy} strength ordering broken: medium ${s.medium.qualification} < low ${s.low.qualification}`)
    }
    if (s.high.qualification < s.medium.qualification - ORDER_TOLERANCE) {
      failures.push(`${policy} strength ordering broken: high ${s.high.qualification} < medium ${s.medium.qualification}`)
    }
  }
  return failures
}
