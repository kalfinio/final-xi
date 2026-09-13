import { immutableCopy } from './immutable.js'

export const FORMATION_PHASES = Object.freeze(['defensive', 'buildup', 'settled', 'attacking', 'transition'])
export const visualPosition = (slot) => ({ CDM: 'DM', CAM: 'AM' }[slot] || slot)
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
export const toWorld = ({ u, v }, side) => side === 'us' ? { x: u, y: v } : { x: 100 - u, y: 100 - v }
export const toRelative = ({ x, y }, side) => side === 'us' ? { u: x, v: y } : { u: 100 - x, v: 100 - y }

// Ordered canonical slot occurrences: [slot, lateral lane, longitudinal values
// for defensive / buildup / settled / attacking / transition]. These are
// presentation data; they neither import nor change canonical FORMATIONS.
const GK = ['GK', 50, [4, 9, 11, 13, 8]]
const RB = ['RB', 88, [22, 30, 46, 65, 38]]
const LB = ['LB', 12, [22, 30, 46, 65, 38]]
const CB = (v) => ['CB', v, [22, 24, 35, 44, 30]]
const CM = (v) => ['CM', v, [40, 45, 57, 70, 51]]
const DM = (v) => ['CDM', v, [34, 38, 48, 55, 42]]
const ST = (v) => ['ST', v, [61, 70, 79, 89, 76]]
const ROWS = {
  '4-3-3': [GK, RB, CB(65), CB(35), LB, CM(73), CM(50), CM(27), ['RW', 90, [56, 62, 74, 85, 70]], ST(50), ['LW', 10, [56, 62, 74, 85, 70]]],
  '4-4-2': [GK, RB, CB(65), CB(35), LB, ['RM', 86, [40, 45, 58, 74, 53]], CM(63), CM(37), ['LM', 14, [40, 45, 58, 74, 53]], ST(63), ST(37)],
  '4-2-3-1': [GK, RB, CB(65), CB(35), LB, DM(64), DM(36), ['RW', 90, [49, 59, 73, 85, 68]], ['CAM', 50, [48, 56, 67, 80, 63]], ['LW', 10, [49, 59, 73, 85, 68]], ST(50)],
  '3-5-2': [GK, CB(74), CB(50), CB(26), ['LWB', 9, [28, 43, 61, 80, 52]], CM(30), DM(50), CM(70), ['RWB', 91, [28, 43, 61, 80, 52]], ST(37), ST(63)],
  '5-3-2': [GK, ['RB', 90, [19, 28, 42, 58, 34]], CB(73), CB(50), CB(27), ['LB', 10, [19, 28, 42, 58, 34]], CM(31), CM(69), DM(50), ST(37), ST(63)],
}

export const VISUAL_FORMATIONS = immutableCopy(Object.fromEntries(Object.entries(ROWS).map(([id, rows]) => {
  const occurrences = {}
  return [id, {
    id,
    slots: rows.map(([slot, lateral, longitudinal]) => {
      const occurrence = occurrences[slot] || 0
      occurrences[slot] = occurrence + 1
      return { slot, occurrence, key: `${slot}:${occurrence}`, position: visualPosition(slot), anchors: Object.fromEntries(FORMATION_PHASES.map((phase, index) => [phase, {
        u: longitudinal[index],
        v: slot === 'GK' ? 50 : 50 + (lateral - 50) * (phase === 'defensive' ? 0.82 : phase === 'attacking' ? 1.04 : 1),
      }])) }
    }),
  }]
})))

export function formationEntries(formation, actors) {
  const model = VISUAL_FORMATIONS[formation]
  if (!model || actors.length !== model.slots.length || actors.some((actor, i) => actor.slot !== model.slots[i].slot)) {
    throw new TypeError(`Formation ${formation} must match the ordered visual actor slots`)
  }
  return actors.map((actor, i) => ({ actorId: actor.id, side: actor.side, ...model.slots[i] }))
}

export function blendPhaseAnchor(entry, fromPhase, toPhase, amount) {
  if (!FORMATION_PHASES.includes(fromPhase) || !FORMATION_PHASES.includes(toPhase)) throw new RangeError('Unknown formation phase')
  const a = entry.anchors[fromPhase], b = entry.anchors[toPhase], t = clamp(amount, 0, 1)
  return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t }
}

export function formationContext(view) {
  return [
    ...formationEntries(view.formation, view.actors.filter((actor) => actor.side === 'us')),
    // Anonymous stand-ins retain their existing slots; no archetype profile.
    ...formationEntries('4-3-3', view.actors.filter((actor) => actor.side === 'opp')),
  ]
}
