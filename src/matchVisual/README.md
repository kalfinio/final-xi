# Deterministic match presentation — Phase 2

This module is deliberately not imported by the application. It supports resolved
M1 input only; the current viewer, Daily/legacy, run persistence and gameplay stay
unchanged. There is no renderer, transport loop, bookmark storage, final Match
Plan/opponent profile, or cosmetic between-event football in this phase.

`visual_v2_1` retains the Phase 1 compiler and sampling behavior. Explicitly select
`visual_v2_2` for football choreography. The default version remains `visual_v2_1`;
registering the new compiler does not select it in the current app.

## API

```js
const view = createCanonicalMatchView({
  match, squad, formation, catalogVersion, dbVersion,
  canonicalSignature, // optional; calculated at the existing run boundary
})
const program = compileVisualProgram(view, { visualEngineVersion: 'visual_v2_2' })
const state = sampleVisualProgram(program, 25000)
```

`squad` must be the exact already version-resolved XI. No current-catalogue lookup
occurs here. The adapter clones and freezes presentation-owned data, never the
caller's objects. Unknown participants, unsupported outcomes, inconsistent goals,
shot totals and chronological order fail explicitly instead of being repaired.

## Data contracts

- **CanonicalMatchView**: kind/schema, stable matchKey, engineVersion, optional
  canonicalSignature, seed value/source, formation/catalogue context, copied XI,
  actors, approach/opponent metadata, venue, normalized events and bindings,
  original goals, finalScore/finalStats, result and aggregate penalties.
- **VisualProgram**: kind/schema, visualEngineVersion/visualSeed, match identity,
  durationMs, actors, scenes, revealSchedule, clockTrack, sparse playerTracks and
  ballTracks, initialBall and immutable canonical final values.
- **VisualScene**: stable canonical ID, source index, start/end, canonical origin,
  attacking side/route/requiredOutcome, actor bindings, actions and incoming/
  outgoing ball continuity. All scenes currently originate in canonical events.
- **VisualAction**: ID, kind, actor/receiver, start/end, path and ownership
  before/during/after. V2.2 adds semantic action phases, support/press assignments,
  the canonical final-delivery marker and canonical shooting marker. V2.1 keeps
  its original linear `setup` staging.
- **Sample**: clamped time, active scene/action, player positions, ball ownership,
  exact revealed canonical events/goals, score, event-derived shot totals, clock,
  latest reveal/commentary, FT flag and FT-only result/statistics/penalty summary.
  V2.2 also returns actionProgress, scenePhase, ball height and shadowPosition.

Internal sides are always `us`/`opp`. MatchDetail's `home` statistics become `us`;
they are not swapped for away fixtures. Venue explicitly says which side is home,
away, or unknown. Opponent actors are anonymous positional stand-ins, not a
canonical formation or a newly invented named XI. The source keeperId refers to
the player's keeper; only an opponent attack binds it as the defending keeper.

## Determinism and time

The only external runtime dependency is the existing pure seed utility module.
Visual seeds have a separate `finalxi.visual` namespace. Per-scene, per-action,
per-purpose streams are fresh instances. Rendering and sampling never draw RNG.
No compiler or sampler receives a gameplay RNG or run controller.

Compilation preserves the original event array, including equal-minute order.
Period-aware clock records preserve 45+N before 46 and retain 90+N. This foundation
uses discrete canonical clock labels at reveals, not invented second-level match
timing. All scenes end at their outcome reveal; a final 1,000 ms hold establishes
a positive FT boundary even when the canonical event array is empty.

Sampling uses half-open scene/action intervals and inclusive reveal timestamps.
Score and shots are reduced from revealed canonical events on every call. Seeking
is just sampling a different timestamp: no callback accumulation or mutable
cursor. Negative time clamps to kickoff, overshoot to FT; non-finite time throws.
Samples and programs are deeply immutable. Paths are sparse segments, not frame
arrays. Optimized renderer-facing sampling belongs to a later phase.

The compiler never produces a blocked shot. `cross_blocked` remains a non-shot
failed delivery. Penalties expose only the canonical aggregate summary at FT.

Version selection here chooses an available compiler only. It does not activate
V2 in the app. Future changes to tracks, timing, RNG use or outcome mapping need a
new visual version. Nothing is added to MatchDetail or canonical signatures.

## Football choreography — visual_v2_2

- `formations.js` authors all five formations by canonical ordered slot
  occurrence. Defensive, buildup, settled, attacking and transition anchors use
  attack-relative u/v in 0–100. World x/y uses the same ranges; the opponent is
  rotated 180 degrees. The versioned program declares its coordinate system.
- `zones.js` supplies preferred longitudinal envelopes, lateral lanes, movement
  ranges and support relationships. CDM/CAM aliases affect presentation only.
- `movement.js` combines phase anchors, bounded ball-side shifts, small existing
  role adjustments, support nodes, a nearest presser and a covering defender.
  Nonparticipants stay in preferred lanes. Required canonical actors may make
  exceptional runs; goalkeeper movement remains within u=2–18, v=25–75 in their
  own coordinates. A rare goalkeeper creator supplies the canonical delivery
  from deep rather than being moved into an outfield scoring position.
- Each movement segment uses quintic easing with zero velocity/acceleration at
  its endpoints. Duration is extended so peak normalized speed is at most 10
  units/s and acceleration at most 18 units/s². These are presentation units,
  not a model of player attributes. The bounds apply within scenes; scene cuts
  are explicitly declared, not interpolated as player travel.
- `ballPaths.js` provides deterministic passes, switches, through balls, crosses,
  cutbacks, carries, shots and clearances. Quadratic paths optionally have height
  and a ground shadow. No collision or path sampling chooses an outcome.
- `eventScenes.js` stages distinct canonical routes and begins the finisher's run
  before the final delivery. Supporting touches precede the canonical creator's
  final delivery. Self-created goals have no inserted final assister. Set pieces
  are generic dead-ball restarts with no invented subtype.
- `owned` ball samples use the sampled owner's position exactly. Flights and
  loose balls have explicit sender/receiver or scheduled collector. Passes end
  in deterministic reception; saves end with the correct goalkeeper; misses and
  goals end dead. Goal-line crossing precedes the terminal goal reveal.
- Failed deliveries remain non-shots. Recycling keeps the attacking side in
  possession; interceptions/stopped attacks give control to the defenders;
  clearances have a scheduled safe collector. Keeper claims add no shot save.
  A blocked cross deflects out without creating a blocked shot or a possession
  reception by the blocking defender. Fouls stop play without creating cards.

Each scene has `continuityIn.mode = 'cut'`, with explicit incoming positions and
ball state. Within a scene, action paths and ownership connect continuously.
Different canonical events are separate highlights; there is intentionally no
claim of a continuous inter-scene possession yet. A future renderer must honor
these cuts until the later cosmetic-passage compiler replaces them.

## Validation

The Phase 1 authority suite runs against BOTH versions, including frozen M1
signatures, future outer RNG draws, historical R1 reconstruction, R2 Resume and an
80-match canonical sweep. `football.test.js` tests formations, unit movement,
speed bounds, ownership, routes, failure endings and random-access sampling.
No existing canonical expected signatures or historical fixtures are changed.
