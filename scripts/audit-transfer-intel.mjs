// Phase A — audit the transfer-intel artifact against the V2 database.
//   npm run db:audit:transfers
import { readFileSync } from 'node:fs'
import { loadViteModule } from './vite-ssr-loader.mjs'

const { validateTransferIntel } = await loadViteModule('/src/data/v2/validate.js')

const intel = JSON.parse(readFileSync(new URL('../data/transferIntel.2026-07-07.json', import.meta.url), 'utf8'))
const byStatus = {}
for (const e of intel.entries || []) byStatus[e.status] = (byStatus[e.status] || 0) + 1
const { problems, warnings } = validateTransferIntel(intel)

console.log(`snapshot=${intel.snapshotDate} cutoff=${intel.researchCutoffUtc}`)
console.log('entries by status:', JSON.stringify(byStatus))
if (warnings.length) { console.log(`\n⚠️  ${warnings.length} warning(s):`); for (const w of warnings) console.log('   - ' + w) }
if (problems.length) {
  console.error(`\n❌ ${problems.length} problem(s):`)
  for (const p of problems) console.error('   - ' + p)
  process.exit(1)
}
console.log(`\n✅ transfer intel valid (0 problems).`)
