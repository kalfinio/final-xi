# Match visual foundation — visual_v2_1

This module is deliberately not imported by the application. It supports resolved
M1 input only; the current viewer, Daily/legacy, run persistence and gameplay stay
unchanged. There is no renderer, transport loop, bookmark storage, tactical
choreography or cosmetic between-event football in this phase.

## API

```js
const view = createCanonicalMatchView({
  match, squad, formation, catalogVersion, dbVersion,
  canonicalSignature, // optional; calculated at the existing run boundary
})
const program = compileVisualProgram(view, { visualEngineVersion: 'visual_v2_1' })
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
- **VisualAction**: ID, kind, actor/receiver, start/end, linear path and ownership
  before/after. `setup` is placeholder staging, not a claim of a canonical pass.
- **Sample**: clamped time, active scene/action, player positions, ball ownership,
  exact revealed canonical events/goals, score, event-derived shot totals, clock,
  latest reveal/commentary, FT flag and FT-only result/statistics/penalty summary.

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
arrays. Formation-aware movement and optimized renderer-facing sampling belong
to later phases.

The compiler never produces a blocked shot. `cross_blocked` remains a non-shot
failed delivery. Penalties expose only the canonical aggregate summary at FT.

Version selection here chooses an available compiler only. It does not activate
V2 in the app. Future changes to tracks, timing, RNG use or outcome mapping need a
new visual version. Nothing is added to MatchDetail or canonical signatures.
