# Deterministic match presentation — Phase 3 internal prototype

The normal application does not import this module. A development-only inspection
page now renders the resolved M1 choreography on Canvas. The current viewer,
Daily/legacy, run persistence and gameplay stay unchanged. Bookmark storage,
final Match Plan/opponent profiles and cosmetic between-event football remain
outside this phase.

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

The compiler/sampler's only external dependency is the existing pure seed utility module.
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
arrays. The sampler now uses binary track lookup and shares already frozen
program records; mutable JSON reconstructions are still copied and frozen.

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
claim of a continuous inter-scene possession yet. The Canvas prototype honors
these cuts until a later cosmetic-passage compiler replaces them.

## Open the internal Canvas viewer locally

Run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`, then open:

**http://localhost:5173/?matchVisual=v2**

If 5173 is occupied, use `--port 5174` and open
**http://127.0.0.1:5174/?matchVisual=v2**. This was the HTTP-verified address
during Phase 3 review; the existing service on 5173 was left untouched.

The `src/main.jsx` lazy import is guarded by `import.meta.env.DEV`. Vite removes
the lab from the production build; the query parameter has no effect there.
Opening `/` or using **Return to app** opens the ordinary Final XI app.

The lab offers four fixed seeds and all five formations. Each example creates
one detached M1 run, resolves its first match using the existing engine, adapts
that resolved match, and compiles `visual_v2_2`. An in-memory cache keyed by
seed/formation survives React StrictMode double renders. It does not read or
write saves. Changing examples cannot affect an actual run. Playback and replay
never resolve a match or compile a program.

The initial screen is paused. Choose **Play**, **Pause**, **1x**, **2x** or **4x**.
**Next Highlight** seeks to the next canonical scene start (and is disabled on
the last scene). **Full Time** seeks to duration exactly. **Replay** returns to
zero and stays paused, retaining the chosen speed. During playback, Next
Highlight retains the playing state. Backward seeking is also available on the
controller API and is covered by tests.

## Canvas and transport contracts

`MatchPitchCanvas` mounts the imperative `render/mountPitch` lifecycle. One
`playback/controller` owns the presentation cursor. A RAF callback advances by
elapsed RAF time multiplied by speed, samples once, and draws immediately.
React receives only changed broadcast/control data, never actor coordinates.
The first RAF after Play, seeking, visibility return or speed change establishes
a fresh timestamp baseline; no paused/hidden interval is caught up.

Pause cancels scheduled RAF work. Hidden tabs suspend RAF while retaining play
intent; visibility return resumes from the same cursor. Generation tokens reject
stale callbacks after cancellation, seeking or disposal. Unmount cancels RAF and
removes the visibility listener and ResizeObserver. No CSS animates football.

The canvas projects world x/y 0–100 into a fixed full-pitch view. Width, height
and device pixel ratio affect pixels only; DPR is capped at 2. Resize redraws
the last sample without sampling or compilation. Circles/squares distinguish
teams, diamonds identify goalkeepers, and selective labels expose current
carriers/shooters or inspected actors. Scorer/assister attribution appears only
after its reveal. Airborne balls use the sampled path and cosmetic height.

DOM score, minute/stoppage label, canonical commentary and the recent event feed
all derive from the same sampled cursor. Action lines describe current movement
without exposing unrevealed outcomes. No independently accumulated score exists.

Controls have at least 44px touch targets; markers have a minimum 13px diameter.
Keyboard actor selection supplements Canvas hover/tap. Score and commentary have
accessible status text. Playback starts paused for everyone; enabling reduced
motion also pauses existing playback. Explicit Play remains available.

**Inspection notes → Measure playback work** reports accumulated sampling and
drawing work on demand. It does not introduce another timer or animation loop.
Actual browser/mobile visual review is still needed when browser access exists;
projection and mock-host lifecycle tests cannot establish pixel-level usability.

## Validation

The Phase 1 authority suite runs against BOTH versions, including frozen M1
signatures, future outer RNG draws, historical R1 reconstruction, R2 Resume and an
80-match canonical sweep. `football.test.js` tests formations, unit movement,
speed bounds, ownership, routes, failure endings and random-access sampling.
No existing canonical expected signatures or historical fixtures are changed.

Phase 3 adds playback-speed, pause/visibility, stale-RAF, seeking/replay,
pre-reveal wording/attribution, projection, imperative mount cleanup and dev-entry
tests. The authority checks also exercise playback operations against both visual
versions and compare future gameplay RNG draws and resolved matches.

The continuation review passed 506 tests and all three deterministic gates:
legacy `76273921`, M1 calibration `304571c4`, M1 plan audit `51550751`.
The production build contained no internal viewer or visual_v2_2 code.
Browser tooling had no connection, so no actual browser screenshots, console or
mobile interaction checks were possible. HTTP entry/module transforms passed.
A Node-only benchmark of 20,000 samples across the four default-formation demos
averaged 0.040–0.045 ms per sample (p95 below 0.060 ms); this is not a Canvas FPS
measurement. Demo programs serialized to approximately 0.66–0.86 MB each.
