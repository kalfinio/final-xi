// Read-only deterministic Match Engine M1 calibration gate. This command
// requests M1 explicitly and never changes the public active engine or Daily.
import { loadViteModule } from './vite-ssr-loader.mjs'

const { runM1Calibration } = await loadViteModule('src/matchEngineM1Calibration.js')
const report = runM1Calibration()

console.log(`Match Engine calibration — ${report.engineVersion} (explicit, inactive)`)
console.log('Samples:', JSON.stringify(report.samples))
console.log('Signature:', report.signature)
console.log('Outcomes:', JSON.stringify(report.outcomes))
console.log('Match shape:', JSON.stringify(report.matchShape))
console.log('Run level:', JSON.stringify(report.runLevel))
console.log('Match Plans:', JSON.stringify(report.matchPlans))
console.log('Opponent archetypes:', JSON.stringify(report.opponents))
console.log('Role / Signature effects:', JSON.stringify(report.roleSignatureEffects))
console.log('Preserve orderings:', JSON.stringify({
  difficulty: report.preserveMatrix.difficulty,
  matchLevel: report.preserveMatrix.matchLevel,
  roleBalance: Object.fromEntries(Object.entries(report.preserveMatrix.roleBalance).map(([key, value]) => [key, {
    baseWinProbability: value.baseWinProbability,
    avgLeagueWins: value.metrics.avgLeagueWins,
  }])),
}))

if (report.failures.length) {
  console.error(`M1 CALIBRATION FAILED (${report.failures.length})`)
  for (const failure of report.failures) console.error(` - ${failure}`)
  process.exitCode = 1
} else {
  console.log('M1 CALIBRATION PASSED')
}
