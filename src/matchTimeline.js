// Live Match Center — deterministic event-timeline generator (presentation
// layer only, Phase 1: constrained by the canonical MatchDetail).
//
// The simulation in data.js decides the real result; matchEngine.js builds the
// ONE canonical MatchDetail (final stats for both teams). This module ONLY
// visualizes a match: it expands the goal list into 8–14 believable highlight
// events. It never invents hard totals — every shot-like event it emits is
// drawn from a budget derived from MatchDetail, so resolved-event counts can
// never exceed the canonical full-time numbers:
//
//   goal event        → consumes 1 shot + 1 SOT (pre-consumed from budgets)
//   big-save event    → consumes 1 shot + 1 SOT (attacker)  = 1 save (defender)
//   on-target shot    → consumes 1 shot + 1 SOT (attacker)  = 1 save (defender)
//   off-target shot   → consumes 1 shot, 0 SOT
//   chance / momentum / card / substitution → no stat consumption
//
// Blocked-shot convention (documented): "blocked" exists only as a visual
// outcome in the 2D viewer for on-target shots; statistically an on-target
// non-goal shot is always a save for the defending team. There is no separate
// blocked category, so nothing is double counted.
//
// Because the Match Center shows selected highlights (8–14 events), not every
// one of the ~10–20 canonical shots, the live stat display uses a documented
// progressive reconciliation strategy (see computeStats in MatchCenter.jsx):
// time-eased progression toward the canonical totals, floored by the resolved
// event counts (which this file guarantees never exceed those totals).
//
// Timelines seed their own RNG from detail.presentationSeed, so the same match
// always animates identically (Daily Challenge stays deterministic) and no UI
// action can consume simulation RNG.

import { makeRng, combineSeed } from './seedUtils'
import { squadDisplayName } from './data'
import { buildMatchDetail, matchVerdict } from './matchEngine'

// Single canonical verdict helper lives in matchEngine.js; re-exported here so
// existing imports (MatchCenter, RunFlow) keep working and every screen shows
// the same verdict for the same match.
export { matchVerdict }

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

// Generic opponent attacker labels (no real names — matches the sim's style).
const OPP_LABELS = ['their striker', 'their winger', 'their forward', 'their playmaker', 'their midfielder', 'their wing-back']

// Attach a zone-based "animation plan" to an event so the 2D viewer can play a
// clear, tactical replay (build-up → final third → outcome) instead of random
// ball movement. Zones are attack-relative; the viewer mirrors them for the away
// team. Purely descriptive — never affects the result.
function planAnim(e) {
  const wide = e.id % 2 === 0 ? 'wideRight' : 'wideLeft'
  const late = e.minute >= 85 && ['goal', 'save', 'shot', 'chance'].includes(e.type)
  switch (e.type) {
    case 'goal':
      return { animType: 'goal', startZone: 'center', pathZones: ['opponentMidfield', wide, 'opponentBox'], endZone: 'goal', outcome: 'goal', visualLabel: 'GOAL', subLabel: null, lateDrama: late }
    case 'save':
      return { animType: 'save', startZone: 'center', pathZones: ['finalThird', 'opponentBox'], endZone: 'opponentBox', outcome: 'save', visualLabel: 'BIG SAVE', subLabel: 'Keeper denies it', lateDrama: late }
    case 'shot':
      return { animType: 'shot', startZone: 'center', pathZones: ['opponentMidfield', 'finalThird'], endZone: 'opponentBox', outcome: e.onTarget ? 'blocked' : 'miss', visualLabel: 'SHOT', subLabel: e.onTarget ? 'Saved' : 'Off target', lateDrama: late }
    case 'chance':
      return { animType: 'chance', startZone: 'center', pathZones: ['opponentMidfield', wide], endZone: 'finalThird', outcome: 'none', visualLabel: 'CHANCE', subLabel: 'Chance created', lateDrama: late }
    case 'momentum':
      return { animType: 'momentum_shift', startZone: 'center', pathZones: [], endZone: 'center', outcome: 'none', visualLabel: 'MOMENTUM SHIFT', subLabel: null, lateDrama: false, highlightZone: 'center' }
    case 'card':
      return { animType: 'card', startZone: 'center', pathZones: [], endZone: 'center', outcome: 'none', visualLabel: e.red ? 'RED CARD' : 'YELLOW CARD', subLabel: null, lateDrama: false, highlightZone: 'ownMidfield' }
    default: // substitution
      return { animType: 'substitution_impact', startZone: 'center', pathZones: [], endZone: 'center', outcome: 'none', visualLabel: 'ROLE IMPACT', subLabel: null, lateDrama: false, highlightZone: 'ownMidfield' }
  }
}

// Turn a finished match object into a visual timeline constrained by its
// canonical MatchDetail. `players` is the user's XI for home flavour names.
export function buildMatchTimeline(match, players, stageLabel = '', teamName = 'Final XI', tactics = null) {
  if (!match) return null
  const gf = match.gf ?? 0
  const ga = match.ga ?? 0
  const opponent = match.opponent || 'Opponent'
  const oppMeta = match.opponentMeta || null
  const tf = tactics?.flags || {} // tactical flags → light, capped flavour only
  const squadNames = new Set(players.map((p) => p.name))
  const homeName = (n) => squadDisplayName(n, squadNames)

  // Canonical stats. Every simulated match carries `detail`; the fallback only
  // covers stray callers (e.g. tests with hand-built matches) and is itself
  // deterministic from the match facts.
  const detail = match.detail || buildMatchDetail({ match, runSeed: 0, matchNumber: 0 })
  const dh = detail.finalStats.home
  const da = detail.finalStats.away

  const goalMinutes = (match.events || []).map((e) => e.minute)
  // Timeline RNG stream derived from the canonical presentation seed (offset so
  // it does not replay the engine's own draws). Identical on every replay.
  const rng = makeRng(combineSeed(detail.presentationSeed, 7))
  const pick = (arr) => arr[Math.floor(rng() * arr.length)]

  const outfield = players.filter((p) => p.posType !== 'GK')
  const gk = players.find((p) => p.posType === 'GK')
  const homeAttacker = () => homeName(pick(outfield.length ? outfield : players).name)
  const awayAttacker = () => pick(OPP_LABELS)

  // Event budgets: canonical totals minus what the goal events pre-consume.
  // Guarantees resolved shot/SOT/save event counts never exceed MatchDetail.
  const shotBudget = { home: Math.max(0, dh.shots - gf), away: Math.max(0, da.shots - ga) }
  const sotBudget = { home: Math.max(0, dh.shotsOnTarget - gf), away: Math.max(0, da.shotsOnTarget - ga) }
  // (sotBudget[team] is by construction the defending team's canonical saves.)

  // 1) Real goals become 'goal' events (kept verbatim from the simulation).
  const events = (match.events || []).map((e) => {
    const home = e.side === 'us'
    const scorer = home ? homeName(e.scorer) : (e.scorer || 'their forward')
    const assister = home && e.assist ? homeName(e.assist) : null
    const lbl = e.label ? ` ${e.label}` : ''
    // Big Game Scorer side → a touch of late-drama wording on late home goals.
    const lateDrama = home && tf.bigGame && e.minute >= 75 ? ' — the big-game man delivers' : ''
    return {
      minute: e.minute,
      type: 'goal',
      team: home ? 'home' : 'away',
      onTarget: true,
      countsShot: true,
      scorer,
      assister,
      title: 'GOAL',
      description: home
        ? (assister ? `${scorer} scores${lbl} — assist ${assister}${lateDrama}` : `${scorer} scores${lbl} for ${teamName}${lateDrama}`)
        : `${scorer} scores for ${opponent}`,
    }
  })

  // 2) Filler events to reach a believable 8–14 total.
  const total = clamp(events.length + 6 + Math.floor(rng() * 4), 8, 14)
  const used = new Set(goalMinutes)
  function freeMinute() {
    for (let k = 0; k < 24; k++) {
      const m = 3 + Math.floor(rng() * 88)
      if (!used.has(m)) { used.add(m); return m }
    }
    const m = 3 + Math.floor(rng() * 88); used.add(m); return m
  }

  // Base filler mix, nudged a little by the XI's tactical profile (capped: an
  // attack-heavy/creative shape produces more chances/tempo events). This only
  // shapes the *flavour* of filler events — never goals, score, or win odds.
  const TYPES = [
    { type: 'shot', w: 30 },
    { type: 'save', w: 24 },
    { type: 'chance', w: 22 + (tf.inPossStrong ? 6 : 0) + (tf.creators ? 4 : 0) },
    { type: 'momentum', w: 14 + (tf.tempoControl ? 4 : 0) + (tf.inPossStrong ? 3 : 0) },
    { type: 'card', w: 7 },
    { type: 'substitution', w: 3 },
  ]
  const totalW = TYPES.reduce((s, t) => s + t.w, 0)
  function rollType() {
    let r = rng() * totalW
    for (const t of TYPES) { if ((r -= t.w) < 0) return t.type }
    return 'shot'
  }

  let cardGiven = false
  let subGiven = false
  while (events.length < total) {
    let type = rollType()
    if (type === 'card' && cardGiven) type = 'shot'       // at most one booking
    if (type === 'substitution' && subGiven) type = 'chance' // at most one sub
    // A compact, shielded XI concedes fewer clear opponent chances — some away
    // shots/chances fizzle into a stalled attack instead.
    const home = rng() < 0.58 // tilt the visuals toward the user's team
    const team = home ? 'home' : 'away'
    if (!home && (tf.outPossStrong || tf.defensiveShield) && (type === 'shot' || type === 'chance') && rng() < 0.5) {
      type = 'momentum'
    }
    // Budget accounting: downgrade shot-like events the canonical totals can't
    // afford, so resolved counts never exceed MatchDetail at any point.
    if ((type === 'shot' || type === 'save') && shotBudget[team] <= 0) type = 'chance'
    if (type === 'save' && sotBudget[team] <= 0) type = 'shot'

    const who = home ? homeAttacker() : awayAttacker()
    const minute = freeMinute()
    let ev

    if (type === 'shot') {
      const onT = sotBudget[team] > 0 && rng() < 0.45
      shotBudget[team] -= 1
      if (onT) sotBudget[team] -= 1 // on-target non-goal shot = defender's save
      ev = {
        type, team, onTarget: onT, countsShot: true,
        title: onT ? 'Shot on target' : 'Shot off target',
        description: home ? `${who} ${onT ? 'forces a save' : 'fires just wide'}` : `${who} ${onT ? 'tests the keeper' : 'drags it wide'}`,
      }
    } else if (type === 'save') {
      shotBudget[team] -= 1
      sotBudget[team] -= 1 // consumes one defending-team save
      const keeper = home ? `${opponent} keeper` : (gk ? homeName(gk.name) : 'the keeper')
      ev = {
        type, team, onTarget: true, countsShot: true,
        title: 'Big save',
        description: `${who} is denied — ${keeper} stands tall`,
      }
    } else if (type === 'chance') {
      // Tactical flavour: attacking fullbacks overload the wing; creators thread
      // key passes; exposed XIs concede chances between the lines.
      let homeDesc = `${who} carves out an opening`
      if (tf.attackingFB && rng() < 0.5) homeDesc = `${who} overlaps and whips in a cross`
      else if (tf.creators && rng() < 0.5) homeDesc = `${who} is slipped in by a clever key pass`
      const awayDesc = tf.exposed && rng() < 0.5 ? `${opponent} find space in behind the fullbacks` : `${opponent} work a chance through ${who}`
      ev = {
        type, team, onTarget: false, countsShot: false,
        title: 'Chance created',
        description: home ? homeDesc : awayDesc,
      }
    } else if (type === 'momentum') {
      // Home momentum reflects control style; away references opponent style or
      // (if the XI is exposed) gaps opening up between the lines.
      let homeDesc = `${teamName} seize control of the tempo`
      if (tf.tempoControl && rng() < 0.6) homeDesc = `${teamName} are controlling possession through midfield`
      else if (tf.attackingFB && rng() < 0.4) homeDesc = `${teamName} are overloading the final third out wide`
      const awayDesc = tf.exposed && rng() < 0.45
        ? `${opponent} are finding gaps between midfield and defense`
        : (oppMeta ? `${opponent} are ${oppMeta.style}` : `${opponent} push for a foothold`)
      ev = {
        type, team, onTarget: false, countsShot: false,
        title: 'Momentum shift',
        description: home ? homeDesc : awayDesc,
      }
    } else if (type === 'card') {
      cardGiven = true
      const red = rng() < 0.12
      ev = {
        type, team, onTarget: false, countsShot: false, red,
        title: red ? 'Red card' : 'Yellow card',
        description: home ? `${teamName} booked for a tactical foul` : `${opponent} ${red ? 'reduced to ten men' : 'shown a yellow'}`,
      }
    } else { // substitution
      subGiven = true
      ev = {
        type, team, onTarget: false, countsShot: false,
        title: 'Substitution',
        description: home ? `${teamName} freshen things up` : `${opponent} make a change`,
      }
    }
    events.push({ minute, ...ev })
  }

  // 3) Chronological order; give each event a stable id + animation plan.
  events.sort((a, b) => a.minute - b.minute)
  events.forEach((e, i) => { e.id = i; e.anim = planAnim(e) })

  // 4) Final stat targets = the canonical MatchDetail totals, verbatim. The UI
  //    eases live stats toward these and lands exactly on them at full time.
  return {
    home: teamName,
    away: opponent,
    gf, ga,
    stageLabel,
    opponentMeta: oppMeta,
    potm: detail.keyPlayer,
    pens: match.pens || null,
    result: match.result,
    verdict: detail.verdict,
    detail,
    events,
    finalStats: {
      home: { shots: dh.shots, sot: dh.shotsOnTarget, possession: dh.possession, saves: dh.saves, bigChances: dh.bigChances, xg: dh.xg, fouls: dh.fouls },
      away: { shots: da.shots, sot: da.shotsOnTarget, possession: da.possession, saves: da.saves, bigChances: da.bigChances, xg: da.xg, fouls: da.fouls },
    },
  }
}
