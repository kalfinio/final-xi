// Deterministic, read-only deep audit for M1 Match Plan balance. The default
// executes 1,000 paired seeds for every 3-strength x 7-archetype x 4-plan
// cell. Use --samples=<n> only for local iteration; the release gate uses the
// default and exits non-zero when contextual viability or route identity
// regresses.
import { loadViteModule } from './vite-ssr-loader.mjs'

const { runM1PlanAudit, M1_ARCHETYPE_KEYS, M1_PLAN_KEYS } = await loadViteModule('src/matchEngineM1Calibration.js')
const sampleArg = process.argv.find((arg) => arg.startsWith('--samples='))
const requestedSamples = sampleArg ? Number(sampleArg.slice('--samples='.length)) : 1000
const samplesPerCell = Number.isInteger(requestedSamples) && requestedSamples > 0 ? requestedSamples : 1000
const report = runM1PlanAudit({ samplesPerCell })

console.log(`Match Engine M1 plan audit — ${report.pairedMatches} paired matches`)
console.log(`Samples/cell: ${report.samplesPerCell} · PPM noise tolerance: ${report.noiseTolerancePpm.toFixed(2)} · signature: ${report.signature}`)
for (const [strength, byArchetype] of Object.entries(report.cells)) {
  console.log(`\n${strength.toUpperCase()} SQUAD`)
  for (const archetype of M1_ARCHETYPE_KEYS) {
    const cell = byArchetype[archetype]
    const line = M1_PLAN_KEYS.map((plan) => {
      const m = cell.metrics[plan]
      return `${plan} ${m.pointsPerMatch.toFixed(3)} PPM (${(m.winRate * 100).toFixed(1)}/${(m.drawRate * 100).toFixed(1)}/${(m.lossRate * 100).toFixed(1)} W/D/L, ${m.goalsFor.toFixed(2)}-${m.goalsAgainst.toFixed(2)}, opp ${m.ownOpportunities.toFixed(2)}/${m.opponentOpportunities.toFixed(2)}, xG ${m.ownXg.toFixed(2)}/${m.opponentXg.toFixed(2)}, poss ${m.possession.toFixed(1)})`
    }).join(' | ')
    console.log(`${archetype.padEnd(10)} ${line}`)
    console.log(`${''.padEnd(11)}rank ${cell.ranking.join(' > ')} · viable ${cell.viable.join(', ')}`)
  }
}

console.log('\nBest counts:', JSON.stringify(report.bestCounts))
console.log('Viable/tied counts:', JSON.stringify(report.viableCounts))
console.log('Aggregate identities:', JSON.stringify(report.aggregate))
if (report.failures.length) {
  console.error(`M1 PLAN AUDIT FAILED (${report.failures.length})`)
  for (const failure of report.failures) console.error(` - ${failure}`)
  process.exitCode = 1
} else {
  console.log('M1 PLAN AUDIT PASSED')
}
