import { loadViteModule } from './scripts/vite-ssr-loader.mjs'
const dc = await loadViteModule('src/draftClarity.js')
const { catalogueMembers } = await loadViteModule('src/data/v2/catalogues.js')
const cur = catalogueMembers('modern_mix_v2_curated')
const leg = catalogueMembers('legacy_v1')
const curNoSig = cur.filter(p=>dc.playerSignatures(p).length===0)
const legNoSig = leg.filter(p=>dc.playerSignatures(p).length===0)
console.log('curated players with 0 signatures (guard over-fire?):', curNoSig.length, curNoSig.slice(0,5).map(p=>p.id))
console.log('legacy players with 0 signatures (expected: 12 mismatch + no-profile):', legNoSig.length)
// strengths always exactly 2, no dupes, across both catalogues
let bad=0
for(const p of [...cur,...leg]){const s=dc.playerKeyStrengths(p); if(s.length!==2||new Set(s).size!==2){bad++;console.log('BAD STRENGTHS',p.id,s)}}
console.log('players without exactly 2 unique strengths:', bad)
// every active player has a fit label for all identities
let nolabel=0
for(const p of [...cur,...leg]) for(const id of ['control','press','transition','fortress']){const f=dc.calculateIdentityFit(p,id); if(!['EXCELLENT','GOOD','MODERATE','WEAK'].includes(f.label)) nolabel++}
console.log('invalid fit labels:', nolabel)
