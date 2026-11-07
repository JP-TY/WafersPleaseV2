# Wafers Please — Project Status

> **This file was rewritten on 2026-10-04.** The previous `HANDOFF.md` described a codebase that
> was never committed to this repository. It is preserved verbatim as
> `docs/archive/HANDOFF.unimplemented-design.md` and is retained **as design intent only**.
>
> The port plan and all locked decisions live in **`docs/WEB_PORT_PLAN.md`**. Read that first.

---

## Overview

A 45nm semiconductor inspection training game. Desktop-first with WebXR VR. The player evaluates
wafers, decides Accept / Reject / Rework, performs node-specific mini-procedures, and must meet
salary and competency thresholds to progress.

- **GDD:** `Wafers Please_ MVP Game Design Document (Training-First).md`
- **Port plan:** `docs/WEB_PORT_PLAN.md`
- **Old (unimplemented) design doc:** `docs/archive/HANDOFF.unimplemented-design.md`

## Current state: Unity reference snapshot — port not started (2026-10-04)

Branch `unity-reference` holds a committed snapshot of the Unity project, taken before any port
work. This tree is now **reference-only**: it documents intended behaviour, it is not the shipping
target.

### Actual codebase (verified against disk)

| Path | Files | Lines |
|---|---|---|
| `Assets/Scripts/Config` | 7 | 177 |
| `Assets/Scripts/Core` | 15 | 1,822 |
| `Assets/Scripts/Interaction` | 20 | 3,951 |
| `Assets/Scripts/Systems/*` | 13 | 1,072 |
| `Assets/Scripts/UI` | 1 | 421 |
| `Assets/Editor` | 6 | 617 |
| **Total project C#** | **65** | **8,133** |

- 54 of 59 runtime files import `UnityEngine`; 40 are `MonoBehaviour`
- **Zero** `.asmdef` files — everything compiles into `Assembly-CSharp`
- **Zero** tests exist
- **Only 129 lines across 3 files** are engine-free: `Core/Enums.cs`, `Core/DispositionResult.cs`,
  `Systems/Rework/ReworkState.cs`
- No `Newtonsoft.Json` usage, no serialization code of any kind
- Config is 24 ScriptableObject `.asset` YAML files in `Assets/Config/`, **not** JSON

### Determinism does not exist yet

`UnityEngine.Random` is the gameplay RNG across defect generation, measurement noise, detection
rolls, rework parameters and minigame selection. It is seeded in places by `string.GetHashCode()`,
which is randomized per process and therefore non-reproducible. `InstrumentPanel.cs` also
save/restores the **global** `Random.state` around texture bakes.

A deterministic seeded simulation must be **written**, not ported. This is `packages/sim` in the
new architecture and is the single largest piece of new work.

### Assets

**8 `.glb` files, 56.4 MB** — already glTF 2.0 and directly loadable by any JS engine. Geometry is
trivial (~76k tris total). ~99.9% of the payload is embedded 2048×2048 PNG textures.

Everything else is placeholder: 1 texture, 1 prefab, 5 URP materials, 0 authored audio, and ~450
lines of `GameObject.CreatePrimitive` standing in for geometry.

### ⚠️ Working-tree damage

Third-party **package** binaries in `Assets/Samples/**` and `Assets/VRTemplateAssets/**` have been
reduced to minimal stubs in the working tree (PNGs are 1×1, FBX are 130 bytes). Project-owned assets
are intact and verified. Cause unestablished — see `docs/WEB_PORT_PLAN.md` §7.

**Consequence: opening this project in Unity will likely produce import errors.** Treat the Unity
tree as a behavioural reference, not a working editor project.

## Running the Unity tests

There are none. `HANDOFF.md`'s previous claim of "336 EditMode tests" was fiction; the `Assets/Tests/`
directory and the test framework package do not exist in this repository.

The Unity tree has also never been successfully built here — the `webgl` module is not installed
and no WebGL build configuration exists.

## Architecture — what the port must preserve

**Single governing constraint:** the simulation core must be pure TypeScript with zero engine and
zero DOM imports. The old `PurityScanner` (IL-walking, Mono.Cecil) enforced an equivalent rule and
never existed. CI enforces it now with a grep-level import ban against `packages/sim`.

Dependency direction:

```
sim (pure TS — no Babylon, no DOM, no Node)
 ↑
data (JSON schemas + zod; no engine)
 ↑
apps/web (Babylon.js — owns all rendering and IO)
```

**The two-stage generation pipeline (the most important invariant):**

1. Lot generation → *latent lot*. A pure function of `(seed, day, config)`. **All** draws happen
   here, unconditionally, every wafer.
2. Wafer projection → *effective wafer*. Projection through station state. **Zero draws.** Applies
   the defect mask only under the CMP-brake condition.

Every downstream reader (metrology, disposition evaluator, scoring engine) reads the *effective*
wafer, never the latent entry.

**Critical rules for lot generation:**

- Draw every channel unconditionally, every wafer — including drift rolls for wafers that will not
  use them and for wafers with the safety brake engaged.
- The dishing penalty scales a ladder entry *before* the single draw; it changes the ladder, not
  the draw count.
- The required metrology set derives from the routing step **alone**, never from the defect class.
- Zero-seed substitution: replace 0 with the golden-ratio constant and record an analytics event.

**`SilicideBridging` is the phase-dependent class:** C49 → Rework (inside the etch window),
C54 → Reject (phase-locked, permanent). Phase is revealed only by the electron microscope. A wafer
masked from the STI-void class by the CMP brake still requires ellipsometry — the traveler does not
know the polisher was recalibrated.

## File reference

```
docs/
  WEB_PORT_PLAN.md                          Port plan + all locked decisions  ← START HERE
  archive/HANDOFF.unimplemented-design.md   Previous handoff (design intent only)
  ARCHITECTURE.md  CONTEXT.md  DATA_CONFIG.md  GAME_SYSTEMS.md
  SCENE_HIERARCHY.md  SCRIPT_ARCHITECTURE.md  ASSET_PIPELINE.md
  ROADMAP.md  XR_INTERACTIONS.md

Assets/
  Scripts/          59 files — Config, Core, Interaction, Systems/*, UI
  Editor/            6 files — all UnityEditor-only (CLI, asset generation, scene wiring)
  Config/           24 ScriptableObject .asset files  ← source data for packages/data
  Models/            8 .glb, 56.4 MB                   ← source assets for Phase 1
  Scenes/           GameScene.unity (the only enabled scene)
  Materials/  Prefabs/  Textures/  Settings/  Screenshots/

Packages/manifest.json    25 registry packages (URP 17.5.0, XRI 3.5.0, XR Hands 1.8.0,
                           Input System 1.19.0, glTFast 6.19.0, …)
```