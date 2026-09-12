// R2 full-run viability calibration — release gate. Plays complete
// deterministic M1 runs for THREE drafting policies (novice / power /
// reasonable) on identical seeded offers and enforces the declared
// per-policy release bands, including strict numerical classic-champion
// gates over at least 1,000 classic runs per policy. Exits non-zero on any
// regression. `--seeds=<n>` exists ONLY for local iteration (the run prints a
// loud warning when the classic sample is below the release requirement);
// the release gate always uses the default.
import { loadViteModule } from './vite-ssr-loader.mjs'

const { runR2Calibration } = await loadViteModule('src/r2Calibration.js')
const seedArg = process.argv.find((a) => a.startsWith('--seeds='))
const seeds = seedArg ? Number(seedArg.slice(8)) : 200

const report = runR2Calibration({ seeds })
console.log(`R2 full-run calibration — ${seeds} seeds × ${report.samples.formations} formations × ${report.samples.difficulties} difficulties × ${report.samples.policies} policies`)
console.log('Signature:', report.signature, '· unwinnable threshold ≤', report.unwinnableProbability)
console.log('Seed contract:', report.seedContract)
if (seeds * report.samples.formations < report.bands.minClassicRuns) {
  console.warn(`LOCAL-ONLY SAMPLE: ${seeds * report.samples.formations} Classic runs/policy; release requires ${report.bands.minClassicRuns}.`)
}
for (const [policy, data] of Object.entries(report.policies)) {
  console.log(`\n== ${policy.toUpperCase()} ==`)
  console.log('policy   :', report.policyDefinitions[policy])
  console.log('overall  :', JSON.stringify(data.overall))
  for (const [d, s] of Object.entries(data.byDifficulty)) console.log(`${d.padEnd(9)}:`, JSON.stringify(s))
  console.log('strength :', JSON.stringify(data.strength))
  console.log('formation:', JSON.stringify(Object.fromEntries(Object.entries(data.byFormation).map(([f, s]) => [f, s.qualification]))))
  console.log('formRange:', JSON.stringify(data.formationQualificationRange))
}
if (report.failures.length) {
  console.error(`\nR2 CALIBRATION FAILED (${report.failures.length})`)
  for (const f of report.failures) console.error(' - ' + f)
  process.exitCode = 1
} else {
  console.log('\nR2 CALIBRATION PASSED')
}
