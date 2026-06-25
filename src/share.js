// Frontend-only share helpers: viral copy text + a text-only PNG share card.
// No images, logos, badges, photos, or banned competition wording.

import { squadDisplayName } from './data'

// Common shape used by both the copy text and the PNG card.
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function buildShareData({
  result,
  config,
  total,
  winPct,
  outcome,
  league,
  mvp,
  smart,
  best,
  weak,
  rerollsUsed,
  totalRerolls,
  date,
  era,
  bestModern,
  bestLegend,
  topScorer,
  topAssister,
  squadNames = new Set(),
  verdict = '',
  teamName = '',
}) {
  return {
    champion: result.champion,
    resultLine: outcome,
    verdict,
    team: teamName,
    leagueFinish: `${ordinal(league.position)}, ${league.points} pts`,
    pool: config.pool === 'legends' ? 'Legends Only' : 'Modern Mix',
    formation: config.formation,
    difficulty: config.difficultyName,
    rating: total,
    winPct,
    identity: config.identity,
    mvp: mvp ? squadDisplayName(mvp.name, squadNames) : '—',
    topScorer: topScorer ? `${squadDisplayName(topScorer.name, squadNames)}, ${topScorer.goals} goals` : '—',
    topAssister: topAssister ? `${squadDisplayName(topAssister.name, squadNames)}, ${topAssister.assists} assists` : '—',
    smart: smart ? `${squadDisplayName(smart.name, squadNames)}, ${smart.rarity}% pick rate` : '—',
    bestBonus: best ? `${best.name} (+${best.pts})` : 'None',
    keyWeakness: weak ? weak.name : 'None',
    rerolls: `${rerollsUsed}/${totalRerolls}`,
    eraLegends: era.legends,
    eraModern: era.modern,
    bestModern: bestModern ? bestModern.name : '—',
    bestLegend: bestLegend ? bestLegend.name : '—',
    isDaily: config.mode === 'daily',
    date,
  }
}

// Compact, viral, readable copy text.
export function buildShareText(d) {
  const trophy = d.champion ? '🏆' : '⚔️'
  const lines = [
    `${trophy} ${d.team || 'Final XI'} — ${d.resultLine}`,
  ]
  if (d.verdict) lines.push(`Verdict: ${d.verdict}`)
  lines.push(
    `League Phase: ${d.leagueFinish}`,
    `Rating: ${d.rating} | Identity: ${d.identity}`,
    `MVP: ${d.mvp}`,
    `Top scorer: ${d.topScorer}`,
    `Top assister: ${d.topAssister}`,
    `Difficulty: ${d.difficulty} | Rerolls: ${d.rerolls}`,
  )
  if (d.isDaily) lines.push(`Daily Challenge: ${d.date}`)
  lines.push('#FinalXI')
  return lines.join('\n')
}

// Draw a dark premium, text-only result card and trigger a PNG download.
export function downloadShareCard(d) {
  const W = 1080
  const H = 1620
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#161616'
  ctx.fillRect(48, 48, W - 96, H - 96)
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 2
  ctx.strokeRect(48, 48, W - 96, H - 96)

  const padL = 110
  const gold = '#c9a84c'
  const primary = '#f0f0f0'
  const secondary = '#888888'
  const danger = '#f87171'
  const success = '#4ade80'

  ctx.textAlign = 'left'
  ctx.fillStyle = gold
  ctx.font = '700 96px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
  ctx.fillText('Final XI', padL, 200)

  ctx.fillStyle = secondary
  ctx.font = '600 30px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
  // Keep "Final XI" as the game brand above; personalise this line with the
  // user's team name (safe, single-line, no layout change).
  const runLabel = d.isDaily ? `DAILY CHALLENGE · ${d.date}` : 'RANDOM RUN'
  ctx.fillText(d.team ? `${d.team.toUpperCase()} · ${runLabel}` : runLabel, padL, 252)

  ctx.fillStyle = d.champion ? gold : danger
  ctx.font = '700 60px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
  ctx.fillText(d.resultLine, padL, 360)

  // Dramatic verdict subtitle — the run's one-line headline.
  if (d.verdict) {
    ctx.fillStyle = gold
    ctx.font = '700 40px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
    ctx.fillText(`“${d.verdict}”`, padL, 414)
  }

  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(padL, 452)
  ctx.lineTo(W - padL, 452)
  ctx.stroke()

  // Compact, not overcrowded — the headline stats only.
  const rows = [
    ['League Phase', d.leagueFinish, primary],
    ['Rating', String(d.rating), gold],
    ['Formation', `${d.formation} · ${d.difficulty}`, primary],
    ['Tactical identity', d.identity, gold],
    ['MVP', d.mvp, primary],
    ['Top scorer', d.topScorer, success],
    ['Top assister', d.topAssister, primary],
    ['Key bonus', d.bestBonus, success],
    ['Key weakness', d.keyWeakness, d.keyWeakness === 'None' ? success : danger],
    ['Rerolls used', d.rerolls, primary],
  ]

  let y = 512
  const step = 100
  for (const [label, value, color] of rows) {
    ctx.fillStyle = secondary
    ctx.font = '500 28px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
    ctx.fillText(label.toUpperCase(), padL, y)
    ctx.fillStyle = color
    ctx.font = '700 42px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
    ctx.fillText(String(value), padL, y + 48)
    y += step
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = gold
  ctx.font = '700 44px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif'
  ctx.fillText('#FinalXI', W / 2, H - 80)

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'final-xi.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
