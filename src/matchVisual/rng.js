import { hashString, makeRng } from '../seedUtils.js'
import { assertVisualEngineVersion } from './versions.js'

export const VISUAL_RNG_PURPOSES = Object.freeze(['template', 'flank', 'support-selection', 'path-variation', 'commentary'])
const seedOf = (parts) => hashString(JSON.stringify(parts))

export function visualSeedFor(stableMatchSeed, visualEngineVersion) {
  assertVisualEngineVersion(visualEngineVersion)
  if (!Number.isInteger(stableMatchSeed) || stableMatchSeed < 0 || stableMatchSeed > 0xffffffff) {
    throw new TypeError('A canonical uint32 match seed is required')
  }
  return seedOf(['finalxi.visual', stableMatchSeed, visualEngineVersion])
}

export function sceneSeedFor(visualSeed, sceneId, canonicalEventIdOrGapId) {
  return seedOf(['finalxi.visual.scene', visualSeed, sceneId, canonicalEventIdOrGapId])
}

export function actionSeedFor(sceneSeed, actionIndex, purpose) {
  if (!Number.isInteger(actionIndex) || actionIndex < 0) throw new TypeError('Invalid visual action index')
  if (!VISUAL_RNG_PURPOSES.includes(purpose)) throw new RangeError(`Unsupported visual RNG purpose: ${purpose}`)
  return seedOf(['finalxi.visual.action', sceneSeed, actionIndex, purpose])
}

// Always a fresh, private stream. No API accepts a caller-owned RNG instance.
export function visualActionRng(sceneSeed, actionIndex, purpose) {
  return makeRng(actionSeedFor(sceneSeed, actionIndex, purpose))
}
