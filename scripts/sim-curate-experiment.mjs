import { loadViteModule } from './vite-ssr-loader.mjs'

const { simulateMembers, simulateCatalogue } = await loadViteModule('src/data/v2/draftSim.js')
const { catalogueMembers } = await loadViteModule('src/data/v2/catalogues.js')
const { v2PlayerById } = await loadViteModule('src/data/v2/index.js')

const seeds = Number(process.argv[2] || 300)
const master = catalogueMembers('modern_mix_v2_2026_07_07')
const V = (p) => v2PlayerById[p.id] || {}
const tier = (p) => V(p).tier
const posesOf = (p) => [V(p).primaryPosition, ...(V(p).secondaryPositions || [])]
const roleOf = (p) => V(p).primaryRole

const PREMIUM = ['goat', 'goat_candidate', 'elite', 'star']
const AStar = (p) => p.era === 'legend' || PREMIUM.includes(tier(p))
// Genuinely thin slots under rule A (from the A sweep): keepers, wing-backs, natural width.
const THIN = new Set(['GK', 'RWB', 'LWB', 'RM', 'LM'])
// Tactically important, scarce roles worth topping up with quality specialists.
const SPECIALIST_ROLES = new Set([
  'Defensive Shield', 'Ball Winner', 'Defensive Wingback', 'Balanced Wingback',
  'Defensive Fullback', 'Touchline Winger', 'Sweeper Keeper', 'Big Match Keeper',
])
const thinQuality = (p) => tier(p) === 'quality' && posesOf(p).some((s) => THIN.has(s))
const specialistQuality = (p) => tier(p) === 'quality' && SPECIALIST_ROLES.has(roleOf(p))

const rules = {
  A: (p) => AStar(p),
  B: (p) => AStar(p) || thinQuality(p),
  C: (p) => AStar(p) || specialistQuality(p),
  D: (p) => AStar(p) || thinQuality(p) || specialistQuality(p),
}

const line = (name, size, r) =>
  `${name.padEnd(11)}[${String(size).padStart(3)}] offer=${String(r.avgOfferPoints).padStart(5)} XI=${String(r.avgXIRating).padStart(6)} (min ${String(r.minXIRating).padStart(3)}/med ${String(r.medianXIRating).padStart(3)}/max ${String(r.maxXIRating).padStart(3)}) done=${r.formationCompletion}% prem=${String(r.premiumOfferPct).padStart(5)}% goat=${String(r.goatOfferPct).padStart(4)}% conc10=${String(r.concentrationTop10Pct).padStart(4)}% distinct=${r.distinctOffered}`

const tierMix = (r) => {
  const t = r.tierOfferPct
  return `elite=${t.elite || 0} star=${t.star || 0} quality=${t.quality || 0} gc=${t.goat_candidate || 0} goat=${t.goat || 0} legend?=${t.unknown || 0}`
}

// role accessibility: distinct members whose primaryRole == role, per role
function roleAccess(members) {
  const m = {}
  for (const p of members) { const r = roleOf(p); m[r] = (m[r] || 0) + 1 }
  return m
}

const leg = simulateCatalogue('legacy_v1', { seeds })
const full = simulateCatalogue('modern_mix_v2_2026_07_07', { seeds })
console.log(line('legacy', 134, leg))
console.log(line('fullmaster', master.length, full))
console.log('')
for (const [name, rule] of Object.entries(rules)) {
  const members = master.filter(rule)
  const r = simulateMembers(members, { seeds, label: name })
  console.log(line(name, members.length, r))
  console.log('   tiers:', tierMix(r))
  console.log('   depth:', JSON.stringify(r.slotDepth))
  // scarce role access
  const ra = roleAccess(members)
  const scarce = ['Defensive Wingback', 'Balanced Wingback', 'Defensive Fullback', 'Defensive Shield', 'Touchline Winger', 'Big Match Keeper', 'Sweeper Keeper']
  console.log('   scarceRoleNaturals:', scarce.map((s) => `${s}=${ra[s] || 0}`).join(', '))
}
