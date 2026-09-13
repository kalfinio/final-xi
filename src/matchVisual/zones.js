import { immutableCopy } from './immutable.js'
import { clamp, visualPosition } from './formations.js'

const zone = (base, attacking, defensive, lateral, range, supports) => ({ base, attacking, defensive, lateral, range, supports })
// Longitudinal preferred envelopes and lateral lanes. Exceptional canonical
// runners may leave these preferences; ordinary support cannot leave its lane.
export const POSITIONAL_ZONES = immutableCopy({
  GK: zone([3, 14], [4, 18], [2, 8], [25, 75], [5, 12], ['CB']),
  CB: zone([17, 42], [30, 50], [10, 30], [20, 80], [9, 10], ['CB', 'DM', 'LB', 'RB', 'GK']),
  LB: zone([22, 52], [42, 82], [12, 32], [5, 30], [14, 10], ['CB', 'CM', 'LM', 'LW']),
  RB: zone([22, 52], [42, 82], [12, 32], [70, 95], [14, 10], ['CB', 'CM', 'RM', 'RW']),
  LWB: zone([30, 65], [53, 90], [15, 38], [4, 27], [17, 10], ['CB', 'CM', 'ST']),
  RWB: zone([30, 65], [53, 90], [15, 38], [73, 96], [17, 10], ['CB', 'CM', 'ST']),
  DM: zone([30, 55], [40, 65], [23, 42], [25, 75], [10, 13], ['CB', 'CM', 'AM']),
  CM: zone([37, 65], [49, 81], [29, 50], [18, 82], [13, 15], ['DM', 'CM', 'AM', 'LM', 'RM', 'ST']),
  AM: zone([50, 74], [63, 89], [38, 60], [22, 78], [12, 15], ['CM', 'LW', 'RW', 'ST']),
  LM: zone([38, 65], [53, 86], [27, 49], [5, 29], [14, 12], ['LB', 'CM', 'ST']),
  RM: zone([38, 65], [53, 86], [27, 49], [71, 95], [14, 12], ['RB', 'CM', 'ST']),
  LW: zone([49, 78], [64, 94], [34, 62], [4, 32], [14, 13], ['LB', 'LWB', 'CM', 'AM', 'ST']),
  RW: zone([49, 78], [64, 94], [34, 62], [68, 96], [14, 13], ['RB', 'RWB', 'CM', 'AM', 'ST']),
  ST: zone([60, 84], [71, 96], [47, 70], [28, 72], [12, 15], ['AM', 'CM', 'LW', 'RW', 'ST']),
})

export function constrainToZone(point, entry, phase, anchor, exceptional = false) {
  const profile = POSITIONAL_ZONES[visualPosition(entry.slot)]
  if (!profile) throw new TypeError(`Unsupported visual position: ${entry.slot}`)
  if (exceptional && entry.position !== 'GK') return { u: clamp(point.u, 2, 97), v: clamp(point.v, 3, 97) }
  const envelope = phase === 'defensive' ? profile.defensive : phase === 'attacking' ? profile.attacking : profile.base
  // Keeper participation can use the buildup envelope, never an outfield run.
  if (entry.position === 'GK') return { u: clamp(point.u, 2, phase === 'defensive' ? 8 : 18), v: clamp(point.v, 25, 75) }
  return {
    u: clamp(point.u, Math.max(envelope[0], anchor.u - profile.range[0]), Math.min(envelope[1], anchor.u + profile.range[0])),
    v: clamp(point.v, Math.max(profile.lateral[0], anchor.v - profile.range[1]), Math.min(profile.lateral[1], anchor.v + profile.range[1])),
  }
}
