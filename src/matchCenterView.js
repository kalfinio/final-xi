// ---------------------------------------------------------------------------
// Match Center view helpers (Phase 2.1 — presentation polish only).
//
// Pure, deterministic functions that turn the existing sequence/plan data into
// readable visuals: the compact sequence chain, path segmentation (been vs
// going), a lightweight marker-spacing pass, and the compact outcome banner.
// They derive everything from event.seq / plan data — no sequence logic is
// duplicated, no stats are touched, no RNG is used.
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const PATTERN_LABELS = {
  central_buildup: 'Central buildup',
  wide_overlap: 'Wide overlap',
  switch_of_play: 'Switch of play',
  through_ball: 'Through ball',
  one_two: 'One-two',
  counterattack: 'Counterattack',
  cross: 'Cross',
  cutback: 'Cutback',
  pressing_recovery: 'Pressing recovery',
  direct_attack: 'Direct attack',
  set_piece: 'Set piece',
  gk_miracle: 'Keeper up for it!',
}

// Compact actor chain for a sequence: consecutive touches by the same player
// collapse into one step (e.g. the cross pattern's carry+cross). Each step
// keeps the touch index it starts at so the current actor can be highlighted.
export function buildSeqChain(seq) {
  if (!seq || !seq.touches?.length) return null
  const chain = []
  seq.touches.forEach((t, i) => {
    const key = t.playerId != null ? `h${t.playerId}` : `a${t.awayNum}`
    const last = chain[chain.length - 1]
    if (last && last.key === key) { last.lastTouch = i; return }
    chain.push({ key, name: t.playerName, firstTouch: i, lastTouch: i })
  })
  return chain
}

// Index of the chain step that owns `touchIdx` (Infinity → last step, used at
// the outcome/rest frames). Never looks past the touches that have played.
export function chainActiveIndex(chain, touchIdx) {
  if (!chain || !chain.length) return -1
  if (touchIdx == null || touchIdx === Infinity) return chain.length - 1
  let pos = 0
  chain.forEach((c, i) => { if (c.firstTouch <= touchIdx) pos = i })
  return pos
}

// Split the ball path at the current frame: dim "where it's been" vs a bright
// "where it's going" segment. Future segments are never returned, and nothing
// is shown on the rest frame or before the ball first moves (frame 0).
export function pathSegments(stops, frame) {
  if (!stops || frame < 1) return null
  const f = Math.min(frame, stops.length - 1)
  const stop = stops[f]
  if (!stop || stop.kind === 'rest' || stop.kind === 'build') return null
  const pts = stops.slice(0, f + 1).map((s) => s.point)
  const completed = pts.slice(0, f) // travelled points (up to the previous stop)
  const current = { x1: pts[f - 1].x, y1: pts[f - 1].y, x2: pts[f].x, y2: pts[f].y }
  return {
    completed: completed.length >= 2 ? completed.map((p) => `${p.x},${p.y}`).join(' ') : null,
    current,
  }
}

// Lightweight, deterministic visual de-overlap pass. Two bounded passes push
// too-close markers apart along their separation vector; identical positions
// get an index-derived angle so the result is stable across replays. This is
// a display-only nudge — tactical coordinates are never changed, and markers
// ease back as soon as the underlying positions separate.
export function spreadMarkers(dots, minDist = 4.0, maxPush = 2.2) {
  const out = dots.map((d) => ({ ...d }))
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= minDist) continue
        if (d < 0.01) {
          const ang = ((i * 7 + j * 13) % 12) * (Math.PI / 6)
          dx = Math.cos(ang)
          dy = Math.sin(ang)
        } else {
          dx /= d
          dy /= d
        }
        const push = Math.min((minDist - d) / 2, maxPush)
        a.x = clamp(a.x - dx * push, 2, 98)
        a.y = clamp(a.y - dy * push, 3, 61)
        b.x = clamp(b.x + dx * push, 2, 98)
        b.y = clamp(b.y + dy * push, 3, 61)
      }
    }
  }
  return out
}

// Compact outcome banner content, derived strictly from the canonical
// event/sequence outcome (visual only — stats and score timing are untouched).
export function outcomeBanner(event) {
  if (!event) return null
  const out = event.seq?.outcome
  if (!out) {
    // no-ball events keep their existing labels, just in the compact banner
    const legacy = {
      momentum: { title: 'MOMENTUM SHIFT', tone: 'neutral' },
      card: { title: event.red ? 'RED CARD' : 'YELLOW CARD', tone: 'card' },
      substitution: { title: 'ROLE IMPACT', tone: 'neutral' },
    }
    return legacy[event.type] || { title: event.title?.toUpperCase() || 'PLAY', tone: 'neutral' }
  }
  switch (out.type) {
    case 'goal':
      return {
        title: 'GOAL',
        detail: `${out.playerName} · ${event.minute}'`,
        sub: event.assister ? `assist ${event.assister}` : null,
        tone: 'goal',
      }
    case 'save':
      return { title: 'BIG SAVE', detail: out.goalkeeper || 'Keeper', sub: `denies ${out.playerName}`, tone: 'save' }
    case 'shot_on':
      return { title: 'SAVED', detail: out.playerName, sub: out.goalkeeper ? `kept out by ${out.goalkeeper}` : null, tone: 'save' }
    case 'shot_off':
      return { title: 'WIDE', detail: out.playerName, sub: null, tone: 'miss' }
    default: // chance — the move broke down, no shot occurred
      return { title: 'CHANCE', detail: out.playerName, sub: 'the move breaks down — no shot', tone: 'chance' }
  }
}
