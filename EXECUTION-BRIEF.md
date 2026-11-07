# Wafers Please — Execution Brief

**Purpose:** take Wafers Please from "simulator that works" to "game that is good and playable".
**Audience:** an autonomous coding agent working in this repository.
**Authority:** `Wafers Please_ MVP Game Design Document (Training-First).md` is the source of truth. Where this brief and the GDD disagree, the GDD wins and this brief is wrong.

---

## 0. How to use this document

You are continuing work on an existing, partially-complete game. Roughly 70% of the
simulation and campaign is done and well tested. Your job is **not** to rewrite it.

Read §2 (constraints) and §4 (traps) before touching anything. §4 is the most
important section in this document: every trap listed there was found the hard way,
in this repository, after a wrong hypothesis looked correct.

Work the milestones in §8 in order. Within a milestone, workstreams may run in
parallel under the file-ownership rules in §6.

---

## 1. Role and mission

You are the gameplay and presentation engineer on *Wafers Please*, a training-first
game about semiconductor wafer disposition. A player works a three-day technician
training shift: they inspect wafers with real metrology instruments, read a rule
matrix, and stamp Accept / Reject / Rework, then learn from the consequences.

**Your mission:** make one shift — Day 1 — into a genuinely good ten-minute
experience that a player can complete, understand, and remember. Then extend to
Days 2 and 3.

**Definition of "good"**, in priority order:

1. **Understandable.** When a player makes a wrong call, they learn *why* within
   seconds. Today they lose salary silently and learn nothing.
2. **Playable end to end.** A player can complete a shift using only the diegetic
   3D world — no DOM fallbacks, no dead props, nothing occluded.
3. **Alive.** Sound and motion carry weight. Today there is no audio whatsoever.
4. **Rewarding.** The rework minigames (§8 of the GDD) are the most interesting
   content in the game and the least finished.

---

## 2. Hard constraints — never violate these

### 2.1 The simulation is the only source of truth

GDD §16 requires: *"identical procedural lot seeds generate identical performance
scores."* This is the one non-negotiable guarantee in the project.

- `packages/sim` decides every verdict, score, penalty, defect and gate.
- Anything in `apps/web/src/physics/` or `apps/web/src/player/` is **presentation
  only** and must never be read when computing an outcome.
- Player intent may flow one way: hand position → simulation action → outcome.
  Never the reverse.
- The sanctioned route is `IntentChannel` in `apps/web/src/physics/boundary.ts`,
  which carries player *choices* ("take it to SC-1"), never measured physical
  quantities.
- There is a runtime guard: simulations are tagged via `authoritative()`, and
  `assertReadOnly()` throws if presentation code is handed one. **Do not remove or
  weaken this guard.** If you find yourself wanting to read simulation state from
  a physics or camera callback, the design is wrong — redesign it.

### 2.2 Stack is fixed

Babylon.js `9.29.0`, Vite, TypeScript strict, Vitest, pnpm workspace.

- **Babylon must use deep imports.** `import { X } from '@babylonjs/core/...'`.
  Barrel imports from `@babylonjs/core` will break the production build.
- Picking requires `import '@babylonjs/core/Culling/ray.js'`.
- glTF loading requires `@babylonjs/loaders/glTF/2.0/index.js`.
- **Do not add runtime dependencies** without explicit approval. In particular do
  not add a physics engine — see §4.15.

### 2.3 Binary assets

The repository deliberately does not carry binary assets. `Assets/Samples/**` and
`Assets/VRTemplateAssets/**` are Git LFS pointer stubs and must not be staged.

**Consequence:** synthesise audio at runtime with the Web Audio API. Do not commit
`.wav`/`.mp3`/`.glb` files. See §6.1.

### 2.4 Test discipline

- Every behaviour change needs a test that fails without the change.
- A test that asserts a *rendered* result must assert on scene state (world
  coordinates, raycasts, mesh identity) — never on pixels or screenshots. See §4.13.
- The suite must stay green and the production build must stay clean at every
  commit boundary.

Current baseline: **404 tests passing** (254 sim, 35 data, 115 web), typecheck
clean, `vite build` clean.

```bash
# from webport/
cd packages/sim && ./node_modules/.bin/vitest run
cd packages/data && ./node_modules/.bin/vitest run
cd apps/web   && ./node_modules/.bin/vitest run
cd apps/web   && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build
```

---

## 3. Ground truth: the measured current state

Every number here was measured against the running game or the real data files, not
inferred. Re-verify anything load-bearing before acting on it.

### 3.1 What is solid — do not touch

- Deterministic simulation: lot generation, disposition, penalty ladder, dual
  scoring gate, competency metrics, debrief.
- Metrology: five instruments report GDD measurands; tools are physically blind to
  defects they cannot see; readings are deterministic and reproducible.
- Campaign: three days, seed mixing, boost carry-over, certification gate.
- Diegetic UI: lit paper, physical controls, printed notices, instrument housings.
- GDD §12 scaffolding: context callouts that fire on measurement.
- The physics layer (`src/physics/`): fixed-timestep, deterministic, presentation
  only, well tested.
- Playability guards in `apps/web/test/playability.test.ts`.

### 3.2 Measured gaps, in priority order

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **Teaching content is authored and never shown.** Every defect has authored `ruleText` in `packages/data/config/rule-matrices.json` — e.g. *"Irreversible structural deformation: REJECT"*. The string `ruleText` appears in **zero** source files. | `grep -rn ruleText packages/sim/src apps/web/src` → no hits |
| 2 | **No audio anywhere in the game.** No stamp, no slosh, no beep, no UI click. | `grep -rl "AudioContext\|createOscillator" apps/web/src packages/*/src` → no hits |
| 3 | **Rework benches are inconsistent and unfinished.** RCA and silicide are 3D; CMP is still a 2D panel. RCA/silicide tanks render as dark crescents rather than open baths of coloured chemistry. | `apps/web/src/main.ts` imports `RcaBench3D`, `SilicideBench3D`, `CmpBench` |
| 4 | **Rework reachability is broken by content.** Day 2 produces **zero** reworkable wafers across 60 sampled seeds. Day 1 has one in only 41/60 lots (68%) — so ~1 in 3 players finishes Day 1 without ever seeing the RCA bench they were meant to learn. Day 3 is 60/60. | `packages/sim` generation sampled over seeds 1–60; 18.2% of all wafers are reworkable |
| 5 | **Rework sims ignore authored recipes.** Only RCA consumes a `Recipe`. Silicide and CMP read hardcoded `PROCESS` constants, so the authored rework config in `packages/data/scripts/authored-rework.mjs` does nothing for them. | `src/rework/silicide-etch.ts`, `src/rework/cmp-endpoint.ts` |
| 6 | **A wrong stamp produces no explanation.** The traveler takes the stamp imprint, salary drops, and the player is never told which defect they missed or which rule applied. | `commitStamp()` in `shift-session.ts` |
| 7 | **WebXR is 0% implemented.** Only comments and a post-processing hook. | `grep -rn "createDefaultXRExperience\|navigator.xr" apps/web/src` → no hits |
| 8 | **No onboarding.** A first-time player is given a bench, five instruments and three stamps with no instruction. | no onboarding/tutorial module exists |
| 9 | **Operator silhouette is crude.** The hood reads as a large sphere on a box body; legs crop at default framing. | `src/player/operator.ts` |

### 3.3 A note on what "unplayable" has meant here

Twice this session the game looked complete and tested while being unplayable. Both
times the cause was invisible to unit tests and to code review. The errors were
fixed in `9a6c4a1`-era commits; the guards now live in
`apps/web/test/playability.test.ts`. **Read that file before changing anything
spatial or interactive.** It encodes the failure modes, not just the assertions.

---

## 4. Traps — verified failure modes in this codebase

Each of these cost real time. Each is a latent trap still present in the code.

### 4.1 Three things fight over the camera target

`frameWorkspace()` (on every phase change), `frameStation()` (when a rework bench
opens) and `FollowCamera` (every frame) all want to set `camera.target`.

If they run in the wrong order the camera silently snaps back. This produced a
stretch of work where *nothing* appeared to change, because every bench framing was
being reverted one tick later.

**Rule:** ownership must be explicit. While a bench owns the screen, the follow
camera is suspended. While a reading phase owns the screen, the follow camera is
suspended. Otherwise the follow camera is authoritative and `resync()` seeds it
from whatever ran before. Never add a fourth writer without extending this.

### 4.2 Station visibility is decided in two places

`setStationVisible()` hides the inspection station; `applyPhaseVisibility()` runs on
every phase change and re-shows it. A bench that hid the station therefore had its
station's metrology rack reappear *in front of it* one tick later.

**Rule:** one decision, one place. `stationSuppressed` is the flag; everything
respects it.

### 4.3 A Light added to a Scene is not in the transform graph

`new SpotLight(name, position, ...)` interprets `position` as **world space**. Bench
task lamps authored with local-looking coordinates ended up 1.4 m below the bench,
lighting nothing. Raising intensity from 7 to 14 changed nothing at all.

**Rule:** `light.parent = <node>` and then use local coordinates. Always verify a
light's `getAbsolutePosition()`.

### 4.4 Camera radius is silently clamped

`frameWorkspace` sets `camera.lowerRadiusLimit = 0.8`. Babylon clamps an assigned
radius into `[lower, upper]`, so every attempt to move closer than 0.8 m was
reverted and the framing you reasoned about was never the framing rendered.

**Rule:** set limits *before* radius, in the same function. `frameStation()` in
`src/scene/physical.ts` is the correct reference implementation.

### 4.5 `pickWithRay` needs a real `Ray`

Passing a duck-typed `{ origin, direction, length }` object returns plausible,
meaningless results. This produced a fabricated "everything is occluded" diagnosis
that sent me chasing a non-existent bug.

**Rule:** `import { Ray } from '@babylonjs/core/Culling/ray.js'` and construct it
properly. When in doubt, verify with a **real click** and read `pickInfo.pickedMesh`.

### 4.6 `boundingBox.maximumWorld` can be stale

It is only as fresh as the last world-matrix update. On a `NullEngine` with no
render loop that is construction time, so it returns local-space numbers. This
produced assertions that read plausibly and meant nothing (`0.2225` where `1.61` was
correct).

**Rule:** call `mesh.computeWorldMatrix(true)` and `mesh.refreshBoundingInfo()`
before reading world bounds. See `worldBounds()` in
`apps/web/test/playability.test.ts`.

### 4.7 Occlusion silently makes a button unclickable

The traveler clipboard stood on an easel and physically covered the **Stylus
Profilometer** screen — the first instrument Day 1 requires. Four of five screens
were clickable; that one was not, and nothing indicated why.

**Rule:** any interactive element must be reachable by raycast from the working
camera. This is asserted in `playability.test.ts`. When you add geometry, re-check
every interactive element — especially anything large you add near the camera.

### 4.8 A callback defaulted to a no-op is invisible

`ClusterView.onRun` was declared `onRun: (tool: ToolType) => void = () => {}` and
**never assigned**. Every instrument in the rack was a dead prop. The game was
"playable" only via a DOM chip row. 399 tests passed throughout.

Two more in the same class: `setRunning` and `releaseRunKeys` were never called, so
lamps never lit and keys never travelled.

**Rule:** when you add a callback, wire it and prove it. Sweep for new no-op
defaults:

```bash
grep -rn "= () => {}" apps/web/src --include=*.ts
```

Every result must have an assignment somewhere.

### 4.9 `Math.pow(1 - d, dt)` is NaN when `d > 1`

Damping written as a "rate" silently produced `NaN` for every heavily damped body,
because a fractional power of a negative base is `NaN`.

**Rule:** damping is a retention per second, clamped to `[0, 1]`. See `retain()` in
`src/physics/rigid.ts`.

### 4.10 Babylon is left-handed

Facing `+Z` with `+Y` up, **screen-right is `+X`**. Deriving a right-vector the
intuitive right-handed way inverts it, and `D` walks the player left. This was
caught by a screenshot, not by a test.

**Rule:** `apps/web/src/player/input.ts` is the tested reference. Add a test for any
new direction maths.

### 4.11 `mountBench` assumes the bench *is* the instrument

It places the screen at `(0, BENCH_Y, 0)` and adds its own bench top. On a
purpose-built wet bench this puts the screen *inside* the deck box (invisible) and
z-fights a duplicate bench top.

**Rule:** use `placeInstrument()` from `src/ui/bench.ts`, which re-seats the screen
and disables the redundant bench.

### 4.12 Child offsets stack on group offsets

A column parented to a moving group, with an absolute height baked in, ended up
standing a metre above the bench. A fork arm with an absolute deck height, under a
group that already carried the lift, sat at 2.24 m instead of 1.8 m.

**Rule:** a parent that carries a position must have children authored as *offsets
from that parent*, not absolute coordinates.

### 4.13 Screenshots lie about occlusion and framing

Both were wrong simultaneously at several points: a screenshot showed the room
camera while I believed I had framed a bench (§4.4), and a screenshot showed
"crescents" that were in fact the liquid surfaces.

**Rule:** measure, then look. Prefer, in order: world-coordinate assertions,
raycasts, framebuffer luminance sampling, and only then screenshots.

### 4.14 Bounding-box "centre" is not where a click lands

Projecting `boundingBox.centerWorld` gives a plausible click target for a flat
screen but can be badly wrong for a curved or rotated mesh. Prefer projecting a
known local point, or better, test occlusion by raycast and test hits by clicking.

### 4.15 Do not add a physics engine

`@babylonjs/havok` was installed and removed. Havok steps on a **variable**
timestep, so it is frame-rate coupled by construction; using it would mean either
breaking §2.1 or hand-rolling a fixed-step accumulator over it anyway — at which
point you have built the thing yourself and paid 2 MB of WASM, async
initialisation and `NullEngine` breakage for the privilege.

The existing solver is ~250 lines, deterministic for free, and testable without a
GPU. Extend it instead.

---

## 5. Verification protocol

Unit tests are necessary and were not sufficient — the two worst bugs this session
passed 399 tests each. **A milestone is not done until a scripted playthrough
exercises it.**

### 5.1 The playthrough harness

Drive the real game in a browser with real clicks on real meshes. Do not call
session methods directly; that bypasses the bug class in §4.8.

```ts
// project a mesh's centre to CSS pixels using the engine's own matrices
const project = (name: string) => {
  const s = window.__WP.scene, eng = s.getEngine();
  const cnv = eng.getRenderingCanvas();
  const m = s.getMeshByName(name);
  const c = m.getBoundingInfo().boundingBox.centerWorld;
  const tm = s.getTransformMatrix();
  const w = tm.m[3]*c.x + tm.m[7]*c.y + tm.m[11]*c.z + tm.m[15];
  const x = (tm.m[0]*c.x + tm.m[4]*c.y + tm.m[8]*c.z + tm.m[12]) / w;
  const y = (tm.m[1]*c.x + tm.m[5]*c.y + tm.m[9]*c.z + tm.m[13]) / w;
  const W = eng.getRenderWidth(), H = eng.getRenderHeight();
  return {
    x: Math.round(((x * 0.5 + 0.5) * W) * cnv.clientWidth / W),
    y: Math.round(((-y * 0.5 + 0.5) * H) * cnv.clientHeight / H),
  };
};
const hitAt = (x: number, y: number) => { /* read pickInfo.pickedMesh.name */ };
```

### 5.2 Definition of a playable shift

A shift passes only if all of these hold, verified by real clicks:

1. Begin Shift is pressable.
2. Every instrument on the day's roster is clickable and produces a reading.
3. All three stamps are clickable and advance or route the wafer.
4. A `Break` phase offers a working resume control.
5. The shift reaches `Review` and then `EndOfDay` without a dead end.
6. At least one wafer routes to a rework bench, and that bench can be completed.
7. The debrief communicates what happened and why.

Any of these failing means the shift is not playable, regardless of test count.

### 5.3 Regression guards

Keep `apps/web/test/playability.test.ts` green. When adding geometry, it will catch
§4.7 for you.

---

## 6. Workstreams

Four lanes, designed to run **in parallel**. Collisions on shared files are the main
risk of parallel work in this repo, so ownership is explicit and total.

### 6.0 File ownership

| Lane | Owns exclusively | Must not edit |
|------|------------------|---------------|
| **A — Audio & Feel** | `apps/web/src/audio/**`, `apps/web/test/audio.test.ts` | everything else, except ≤5 lines in `main.ts` |
| **B — Teaching Clarity** | `apps/web/src/inspection/feedback/**`, `apps/web/test/feedback.test.ts`, `packages/sim/src/assessment/**`, `apps/web/src/inspection/shift-session.ts` | `src/rework/**`, `src/scene/**`, `src/physics/**` |
| **C — Rework Benches** | `apps/web/src/rework/**`, `apps/web/src/scene/physical.ts`, `apps/web/src/scene/lighting.ts`, `apps/web/test/rework-*.test.ts` | `main.ts`, `shift-session.ts`, `packages/**` |
| **D — Content & Pacing** | `packages/data/config/*.json`, `packages/data/scripts/**`, `packages/sim/src/generation/**`, `packages/sim/test/**` | all of `apps/web/**` |

**`apps/web/src/main.ts` has exactly one owner: the integrator.** Lanes A and B
deliver a self-contained module plus tests; wiring them in is a single final commit.
Lanes C and D require no `main.ts` changes.

If you must change a file you do not own, stop and say so. Do not silently widen
your lane.

---

### 6.1 Lane A — Audio & Feel

**Problem:** the game is completely silent. It reads as dead.

**Constraint (§2.3):** synthesise everything at runtime with the Web Audio API. No
committed audio files.

Deliver a small module, e.g. `apps/web/src/audio/`:

- `installAudio(scene, session)` — one call, lazily creates the `AudioContext` on
  first user gesture (browsers require this; do not create it at module load).
- Stamp press: a short filtered-noise transient with a pitched thump. This is the
  single most important sound in the game — it is the player's confirmation that
  an irreversible decision was committed.
- Bath ambience while immersed: filtered noise with slow LFO, gain tied to
  agitation. Pull from the existing physics layer's read-only slosh magnitude.
- Instrument RUN: a short confirmation tone, pitch per instrument.
- UI: click, stamp cooldown tick, phase transition stings (briefing, rework
  opened, rework resolved, pass/fail).
- Rework resolution: distinct success and failure cues — §8 makes failure
  destructive, so it must be unmistakable.
- A single `setMuted(boolean)` and respect `prefers-reduced-motion`-style
  accessibility for anything flashing.

**Tests:** assert that calling each cue after `installAudio` in a `NullEngine`
context does not throw, and that the graph is created lazily (no `AudioContext`
before a gesture). Do not assert on actual samples.

**Acceptance:** a player can complete a shift with sound on and can identify every
action by ear alone.

---

### 6.2 Lane B — Teaching Clarity

**The single highest-value item in this brief.** The content already exists.

`packages/data/config/rule-matrices.json` authors a `ruleText` for every defect:

> "Bow/warp beyond flatness spec pushes the surface outside high-NA depth-of-focus.
> Irreversible structural deformation: REJECT."

That string is in **zero** source files. Wire it.

Deliver:

1. **Structured stamp feedback from the sim.** Extend the sim's stamp result with
   something like `StampFeedback { correctAction, missedDefect?, ruleText?,
   penaltyApplied, reasoning }`. It must be derived from sim state only — never
   from presentation (§2.1).
2. **Immediate feedback at the moment of the wrong call.** A physical, diegetic
   surface: the traveler sheet takes the imprint *and* the missed defect is named on
   it, or a fault light on the rack lights. Not a modal, not a DOM toast.
3. **A debrief that teaches.** GDD §11 assessment is the point of the product. The
   debrief should show, per defect class: what it was, the rule, the right call,
   what the player did, and the cost.
4. **GDD §12 scaffolding extension.** Callouts currently fire on measurement, which
   is right. Add post-stamp callouts that fade out by Day 3.

**Tests:** that the sim returns the authored `ruleText` verbatim for a known defect;
that a wrong stamp produces feedback and a correct stamp does not; that feedback is
identical for identical seeded runs.

**Acceptance:** a player who stamps wrong can name the defect they missed and the
rule they broke, without reading help text.

---

### 6.3 Lane C — Rework Benches

Three problems: CMP is 2D while the others are 3D; the tanks render as dark
crescents; and the silicide and CMP sims ignore their authored recipes.

1. **Finish the RCA and silicide visuals.** The specific known defect is
   *materials, not geometry* — liquid geometry is verified correct and correctly
   placed by bounding box. The tank walls need to be visibly transparent quartz, not
   opaque PBR. Dark crescents in the render are the tank interiors, not the liquid.
2. **Build CMP to parity.** It is the third §8 minigame and currently a flat panel
   beside two 3D benches.
3. **Wire recipes.** Only RCA consumes a `Recipe`; silicide and CMP read hardcoded
   `PROCESS` constants, so authored rework config is dead for two thirds of the
   feature. Make all three consume `Recipe`, with the authored config as the source
   of truth, and keep the exported verdict helpers
   (`rcaRemovalFraction`, `rcaExposure`, `rcaSubstrateDamage`) as the single
   source for anything drawn *and* anything graded.

**Rule:** the picture and the verdict must come from the same function. If a curve
is drawn from `rcaRemovalFraction`, the grade must be too — otherwise a player can
read one and be graded on another.

**Tests:** recipe plumbing (silicide and CMP receive and use their recipe);
for each bench, every §8 failure mode is reachable and visually distinguishable;
occlusion raycasts for all interactive bench controls.

**Acceptance:** a player can complete all three minigames using only the 3D scene,
and can fail each in each of its specified ways.

---

### 6.4 Lane D — Content & Pacing

**No `apps/web` changes at all** — this lane is independent and can finish first.

1. **Guarantee at least one reworkable wafer per shift.** Measured: Day 1 has one in
   only 41/60 lots and Day 2 in 0/60. Roughly one in three players finishes Day 1
   without meeting the RCA bench the day is meant to teach. Make generation
   guarantee it, and tune difficulty through severity rather than through whether
   the content appears at all.
2. **Fix Day 2.** Zero reworkable wafers across all sampled seeds is a content
   defect, not a difficulty choice. Day 2 should introduce a defect class that
   routes somewhere new.
3. **Add a seeded content regression test.** Sample N seeds per day and assert the
   rework guarantee holds. This is cheap and prevents silent drift.
4. **Balance pass against the GDD §10 economy.** Correct play should clear the gate;
   reckless play should fail visibly.

**Tests:** the sampled-seed guarantee; per-day defect-class coverage; a
known-seed golden test for dispositions.

**Acceptance:** across 60 seeds per day, every day contains at least one wafer of
every defect class that day's matrix can route.

---

## 7. Merge order

1. **Lane D** — independent, no `apps/web` changes, unblocks rework reachability.
2. **Lane B** — highest value, self-contained.
3. **Lane A** — self-contained.
4. **Lane C** — largest and riskiest; touches the most geometry.
5. **Integration** — one owner wires A and B into `main.ts` in a single commit.

Merge only with: full suite green, typecheck clean, production build clean, and the
§5.2 playthrough passing for whatever the lane touched.

---

## 8. Milestones

### M0 — Baseline and guard rails *(do first, small)*
Record the §3 measurements as tests where they are not already covered. Confirm the
suite and build are green before any feature work. Do not skip this; the value of
this brief is entirely in the measurements being real.

### M1 — Day 1 teaches *(Lane B)*
Stamp feedback + debrief + post-stamp callouts. **Gate:** a player who makes a wrong
call can say what the rule was.

### M2 — Day 1 feels alive *(Lane A)*
Full audio pass. **Gate:** a shift is completable and legible with eyes on the
instruments only.

### M3 — Day 1 has its rework *(Lane D + Lane C)*
Guarantee one rework per shift; finish the RCA bench; verify the player can complete
it and fail it in each §8A way. **Gate:** every Day 1 run reaches the RCA bench and
it is good to play.

### M4 — Day 1 end-to-end playtest *(integrator)*
Run §5.2 against several seeds, including one with rework and one without. Fix what
breaks. **This is the milestone that decides whether the game is good.**

### M5 — Days 2 and 3 *(all lanes)*
Only after M4 passes. Fix Day 2's content defect, bring Days 2–3 to Day 1's
standard, add the remaining tool rosters.

### M6 — WebXR *(explicitly last, and optional)*
Currently 0% implemented. GDD §4 lists VR as optional. **Do not start this until M4
passes.** If time is short, ship without it and say so explicitly rather than
shipping a broken VR mode.

---

## 9. Definition of done

A milestone is done when all of the following are true:

- [ ] Every behaviour change has a test that fails without it.
- [ ] Full suite green (currently 404 + new tests), typecheck clean, build clean.
- [ ] The §5.2 playthrough passes for the affected area, using real clicks on meshes.
- [ ] `playability.test.ts` still passes — especially the occlusion raycasts.
- [ ] Nothing new reads simulation state from `src/physics/` or `src/player/`.
- [ ] No new no-op callbacks left unwired (§4.8).
- [ ] No new binary assets committed (§2.3).
- [ ] The §3 table in this brief is updated with new measurements.
- [ ] Any trap you discovered is written down in §4 before you fix it.

That last item matters more than it looks. The most expensive problem in this project
was not any single bug — it was that the same class of bug kept recurring because
nobody had written down why the last one was so hard to find.

---

## 10. Out of scope

Do not do these unless explicitly asked:

- Rewriting `packages/sim`. It is correct and well tested.
- Replacing Babylon, or adding a physics engine (§4.15).
- A new art direction or renderer. The low-poly cleanroom look is deliberate.
- More rooms, a fab floor, or a walkable factory. §15 scopes this to a training bay,
  and it is a bay, not a level.
- WebXR before M4 (§8, M6).
- Touching the Unity reference project in `Assets/`.

---

## 11. If you are stuck

Report the specific thing that is true, not a theory of what is wrong. The pattern
that has cost the most time in this project is proposing a fix for a guessed cause
and then iterating on the guess.

Before proposing any fix:

1. Measure it (§5, §3).
2. Name the file and line.
3. State what evidence would distinguish your hypothesis from the alternative.

A correct diagnosis delivered slowly beats a fast wrong one. Twice this session a
confident wrong diagnosis was chased for several iterations because nobody measured
first — and in both cases the real bug was somewhere entirely different and had been
findable in one query.