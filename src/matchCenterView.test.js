// Phase 2.1 test suite — Match Center readability helpers.
//
// 1. Path segmentation (future hidden, completed vs current)
// 2. Active-player mapping (label ↔ current touch actor)
// 3. Sequence-chain progression (advances, never reveals the outcome early)
// 4. Spacing helper determinism + bounds
// 5. Outcome banner derives strictly from the canonical outcome
// (Phase 1 baseline + Phase 2 determinism are covered by the existing suites,
// which run alongside this file.)
import { describe, it, expect } from 'vitest'
import baseline from './simBaseline.fixture.json'
import { PLAYERS, computeRating, simulate, makeRng } from './data'
import { buildMatchTimeline } from './matchTimeline'
import { buildPlan } from './MatchCenter'
import { buildSeqChain, chainActiveIndex, pathSegments, spreadMarkers, outcomeBanner, PATTERN_LABELS, placeLabels, ftBallPoint } from './matchCenterView'

const byId = Object.fromEntries(PLAYERS.map((p) => [p.id, p]))
const squadFromFixture = (run) => run.squad.map(({ slot, id }) => ({ slot, player: byId[id] }))
const allRunMatches = (r) => [...r.leaguePhase.matches, ...(r.playoff ? [r.playoff] : []), ...r.knockouts]

// Gather a broad pool of real timeline events (all types) from baseline runs.
function collectEvents(maxRuns = 6) {
  const out = []
  for (const run of baseline.runs.slice(0, maxRuns)) {
    const squad = squadFromFixture(run)
    const players = squad.map((s) => s.player)
    const { total } = computeRating(squad)
    const result = simulate({
      rating: total, difficulty: run.config.difficulty, squad,
      rng: makeRng(run.seed), runSeed: run.seed,
    })
    for (const m of allRunMatches(result)) {
      const tl = buildMatchTimeline(m, players, 'S', 'Team', null, squad)
      for (const e of tl.events) out.push(e)
    }
  }
  return out
}
const EVENTS = collectEvents()
const SEQ_EVENTS = EVENTS.filter((e) => e.seq)

// ---------------------------------------------------------------------------
describe('1. path segmentation', () => {
  it('frame 0 shows no path; touch frames show completed (dim) + one current segment; rest hides all', () => {
    for (const e of SEQ_EVENTS.slice(0, 60)) {
      const plan = buildPlan(e)
      const stops = plan.stops
      expect(pathSegments(stops, 0)).toBeNull()
      for (let f = 1; f < stops.length; f++) {
        const seg = pathSegments(stops, f)
        if (stops[f].kind === 'rest') {
          expect(seg).toBeNull()
          continue
        }
        // current segment is exactly previous stop → this stop
        expect(seg.current).toEqual({
          x1: stops[f - 1].point.x, y1: stops[f - 1].point.y,
          x2: stops[f].point.x, y2: stops[f].point.y,
        })
        // completed points exist only once ≥2 travelled points, and only ever
        // reference stops that have already played (future stays hidden)
        const playedPts = new Set(stops.slice(0, f + 1).map((s) => `${s.point.x},${s.point.y}`))
        if (seg.completed) {
          for (const p of seg.completed.split(' ')) expect(playedPts.has(p)).toBe(true)
          expect(seg.completed.split(' ').length).toBe(f)
        } else {
          expect(f).toBe(1) // only the first moving frame has no travelled path yet
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
describe('2. active-player mapping', () => {
  it('every touch stop carries the touch actor key + name; the outcome stop keeps the finisher', () => {
    for (const e of SEQ_EVENTS.slice(0, 120)) {
      const plan = buildPlan(e)
      e.seq.touches.forEach((t, i) => {
        const stop = plan.stops[i]
        expect(stop.kind).toBe('touch')
        expect(stop.touchIdx).toBe(i)
        expect(stop.actorKey).toBe(t.playerId != null ? `h${t.playerId}` : `a${t.awayNum}`)
        expect(stop.actorName).toBe(t.playerName)
        expect(stop.text).toBe(t.text)
      })
      const last = e.seq.touches[e.seq.touches.length - 1]
      const outcomeStop = plan.stops[plan.outcomeFrame]
      expect(outcomeStop.kind).toBe('outcome')
      expect(outcomeStop.actorKey).toBe(last.playerId != null ? `h${last.playerId}` : `a${last.awayNum}`)
      expect(outcomeStop.actorName).toBe(last.playerName)
    }
  })

  it('no-ball events have no actor keys (no stray labels)', () => {
    for (const e of EVENTS.filter((x) => !x.seq).slice(0, 40)) {
      const plan = buildPlan(e)
      for (const s of plan.stops) expect(s.actorKey).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
describe('3. sequence chain progression', () => {
  it('chain dedupes consecutive touches, advances with touchIdx, and never reveals the outcome', () => {
    for (const e of SEQ_EVENTS.slice(0, 120)) {
      const chain = buildSeqChain(e.seq)
      const touchNames = new Set(e.seq.touches.map((t) => t.playerName))
      expect(chain.length).toBeGreaterThanOrEqual(1)
      expect(chain.length).toBeLessThanOrEqual(e.seq.touches.length)
      // chain items are participant names only — no outcome text leaks
      for (const c of chain) {
        expect(touchNames.has(c.name)).toBe(true)
        expect(['GOAL', 'SAVED', 'WIDE', 'BIG SAVE']).not.toContain(c.name)
      }
      // consecutive same-actor touches are merged
      for (let i = 1; i < chain.length; i++) expect(chain[i].key).not.toBe(chain[i - 1].key)
      // progression is monotone and lands on the last actor at the outcome
      let prev = -1
      for (let t = 0; t < e.seq.touches.length; t++) {
        const pos = chainActiveIndex(chain, t)
        expect(pos).toBeGreaterThanOrEqual(prev)
        prev = pos
      }
      expect(chainActiveIndex(chain, 0)).toBe(0)
      expect(chainActiveIndex(chain, Infinity)).toBe(chain.length - 1)
    }
  })

  it('every sequence pattern has a display label', () => {
    for (const e of SEQ_EVENTS) expect(PATTERN_LABELS[e.seq.pattern]).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
describe('4. spacing helper', () => {
  const cluster = [
    { id: 'a', x: 86, y: 32 }, { id: 'b', x: 86.5, y: 32.2 }, { id: 'c', x: 87, y: 31.8 },
    { id: 'd', x: 50, y: 10 }, { id: 'e', x: 20, y: 50 },
  ]

  it('is deterministic: same input → identical output', () => {
    expect(JSON.stringify(spreadMarkers(cluster))).toBe(JSON.stringify(spreadMarkers(cluster)))
  })

  it('separates clustered markers with bounded displacement; far markers untouched', () => {
    const out = spreadMarkers(cluster)
    // clustered trio gains separation
    const d = (i, j) => Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)
    expect(d(0, 1)).toBeGreaterThan(Math.hypot(0.5, 0.2))
    // displacement stays small and bounded (≤ 2 passes × maxPush + ε)
    cluster.forEach((c, i) => {
      const moved = Math.hypot(out[i].x - c.x, out[i].y - c.y)
      expect(moved).toBeLessThanOrEqual(4.5)
    })
    // far-away markers are untouched
    expect(out[3]).toEqual(cluster[3])
    expect(out[4]).toEqual(cluster[4])
    // pitch bounds respected
    for (const o of out) {
      expect(o.x).toBeGreaterThanOrEqual(2)
      expect(o.x).toBeLessThanOrEqual(98)
      expect(o.y).toBeGreaterThanOrEqual(3)
      expect(o.y).toBeLessThanOrEqual(61)
    }
  })

  it('handles identical positions deterministically', () => {
    const twins = [{ x: 40, y: 30 }, { x: 40, y: 30 }]
    const out1 = spreadMarkers(twins)
    const out2 = spreadMarkers(twins)
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2))
    expect(Math.hypot(out1[0].x - out1[1].x, out1[0].y - out1[1].y)).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
describe('5. outcome banner', () => {
  it('banner content matches the canonical sequence outcome for every type', () => {
    const byOutcome = (t) => SEQ_EVENTS.find((e) => e.seq.outcome.type === t)
    const goal = byOutcome('goal')
    expect(goal).toBeTruthy()
    const gb = outcomeBanner(goal)
    expect(gb.title).toBe('GOAL')
    expect(gb.detail).toContain(goal.seq.outcome.playerName)
    expect(gb.detail).toContain(`${goal.minute}'`)

    const save = byOutcome('save')
    if (save) expect(outcomeBanner(save).title).toBe('BIG SAVE')
    const shotOn = byOutcome('shot_on')
    if (shotOn) {
      const b = outcomeBanner(shotOn)
      expect(b.title).toBe('SAVED')
      expect(b.detail).toBe(shotOn.seq.outcome.playerName)
    }
    const shotOff = byOutcome('shot_off')
    if (shotOff) expect(outcomeBanner(shotOff).title).toBe('WIDE')
    const chance = byOutcome('chance')
    if (chance) {
      const b = outcomeBanner(chance)
      expect(b.title).toBe('CHANCE') // never presented as a shot outcome
      expect(b.sub).toBeTruthy()     // varied non-shot ending (variant label)
      expect(['GOAL', 'SAVED', 'WIDE', 'BIG SAVE']).not.toContain(b.title)
    }
    // at least save-or-shotOn and one non-shot outcome must exist in the pool
    expect(save || shotOn).toBeTruthy()
    expect(chance).toBeTruthy()
  })

  it('no-ball events keep their existing labels in the compact banner', () => {
    const momentum = EVENTS.find((e) => e.type === 'momentum')
    expect(outcomeBanner(momentum).title).toBe('MOMENTUM SHIFT')
    const card = EVENTS.find((e) => e.type === 'card')
    if (card) expect(['YELLOW CARD', 'RED CARD']).toContain(outcomeBanner(card).title)
  })
})

// ---------------------------------------------------------------------------
describe('6. outcome actor in chain (bug 10A regression)', () => {
  it('the sequence chain always ends with the canonical outcome actor', () => {
    for (const e of SEQ_EVENTS) {
      const chain = buildSeqChain(e.seq)
      expect(chain[chain.length - 1].name).toBe(e.seq.outcome.playerName)
    }
  })

  it('two different generic labels never merge into one chain step', () => {
    for (const e of SEQ_EVENTS.filter((x) => x.team === 'away')) {
      const chain = buildSeqChain(e.seq)
      for (let i = 1; i < chain.length; i++) {
        const same = chain[i].key === chain[i - 1].key && chain[i].name === chain[i - 1].name
        expect(same).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
describe('7. label placement (bug 10B)', () => {
  it('is deterministic and keeps labels inside the pitch', () => {
    const reqs = [
      { key: 'a', name: 'their striker', x: 6, y: 5 },       // near top-left corner
      { key: 'b', name: 'Keeper', x: 7, y: 32 },
      { key: 'c', name: 'their playmaker', x: 96, y: 60 },   // near bottom-right corner
    ]
    const p1 = placeLabels(reqs)
    const p2 = placeLabels(reqs)
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2))
    for (const r of reqs) {
      const pos = p1[r.key]
      const half = Math.max(3, r.name.length * 0.68)
      const cx = r.x + pos.dx
      const cy = r.y + pos.dy
      expect(cx - half).toBeGreaterThanOrEqual(0)
      expect(cx + half).toBeLessThanOrEqual(100)
      expect(cy).toBeGreaterThanOrEqual(3)
      expect(cy).toBeLessThanOrEqual(63)
    }
  })

  it('active + keeper at the goal mouth do not overlap (long generic labels)', () => {
    const reqs = [
      { key: 'shooter', name: 'their striker', x: 88, y: 32 },
      { key: 'keeper', name: 'Courtois', x: 93, y: 32 },
    ]
    const p = placeLabels(reqs)
    const box = (r) => {
      const half = Math.max(3, r.name.length * 0.68)
      const cx = r.x + p[r.key].dx
      const cy = r.y + p[r.key].dy
      return { x1: cx - half, x2: cx + half, y1: cy - 2.4, y2: cy + 1 }
    }
    const a = box(reqs[0])
    const b = box(reqs[1])
    const intersect = !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2)
    expect(intersect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('8. FT/rest ball position (bug 10C)', () => {
  it('nudges the ball off markers near the centre spot, deterministically', () => {
    const dots = [{ x: 49, y: 32 }, { x: 53, y: 30 }, { x: 20, y: 10 }]
    const p1 = ftBallPoint(dots)
    const p2 = ftBallPoint(dots)
    expect(p1).toEqual(p2)
    for (const d of dots) expect(Math.hypot(d.x - p1.x, d.y - p1.y)).toBeGreaterThanOrEqual(4.2)
    // stays near the centre spot
    expect(Math.abs(p1.x - 50)).toBeLessThanOrEqual(6)
    expect(Math.abs(p1.y - 32)).toBeLessThanOrEqual(10)
  })

  it('keeps the exact centre when it is clear', () => {
    expect(ftBallPoint([{ x: 10, y: 10 }, { x: 90, y: 50 }])).toEqual({ x: 50, y: 32 })
  })
})
