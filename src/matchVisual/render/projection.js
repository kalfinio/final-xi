/** Pixel dimensions affect only projection. World coordinates never change. */
export function createProjection(width, height) {
  const padding = 16, usableWidth = Math.max(1, width - padding * 2), usableHeight = Math.max(1, height - padding * 2)
  const pitchWidth = Math.min(usableWidth, usableHeight * 1.54), pitchHeight = pitchWidth / 1.54
  const left = (width - pitchWidth) / 2, top = (height - pitchHeight) / 2
  return {
    width, height, left, top, pitchWidth, pitchHeight,
    markerRadius: Math.max(6.5, Math.min(9, pitchWidth / 90)),
    project: ({ x, y }) => ({ x: left + x / 100 * pitchWidth, y: top + y / 100 * pitchHeight }),
  }
}

export function hitActor(sample, projection, pointer) {
  return sample.players.map((player) => {
    const p = projection.project(player.position)
    return { id: player.actorId, distance: Math.hypot(pointer.x - p.x, pointer.y - p.y) }
  }).filter((item) => item.distance <= Math.max(14, projection.markerRadius + 5))
    .sort((a, b) => a.distance - b.distance)[0]?.id ?? null
}
