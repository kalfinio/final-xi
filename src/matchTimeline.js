// Live Match Center — deterministic highlight-timeline generator.
//
// Phase 3 highlight model: instead of a fixed 8–14 events with a home tilt,
// the timeline is COMPOSED from the canonical MatchDetail so the match feels
// like a real highlight package:
//
//   • density scales with canonical volume (shots + big chances + archetype
//     bias): low-event ≈ 6–8 ball sequences, normal ≈ 9–14, busy ≈ 15–18;
//   • both teams get visible sequences in proportion to their canonical
//     attacking numbers (a side with 6+ shots never disappears);
//   • on-target budget is spent save-first, so a high-SOT goalless match
//     reads as a goalkeeper/finishing story;
//   • the remainder becomes NON-SHOT attack sequences ('chance' events —
//     interceptions, blocked crosses, keeper claims…) with zero hard-stat
//     impact;
//   • every event still respects the Phase 1 budgets: visible shots/SOT/saves
//     can never exceed the canonical totals.
//
// Event accounting (unchanged from Phase 1):
//   goal → 1 shot + 1 SOT · save/on-target shot → 1 shot + 1 SOT (= 1 save
//   for the defender) · off-target shot → 1 shot · chance/momentum/card/sub
//   → nothing. "Blocked" remains a visual outcome only.
//
// Timelines seed their own RNG from detail.presentationSeed; no UI action can
// consume simulation RNG, and replays are byte-identical.

import { makeRng, combineSeed, hashString } from './seedUtils'
import { squadDisplayName } from './data'
import { buildMatchDetail, matchVerdict } from './matchEngine'
import { attachSequences } from './sequenceEngine'

export { matchVerdict }

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

// Attach a zone-based "animation plan" to an event (legacy no-ball events use
// it directly; sequence events read it only for labels/late-drama flags).
function planAnim(e) {
  const late = e.minute >= 85 && ['goal', 'save', 'shot', 'chance'].includes(e.type)
  switch (e.type) {
    case 'goal':
      return { animType: 'goal', outcome: 'goal', visualLabel: 'GOAL', subLabel: null, lateDrama: late }
    case 'save':
      return { animType: 'save', outcome: 'save', visualLabel: 'BIG SAVE', subLabel: 'Keeper denies it', lateDrama: late }
    case 'shot':
      return { animType: 'shot', outcome: e.onTarget ? 'blocked' : 'miss', visualLabel: 'SHOT', subLabel: e.onTarget ? 'Saved' : 'Off target', lateDrama: late }
    case 'chance':
      return { animType: 'chance', outcome: 'none', visualLabel: 'CHANCE', subLabel: 'Chance created', lateDrama: late }
    case 'momentum':
      return { animType: 'momentum_shift', outcome: 'none', visualLabel: 'MOMENTUM SHIFT', subLabel: null, lateDrama: false, highlightZone: 'center' }
    case 'card':
      return { animType: 'card', outcome: 'none', visualLabel: e.red ? 'RED CARD' : 'YELLOW CARD', subLabel: null, lateDrama: false, highlightZone: 'ownMidfield' }
    default: // substitution
      return { animType: 'substitution_impact', outcome: 'none', visualLabel: 'ROLE IMPACT', subLabel: null, lateDrama: false, highlightZone: 'ownMidfield' }
  }
}

const M1_FAILURE_TEXT = {
  cross_blocked: 'the delivery is blocked behind',
  delivery_cleared: 'the delivery is cleared and the break is on',
  possession_recycled: 'the move is recycled safely',
  counter_halted: 'a recovery challenge halts the break',
  foul_won: 'the attack draws a foul',
  turnover_created: 'the move breaks down and possession turns over',
  heavy_touch_turnover: 'a heavy touch gives the ball away',
  set_piece_cleared: 'the set piece is headed clear',
  keeper_claim: 'the keeper claims the delivery',
  pass_intercepted: 'the final pass is intercepted',
  buildup_stopped: 'the buildup is stopped before the box',
}

function m1Point(route, step, team) {
  const routePoints = {
    central_buildup: [{ x: 38, y: 32 }, { x: 69, y: 32 }, { x: 87, y: 32 }],
    wide_overlap: [{ x: 54, y: 51 }, { x: 89, y: 53 }, { x: 87, y: 32 }],
    switch_of_play: [{ x: 35, y: 19 }, { x: 69, y: 51 }, { x: 87, y: 34 }],
    through_ball: [{ x: 56, y: 32 }, { x: 76, y: 28 }, { x: 89, y: 32 }],
    one_two: [{ x: 65, y: 35 }, { x: 79, y: 31 }, { x: 88, y: 32 }],
    counterattack: [{ x: 32, y: 37 }, { x: 69, y: 43 }, { x: 89, y: 32 }],
    cross: [{ x: 63, y: 52 }, { x: 92, y: 53 }, { x: 88, y: 29 }],
    cutback: [{ x: 66, y: 50 }, { x: 92, y: 51 }, { x: 83, y: 32 }],
    pressing_recovery: [{ x: 69, y: 32 }, { x: 82, y: 34 }, { x: 89, y: 32 }],
    direct_attack: [{ x: 29, y: 32 }, { x: 72, y: 30 }, { x: 88, y: 32 }],
    set_piece: [{ x: 94, y: 59 }, { x: 87, y: 28 }, { x: 89, y: 32 }],
    long_range: [{ x: 73, y: 34 }, { x: 78, y: 34 }, { x: 97, y: 32 }],
  }
  const points = routePoints[route] || routePoints.central_buildup
  const point = points[Math.min(step, points.length - 1)]
  return team === 'away' ? { x: 100 - point.x, y: 64 - point.y } : { ...point }
}

function selectM1Highlights(causalEvents, presentationSeed) {
  const chances = causalEvents.filter((event) => event.progression === 'success')
  const failures = causalEvents.filter((event) => event.progression !== 'success')
    .sort((left, right) => {
      const leftRank = hashString(`${presentationSeed}|m1-highlight|${left.id}`)
      const rightRank = hashString(`${presentationSeed}|m1-highlight|${right.id}`)
      return leftRank - rightRank || left.minute - right.minute
    })
  let selected = [...chances]
  if (selected.length < 5) selected.push(...failures.slice(0, 5 - selected.length))
  else selected.push(...failures.slice(0, Math.min(3, Math.max(0, 12 - selected.length))))
  if (selected.length > 15) {
    const goals = selected.filter((event) => event.goal)
    const rest = selected.filter((event) => !event.goal)
      .sort((left, right) => (right.xg || 0) - (left.xg || 0) || left.minute - right.minute)
    selected = [...goals, ...rest.slice(0, Math.max(0, 15 - goals.length))]
  }
  return selected.sort((left, right) => left.minute - right.minute || (left.stoppage || 0) - (right.stoppage || 0) || left.id.localeCompare(right.id))
}

function buildM1Sequence(causal, timelineEvent, squad, nameOf, opponent) {
  const team = timelineEvent.team
  const byId = Object.fromEntries((squad || []).map((entry) => [entry.player.id, entry]))
  const creatorEntry = causal.creatorId ? byId[causal.creatorId] : null
  const shooterEntry = causal.shooterId ? byId[causal.shooterId] : null
  const creatorName = team === 'home' ? nameOf(causal.creatorName || creatorEntry?.player.name || 'Final XI') : (causal.creatorName || 'their playmaker')
  const shooterName = team === 'home' ? nameOf(causal.shooterName || shooterEntry?.player.name || creatorName) : (causal.shooterName || 'their forward')
  const creatorActor = {
    playerId: team === 'home' ? causal.creatorId : null,
    awayNum: team === 'away' ? 6 : undefined,
    playerName: creatorName,
    role: creatorEntry?.player.role || creatorName,
    slot: creatorEntry?.slot || null,
    action: causal.highTurnover ? 'recovery' : causal.route === 'direct_attack' ? 'longball' : 'progression',
    text: causal.highTurnover ? `${creatorName} wins it high` : `${creatorName} drives the ${causal.route.replaceAll('_', ' ')} move`,
    at: m1Point(causal.route, 0, team),
    kind: causal.highTurnover ? 'recovery' : 'pass',
  }
  const touches = [creatorActor]
  if (causal.progression === 'success') {
    const sameActor = causal.shooterId && causal.shooterId === causal.creatorId
    touches.push({
      playerId: team === 'home' ? causal.shooterId : null,
      awayNum: team === 'away' ? (sameActor ? 6 : 9) : undefined,
      playerName: shooterName,
      role: shooterEntry?.player.role || shooterName,
      slot: shooterEntry?.slot || null,
      action: 'shot',
      text: `${shooterName} ${causal.route === 'cross' || causal.route === 'set_piece' ? 'meets the delivery' : 'shoots'}`,
      at: m1Point(causal.route, 2, team),
      kind: 'shot',
    })
  }
  const last = touches[touches.length - 1]
  const outcomeAt = causal.outcome === 'off_target'
    ? (team === 'home' ? { x: 99, y: 43 } : { x: 1, y: 21 })
    : causal.progression === 'success'
      ? (team === 'home' ? { x: 97, y: 32 } : { x: 3, y: 32 })
      : m1Point(causal.route, 1, team)
  const failureText = M1_FAILURE_TEXT[causal.outcome] || 'the move breaks down'
  let outcome
  if (causal.goal) {
    outcome = { type: 'goal', playerId: last.playerId, playerName: last.playerName, at: outcomeAt, description: timelineEvent.description }
  } else if (causal.outcome === 'saved') {
    const goalkeeper = team === 'home' ? `${opponent} keeper` : (squad || []).find((entry) => entry.player.posType === 'GK')?.player.name || 'the keeper'
    outcome = { type: 'save', playerId: last.playerId, playerName: last.playerName, goalkeeper, at: outcomeAt, description: `${last.playerName} is denied by ${goalkeeper}` }
  } else if (causal.outcome === 'off_target') {
    outcome = { type: 'shot_off', playerId: last.playerId, playerName: last.playerName, at: outcomeAt, description: `${last.playerName} fires wide` }
  } else {
    outcome = { type: 'chance', playerId: last.playerId, playerName: last.playerName, at: outcomeAt, variantLabel: failureText, description: `${team === 'home' ? 'Final XI' : opponent} threaten — ${failureText}` }
  }
  const participants = []
  const seen = new Set()
  for (const touch of touches) {
    const key = touch.playerId ?? `away-${touch.awayNum}`
    if (seen.has(key)) continue
    seen.add(key)
    participants.push({ playerId: touch.playerId, awayNum: touch.awayNum ?? null, name: touch.playerName, role: touch.role, slot: touch.slot })
  }
  return {
    id: timelineEvent.id,
    minute: causal.minute,
    team,
    phase: team === 'home' ? 'attack' : 'defend',
    pattern: causal.route,
    big: causal.chanceQuality === 'high' || causal.chanceQuality === 'clear',
    participants,
    touches,
    outcome,
    statImpact: {
      shots: causal.progression === 'success' ? 1 : 0,
      shotsOnTarget: causal.onTarget ? 1 : 0,
      saves: causal.outcome === 'saved' ? 1 : 0,
      bigChances: causal.chanceQuality === 'high' || causal.chanceQuality === 'clear' ? 1 : 0,
      goals: causal.goal ? 1 : 0,
    },
  }
}

function buildM1MatchTimeline(match, players, stageLabel, teamName, squad) {
  const detail = match.detail || buildMatchDetail({ match, runSeed: 0, matchNumber: 0 })
  const dh = detail.finalStats.home
  const da = detail.finalStats.away
  const opponent = match.opponent || 'Opponent'
  const squadNames = new Set(players.map((player) => player.name))
  const homeName = (name) => squadDisplayName(name, squadNames)
  const highlights = selectM1Highlights(match.causalEvents, detail.presentationSeed)
  const events = highlights.map((causal, index) => {
    const team = causal.side === 'us' ? 'home' : 'away'
    const scorer = team === 'home' ? homeName(causal.shooterName || 'Final XI') : (causal.shooterName || 'Opponent Forward')
    const assister = causal.creatorName && causal.creatorName !== causal.shooterName
      ? (team === 'home' ? homeName(causal.creatorName) : causal.creatorName)
      : null
    const type = causal.goal ? 'goal' : causal.outcome === 'saved' ? 'save' : causal.outcome === 'off_target' ? 'shot' : 'chance'
    const title = causal.goal ? 'GOAL' : causal.outcome === 'saved' ? 'Big save' : causal.outcome === 'off_target' ? 'Shot off target' : 'Chance created'
    const description = causal.goal
      ? (team === 'home'
        ? (assister ? `${scorer} scores — assist ${assister}` : `${scorer} scores for ${teamName}`)
        : `${scorer} scores for ${opponent}`)
      : causal.outcome === 'saved' ? `${scorer} is denied`
        : causal.outcome === 'off_target' ? `${scorer} fires wide`
          : `${team === 'home' ? teamName : opponent} threaten — ${M1_FAILURE_TEXT[causal.outcome] || 'the move breaks down'}`
    const event = {
      id: index,
      causalEventId: causal.id,
      minute: causal.minute,
      minuteLabel: causal.minuteLabel,
      type,
      team,
      route: causal.route,
      onTarget: !!causal.onTarget,
      countsShot: causal.progression === 'success',
      scorer: causal.goal ? scorer : undefined,
      assister: causal.goal ? assister : undefined,
      title,
      description,
      big: causal.chanceQuality === 'high' || causal.chanceQuality === 'clear',
      gameState: {
        diff: team === 'home'
          ? causal.scoreBefore.us - causal.scoreBefore.opp
          : causal.scoreBefore.opp - causal.scoreBefore.us,
        late: causal.phase === 'late',
      },
    }
    event.anim = planAnim(event)
    event.seq = buildM1Sequence(causal, event, squad, homeName, opponent)
    if (!causal.goal) event.description = event.seq.outcome.description
    return event
  })
  return {
    home: teamName,
    away: opponent,
    gf: match.gf,
    ga: match.ga,
    stageLabel,
    opponentMeta: match.opponentMeta || null,
    matchup: match.matchup || null,
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

// Turn a finished match object into a visual timeline constrained by its
// canonical MatchDetail. `squad` ([{slot, player}]) enables formation-aware
// participant sequences; slots fall back to primary positions when absent.
export function buildMatchTimeline(match, players, stageLabel = '', teamName = 'Final XI', tactics = null, squad = null) {
  if (!match) return null
  if (match.engineVersion === 'm1' && Array.isArray(match.causalEvents)) {
    const seqSquad = squad || players.map((player) => ({ slot: player.primaryPos, player }))
    return buildM1MatchTimeline(match, players, stageLabel, teamName, seqSquad)
  }
  const gf = match.gf ?? 0
  const ga = match.ga ?? 0
  const opponent = match.opponent || 'Opponent'
  const oppMeta = match.opponentMeta || null
  const matchup = match.matchup || null
  const tf = tactics?.flags || {} // tactical flags → light flavour on no-ball events
  const squadNames = new Set(players.map((p) => p.name))
  const homeName = (n) => squadDisplayName(n, squadNames)

  const detail = match.detail || buildMatchDetail({ match, runSeed: 0, matchNumber: 0 })
  const dh = detail.finalStats.home
  const da = detail.finalStats.away

  const goalMinutes = (match.events || []).map((e) => e.minute)
  const rng = makeRng(combineSeed(detail.presentationSeed, 7))

  // 1) Real goals become 'goal' events (kept verbatim from the simulation).
  const events = (match.events || []).map((e) => {
    const home = e.side === 'us'
    const scorer = home ? homeName(e.scorer) : (e.scorer || 'their forward')
    const assister = home && e.assist ? homeName(e.assist) : null
    const lbl = e.label ? ` ${e.label}` : ''
    const lateDrama = home && tf.bigGame && e.minute >= 75 ? ' — the big-game man delivers' : ''
    return {
      minute: e.minute,
      type: 'goal',
      team: home ? 'home' : 'away',
      onTarget: true,
      countsShot: true,
      scorer,
      assister,
      label: e.label || null,
      title: 'GOAL',
      description: home
        ? (assister ? `${scorer} scores${lbl} — assist ${assister}${lateDrama}` : `${scorer} scores${lbl} for ${teamName}${lateDrama}`)
        : `${scorer} scores for ${opponent}`,
    }
  })

  const used = new Set(goalMinutes)
  function freeMinute() {
    for (let k = 0; k < 24; k++) {
      const m = 3 + Math.floor(rng() * 88)
      if (!used.has(m)) { used.add(m); return m }
    }
    const m = 3 + Math.floor(rng() * 88); used.add(m); return m
  }

  // 2) Highlight composition from canonical volume.
  const shotB = { home: Math.max(0, dh.shots - gf), away: Math.max(0, da.shots - ga) }
  const sotB = { home: Math.max(0, dh.shotsOnTarget - gf), away: Math.max(0, da.shotsOnTarget - ga) }
  const totalShots = dh.shots + da.shots
  const totalBig = dh.bigChances + da.bigChances
  const densityBias = matchup?.densityBias || 0
  const targetBall = clamp(
    Math.round(4 + totalShots * 0.28 + totalBig * 0.22 + densityBias + (rng() - 0.5)),
    6, 18,
  )
  // split between teams by canonical attacking weight (shots + big chances +
  // possession surplus) — never artificially equal, never invisible.
  const wHome = dh.shots + dh.bigChances + Math.max(0, dh.possession - 50) * 0.06
  const wAway = da.shots + da.bigChances + Math.max(0, da.possession - 50) * 0.06
  let homeBall = clamp(Math.round(targetBall * (wHome / ((wHome + wAway) || 1))), 1, targetBall - 1)
  if (da.shots >= 6) homeBall = Math.min(homeBall, targetBall - 2) // away stays present
  if (dh.shots >= 6) homeBall = Math.max(homeBall, 2)              // home stays present
  let awayBall = targetBall - homeBall
  homeBall = Math.max(homeBall, gf)
  awayBall = Math.max(awayBall, ga)

  // Per-team composition: saves first (SOT budget → keeper story), a share of
  // off-target shots, remainder = non-shot attack sequences.
  function planTeam(team, goals, ballCount) {
    const filler = Math.max(0, ballCount - goals)
    let saves = Math.min(sotB[team], Math.ceil(sotB[team] * 0.75), filler)
    if (filler >= 4 && filler - saves < 1) saves = filler - 1 // keep ≥1 non-shot story
    const offT = Math.min(Math.max(0, shotB[team] - saves), Math.max(0, Math.round(filler * 0.3)), filler - saves)
    const attacks = Math.max(0, filler - saves - offT)
    return { saves, offT, attacks }
  }

  for (const team of ['home', 'away']) {
    const goals = team === 'home' ? gf : ga
    const ballCount = team === 'home' ? homeBall : awayBall
    const { saves, offT, attacks } = planTeam(team, goals, ballCount)
    for (let i = 0; i < saves; i++) {
      const bigSave = rng() < 0.5
      events.push({
        minute: freeMinute(), type: bigSave ? 'save' : 'shot', team,
        onTarget: true, countsShot: true,
        title: bigSave ? 'Big save' : 'Shot on target',
        description: 'denied', // rewritten by the sequence outcome
      })
    }
    for (let i = 0; i < offT; i++) {
      events.push({
        minute: freeMinute(), type: 'shot', team,
        onTarget: false, countsShot: true,
        title: 'Shot off target',
        description: 'off target', // rewritten by the sequence outcome
      })
    }
    for (let i = 0; i < attacks; i++) {
      events.push({
        minute: freeMinute(), type: 'chance', team,
        onTarget: false, countsShot: false,
        title: 'Chance created',
        description: 'an opening', // rewritten by the sequence outcome
      })
    }
  }

  // 3) A little no-ball texture (momentum / card / substitution) — kept small
  //    so the match stays a football highlight package, not filler.
  const momentumCount = 1 + (rng() < 0.5 ? 1 : 0)
  for (let i = 0; i < momentumCount; i++) {
    const home = rng() < 0.55
    let homeDesc = `${teamName} seize control of the tempo`
    if (tf.tempoControl && rng() < 0.6) homeDesc = `${teamName} are controlling possession through midfield`
    else if (tf.attackingFB && rng() < 0.4) homeDesc = `${teamName} are overloading the final third out wide`
    const awayDesc = tf.exposed && rng() < 0.45
      ? `${opponent} are finding gaps between midfield and defense`
      : (oppMeta ? `${opponent} are ${oppMeta.style}` : `${opponent} push for a foothold`)
    events.push({
      minute: freeMinute(), type: 'momentum', team: home ? 'home' : 'away',
      onTarget: false, countsShot: false,
      title: 'Momentum shift',
      description: home ? homeDesc : awayDesc,
    })
  }
  if (rng() < 0.55) {
    const home = rng() < 0.5
    const red = rng() < 0.12
    events.push({
      minute: freeMinute(), type: 'card', team: home ? 'home' : 'away',
      onTarget: false, countsShot: false, red,
      title: red ? 'Red card' : 'Yellow card',
      description: home ? `${teamName} booked for a tactical foul` : `${opponent} ${red ? 'reduced to ten men' : 'shown a yellow'}`,
    })
  }
  if (rng() < 0.3) {
    const home = rng() < 0.6
    events.push({
      minute: freeMinute(), type: 'substitution', team: home ? 'home' : 'away',
      onTarget: false, countsShot: false,
      title: 'Substitution',
      description: home ? `${teamName} freshen things up` : `${opponent} make a change`,
    })
  }

  // 4) Chronological order; stable ids + animation labels; game-state tags.
  events.sort((a, b) => a.minute - b.minute)
  events.forEach((e, i) => { e.id = i; e.anim = planAnim(e) })
  // Game state at each event (presentation only — sequences use it to pick
  // plausible patterns; it never alters results or budgets).
  let runH = 0
  let runA = 0
  for (const e of events) {
    const diff = e.team === 'home' ? runH - runA : runA - runH
    e.gameState = { diff, late: e.minute >= 70 }
    if (e.type === 'goal') { if (e.team === 'home') runH++; else runA++ }
  }

  // 5) Participant-based possession sequences (Phase 2/3/4).
  const seqSquad = squad || players.map((p) => ({ slot: p.primaryPos, player: p }))
  attachSequences(events, { detail, squad: seqSquad, nameOf: homeName, teamName, opponent, matchup, approach: match.approach || 'balanced' })

  return {
    home: teamName,
    away: opponent,
    gf, ga,
    stageLabel,
    opponentMeta: oppMeta,
    matchup,
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
