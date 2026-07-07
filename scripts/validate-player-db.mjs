// Phase A — validate the V2 player database + transfer intel. Run before the
// bundle is built. Exits non-zero on any hard schema/referential problem.
//   npm run db:validate
import { readFileSync } from 'node:fs'
import { loadViteModule } from './vite-ssr-loader.mjs'

const { validateV2 } = await loadViteModule('/src/data/v2/validate.js')

const intel = JSON.parse(readFileSync(new URL('../data/transferIntel.2026-07-07.json', import.meta.url), 'utf8'))
const { problems, warnings } = validateV2(intel)

if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} warning(s):`)
  for (const w of warnings) console.log('   - ' + w)
}
if (problems.length) {
  console.error(`\n❌ ${problems.length} problem(s):`)
  for (const p of problems) console.error('   - ' + p)
  process.exit(1)
}
console.log(`\n✅ V2 database valid (0 problems, ${warnings.length} warnings).`)
