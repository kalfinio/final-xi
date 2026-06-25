// Simplified FM-style tactical shape system.
//
// Pure, deterministic helpers that turn a finished XI into:
//   • base / in-possession / out-of-possession marker coordinates (a top-down
//     vertical pitch, 100×150 — own goal at the bottom, attack toward the top),
//   • in/out-of-possession shape labels (e.g. "3-2-5", "4-4-2"),
//   • a tactical identity summary (label, strength, weakness, flags),
//   • tactical commentary used to FLAVOUR the Match Center and post-match note.
//
// It NEVER decides results. Roles drive how dots move; the simulation in
// data.js still owns scores and win probability. Reuses existing role data and
// rating/weakness helpers rather than re-deriving them.

import {
  shortDisplayName, slotAwareRole, playerPoints,
  computeRating, keyWeakness, topBonus, bestRoleSynergy,
  isGoat, isBigGameScorer,
} from './data'

// Role groups (mirror the approved role names in data.js — validated set).
const FINISHER_ROLES = new Set(['Complete Striker', 'Box Finisher', 'Link-Up Striker', 'Big Game Scorer'])
const WIDE_ATT_ROLES = new Set(['Inside Forward', 'Touchline Winger', 'Direct Runner'])
const CREATOR_ROLES = new Set(['Creative Magician', 'Final Passer'])
const SHIELD_ROLES = new Set(['Defensive Shield', 'Ball Winner'])
const COMMANDING_CB_ROLES = new Set(['Defensive Leader', 'Ball-Playing Defender'])
const ATT_FULLBACK_ROLES = new Set(['Attacking Fullback', 'Attacking Wingback', 'Balanced Wingback'])

// Base slot coordinates on a vertical pitch (y: 0 attack-end … 150 own-goal).
const SLOT_BASE = {
  GK: { x: 50, y: 140 },
  CB: { x: 50, y: 112 }, RB: { x: 84, y: 110 }, LB: { x: 16, y: 110 },
  RWB: { x: 87, y: 98 }, LWB: { x: 13, y: 98 },
  CDM: { x: 50, y: 94 }, CM: { x: 50, y: 76 }, CAM: { x: 50, y: 58 },
  RM: { x: 82, y: 74 }, LM: { x: 18, y: 74 },
  RW: { x: 84, y: 44 }, LW: { x: 16, y: 44 }, ST: { x: 50, y: 28 },
}
// Horizontal spread (px) when several players share a central slot.
const SLOT_SPREAD = { CB: 24, CM: 22, CDM: 24, CAM: 26, ST: 26 }

// Per-role shape shift. fwd = push up the pitch (toward attack); wide = away from
// the centre line (+) or tuck inside (−). Separate in/out-of-possession values.
const ROLE_SHAPE = {
  // GK
  'Shot Stopper': { inFwd: 0, inWide: 0, outFwd: 0, outWide: 0 },
  'Sweeper Keeper': { inFwd: 6, inWide: 0, outFwd: 3, outWide: 0 },
  'Big Match Keeper': { inFwd: 0, inWide: 0, outFwd: 0, outWide: 0 },
  // Defence
  'Defensive Leader': { inFwd: 0, inWide: 0, outFwd: -1, outWide: 0 },
  'Ball-Playing Defender': { inFwd: 5, inWide: 0, outFwd: 0, outWide: 0 },
  'Attacking Fullback': { inFwd: 22, inWide: 7, outFwd: -1, outWide: -5 },
  'Balanced Fullback': { inFwd: 13, inWide: 4, outFwd: 0, outWide: -1 },
  'Defensive Fullback': { inFwd: 6, inWide: 2, outFwd: -1, outWide: -3 },
  'Attacking Wingback': { inFwd: 30, inWide: 9, outFwd: -6, outWide: -3 },
  'Balanced Wingback': { inFwd: 21, inWide: 6, outFwd: -3, outWide: -2 },
  'Defensive Wingback': { inFwd: 12, inWide: 4, outFwd: -9, outWide: -2 },
  // Midfield
  'Defensive Shield': { inFwd: -9, inWide: -3, outFwd: -2, outWide: -2 },
  'Ball Winner': { inFwd: 2, inWide: 0, outFwd: 7, outWide: 0 },
  'Tempo Controller': { inFwd: 3, inWide: -4, outFwd: 0, outWide: -2 },
  'Box-to-Box Engine': { inFwd: 15, inWide: 0, outFwd: -7, outWide: 0 },
  'Final Passer': { inFwd: 13, inWide: -3, outFwd: -3, outWide: -1 },
  // Wide / Attacking Mid
  'Creative Magician': { inFwd: 10, inWide: -9, outFwd: -9, outWide: -2 },
  'Inside Forward': { inFwd: 14, inWide: -13, outFwd: -11, outWide: 3 },
  'Touchline Winger': { inFwd: 12, inWide: 10, outFwd: -15, outWide: -2 },
  'Direct Runner': { inFwd: 19, inWide: -3, outFwd: -11, outWide: 0 },
  // Strikers
  'Complete Striker': { inFwd: 6, inWide: 0, outFwd: -5, outWide: 0 },
  'Box Finisher': { inFwd: 9, inWide: 0, outFwd: 0, outWide: 0 },
  'Link-Up Striker': { inFwd: -6, inWide: 0, outFwd: -7, outWide: 0 },
  'Big Game Scorer': { inFwd: 8, inWide: -4, outFwd: 2, outWide: 0 },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Base (formation) coordinates for each squad slot, spreading shared slots.
function basePositions(squad) {
  const bySlot = {}
  squad.forEach((s, i) => { (bySlot[s.slot] = bySlot[s.slot] || []).push(i) })
  const pos = new Array(squad.length)
  for (const [slot, idxs] of Object.entries(bySlot)) {
    const base = SLOT_BASE[slot] || { x: 50, y: 80 }
    const gap = SLOT_SPREAD[slot] || 0
    idxs.forEach((idx, k) => {
      const offset = idxs.length > 1 && gap ? (k - (idxs.length - 1) / 2) * gap : 0
      pos[idx] = { x: clamp(base.x + offset, 6, 94), y: base.y }
    })
  }
  return pos
}

// Build markers for one phase: 'combined' | 'inPossession' | 'outPossession'.
// `compact` (0..1) loosens out-of-possession shape for poorly balanced sides.
export function buildMarkers(squad, phase = 'combined', compact = 1) {
  const base = basePositions(squad)
  return squad.map((s, i) => {
    const p = s.player
    const role = p ? slotAwareRole(p, s.slot) : ''
    const shape = ROLE_SHAPE[role] || { inFwd: 0, inWide: 0, outFwd: 0, outWide: 0 }
    const { x: bx, y: by } = base[i]
    const side = bx > 55 ? 1 : bx < 45 ? -1 : 0
    let x = bx, y = by
    if (phase === 'inPossession') {
      y = by - shape.inFwd
      x = bx + side * shape.inWide
    } else if (phase === 'outPossession') {
      // Looser shape when defensively exposed → tuck/drop less.
      y = by - shape.outFwd * compact
      x = bx + side * shape.outWide * compact
    }
    return {
      id: p ? p.id : `slot-${i}`,
      x: clamp(x, 6, 94),
      y: clamp(y, 8, 144),
      slot: s.slot,
      role,
      posType: p ? p.posType : null,
      isGK: p ? p.posType === 'GK' : false,
      label: p ? shortDisplayName(p.name) : s.slot,
      rating: p ? playerPoints(p) : 0,
    }
  })
}

// Compact football shape label from a phase's markers (outfield only, back→front).
export function shapeLabel(markers) {
  const out = markers.filter((m) => !m.isGK)
  const bands = [
    out.filter((m) => m.y >= 98).length,     // defenders
    out.filter((m) => m.y >= 80 && m.y < 98).length, // defensive mid
    out.filter((m) => m.y >= 60 && m.y < 80).length, // midfield
    out.filter((m) => m.y >= 42 && m.y < 60).length, // attacking mid
    out.filter((m) => m.y < 42).length,      // attack
  ]
  return bands.filter((n) => n > 0).join('-')
}

// Squad role/shape counts used by identity + commentary.
function countProfile(squad) {
  const players = squad.map((s) => s.player).filter(Boolean)
  const slotsOf = (set) => squad.filter((s) => set.has(s.slot)).length
  const roleN = (set) => players.filter((p) => set.has(p.role)).length
  const has = (role) => players.some((p) => p.role === role || p.secondaryRole === role)

  const { weaknesses } = computeRating(squad)
  const exposed = weaknesses.some((w) => w.name === 'Weak Defense' || w.name === 'No Defensive Shield')

  return {
    players,
    creators: roleN(CREATOR_ROLES),
    tempo: players.filter((p) => p.role === 'Tempo Controller').length,
    wide: roleN(WIDE_ATT_ROLES),
    finishers: roleN(FINISHER_ROLES),
    shield: roleN(SHIELD_ROLES),
    defLeaders: roleN(COMMANDING_CB_ROLES),
    attFullbacks: roleN(ATT_FULLBACK_ROLES),
    box2box: players.filter((p) => p.role === 'Box-to-Box Engine').length,
    directRunners: players.filter((p) => p.role === 'Direct Runner').length,
    touchline: players.filter((p) => p.role === 'Touchline Winger').length,
    boxFinishers: players.filter((p) => p.role === 'Box Finisher').length,
    centralMids: slotsOf(new Set(['CM', 'CDM', 'CAM'])),
    defSlots: slotsOf(new Set(['CB', 'RB', 'LB', 'RWB', 'LWB'])),
    attackers: players.filter((p) => p.posType === 'ATT').length,
    goats: players.filter(isGoat).length,
    bigGame: players.some(isBigGameScorer),
    hasShield: has('Defensive Shield'),
    exposed,
  }
}

// Tactical identity label (style-based, distinct from the chemistry identity).
function identityLabel(c) {
  const cands = [
    ['GOAT-led chaos XI', c.goats >= 2 ? 100 : 0],
    ['Wing-heavy overload XI', (c.wide + c.attFullbacks) >= 4 ? c.wide * 2 + c.attFullbacks * 1.5 : 0],
    ['High-possession technical XI', (c.tempo >= 1 && (c.creators + c.tempo) >= 3) ? c.tempo * 2.5 + c.creators * 2 : 0],
    ['Midfield-control XI', c.centralMids >= 4 ? c.centralMids * 1.6 + c.tempo : 0],
    ['Compact defensive XI', (c.defSlots >= 5 || c.defLeaders + c.shield >= 4) ? c.defLeaders * 2 + c.shield * 1.6 + (c.defSlots >= 5 ? 4 : 0) : 0],
    ['Direct attacking XI', (c.directRunners + c.boxFinishers + c.touchline) >= 3 ? (c.directRunners + c.boxFinishers + c.touchline) * 1.6 : 0],
    ['Attack-heavy but exposed XI', (c.exposed && c.attackers >= 4) ? c.attackers * 1.6 + 4 : 0],
    ['Balanced tournament XI', 2.5],
  ]
  return cands.reduce((best, x) => (x[1] > best[1] ? x : best))[0]
}

const STRENGTH_BY_IDENTITY = {
  'GOAT-led chaos XI': 'Match-winning individual quality',
  'Wing-heavy overload XI': 'Width and overloads out wide',
  'High-possession technical XI': 'Midfield control and ball retention',
  'Midfield-control XI': 'Dominance through the middle',
  'Compact defensive XI': 'Defensive organisation and shape',
  'Direct attacking XI': 'Pace and directness in behind',
  'Attack-heavy but exposed XI': 'Firepower going forward',
  'Balanced tournament XI': 'A well-rounded, flexible balance',
}

// Live Match Center commentary lines that apply to this XI.
function liveNotes(c) {
  const notes = []
  if (c.wide + c.attFullbacks >= 3) notes.push('Your in-possession shape is creating width.')
  if (c.tempo >= 1 || c.creators >= 2) notes.push('The midfield is controlling possession.')
  if (c.attFullbacks >= 2 && c.exposed) notes.push('Your fullbacks are leaving space behind.')
  if (c.hasShield) notes.push('The defensive shield is protecting the box.')
  if (c.exposed) notes.push('The opponent is finding gaps between midfield and defense.')
  if (c.attackers >= 4) notes.push('Your attacking shape is overloading the final third.')
  if (c.creators >= 1 || c.tempo >= 1) notes.push('Your playmakers are picking the locks with key passes.')
  if (notes.length === 0) notes.push('Your shape is staying balanced across the pitch.')
  return notes
}

// One post-match tactical note (most relevant first).
function postNote(c) {
  if (c.attFullbacks >= 2 && c.exposed) return 'Your aggressive fullbacks created chances but left space behind.'
  if (c.wide + c.attFullbacks >= 3) return 'Your in-possession shape created overloads out wide.'
  if (c.hasShield && !c.exposed) return 'Your out-of-possession shape stayed compact and protected the box.'
  if (c.exposed) return 'Your midfield struggled to control transitions at times.'
  if (c.tempo >= 1 || c.creators >= 2) return 'Your control of the tempo helped dictate the match.'
  if (c.bigGame) return 'Your role balance helped create late pressure.'
  return 'Your role balance kept the side compact and competitive.'
}

// Full tactical summary for a finished XI. `formation` is the combined-view label.
export function buildTactics(squad, formation) {
  if (!squad || squad.length === 0) return null
  const c = countProfile(squad)
  const compact = c.exposed ? 0.4 : 1
  const inMarkers = buildMarkers(squad, 'inPossession', compact)
  const outMarkers = buildMarkers(squad, 'outPossession', compact)

  const identity = identityLabel(c)
  const synergy = bestRoleSynergy(squad) || topBonus(squad)
  const weak = keyWeakness(squad)

  return {
    identity,
    formation,
    inShape: shapeLabel(inMarkers) || formation,
    outShape: shapeLabel(outMarkers) || formation,
    strength: STRENGTH_BY_IDENTITY[identity] || (synergy ? synergy.name : 'Balanced all-round side'),
    weakness: weak ? weak.name : 'Few obvious weaknesses',
    weaknessDesc: weak ? weak.desc : 'A well-balanced XI with no glaring flaw.',
    liveNotes: liveNotes(c),
    postNote: postNote(c),
    // Compact flags consumed by the timeline for light, capped flavour only.
    flags: {
      inPossStrong: (c.wide + c.attFullbacks + c.creators + c.tempo) >= 4,
      outPossStrong: c.hasShield && !c.exposed && c.defLeaders >= 1,
      attackingFB: c.attFullbacks >= 2,
      defensiveShield: c.hasShield,
      tempoControl: c.tempo >= 1,
      creators: c.creators >= 1,
      bigGame: c.bigGame,
      exposed: c.exposed,
    },
  }
}
