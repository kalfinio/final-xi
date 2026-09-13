// Independent of matchEngineVersions and deliberately unused by the live app.
export const VISUAL_V2_1 = 'visual_v2_1'
export const VISUAL_ENGINE_VERSIONS = Object.freeze({
  [VISUAL_V2_1]: Object.freeze({ id: VISUAL_V2_1, implemented: true, matchEngineVersions: Object.freeze(['m1']) }),
})

export function isVisualEngineVersion(version) {
  return typeof version === 'string' && Object.hasOwn(VISUAL_ENGINE_VERSIONS, version)
}

export function assertVisualEngineVersion(version) {
  if (!isVisualEngineVersion(version)) throw new RangeError(`Unsupported visual engine version: ${String(version)}`)
  return version
}

// This selects a compiler, never the application's active viewer or run engine.
export function selectVisualEngineVersion(requestedVersion = VISUAL_V2_1) {
  return assertVisualEngineVersion(requestedVersion)
}
