// ---------------------------------------------------------------------------
// Participant-based possession-sequence engine (Phase 2).
//
// Turns canonical MatchDetail outcomes into readable football sequences the
// 2D Match Center can animate touch by touch:
//
//   MatchDetail → attachSequences() → event.seq → 2D animator
//     → progressive live stats → exact canonical finalStats at FT
//
// Rules:
//   • NEVER changes results, scores, stats, or probabilities — it decorates
//     the highlight events the (budget-constrained) timeline already emits,
//     so every visible shot/SOT/save/big-chance count stays within the
//     canonical MatchDetail totals from Phase 1.
//   • Deterministic: each sequence's RNG is derived from
//     detail.presentationSeed + the event's stable id. No Math.random().
//   • Uses the REAL drafted XI: participants are actual players, selected by
//     slot / posType / role, and positioned via the tactics.js marker model
//     (single positional source — projected, not re-modelled).
//   • Roles shape narrative and participation ONLY (Phase 2) — no effect on
//     match probability or outcomes.
// ---------------------------------------------------------------------------

import { makeRng, combineSeed } from './seedUtils'
import { buildMarkers } from './tactics'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------------------
// Positional source: tactics.js markers (vertical 100×150, own goal at y=150)
// projected onto the Match Center's horizontal 100×64 pitch (home attacks →).
// This is a projection of the existing model, not a second positioning model.
// ---------------------------------------------------------------------------
function project(m) {
  return {
    x: clamp(3 + ((150 - m.y) / 150) * 45, 3, 49),
    y: clamp(4 + (m.x / 100) * 56, 4, 60),
  }
}

// Home dots for the 2D pitch: role/formation-aware base shape + in-possession
// shape (used as "temporary possession positions" during sequences).
export function projectHomeDots(squad, compact = 1) {
  const base = buildMarkers(squad, 'combined', compact)
  const poss = buildMarkers(squad, 'inPossession', compact)
  return squad.map((s, i) => {
    const b = project(base[i])
    const p = project(poss[i])
    return {
      id: s.player.id,
      num: i + 1,
      side: 'home',
      gk: s.player.posType === 'GK',
      x: b.x, y: b.y,
      possX: p.x, possY: p.y,
      slot: s.slot,
      role: base[i].role,
    }
  })
}

// Generic opponent shape (right half, defending the right goal), numbered 1..11.
// Exported so the Match Center and the engine share one away layout.
export function layoutAwayDots() {
  const shape = [
    { line: 'GK', n: 1, x: 93 },
    { line: 'DEF', n: 4, x: 79 },
    { line: 'MID', n: 3, x: 64 },
    { line: 'ATT', n: 3, x: 53 },
  ]
  const dots = []
  let num = 0
  shape.forEach((row) => {
    for (let i = 0; i < row.n; i++) {
      const y = row.n === 1 ? 32 : 9 + i * (46 / (row.n - 1))
      dots.push({ num: ++num, side: 'away', gk: row.line === 'GK', line: row.line, x: row.x, y })
    }
  })
  return dots
}

// Attack-relative anchor points (home attacking →). `side` picks the wing.
// Away sequences mirror through mirrorPt().
function zone(name, side = 'R') {
  const wy = side === 'R' ? 52 : 12
  const near = side === 'R' ? 26 : 38 // near post relative to delivery side
  const Z = {
    deepBuild: { x: 24, y: 32 },
    midHub: { x: 42, y: 32 },
    centerMid: { x: 55, y: 32 },
    centerAtt: { x: 70, y: 32 },
    halfSpace: { x: 74, y: side === 'R' ? 44 : 20 },
    wideMid: { x: 60, y: wy },
    wideFinal: { x: 78, y: wy },
    byline: { x: 93, y: side === 'R' ? 54 : 10 },
    corner: { x: 97, y: side === 'R' ? 61 : 3 },
    cutbackSpot: { x: 82, y: 32 },
    boxCenter: { x: 86, y: 32 },
    boxNear: { x: 87, y: near },
    penaltySpot: { x: 88, y: 32 },
    goalMouth: { x: 96, y: 32 },
    missWide: { x: 99, y: side === 'R' ? 46 : 18 },
  }
  return { ...(Z[name] || Z.centerAtt) }
}
function mirrorPt(p) { return { x: 100 - p.x, y: 64 - p.y } }

// ---------------------------------------------------------------------------
// Squad pools + role weights
// ---------------------------------------------------------------------------
const WIDE_SLOTS = new Set(['RW', 'LW', 'RM', 'LM'])
const FB_SLOTS = new Set(['RB', 'LB', 'RWB', 'LWB'])
const FINISHER_ROLES = new Set(['Complete Striker', 'Box Finisher', 'Link-Up Striker', 'Big Game Scorer'])
const WIDE_ROLES = new Set(['Inside Forward', 'Touchline Winger', 'Direct Runner'])
const CREATOR_ROLES = new Set(['Creative Magician', 'Final Passer'])
const HOLDER_ROLES = new Set(['Defensive Shield', 'Ball Winner'])

function buildPools(squad) {
  const entries = squad.map((s, i) => ({ slot: s.slot, p: s.player, idx: i }))
  const by = (fn) => entries.filter(fn)
  return {
    entries,
    gk: by((e) => e.p.posType === 'GK'),
    cbs: by((e) => e.slot === 'CB'),
    fbs: by((e) => FB_SLOTS.has(e.slot)),
    holders: by((e) => e.slot === 'CDM' || HOLDER_ROLES.has(e.p.role)),
    mids: by((e) => ['CM', 'CDM'].includes(e.slot)),
    creators: by((e) => e.slot === 'CAM' || CREATOR_ROLES.has(e.p.role)),
    wingers: by((e) => WIDE_SLOTS.has(e.slot) || (WIDE_ROLES.has(e.p.role) && e.p.posType !== 'DEF')),
    sts: by((e) => e.slot === 'ST' || FINISHER_ROLES.has(e.p.role)),
    attackers: by((e) => e.p.posType === 'ATT'),
    outfield: by((e) => e.p.posType !== 'GK'),
  }
}

const count = (pool) => pool.length
const roleCount = (squad, role) => squad.filter((s) => s.player.role === role || s.player.secondaryRole === role).length

// Pattern availability weights from the squad's role profile. Every pattern
// keeps a base weight so any XI can occasionally produce it, but role-heavy
// squads lean into their identity. Narrative-only — never touches results.
export function squadPatternWeights(squad) {
  const P = buildPools(squad)
  const tempo = roleCount(squad, 'Tempo Controller')
  const finalPasser = roleCount(squad, 'Final Passer')
  const magician = roleCount(squad, 'Creative Magician')
  const ballWinner = roleCount(squad, 'Ball Winner')
  const shield = roleCount(squad, 'Defensive Shield')
  const attFB = squad.filter((s) => FB_SLOTS.has(s.slot) && /Attacking/.test(s.player.role)).length
  const touchline = roleCount(squad, 'Touchline Winger')
  const insideFwd = roleCount(squad, 'Inside Forward')
  const directRunner = roleCount(squad, 'Direct Runner')
  const linkUp = roleCount(squad, 'Link-Up Striker')
  const boxFinisher = roleCount(squad, 'Box Finisher')
  const completeSt = roleCount(squad, 'Complete Striker')
  const b2b = roleCount(squad, 'Box-to-Box Engine')
  return {
    central_buildup: 6 + tempo * 3 + magician * 2 + finalPasser,
    wide_overlap: 2 + attFB * 4 + count(P.wingers) * 1.5,
    switch_of_play: 2 + tempo * 4 + (count(P.wingers) >= 2 ? 2 : 0),
    through_ball: 2 + finalPasser * 4 + magician * 3 + directRunner * 2,
    one_two: 1 + insideFwd * 3 + linkUp * 4 + magician * 2,
    counterattack: 2 + ballWinner * 4 + shield * 2 + directRunner * 2,
    cross: 2 + touchline * 4 + attFB * 2 + boxFinisher * 3,
    cutback: 1 + attFB * 3 + touchline * 2 + insideFwd,
    pressing_recovery: 1 + ballWinner * 2 + b2b * 2 + count(P.attackers) * 0.5,
    direct_attack: 1 + directRunner * 3 + completeSt * 2 + linkUp,
  }
}

export const SEQ_PATTERNS = Object.keys(squadPatternWeights([]))

// Assister-role affinity: for goal sequences the penultimate touch is the real
// assister, so patterns that fit that player's role get boosted.
function assistAffinity(role) {
  switch (role) {
    case 'Touchline Winger': return ['cross', 'cutback', 'wide_overlap']
    case 'Attacking Fullback': case 'Attacking Wingback': case 'Balanced Fullback': case 'Balanced Wingback':
      return ['wide_overlap', 'cutback', 'cross']
    case 'Final Passer': return ['through_ball', 'central_buildup']
    case 'Tempo Controller': return ['switch_of_play', 'central_buildup', 'through_ball']
    case 'Creative Magician': return ['one_two', 'through_ball', 'central_buildup']
    case 'Link-Up Striker': return ['one_two', 'direct_attack']
    case 'Inside Forward': case 'Direct Runner': return ['one_two', 'counterattack']
    case 'Ball Winner': case 'Defensive Shield': return ['counterattack', 'pressing_recovery']
    default: return []
  }
}

function wpick(rng, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return items[0]
  let r = rng() * total
  for (let i = 0; i < items.length; i++) { if ((r -= weights[i]) < 0) return items[i] }
  return items[items.length - 1]
}

function pickEntry(rng, pool, fallback, used) {
  const fresh = pool.filter((e) => !used.has(e.p.id))
  const src = fresh.length ? fresh : (pool.length ? pool : fallback)
  return src[Math.floor(rng() * src.length)]
}

// Shooter weighting for non-goal sequences (narrative only).
function shooterWeight(e, minute) {
  const r = e.p.role
  let w = FINISHER_ROLES.has(r) ? 10 : WIDE_ROLES.has(r) ? 7 : CREATOR_ROLES.has(r) ? 5
    : r === 'Box-to-Box Engine' ? 3 : e.p.posType === 'MID' ? 2 : FB_SLOTS.has(e.slot) ? 1 : 0.4
  if ((r === 'Big Game Scorer' || e.p.secondaryRole === 'Big Game Scorer') && minute >= 80) w += 4
  return w
}

const sideOfSlot = (slot) => (slot && slot.startsWith('L') ? 'L' : 'R')

// ---------------------------------------------------------------------------
// Sequence construction (home team — real players)
// ---------------------------------------------------------------------------
// A touch = one readable beat: the actor acts at `at`, then the ball moves on.
function T(entry, action, text, at, kind = 'pass') {
  return {
    playerId: entry.p.id,
    playerName: entry.name,
    role: entry.p.role,
    slot: entry.slot,
    action,
    text,
    at,
    kind,
  }
}

function buildHomeSequence({ event, rng, squad, pools, nameOf, minute, scorerEntry, assistEntry }) {
  const P = pools
  const used = new Set()
  const take = (pool, fallback = P.outfield) => {
    const e = pickEntry(rng, pool, fallback, used)
    used.add(e.p.id)
    return { ...e, name: nameOf(e.p.name) }
  }
  const isGoal = event.type === 'goal'

  // Finisher: real scorer for goals; role-weighted shooter otherwise.
  let finisher
  if (isGoal && scorerEntry) {
    finisher = { ...scorerEntry, name: nameOf(scorerEntry.p.name) }
  } else {
    const pool = P.outfield
    finisher = { ...wpick(rng, pool, pool.map((e) => shooterWeight(e, minute))), name: '' }
    finisher.name = nameOf(finisher.p.name)
  }
  used.add(finisher.p.id)
  // Penultimate actor: real assister for assisted goals.
  const penult = isGoal && assistEntry ? { ...assistEntry, name: nameOf(assistEntry.p.name) } : null
  if (penult) used.add(penult.p.id)

  // GK-miracle goal (keeper scores late): dedicated set-piece sequence.
  if (isGoal && finisher.p.posType === 'GK') {
    const taker = penult || take(P.creators, P.mids)
    const side = sideOfSlot(taker.slot)
    return finalize('gk_miracle', [
      T(taker, 'carry', `${taker.name} takes it to the corner — everyone forward!`, zone('corner', side), 'carry'),
      T(taker, 'cross', `${taker.name} swings in the set-piece`, zone('corner', side), 'cross'),
      T(finisher, 'header', `THE KEEPER IS UP — ${finisher.name} attacks the ball!`, zone('boxCenter'), 'shot'),
    ])
  }
  // Defender set-piece goal (the sim labels these as headers).
  if (isGoal && event.label && finisher.p.posType === 'DEF') {
    const taker = penult || take(P.creators, P.mids)
    const side = sideOfSlot(taker.slot)
    return finalize('set_piece', [
      T(taker, 'cross', `${taker.name} swings in the delivery`, zone('corner', side), 'cross'),
      T(finisher, 'header', `${finisher.name} rises highest`, zone('boxNear', side), 'shot'),
    ])
  }

  // Pattern choice: squad-profile weights × assister affinity for goals.
  const weights = squadPatternWeights(squad)
  const names = Object.keys(weights)
  const affinity = penult ? assistAffinity(penult.p.role) : []
  const ws = names.map((n) => weights[n] * (affinity.includes(n) ? 4 : 1))
  const pattern = wpick(rng, names, ws)

  const touches = []
  const push = (...ts) => touches.push(...ts)

  switch (pattern) {
    case 'wide_overlap': {
      const w = take(P.wingers, P.attackers)
      const side = sideOfSlot(penult && FB_SLOTS.has(penult.slot) ? penult.slot : w.slot)
      const fb = penult && FB_SLOTS.has(penult.slot) ? penult : (penult || take(P.fbs, P.mids))
      const starter = take(P.mids, P.creators)
      push(
        T(starter, 'pass', `${starter.name} spreads it wide`, zone('centerMid')),
        T(w, 'carry', `${w.name} drives at the fullback`, zone('wideFinal', side), 'carry'),
        T(fb, 'cross', `${fb.name} slips the overlap and reaches the byline`, zone('byline', side), 'cross'),
      )
      break
    }
    case 'switch_of_play': {
      const a = take(P.cbs, P.holders)
      const b = penult || take(P.holders.concat(P.mids), P.mids)
      const w = take(P.wingers, P.attackers)
      const side = sideOfSlot(w.slot)
      push(
        T(a, 'pass', `${a.name} steps out and circulates`, zone('deepBuild')),
        T(b, 'switch', `${b.name} switches the play — a raking diagonal`, zone('centerMid')),
        T(w, 'carry', `${w.name} brings it down on the far side`, zone('wideFinal', side), 'carry'),
      )
      break
    }
    case 'through_ball': {
      const a = take(P.holders, P.mids)
      const p = penult || take(P.creators, P.mids)
      push(
        T(a, 'pass', `${a.name} wins it and feeds the playmaker`, zone('midHub')),
        T(p, 'through', `${p.name} slides a through ball in behind`, zone('centerAtt'), 'through'),
      )
      break
    }
    case 'one_two': {
      const a = penult || take(P.creators.concat(P.wingers), P.attackers)
      const wall = take(P.sts, P.attackers)
      push(
        T(a, 'pass', `${a.name} gives it and keeps running`, zone('centerAtt')),
        T(wall, 'layoff', `${wall.name} cushions the return — one-two!`, zone('cutbackSpot'), 'layoff'),
      )
      break
    }
    case 'counterattack': {
      const bw = take(P.holders, P.mids)
      const c = penult || take(P.wingers.concat(P.mids), P.attackers)
      const side = sideOfSlot(c.slot)
      push(
        T(bw, 'recovery', `${bw.name} wins it back — the counter is on!`, zone('deepBuild'), 'recovery'),
        T(c, 'carry', `${c.name} surges forward at pace`, zone('halfSpace', side), 'carry'),
      )
      break
    }
    case 'cross': {
      const w = penult || take(P.wingers.concat(P.fbs), P.attackers)
      const side = sideOfSlot(w.slot)
      push(
        T(w, 'carry', `${w.name} takes it to the byline`, zone('byline', side), 'carry'),
        T(w, 'cross', `${w.name} whips in the cross`, zone('byline', side), 'cross'),
      )
      break
    }
    case 'cutback': {
      const r = penult || take(P.fbs.concat(P.wingers), P.attackers)
      const side = sideOfSlot(r.slot)
      push(
        T(r, 'carry', `${r.name} bursts to the byline`, zone('byline', side), 'carry'),
        T(r, 'cutback', `${r.name} cuts it back`, zone('byline', side), 'cutback'),
      )
      break
    }
    case 'pressing_recovery': {
      const presser = take(P.attackers.concat(P.creators), P.mids)
      const link = penult || presser
      push(T(presser, 'recovery', `${presser.name} presses and robs the defender high up!`, zone('centerAtt'), 'recovery'))
      if (link.p.id !== presser.p.id) push(T(link, 'pass', `${link.name} plays it first time`, zone('cutbackSpot')))
      break
    }
    case 'direct_attack': {
      const launcher = take(P.cbs.concat(P.gk), P.holders)
      const target = penult || take(P.sts, P.attackers)
      push(
        T(launcher, 'longball', `${launcher.name} goes long`, zone('deepBuild'), 'longball'),
        T(target, 'layoff', `${target.name} brings it down for the runner`, zone('centerAtt'), 'layoff'),
      )
      break
    }
    default: { // central_buildup
      const a = take(P.cbs, P.holders)
      const b = take(P.holders.concat(P.mids), P.mids)
      const c = penult || take(P.creators, P.mids)
      push(
        T(a, 'pass', `${a.name} steps out from the back`, zone('deepBuild')),
        T(b, 'carry', `${b.name} collects and turns away from pressure`, zone('centerMid'), 'carry'),
        T(c, 'through', `${c.name} threads it between the lines`, zone('centerAtt'), 'through'),
      )
    }
  }

  // If the forced penultimate assister wasn't placed by the pattern, insert a
  // final key pass so the assist is always the last action before the finish.
  if (penult && !touches.some((t) => t.playerId === penult.p.id)) {
    push(T(penult, 'keypass', `${penult.name} picks out the killer pass`, zone('centerAtt'), 'through'))
  }

  // Finishing touch: the real scorer / weighted shooter acts in the box.
  const shotAt = pattern === 'cross' ? zone('boxNear', sideOfSlot(touches[touches.length - 1].slot))
    : pattern === 'cutback' ? zone('cutbackSpot')
    : zone('boxCenter')
  const verb = event.type === 'chance' ? `${finisher.name} arrives… but can't quite connect`
    : `${finisher.name} shoots!`
  push(T(finisher, event.type === 'chance' ? 'run' : 'shot', verb, shotAt, event.type === 'chance' ? 'run' : 'shot'))

  return finalize(pattern, touches)

  function finalize(patternName, ts) {
    return { pattern: patternName, touches: ts, finisher, penult }
  }
}

// ---------------------------------------------------------------------------
// Generic opponent sequences (no real names — matches the sim's away style)
// ---------------------------------------------------------------------------
const AWAY_PATTERNS = ['central_buildup', 'wide_overlap', 'counterattack', 'cross', 'direct_attack']
const AWAY_LABELS = {
  DEF: 'their defender', MID: 'their midfielder', ATT: 'their forward',
  playmaker: 'their playmaker', winger: 'their winger', striker: 'their striker',
}

function buildAwaySequence({ event, rng, awayDots, opponent }) {
  const pattern = AWAY_PATTERNS[Math.floor(rng() * AWAY_PATTERNS.length)]
  const dotOf = (line) => {
    const pool = awayDots.filter((d) => d.line === line)
    return pool[Math.floor(rng() * pool.length)]
  }
  const side = rng() < 0.5 ? 'R' : 'L'
  const at = (name) => mirrorPt(zone(name, side))
  const def = dotOf('DEF')
  const mid = dotOf('MID')
  const att = dotOf('ATT')
  const AT = (dot, label, action, text, p, kind = 'pass') => ({
    playerId: null, awayNum: dot.num, playerName: label, role: label, slot: null,
    action, text, at: p, kind,
  })
  const touches = pattern === 'counterattack'
    ? [
      AT(mid, AWAY_LABELS.MID, 'recovery', `${opponent} win it back and break`, at('deepBuild'), 'recovery'),
      AT(att, AWAY_LABELS.winger, 'carry', `${AWAY_LABELS.winger} carries at speed`, at('halfSpace'), 'carry'),
    ]
    : pattern === 'cross' || pattern === 'wide_overlap'
      ? [
        AT(mid, AWAY_LABELS.playmaker, 'pass', `${opponent} work it wide`, at('centerMid')),
        AT(att, AWAY_LABELS.winger, 'cross', `${AWAY_LABELS.winger} gets to the byline and crosses`, at('byline'), 'cross'),
      ]
      : pattern === 'direct_attack'
        ? [
          AT(def, AWAY_LABELS.DEF, 'longball', `${opponent} go direct`, at('deepBuild'), 'longball'),
          AT(att, AWAY_LABELS.striker, 'layoff', `${AWAY_LABELS.striker} brings it down`, at('centerAtt'), 'layoff'),
        ]
        : [
          AT(def, AWAY_LABELS.DEF, 'pass', `${opponent} build from the back`, at('deepBuild')),
          AT(mid, AWAY_LABELS.playmaker, 'through', `${AWAY_LABELS.playmaker} finds a gap between the lines`, at('centerAtt'), 'through'),
        ]
  const shooter = dotOf('ATT')
  const shooterLabel = event.type === 'goal' && event.scorer ? event.scorer : AWAY_LABELS.striker
  touches.push({
    playerId: null, awayNum: shooter.num, playerName: shooterLabel, role: shooterLabel, slot: null,
    action: event.type === 'chance' ? 'run' : 'shot',
    text: event.type === 'chance' ? `${shooterLabel} can't quite reach it` : `${shooterLabel} shoots!`,
    at: mirrorPt(event.type === 'chance' ? zone('centerAtt', side) : zone('boxCenter', side)),
    kind: event.type === 'chance' ? 'run' : 'shot',
  })
  return { pattern, touches, finisher: null, penult: null }
}

// ---------------------------------------------------------------------------
// Outcome + assembly
// ---------------------------------------------------------------------------
function outcomeFor(event, seq, { gkName, oppName, teamName }) {
  const home = event.team === 'home'
  const shooter = seq.touches[seq.touches.length - 1]
  const side = sideOfSlot(shooter.slot)
  const keeper = home ? `${oppName} keeper` : gkName
  switch (event.type) {
    case 'goal':
      return {
        type: 'goal', playerId: shooter.playerId, playerName: shooter.playerName,
        at: home ? zone('goalMouth') : mirrorPt(zone('goalMouth')),
        description: event.description, // sim wording (scorer/assist/label) is canonical
      }
    case 'save':
      return {
        type: 'save', playerId: shooter.playerId, playerName: shooter.playerName, goalkeeper: keeper,
        at: home ? zone('goalMouth') : mirrorPt(zone('goalMouth')),
        description: `${shooter.playerName} is denied — ${keeper} stands tall`,
      }
    case 'shot':
      return event.onTarget
        ? {
          type: 'shot_on', playerId: shooter.playerId, playerName: shooter.playerName, goalkeeper: keeper,
          at: home ? zone('goalMouth') : mirrorPt(zone('goalMouth')),
          description: `${shooter.playerName} forces a save`,
        }
        : {
          type: 'shot_off', playerId: shooter.playerId, playerName: shooter.playerName,
          at: home ? zone('missWide', side) : mirrorPt(zone('missWide', side)),
          description: `${shooter.playerName} fires just wide`,
        }
    default: // chance
      return {
        type: 'chance', playerId: shooter.playerId, playerName: shooter.playerName,
        at: shooter.at,
        description: home
          ? `${teamName} carve them open — ${shooter.playerName} just can't finish the move`
          : `${oppName} threaten — the final ball evades ${shooter.playerName}`,
      }
  }
}

// Attach a deterministic participant sequence to every shot-like highlight
// event, plus canonical big-chance flags (never exceeding detail bigChances).
// Mutates the event objects the timeline already built; descriptions of
// non-goal events are rewritten to match the sequence story (goal wording is
// kept verbatim from the simulation).
export function attachSequences(events, { detail, squad, nameOf, teamName, opponent }) {
  const pools = buildPools(squad)
  const awayDots = layoutAwayDots()
  const gkEntry = squad.find((s) => s.player.posType === 'GK')
  const gkName = gkEntry ? nameOf(gkEntry.player.name) : 'the keeper'
  const byName = Object.fromEntries(pools.entries.map((e) => [e.p.name, e]))
  const byShort = Object.fromEntries(pools.entries.map((e) => [nameOf(e.p.name), e]))

  // --- canonical big-chance flags (goals first, then saves, on-target shots,
  //     then chances, in minute order) --------------------------------------
  for (const team of ['home', 'away']) {
    const fs = team === 'home' ? detail.finalStats.home : detail.finalStats.away
    let budget = fs.bigChances
    const teamEvents = events.filter((e) => e.team === team)
    for (const e of teamEvents) if (e.type === 'goal' && budget > 0) { e.big = true; budget-- }
    for (const type of ['save', 'shotOn', 'chance']) {
      for (const e of teamEvents) {
        if (budget <= 0) break
        if (e.big) continue
        const match = type === 'save' ? e.type === 'save'
          : type === 'shotOn' ? (e.type === 'shot' && e.onTarget)
          : e.type === 'chance'
        if (match) { e.big = true; budget-- }
      }
    }
  }

  // --- sequences -------------------------------------------------------------
  for (const e of events) {
    if (!['goal', 'save', 'shot', 'chance'].includes(e.type)) continue
    const rng = makeRng(combineSeed(detail.presentationSeed, 5000 + e.id))
    let seq
    if (e.team === 'home') {
      // Goal events carry display names; map back to squad entries.
      const scorerEntry = e.type === 'goal' ? (byShort[e.scorer] || byName[e.scorer] || null) : null
      const assistEntry = e.type === 'goal' && e.assister ? (byShort[e.assister] || byName[e.assister] || null) : null
      seq = buildHomeSequence({ event: e, rng, squad, pools, nameOf, minute: e.minute, scorerEntry, assistEntry })
    } else {
      seq = buildAwaySequence({ event: e, rng, awayDots, opponent })
    }
    const outcome = outcomeFor(e, seq, { gkName, oppName: opponent, teamName })
    const participants = []
    const seen = new Set()
    for (const t of seq.touches) {
      const key = t.playerId ?? `away-${t.awayNum}`
      if (seen.has(key)) continue
      seen.add(key)
      participants.push({ playerId: t.playerId, awayNum: t.awayNum ?? null, name: t.playerName, role: t.role, slot: t.slot })
    }
    e.seq = {
      id: e.id,
      minute: e.minute,
      team: e.team,
      phase: e.team === 'home' ? 'attack' : 'defend',
      pattern: seq.pattern,
      big: !!e.big,
      participants,
      touches: seq.touches,
      outcome,
      statImpact: {
        shots: e.countsShot ? 1 : 0,
        shotsOnTarget: e.countsShot && e.onTarget ? 1 : 0,
        saves: e.countsShot && e.onTarget && e.type !== 'goal' ? 1 : 0, // credited to the defending team
        bigChances: e.big ? 1 : 0,
        goals: e.type === 'goal' ? 1 : 0,
      },
    }
    // The ticker, spotlight, ball and highlights must tell one story.
    if (e.type !== 'goal') e.description = outcome.description
  }
  return events
}
