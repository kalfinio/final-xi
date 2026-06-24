// ---------------------------------------------------------------------------
// DEV-ONLY balance harness (Phase 3). Not imported by the app — run manually:
//   node scripts/balance.mjs
// Estimates champion rates and League Phase outcomes for representative squad
// archetypes across all three difficulties. Safe to delete at any time.
// ---------------------------------------------------------------------------
import { PLAYERS, computeRating, simulate, makeRng } from '../src/data.js'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const S = (...ids) => ids.map((id) => {
  const p = byId[id]
  if (!p) throw new Error('missing player ' + id)
  return { slot: p.primaryPos, player: p }
})

const SQUADS = {
  'strong balanced': S('casillas', 'cafu', 'maldini', 'beckenbauer', 'robertocarlos', 'makelele', 'xavi', 'zidane', 'ronaldo', 'vanbasten', 'ribery'),
  'GOAT-heavy': S('casillas', 'cafu', 'maldini', 'beckenbauer', 'robertocarlos', 'makelele', 'xavi', 'messi', 'ronaldo', 'maradona', 'pele'),
  'medium': S('alisson', 'trent', 'vandijk', 'varane', 'robertson', 'thiago', 'gundogan', 'mane', 'salah', 'lewandowski', 'haaland'),
  'low': S('schmeichel', 'lahm', 'ferdinand', 'vidic', 'ashleycole', 'gattuso', 'deco', 'davids', 'owen', 'torres', 'luisdiaz'),
  'weak': S('ricardo', 'thuram', 'costacurta', 'desailly', 'walker', 'khedira', 'verratti', 'frenkie', 'owen', 'torres', 'mahrez'),
  'unbalanced attacking': S('ricardo', 'cafu', 'robertocarlos', 'ronaldinho', 'kaka', 'zidane', 'ozil', 'messi', 'ronaldo', 'neymar', 'henry'),
  'defensive': S('casillas', 'cafu', 'maldini', 'beckenbauer', 'robertocarlos', 'makelele', 'gattuso', 'keane', 'puyol', 'cannavaro', 'ramos'),
}

const DIFFS = ['casual', 'classic', 'legendary']
const N = Number(process.argv[2] || 400)

function run(squad, difficulty) {
  const { total } = computeRating(squad)
  let champ = 0, posSum = 0, top8 = 0, playoff = 0, leagueElim = 0
  const exitRounds = {}
  for (let seed = 1; seed <= N; seed++) {
    const r = simulate({ rating: total, difficulty, squad, rng: makeRng(seed * 2654435761) })
    if (r.champion) champ++
    posSum += r.leaguePhase.position
    if (r.leaguePhase.qualification === 'direct') top8++
    else if (r.leaguePhase.qualification === 'playoff') playoff++
    else leagueElim++
    if (!r.champion) exitRounds[r.exitStage] = (exitRounds[r.exitStage] || 0) + 1
  }
  const commonExit = Object.entries(exitRounds).sort((a, b) => b[1] - a[1])[0]
  return {
    rating: total,
    champ: (champ / N * 100).toFixed(1) + '%',
    avgPos: (posSum / N).toFixed(1),
    top8: (top8 / N * 100).toFixed(0) + '%',
    playoff: (playoff / N * 100).toFixed(0) + '%',
    leagueElim: (leagueElim / N * 100).toFixed(0) + '%',
    commonExit: commonExit ? `${commonExit[0]} (${(commonExit[1] / N * 100).toFixed(0)}%)` : '—',
  }
}

console.log(`Balance harness — ${N} seeded runs per cell\n`)
for (const [name, squad] of Object.entries(SQUADS)) {
  console.log(`### ${name}  (rating ${computeRating(squad).total})`)
  for (const d of DIFFS) {
    const r = run(squad, d)
    console.log(`  ${d.padEnd(10)} champ ${r.champ.padStart(6)} | avgPos ${r.avgPos.padStart(4)} | top8 ${r.top8.padStart(4)} | po ${r.playoff.padStart(4)} | elim ${r.leagueElim.padStart(4)} | exit ${r.commonExit}`)
  }
  console.log('')
}

// --- Seeding test: R16 exit rate bucketed by actual League Phase finish -------
// Pools runs from squads that finish across the table so each band is populated.
const SEED_SQUADS = [SQUADS['strong balanced'], SQUADS['GOAT-heavy'], SQUADS['medium'], SQUADS['defensive']]
const BANDS = [['1st–4th', 1, 4], ['5th–8th', 5, 8], ['9th–16th (PO)', 9, 16], ['17th–24th (PO)', 17, 24]]
console.log('=== Seeding: R16 exit rate by League finish ===')
for (const d of DIFFS) {
  const bucket = BANDS.map(() => ({ n: 0, reachedR16: 0, r16Exit: 0, champ: 0 }))
  for (const squad of SEED_SQUADS) {
    const { total } = computeRating(squad)
    for (let seed = 1; seed <= N; seed++) {
      const r = simulate({ rating: total, difficulty: d, squad, rng: makeRng(seed * 40503 + 7) })
      const pos = r.leaguePhase.position
      const bi = BANDS.findIndex(([, lo, hi]) => pos >= lo && pos <= hi)
      if (bi < 0) continue
      const b = bucket[bi]
      b.n++
      if (r.champion) b.champ++
      const reachedR16 = r.knockouts.length > 0 // played at least the R16
      if (reachedR16) {
        b.reachedR16++
        if (r.exitStage === 'Round of 16') b.r16Exit++
      }
    }
  }
  console.log(`  ${d}:`)
  BANDS.forEach(([label], i) => {
    const b = bucket[i]
    const rate = b.reachedR16 ? (b.r16Exit / b.reachedR16 * 100).toFixed(1) + '%' : '—'
    const champ = b.n ? (b.champ / b.n * 100).toFixed(1) + '%' : '—'
    console.log(`    ${label.padEnd(15)} n=${String(b.n).padStart(4)} | reachedR16 ${String(b.reachedR16).padStart(4)} | R16 exit ${rate.padStart(6)} | champ ${champ.padStart(6)}`)
  })
}
