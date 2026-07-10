// ---------------------------------------------------------------------------
// Match-engine version registry.
//
// The run-level version is authoritative for every match in that run.  M1 is
// registered so persistence and dispatch have a stable future insertion point,
// but it is deliberately not runnable until the causal resolver exists and has
// passed its own activation audit.
// ---------------------------------------------------------------------------

export const LEGACY_ENGINE_VERSION = 'legacy_v1'
export const M1_ENGINE_VERSION = 'm1'

// Historical Phase 6.1 snapshots used this value as a persistence marker.
// It always means the current frozen legacy resolver; it is never written by
// new snapshots after M0.1.
export const LEGACY_PHASE61_ENGINE_ALIAS = 'phase6.1'

export const ENGINE_VERSIONS = Object.freeze({
  [LEGACY_ENGINE_VERSION]: Object.freeze({
    id: LEGACY_ENGINE_VERSION,
    implemented: true,
    runnable: true,
  }),
  [M1_ENGINE_VERSION]: Object.freeze({
    id: M1_ENGINE_VERSION,
    implemented: false,
    runnable: false,
  }),
})

// M0/M0.1 must not activate M1.  A future activation change must be explicit,
// audited, and (for Daily) made at a declared date/ruleset boundary.
export const ACTIVE_ENGINE_VERSION = LEGACY_ENGINE_VERSION

export function isKnownEngineVersion(engineVersion) {
  return typeof engineVersion === 'string' && Object.hasOwn(ENGINE_VERSIONS, engineVersion)
}

export function isRunnableEngineVersion(engineVersion) {
  return isKnownEngineVersion(engineVersion) && ENGINE_VERSIONS[engineVersion].runnable === true
}

export function assertRunnableEngineVersion(engineVersion) {
  if (!isKnownEngineVersion(engineVersion)) {
    throw new RangeError(`Unknown match engine version: ${String(engineVersion)}`)
  }
  if (!isRunnableEngineVersion(engineVersion)) {
    throw new Error(`Match engine version is not implemented: ${engineVersion}`)
  }
  return engineVersion
}

// Small resolver boundary used by createRunSimulation().  The callback keeps
// the legacy implementation in data.js with its RNG call order untouched.
// No fake/fallback M1 behavior is permitted.
export function resolveMatchByEngineVersion({ engineVersion, legacyResolver }) {
  if (engineVersion === LEGACY_ENGINE_VERSION) {
    if (typeof legacyResolver !== 'function') throw new TypeError('legacyResolver must be a function')
    return legacyResolver()
  }
  if (engineVersion === M1_ENGINE_VERSION) {
    throw new Error('Match engine m1 is registered but not implemented')
  }
  throw new RangeError(`Unknown match engine version: ${String(engineVersion)}`)
}
