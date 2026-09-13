import { actorLabel } from '../playback/broadcast.js'

export function drawPitch(ctx, projection, program, sample, selectedId = null) {
  const p = projection, project = p.project
  ctx.clearRect(0, 0, p.width, p.height)
  ctx.fillStyle = '#102820'; ctx.fillRect(0, 0, p.width, p.height)
  for (let stripe = 0; stripe < 10; stripe++) {
    ctx.fillStyle = stripe % 2 ? '#215c42' : '#24664a'
    ctx.fillRect(p.left + stripe * p.pitchWidth / 10, p.top, p.pitchWidth / 10, p.pitchHeight)
  }
  ctx.strokeStyle = '#b8d4c4'; ctx.lineWidth = 1.2
  const line = (a, b) => { a = project(a); b = project(b); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
  const rect = (x, y, w, h) => { const a = project({ x, y }); ctx.strokeRect(a.x, a.y, w / 100 * p.pitchWidth, h / 100 * p.pitchHeight) }
  // World goal planes are 2 and 98, matching visual_v2_2 ball paths.
  rect(2, 0, 96, 100); line({ x: 50, y: 0 }, { x: 50, y: 100 })
  const center = project({ x: 50, y: 50 })
  ctx.beginPath(); ctx.ellipse(center.x, center.y, p.pitchWidth * .085, p.pitchHeight * .13, 0, 0, Math.PI * 2); ctx.stroke()
  for (const x of [2, 82]) rect(x, 20, 16, 60)
  for (const x of [2, 92]) rect(x, 36, 6, 28)
  ctx.strokeStyle = '#f5f5e9'; rect(0, 44, 2, 12); rect(98, 44, 2, 12)
  const actorById = new Map(program.actors.map((actor) => [actor.id, actor]))
  const active = sample.activeAction
  const shooter = active?.kind === 'shoot' ? active.actorId : null
  const presser = active?.assignments?.presserId
  for (const player of sample.players) {
    const actor = actorById.get(player.actorId), pt = project(player.position), r = p.markerRadius
    ctx.fillStyle = actor.side === 'us' ? '#5fe4e7' : '#fff0cf'
    ctx.strokeStyle = '#091c20'; ctx.lineWidth = 2
    ctx.beginPath()
    if (actor.goalkeeper) {
      ctx.moveTo(pt.x, pt.y - r - 2); ctx.lineTo(pt.x + r + 2, pt.y); ctx.lineTo(pt.x, pt.y + r + 2); ctx.lineTo(pt.x - r - 2, pt.y); ctx.closePath()
    } else if (actor.side === 'us') ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
    else ctx.rect(pt.x - r, pt.y - r, r * 2, r * 2)
    ctx.fill(); ctx.stroke()
    if (actor.goalkeeper) {
      ctx.fillStyle = '#091c20'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('K', pt.x, pt.y + 3)
    }
    if (player.actorId === sample.ball.ownerId || player.actorId === selectedId || player.actorId === shooter || player.actorId === presser) {
      ctx.strokeStyle = player.actorId === shooter ? '#ffd76c' : player.actorId === presser ? '#ff9c99' : '#ffffff'
      ctx.setLineDash(player.actorId === presser ? [3, 3] : [])
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    }
  }
  const labels = new Set([sample.ball.ownerId, shooter, selectedId].filter(Boolean))
  // Only already revealed goal attribution can add scorer/assister labels.
  if (sample.currentReveal?.goal && sample.timeMs - sample.currentReveal.atMs < 1800) {
    const scene = program.scenes.find((item) => item.id === sample.currentReveal.sceneId)
    labels.add(scene.participants.shooter)
    if (scene.participants.assister) labels.add(scene.participants.assister)
  }
  for (const id of labels) {
    const actor = actorById.get(id), player = sample.players.find((item) => item.actorId === id)
    if (!actor || !player) continue
    const pt = project(player.position), text = actorLabel(actor)
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
    const width = Math.min(ctx.measureText(text).width + 10, p.width - 8)
    const x = Math.max(width / 2 + 3, Math.min(p.width - width / 2 - 3, pt.x))
    const y = Math.max(14, pt.y - p.markerRadius - 9)
    ctx.fillStyle = '#091c20'; ctx.fillRect(x - width / 2, y - 11, width, 15)
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y, width - 6)
  }
  const ground = project(sample.ball.position), height = Math.min(18, (sample.ball.height || 0) * p.pitchHeight / 100)
  const radius = p.width < 500 ? 3.5 : 4
  ctx.fillStyle = '#061713aa'; ctx.beginPath(); ctx.ellipse(ground.x + 1, ground.y + 2, radius + 1, radius * .55, 0, 0, Math.PI * 2); ctx.fill()
  // No positional offset for ownership: the carrier track is authoritative.
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#091c20'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(ground.x, ground.y - height, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
}
