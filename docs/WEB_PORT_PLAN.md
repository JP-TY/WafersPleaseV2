# Port Plan: Unity → Babylon.js 9 / WebXR

**Date:** 2026-10-04
**Branch:** `unity-reference` (this snapshot) → port branches cut from `unity-reference/v0`
**Status:** decisions locked, implementation not started

## 0. The premise correction

The port was originally scoped as "lift the engine-agnostic pure core, rewrite the presentation
shell" — the standard strategy when a Unity project has a clean `Simulation`/`Data`/`Presentation`
split.

**That split does not exist here.** `docs/archive/HANDOFF.unimplemented-design.md` describes a
mature, tested, purity-enforced codebase that was never committed to this repository.

This is therefore a **greenfield TypeScript rewrite with a Unity reference implementation**, not a
code port. Effort should be budgeted accordingly.

### Verified starting state

| Claim in old handoff | Reality on disk |
|---|---|
| `Assets/Scripts/Simulation/` pure core | Does not exist |
| `Assets/Tests/` — 336 passing tests | Does not exist. Zero tests |
| `PurityScanner.cs`, `Cli.cs` | Do not exist |
| 6 `.asmdef` assemblies | Zero. All code in `Assembly-CSharp` |
| `Assets/Configuration/*.json` | Absent. Config is ScriptableObject YAML in `Assets/Config/` |
| CsCheck 2.14.1 | Not installed |

- **65 C# files, 8,133 lines** (`Assets/Scripts` 59 files / 6,558 lines; `Assets/Editor` 6 / 617)
- 54 of 59 runtime files import `UnityEngine`; 40 are `MonoBehaviour`
- Aggregate coupling: 249 `Color`, 234 `GetComponent`/`AddComponent` family, 17 coroutines
- **Only 129 lines across 3 files** are engine-free: `Core/Enums.cs`, `Core/DispositionResult.cs`,
  `Systems/Rework/ReworkState.cs`

### What ports cleanly

- **Zero** `ulong`/`uint`/`long`/`BitConverter`/`Span<T>`/bit-packing → **no 64-bit precision
  minefield.** TS `number` (float64) is a superset of the `float` logic that exists.
- **Zero** serialization code and zero `Newtonsoft.Json` usage. The data layer is ScriptableObject
  YAML, so there is no serializer to replicate.
- `IInputAdapter.cs` (18 lines, 8 read-only properties) is the one genuinely good abstraction
  seam, and it already has two backends. Scale this pattern rather than fixing it.

### What must be created, not ported

- **Determinism.** `UnityEngine.Random` is the gameplay RNG, seeded in places by
  `string.GetHashCode()` — non-reproducible across processes. `InstrumentPanel.cs` additionally
  saves/restores the *global* `Random.state` around texture bakes (reentrancy hazard).
- **Tests.** Property tests P1–P33 described in the old handoff never existed.
- **A purity enforcement mechanism** to replace the lost `PurityScanner`.

## 1. Assets: the strongest and weakest hand

**8 `.glb` files, 56.4 MB total — already glTF 2.0, natively loadable by any JS engine.**
Geometry is trivial: 9k–14k verts and ~9k–10k tris per prop, ~76k tris total.
`DefaultImporter` metas with no Unity import settings to lose.

**~99.9% of the payload is embedded 2048×2048 PNG textures** (2 per file, 2.5–5.3 MB each, RGB).
Recompression is a **20–50× win** and the highest-leverage task in the migration.

Everything else is placeholder: 1 texture, 1 prefab, 5 URP materials, 0 authored audio,
~450 lines of `GameObject.CreatePrimitive` standing in for geometry.

### Working-tree damage (observed 2026-10-04)

Third-party **package** binaries have been reduced to minimal stubs in the working tree:

- `Assets/Samples/**` (Unity XRI 3.4.1 + XR Hands 1.7.3 samples) — PNGs are 1×1, FBX 130 B
- `Assets/VRTemplateAssets/**` (Unity VR template) — same
- `Assets/Scenes/SampleScene/**` lightmaps, TextMesh Pro fonts, some URP settings

**Project-owned assets are intact** — `Assets/Models/*.glb` verified full-size with valid
`glTF` magic (`676c5446`). Cause not established; noted as an open item. All of this content is
third-party and unused by the web port, so it is deliberately **excluded from the Phase 0 commit**
rather than committed in stubbed form.

## 2. Critical platform constraint

**WebGPU-in-WebXR is experimental.** Meta Browser 146.0 release notes (Apr 2026): *"Experimental
WebGPU Support: Enabled experimental support for WebGPU in WebXR."* Babylon requires the browser's
experimental `XRGPUBinding` plus explicit WebXR Layers opt-in.

→ **WebGL2 is the mandatory production renderer for WebXR.** WebGPU is a feature-detected
enhancement only. (The general "use WebGPU with WebGL fallback" advice is correct for flat 3D and
wrong for WebXR.)

> **Babylon Lite is WebGPU-only → disqualified** for WebXR production.

### Browser reach (2026)

| Target | `immersive-vr` | Notes |
|---|---|---|
| Meta Quest Browser | Yes | Best: passthrough AR, hand tracking, plane detection, anchors |
| Chrome / Edge desktop + Android | Yes | Desktop = tethered PC headset |
| Safari visionOS 2 (Vision Pro) | Yes | Gaze-and-pinch; behaviour varies by OS release |
| Samsung Internet, Opera | Yes | Same Chromium engine as Quest Browser |
| Safari iOS/iPadOS | **No** | Plan a non-XR fallback |
| Firefox desktop/Android | **No** | Support removed, not returned |

Interop 2026 lists WebXR as a focus area, so cross-browser behaviour should improve — but treat it
as unverified, not guaranteed.

## 3. Locked decisions

| Area | Choice | Rationale |
|---|---|---|
| Engine | **Babylon.js 9** | `AdvancedDynamicTexture` is the deciding factor — see below |
| Workspace | **pnpm 11.3.0** workspaces | Installed; no corepack present, so no `packageManager` pin |
| Build | **Vite** + TypeScript strict | Transpiles internal package TS directly; no build step |
| Test | **Vitest** + **fast-check** | Mirrors the intended NUnit + CsCheck role |
| Validation | **zod** | Replaces `ConfigParser` / `ValidationError` |
| Typecheck | `tsc --noEmit` per package | Catches cross-package breaks |
| Task runner | **None** (no Turborepo) | 3 packages don't justify the config surface; revisit on real pain |
| Git LFS | **No** | Post-Phase-1 assets are ~4 MB; LFS is pointless overhead |

### Why Babylon over Three.js

The GDD makes diegetic UI a **pillar**, not a feature (§13: *"There are no traditional floating HUD
elements"*). The Unity code bears this out:

- `Assets/Scripts/UI/UITheme.cs` — **421 lines / 327 dirty**, pure uGUI widget-factory construction
  (panel, button, slider, progress-bar, text)
- 13 files build `Canvas`/`Image` graphs at runtime
- `Assets/Scripts/Interaction/InstrumentPanel.cs` — 36 `Mathf.` calls, 5 procedural instrument
  renderers written with per-pixel `Texture2D.SetPixel` loops

Babylon's `AdvancedDynamicTexture` is a retained-mode Canvas2D-on-mesh widget system that maps
almost line-for-line onto that factory pattern. Three.js has no equivalent; CSS3DRenderer does not
render inside a headset, so it becomes canvas-on-mesh work you write yourself.

Honest cost: ~1.4 MB bundle (vs ~168 KB), ~300× smaller ecosystem than Three.js, and ES6 **pure
imports are mandatory** or tree-shaking is lost.

## 4. Target architecture

```
WafersPleaseV2/
├── unity-reference/          Unity tree, read-only — behavioural spec of record
├── packages/
│   ├── sim/                  PURE TS. No Babylon, no DOM. Seeded PRNG, lot generation,
│   │                         defect sampling, metrology, scoring, day gates, shift machine.
│   │                         Vitest + fast-check. Purity enforced by CI import-ban.
│   ├── data/                 JSON schemas + zod validation + TS types
│   └── content/              config JSON + KTX2/Meshopt glTF (≤4 MB total)
└── apps/web/                 Babylon.js 9 scene, diegetic UI, WebXR, PWA
```

`packages/sim` must import with zero engine and zero DOM dependencies. Enforced in CI by a
grep-level import ban — this replaces the lost `PurityScanner` and is the one architectural
commitment worth protecting.

## 5. Phases

Each phase ends with a checkable artifact, not a claim.

| Phase | Scope | Exit criterion |
|---|---|---|
| **-1** | Disk: `Library/` is 4.4 GB regenerable cache. 14 GB free is sufficient for the web toolchain, so **deferred**, not executed — deleting it would destroy the only import cache while the working tree is already degraded. | Disk headroom adequate |
| **0** | Safety net. Branch `unity-reference`, commit project-owned content, archive stale handoff. | Clean `git status` for project paths |
| **1** | Asset pipeline. Blender MCP + `blender-web-pipeline`. Extract embedded 2048² PNGs → KTX2/Basis, geometry → Meshopt, add LODs. | 56.4 MB → **≤4 MB**, asserted in CI |
| **2** | Data layer. 24 ScriptableObject `.asset` YAML → JSON + zod. Traps: enums stored as **ordinals** (`defectClass: 1`), object refs as **GUIDs**. | All 24 assets convert; write fresh root `HANDOFF.md` |
| **3** | Determinism core (`packages/sim`). xoshiro128**+** seedable PRNG (chosen over SplitMix64/`BigInt` — faster, and there is no 64-bit arithmetic to preserve), lot gen, defect sampling, measurement noise, `DispositionEvaluator`, `ScoringEngine`, `DayGates`, shift state machine. | Full coverage; zero engine imports; property tests green |
| **4** | Scene bootstrap (`apps/web`). Babylon pure imports, cleanroom lighting, 8 props, wafer stage. | Boot with zero console errors (Playwright) |
| **5** | Diegetic UI. `AdvancedDynamicTexture` on meshes: instrument cluster, traveler clipboard, 3 stamp pads, shift board, glossary tablet, incident printer. | All GDD §13 props functional in-world |
| **6** | Metrology instruments. Port 5 procedural renderers (`ProfileChart`, `SpectrumWave`, `BarSpectrum`, `SemImage`, `ResistanceGrid`) to offscreen Canvas2D → ADT, or GLSL → `RawTexture`. | All 5 tools render; SEM blobs as shader |
| **7** | Rework minigames. RCA-Clean (dual timed bath), Silicide Wet Etch (C49 window), CMP Calibration (oscilloscope). | 3 minigames playable with failure states |
| **8** | Game flow. Day/shift state machine (Briefing→Inspection→Break→Review→Debrief), scoring economy, analytics recorder, 3 days of content. | Full shift completable end-to-end |
| **9** | WebXR. `WebXRDefaultExperience.CreateAsync` with `floorMeshes` + `optionalFeatures`; controllers, hand input, snap-turn, teleport, comfort vignette. Desktop shares the `IInputAdapter` seam. | **11.1 ms** frame budget (GDD §16 90 fps) |
| **10** | Ship. PWA, HTTPS (WebXR requires secure context), accessibility, Quest Browser verification via remote Chrome DevTools. | Quest-verified; Lighthouse a11y pass |

## 6. Babylon-specific gotchas

1. **Pure imports are mandatory.** `@babylonjs/core` barrel imports defeat tree-shaking. Use
   `@babylonjs/core/pure` with explicit `Register*()` calls.
2. **Controller-model bug:** without `import '@babylonjs/core/Materials/Node/Blocks'`, loading WebXR
   controller models throws `Build of NodeMaterial failed: FragmentOutputBlock is not connected`.
   Bake in from day one.
3. **`AdvancedDynamicTexture` is not a screen-space `GUI`.** Fullscreen GUI control does not work
   in-headset; ADT renders to a texture you apply to a mesh.
4. **WebGPU stays feature-detected** — probe for `XRGPUBinding`, ship WebGL2.
5. `@babylonjs/loaders/glTF/2.0` is required for glTF and for WebXR input-registry controller models.

## 7. Open items

- **Cause of the stubbed third-party binaries is unestablished.** Needs `git lfs fsck` and a look at
  `.gitattributes` (LFS rules exist for `*.png`, `*.wav`, `*.fbx`, `*.exr`, `*.tif`). Not blocking
  the port — all affected content is unused third-party — but it means **opening this Unity project
  will likely show import errors**, so treat it as reference-only, not a working editor project.
- `Library/` retention: 4.4 GB held in reserve. Delete once the Unity tree is confirmed
  reference-only and no import evidence is needed.
- Vision Pro and Quest must be verified on-device before any launch date is committed.