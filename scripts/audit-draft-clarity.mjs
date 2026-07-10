import { loadViteModule } from './vite-ssr-loader.mjs'

const { catalogueMembers } = await loadViteModule('/src/data/v2/catalogues.js')
const { CLUB_IDENTITY_KEYS, IDENTITY_FIT_LABELS, calculateIdentityFit } = await loadViteModule('/src/draftClarity.js')

const players = catalogueMembers('modern_mix_v2_curated')
if (players.length !== 341) throw new Error(`Expected 341 curated players, found ${players.length}`)

console.log(`Curated Identity Fit distribution (${players.length} players)`)
for (const identity of CLUB_IDENTITY_KEYS) {
  const counts = Object.fromEntries(IDENTITY_FIT_LABELS.map((label) => [label, 0]))
  for (const player of players) counts[calculateIdentityFit(player, identity).label]++
  const output = IDENTITY_FIT_LABELS
    .map((label) => `${label} ${counts[label]} (${(counts[label] * 100 / players.length).toFixed(1)}%)`)
    .join(' | ')
  console.log(`${identity.toUpperCase()}: ${output}`)
}
