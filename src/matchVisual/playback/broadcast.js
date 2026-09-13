const ACTION_LINES = {
  receive: 'Receiving possession', carry: 'Moving with the ball', pass: 'Moving the ball',
  long_pass: 'Playing forward', through_ball: 'A forward run', switch: 'Switching play',
  cross: 'Delivery from wide', cutback: 'Working the ball inside', shoot: 'Shot in motion',
  // Outcomes are withheld until the scene's canonical reveal, including during
  // post-shot save/collect holds. Do not expose scene.requiredOutcome here.
  save: 'Ball in play', keeper_collect: 'Ball in play', clearance: 'Ball in play',
  turnover: 'Contesting possession', dead_ball: 'Play settling',
}

export function broadcastState(program, sample, playback) {
  const feed = program.revealSchedule.filter((item) => item.atMs <= sample.timeMs).slice(-5).reverse()
    .map((item) => ({ id: item.id, minute: item.event.minuteLabel || String(item.event.minute), text: item.commentary }))
  return {
    score: sample.score, clock: sample.clock.label,
    actionLine: sample.fullTime ? 'Full Time' : ACTION_LINES[sample.activeAction?.kind] || (sample.timeMs > 0 ? 'Awaiting Full Time' : 'Ready for kickoff'),
    commentary: sample.commentary, feed, result: sample.result, penalties: sample.penalties,
    playing: playback.playing, speed: playback.speed, hidden: playback.hidden, finished: sample.fullTime,
    hasNext: program.scenes.some((scene) => scene.origin === 'canonical' && scene.startMs > sample.timeMs),
  }
}

export function actorLabel(actor) {
  if (actor.anonymous) return `Opponent ${actor.slot}`
  const words = actor.name.trim().split(/\s+/)
  return words.length > 1 ? `${words[0][0]}. ${words.slice(1).join(' ')}` : actor.name
}
