import { FORMATIONS, computeRating, createRunSimulation, makeRng } from '../data'
import { catalogueEligiblePlayers } from '../data/v2/catalogues'
import { canonicalMatchSignature } from '../runPersistence'
import { createCanonicalMatchView } from '../matchVisual/adapter.js'
import { compileVisualProgram } from '../matchVisual/compile.js'

// DEV entry only. A detached seeded M1 run is resolved ONCE per example.
// No saved run, localStorage or production controller is used by this lab.
const examples = new Map()
export function getVisualDemo(seed = 7, formation = '4-3-3') {
  const key = `${seed}|${formation}`
  if (examples.has(key)) return examples.get(key)
  const catalogVersion = 'modern_mix_v2_curated_r2', used = []
  const squad = FORMATIONS[formation].slots.map((slot) => {
    const player = catalogueEligiblePlayers(catalogVersion, slot, used, 'modern')[0]
    used.push(player.id)
    return { slot, player }
  })
  const ctrl = createRunSimulation({ rating: computeRating(squad).total, difficulty: 'classic', squad, rng: makeRng(seed), runSeed: seed, engineVersion: 'm1' })
  ctrl.prepareNext()
  const match = ctrl.resolveNext('wide')
  const view = createCanonicalMatchView({ match, squad, formation, catalogVersion, dbVersion: 'v2', canonicalSignature: canonicalMatchSignature(match, 0) })
  const example = Object.freeze({ view, program: compileVisualProgram(view, { visualEngineVersion: 'visual_v2_2' }) })
  examples.set(key, example)
  return example
}
