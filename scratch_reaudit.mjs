import { loadViteModule } from './scripts/vite-ssr-loader.mjs'
const dc = await loadViteModule('src/draftClarity.js')
const { catalogueMembers } = await loadViteModule('src/data/v2/catalogues.js')
const { playerPoints, FORMATIONS, auraLabel } = await loadViteModule('src/data.js')
const { getV2PlayerById } = await loadViteModule('src/data/v2/index.js')

const cur = catalogueMembers('modern_mix_v2_curated')
const leg = catalogueMembers('legacy_v1')
const all = [...leg, ...cur]

// ---- A. FIT DISTRIBUTION (independent) ----
console.log('=== FIT DISTRIBUTION — curated (n=%d) ===', cur.length)
const dist={}
for (const id of ['control','press','transition','fortress']) {
  const c={EXCELLENT:0,GOOD:0,MODERATE:0,WEAK:0}
  for (const p of cur) c[dc.calculateIdentityFit(p,id).label]++
  dist[id]=c
  const pc=k=>(100*c[k]/cur.length).toFixed(1)
  console.log(`${id.padEnd(11)} EXC ${pc('EXCELLENT').padStart(5)}%  GOOD ${pc('GOOD').padStart(5)}%  MOD ${pc('MODERATE').padStart(5)}%  WEAK ${pc('WEAK').padStart(5)}%`)
}
console.log('PRESS has WEAK:', dist.press.WEAK>0, '| TRANSITION has WEAK:', dist.transition.WEAK>0)

// ---- B. score == sum(contributors) & no non-contributors listed ----
let scoreOk=true, whyOk=true
for(const id of ['control','press','transition','fortress']) for(const p of all){
  const f=dc.calculateIdentityFit(p,id)
  const sum=Number(f.contributors.reduce((s,c)=>s+c.value,0).toFixed(2))
  if(Math.abs(sum-f.score)>0.001) {scoreOk=false; console.log('SCORE MISMATCH',id,p.id,sum,f.score)}
  if(f.contributors.some(c=>!(c.value>0))) whyOk=false
  // supporting role must never exceed primary contribution
  const prim=f.contributors.find(c=>c.source==='primary-role')
  const sup=f.contributors.find(c=>c.source==='supporting-role')
  if(prim&&sup&&sup.value>prim.value){console.log('SUPPORT>PRIMARY',id,p.id)}
  if(sup&&sup.value>0.75){console.log('SUPPORT CAP BREACH',id,p.id,sup.value)}
  const sigs=f.contributors.filter(c=>c.source==='signature')
  if(sigs.length>3) console.log('SIG COUNT>3',id,p.id)
  if(sigs.some(s=>s.value!==0.35)) console.log('SIG VALUE ODD',id,p.id)
}
console.log('score==sum(contributors):',scoreOk,'| all contributors have value>0:',whyOk)

// ---- C. QUALITY LABELS ----
console.log('\n=== QUALITY LABELS ===')
const bad = all.filter(p=>dc.playerQualityTier(p).label==='PROFILE UNAVAILABLE')
console.log('PROFILE UNAVAILABLE count (should be 0):', bad.length, bad.slice(0,5).map(p=>p.id))
const labels={}; for(const p of cur){const l=dc.playerQualityTier(p).label; labels[l]=(labels[l]||0)+1}
console.log('curated label spread:', JSON.stringify(labels))
const src={}; for(const p of all){const s=dc.playerQualityTier(p).source; src[s]=(src[s]||0)+1}
console.log('label sources:', JSON.stringify(src))
const spot = ['messi','ronaldo','maradona','pele','zidane','cruyff','maldini','debruyne','vandijk','haaland','schmeichel','bensebaini','saliba','yamal']
for(const id of spot){const p=cur.find(x=>x.id===id)||leg.find(x=>x.id===id); if(!p)continue
  const q=dc.playerQualityTier(p); console.log(`  ${p.name.padEnd(22)} ${String(playerPoints(p)).padStart(2)}dv  ${q.label.padEnd(16)} (src=${q.source}/${q.sourceValue})`)}

// ---- D. SQUAD NEED: protection reachability ----
console.log('\n=== SQUAD NEED — DEFENSIVE PROTECTION ===')
const byRole=r=>all.find(p=>p.role===r)
const shield=byRole('Defensive Shield'), winner=byRole('Ball Winner')
const slots=FORMATIONS['4-3-3'].slots
console.log('GK functions:', dc.playerFunctions(byRole('Shot Stopper')))
console.log('CB functions:', dc.playerFunctions(byRole('Defensive Leader')))
console.log('Shield functions:', dc.playerFunctions(shield), '| BallWinner:', dc.playerFunctions(winner))
// realistic GK-inclusive squad, no DM protection
const noProt=[byRole('Shot Stopper'),byRole('Attacking Fullback'),byRole('Defensive Leader'),byRole('Ball-Playing Defender'),
  byRole('Attacking Fullback'),byRole('Tempo Controller'),byRole('Final Passer'),byRole('Creative Magician')]
const sq=noProt.map((p,i)=>({slot:slots[i],player:p}))
console.log('covered:', [...new Set(noProt.flatMap(dc.playerFunctions))].sort().join(','))
console.log('  pick9 Shield ->', JSON.stringify(dc.analyzeSquadNeed({squad:sq,candidate:shield,pickIndex:8,formationSlots:slots})))
console.log('  pick6 Shield (mid) ->', JSON.stringify(dc.analyzeSquadNeed({squad:sq.slice(0,5),candidate:shield,pickIndex:5,formationSlots:slots})))
// false positives
const withShield=[...noProt.slice(0,7),shield].map((p,i)=>({slot:slots[i],player:p}))
console.log('  pick9 Shield when Shield present ->', JSON.stringify(dc.analyzeSquadNeed({squad:withShield,candidate:byRole('Defensive Shield'),pickIndex:8,formationSlots:slots})))
const withWinner=[...noProt.slice(0,7),winner].map((p,i)=>({slot:slots[i],player:p}))
console.log('  pick9 Shield when BallWinner present ->', JSON.stringify(dc.analyzeSquadNeed({squad:withWinner,candidate:shield,pickIndex:8,formationSlots:slots})))
// GK alone must not satisfy midfield-protection
const gkOnly=[byRole('Shot Stopper'),byRole('Defensive Leader'),byRole('Ball-Playing Defender'),byRole('Attacking Fullback')].map((p,i)=>({slot:slots[i],player:p}))
console.log('  GK+DEF covered set:', [...new Set(gkOnly.map(s=>s.player).flatMap(dc.playerFunctions))].sort().join(','))

// ---- E. formation reachability of pickIndex>=8 DM slot ----
console.log('\n=== FORMATION slot@index>=8 ===')
for(const [k,v] of Object.entries(FORMATIONS)) console.log(` ${k.padEnd(8)} idx8..10 = ${v.slots.slice(8).join(',')}`)

// ---- F. Recovery Pace wording + attacker examples ----
console.log('\n=== RECOVERY PACE WORDING ===')
for(const id of ['henry','bale','etoo','torres','owen','weah','cannavaro','kounde']){
  const p=all.find(x=>x.id===id); if(!p)continue
  console.log(`  ${p.name.padEnd(20)} [${dc.playerKeyStrengths(p).join(' | ')}]`)}

// ---- G. legacy signature guard ----
console.log('\n=== LEGACY SIGNATURE GUARD ===')
const mism=leg.filter(p=>{const v=getV2PlayerById(p.id); return v&&v.primaryRole!==p.role})
console.log('mismatched legacy players:',mism.length)
for(const p of mism.slice(0,6)) console.log(`  ${p.name.padEnd(20)} legacyRole=${p.role.padEnd(22)} sigs=[${dc.playerSignatures(p).join(',')}] strengths=[${dc.playerKeyStrengths(p).join(' | ')}]`)
// non-mismatched legacy keeps sigs
const ok=leg.find(p=>{const v=getV2PlayerById(p.id); return v&&v.primaryRole===p.role})
console.log(`  control: ${ok.name} sigs=[${dc.playerSignatures(ok).join(',')}]`)
