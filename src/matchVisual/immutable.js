// Presentation-owned snapshots only. Never freeze an object owned by the run.
export function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableCopy(item)])))
  }
  return value
}
