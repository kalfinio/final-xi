// Read-only deterministic Match Engine M0 calibration gate.
// It never touches localStorage or application state and always requests the
// frozen legacy_v1 resolver explicitly.
import { loadViteModule } from './vite-ssr-loader.mjs'

const { runMatchCalibration } = await loadViteModule('src/matchCalibration.js')
const report = runMatchCalibration()

console.log(`Match Engine calibration — ${report.engineVersion}`)
console.log(`Exact fixtures: ${report.exact.matches.length} matches, ${report.exact.runs.length} runs`)
console.log(`Aggregate sample: ${report.aggregate.sampleRunsPerCell} fixed-seed runs per cell`)
console.log(`Aggregate signature: ${report.aggregateSignature}`)
console.log('Run level:', JSON.stringify(report.aggregate.runLevel))
console.log('Difficulty wins:', JSON.stringify(Object.fromEntries(
  Object.entries(report.aggregate.difficulty).map(([key, value]) => [key, value.avgLeagueWins]),
)))
console.log('Role base probabilities:', JSON.stringify(Object.fromEntries(
  Object.entries(report.aggregate.roleBalance).map(([key, value]) => [key, value.baseWinProbability]),
)))
console.log('Match Plans (MONITOR ONLY):', JSON.stringify(Object.fromEntries(
  Object.entries(report.aggregate.matchPlansMonitorOnly).map(([key, value]) => [key, {
    wins: value.avgLeagueWins,
    draws: value.avgLeagueDraws,
    losses: value.avgLeagueLosses,
    championRate: value.championRate,
  }]),
)))

if (report.failures.length) {
  console.error(`CALIBRATION FAILED (${report.failures.length})`)
  for (const failure of report.failures) console.error(` - ${failure}`)
  process.exitCode = 1
} else {
  console.log('CALIBRATION PASSED')
}
