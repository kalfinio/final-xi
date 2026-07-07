// ---------------------------------------------------------------------------
// Seeded randomness — small pure utilities shared by data.js (simulation) and
// matchEngine.js (canonical MatchDetail). Extracted from data.js so the match
// engine can import them without a circular dependency. data.js re-exports
// them, so existing `from './data'` imports keep working.
// ---------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function combineSeed(base, ...nums) {
  let h = base >>> 0
  for (const n of nums) {
    h ^= n | 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Fresh, non-deterministic 32-bit seed for a new Random Run. Uses the Web
// Crypto API (browser + Node 19+); returns a uint32 — a safe integer that
// serializes cleanly into the run snapshot and drives makeRng() exactly like
// the previous value did, so deterministic reconstruction is unchanged. The
// tiny fallback (only if crypto is entirely absent) stays crypto- and
// Math.random-free.
export function randomSeed() {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : {}
    if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
      const arr = new Uint32Array(1)
      g.crypto.getRandomValues(arr)
      return arr[0] >>> 0
    }
  } catch { /* fall through to the time-based fallback */ }
  const now = Date.now()
  const hi = typeof performance !== 'undefined' && performance.now ? Math.floor(performance.now() * 1000) : 0
  return (now ^ hi ^ (now >>> 5)) >>> 0
}
