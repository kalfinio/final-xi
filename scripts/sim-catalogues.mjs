import { loadViteModule } from './vite-ssr-loader.mjs'

const { simulateCatalogue } = await loadViteModule('src/data/v2/draftSim.js')
const { V2_PLAYERS } = await loadViteModule('src/data/v2/index.js')

const seeds = Number(process.argv[2] || 400)

// Modern-tier breakdown (for sizing the curated pool).
const modern = V2_PLAYERS.filter((p) => p.era === 'modern')
const byTier = {}
for (const p of modern) byTier[p.tier] = (byTier[p.tier] || 0) + 1
console.log('modern by tier:', JSON.stringify(byTier), 'legends:', V2_PLAYERS.length - modern.length)

const report = (r) => {
  console.log(`\n== ${r.catalogVersion} (${seeds} seeds × ${r.drafts / seeds} formations) ==`)
  console.log(`  avgOfferPoints : ${r.avgOfferPoints}`)
  console.log(`  avgXIRating    : ${r.avgXIRating}   (min ${r.minXIRating}, median ${r.medianXIRating}, max ${r.maxXIRating})`)
  console.log(`  raw/effective  : ${r.avgRawStrength} / ${r.avgEffectiveStrength}`)
  console.log(`  formationDone  : ${r.formationCompletion}%`)
  console.log(`  premiumOffer%  : ${r.premiumOfferPct}   goatOffer%: ${r.goatOfferPct}`)
  console.log(`  tierOffer%     : ${JSON.stringify(r.tierOfferPct)}`)
  console.log(`  slotDepth      : ${JSON.stringify(r.slotDepth)}`)
}

for (const cat of ['legacy_v1', 'modern_mix_v2_2026_07_07', 'modern_mix_v2_curated', 'modern_mix_v2_curated_r2']) {
  try { report(simulateCatalogue(cat, { seeds, pool: 'modern' })) }
  catch (e) { console.log(`\n== ${cat} ==\n  (skipped: ${e.message})`) }
}
