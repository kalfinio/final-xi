// ---------------------------------------------------------------------------
// Match-engine version registry.
//
// The run-level version is authoritative for every match in that run.  M1 is
// registered so persistence and dispatch have a stable insertion point. M1 is
// explicitly runnable for tests/development, but the active public version
// remains the frozen legacy resolver until a separate activation audit.
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
    implemented: true,
    runnable: true,
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

// Small resolver boundary used by createRunSimulation(). The callbacks keep
// both implementations isolated. No implicit fallback between engines is
// permitted: a run's immutable version selects exactly one resolver.
export function resolveMatchByEngineVersion({ engineVersion, legacyResolver, m1Resolver }) {
  if (engineVersion === LEGACY_ENGINE_VERSION) {
    if (typeof legacyResolver !== 'function') throw new TypeError('legacyResolver must be a function')
    return legacyResolver()
  }
  if (engineVersion === M1_ENGINE_VERSION) {
    if (typeof m1Resolver !== 'function') throw new TypeError('m1Resolver must be a function')
    return m1Resolver()
  }
  throw new RangeError(`Unknown match engine version: ${String(engineVersion)}`)
}
