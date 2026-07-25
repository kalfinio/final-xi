// ---------------------------------------------------------------------------
// Developer-only R1 artifact verification / intentional regeneration.
//
// Required source: a separately supplied detached worktree at the archived
// pre-correction commit (897efff). The active worktree is explicitly rejected.
// Generation runs from memory and writes only to an OS temp directory. The
// committed artifacts are read-only unless the caller supplies `--write`.
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ARCHIVED_COMMIT = '897efff'
const HISTORICAL_SAVED_AT = 1784465133286
const args = process.argv.slice(2)
const sourceArg = args.find((arg) => arg.startsWith('--source='))
const write = args.includes('--write')

if (!sourceArg || !sourceArg.slice('--source='.length).trim()) {
  console.error('Usage: node scripts/verify-r1-artifacts.mjs --source=<detached-897efff-worktree> [--write]')
  process.exit(2)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.resolve(sourceArg.slice('--source='.length))
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()

if (samePath(sourceDir, repoRoot)) {
  console.error('--source must be a separate archived worktree; the active working tree is never a valid source.')
  process.exit(2)
}
if (!existsSync(path.join(sourceDir, 'src/data/v2/catalogues.js')) || !existsSync(path.join(sourceDir, 'scripts/vite-ssr-loader.mjs'))) {
  console.error(`--source ${sourceDir} does not look like a complete Final XI source worktree`)
  process.exit(2)
}

const git = (...gitArgs) => execFileSync('git', ['-C', sourceDir, ...gitArgs], { encoding: 'utf8' }).trim()
let sourceRoot
let sourceHead
let archivedHead
try {
  sourceRoot = git('rev-parse', '--show-toplevel')
  sourceHead = git('rev-parse', 'HEAD')
  archivedHead = git('rev-parse', `${ARCHIVED_COMMIT}^{commit}`)
} catch {
  console.error('--source must be a Git worktree containing the archived revision.')
  process.exit(2)
}
if (!samePath(sourceRoot, sourceDir)) {
  console.error(`--source must name the archived worktree root exactly (resolved root: ${sourceRoot}).`)
  process.exit(2)
}
if (sourceHead !== archivedHead) {
  console.error(`--source HEAD ${sourceHead.slice(0, 12)} is not archived commit ${ARCHIVED_COMMIT} (${archivedHead.slice(0, 12)}).`)
  process.exit(2)
}

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex')
const committedSnapshot = path.join(repoRoot, 'src/data/v2/curatedR1Snapshot.json')
const committedFixture = path.join(repoRoot, 'src/historicalR1Save.fixture.json')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'final-xi-r1-verify-'))
const regeneratedSnapshotPath = path.join(tempDir, 'curatedR1Snapshot.json')
const regeneratedFixturePath = path.join(tempDir, 'historicalR1Save.fixture.json')
const loaderUrl = pathToFileURL(path.join(sourceDir, 'scripts/vite-ssr-loader.mjs')).href

// Byte-compatible with the original artifact generator. Date.now is pinned so
// the save fixture is deterministic rather than changing on every verification.
const generator = String.raw`
import { loadViteModule } from ${JSON.stringify(loaderUrl)}
import { writeFileSync } from 'node:fs'
const cat = await loadViteModule('src/data/v2/catalogues.js')
const v2 = await loadViteModule('src/data/v2/index.js')
const data = await loadViteModule('src/data.js')
const persistence = await loadViteModule('src/runPersistence.js')
const upgrades = await loadViteModule('src/runUpgrades.js')
const CUR = 'modern_mix_v2_curated'
const ids = cat.getCatalogue(CUR).orderedIds
const leagueOf = (clubId) => { const club = v2.CLUBS.find((candidate) => candidate.id === clubId); return club ? club.leagueId : null }
const snapshot = {}
for (const id of ids) {
  const adapted = cat.resolvePlayer(id, CUR)
  const source = v2.v2PlayerById[id]
  snapshot[id] = { adapted: JSON.parse(JSON.stringify(adapted)), source: {
    id: source.id, name: source.name, nationId: source.nationId ?? null, clubId: source.clubId ?? null,
    leagueId: source.clubId ? leagueOf(source.clubId) : null,
    primaryPosition: source.primaryPosition ?? null, secondaryPositions: [...(source.secondaryPositions || [])],
    primaryRole: source.primaryRole ?? null, tier: source.tier, signatures: [...(source.signatures || [])],
    roleSuitability: source.roleSuitability ? { ...source.roleSuitability } : null,
    developmentProfile: source.developmentProfile ?? null, character: source.character ?? null, era: source.era,
  } }
}
const wanted = [
  ['GK', 'alisson'], ['RB', 'hakimi'], ['CB', 'cucurella'], ['CB', 'saliba'], ['LB', 'theo'],
  ['CM', 'rodri'], ['CM', 'bellingham'], ['CM', 'pedri'],
  ['RW', 'salah'], ['ST', 'haaland'], ['LW', 'vinicius'],
]
const squad = wanted.map(([slot, id]) => ({ slot, player: cat.resolvePlayer(id, CUR) }))
const runSeed = 0x51a077
const ctrl = data.createRunSimulation({
  rating: data.computeRating(squad).total, difficulty: 'classic', squad,
  rng: data.makeRng(runSeed), runSeed, engineVersion: 'm1',
  upgradeContextFor: (matchContext, profile) => upgrades.buildUpgradeContext([], matchContext, profile),
})
for (const plan of ['balanced', 'counter', 'control', 'wide']) { ctrl.prepareNext(); ctrl.resolveNext(plan) }
const realDateNow = Date.now
Date.now = () => ${HISTORICAL_SAVED_AT}
const snap = persistence.createRunSnapshot({
  engineVersion: ctrl.engineVersion,
  config: { mode: 'random', pool: 'modern', difficulty: 'classic', formation: '4-3-3', clubIdentity: 'press' },
  catalogVersion: CUR, runSeed, teamName: 'Historical XI', squad, rerollsUsed: 1,
  matches: ctrl.matches, upgradeState: { owned: [], offers: [] },
  checkpoint: { screen: 'hub', resolvedMatchCount: 4, selectedApproach: 'balanced', stageLabel: 'League Phase' },
})
Date.now = realDateNow
const expected = {
  canonicalMatches: snap.run.signatures.canonicalMatches,
  resolvedMatches: snap.run.signatures.resolvedMatches,
  scores: ctrl.matches.map((match) => match.score + '|' + match.result + '|' + match.approach),
  engineVersion: ctrl.engineVersion,
  matchesJsonLength: JSON.stringify(ctrl.matches).length,
}
writeFileSync(process.env.R1_VERIFY_SNAPSHOT_OUT, JSON.stringify({ generatedFromCommit: '${ARCHIVED_COMMIT}', orderedIds: ids, players: snapshot }, null, 1))
writeFileSync(process.env.R1_VERIFY_FIXTURE_OUT, JSON.stringify({ generatedFromCommit: '${ARCHIVED_COMMIT}', note: 'Save + expected outputs produced by pre-correction committed code; current code must reconstruct byte-identically.', snapshot: snap, expected }, null, 1))
`

try {
  execFileSync(process.execPath, ['--input-type=module', '--eval', generator], {
    cwd: sourceDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      R1_VERIFY_SNAPSHOT_OUT: regeneratedSnapshotPath,
      R1_VERIFY_FIXTURE_OUT: regeneratedFixturePath,
    },
  })

  const regeneratedSnapshot = readFileSync(regeneratedSnapshotPath)
  const regeneratedFixture = readFileSync(regeneratedFixturePath)
  const results = [
    ['curatedR1Snapshot.json', sha(readFileSync(committedSnapshot)), sha(regeneratedSnapshot)],
    ['historicalR1Save.fixture.json', sha(readFileSync(committedFixture)), sha(regeneratedFixture)],
  ]
  let ok = true
  for (const [name, committed, regenerated] of results) {
    const match = committed === regenerated
    ok = ok && match
    console.log(`${name}: committed ${committed} regenerated ${regenerated} ${match ? 'MATCH' : 'MISMATCH'}`)
  }

  if (!ok && write) {
    writeFileSync(committedSnapshot, regeneratedSnapshot)
    writeFileSync(committedFixture, regeneratedFixture)
    console.log('--write supplied: committed artifacts intentionally overwritten with archived-source output.')
  } else if (!ok) {
    console.error('Mismatch detected. Re-run with --write only for an intentional reviewed re-baseline.')
    process.exitCode = 1
  } else {
    console.log(`Committed artifacts verified against archived source ${sourceHead}.`)
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
