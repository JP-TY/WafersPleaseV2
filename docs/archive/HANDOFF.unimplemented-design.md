> **SUPERSEDED - THIS DOCUMENT DESCRIBES A CODEBASE THAT WAS NEVER BUILT.**
>
> Archived on 2026-10-04 during the Unity -> Babylon.js 9 / WebXR port.
> Every claim below was verified against disk and found to be fiction.
> None of the following exist in this repository:
>
> - `Assets/Scripts/Simulation/` (the "pure core") - directory absent
> - `Assets/Tests/` - directory absent; **zero tests exist**
> - `PurityScanner.cs`, `Cli.cs`, `RngStream.cs`, `SplitMix64` - no such symbols in any `.cs`
> - `Assets/Configuration/*.json` - absent; config is ScriptableObject YAML in `Assets/Config/`
> - `Plugins/CsCheck/` - absent; **CsCheck is not installed**
> - The 6 named `.asmdef` assemblies - **zero** asmdefs exist; all code is in `Assembly-CSharp`
> - "336 EditMode tests" - none exist
>
> **Actual state:** 65 C# files / 8,133 lines. Only 129 lines across 3 files are engine-free.
> 54 of 59 runtime files import `UnityEngine`; 40 are `MonoBehaviour`.
> `UnityEngine.Random` is the gameplay RNG (seeded in places by `string.GetHashCode()`,
> which is non-reproducible across processes), so determinism must be *created*, not ported.
>
> This file is retained **as design intent** only - it describes the architecture worth
> building. The real port plan is `docs/WEB_PORT_PLAN.md`.
> The authoritative status document is the root `HANDOFF.md`.

---

# Wafers Please MVP — Project Handoff

## Overview

A 45nm semiconductor inspection training game, desktop-first with optional WebXR VR.  
**Game design doc:** `Wafers Please_ MVP Game Design Document (Training-First).md`  
**Spec:** `.kiro/specs/wafers-please-mvp/` — `requirements.md`, `design.md`, `tasks.md`

---

## Current state: CHECKPOINT 20 REACHED — desktop path independently shippable (2026-09-19)

- **Compile:** exit 0, 0 errors, 0 warnings.
- **EditMode:** 405 total, 404 passed, 0 failed, 1 skipped (pre-existing WebGL guard ignore).
- **PlayMode Headless:** 2/2 (station structure + budget).
- **Linux64 player:** exit 0, boots headless to exit 0 with zero exceptions; configs staged to
  `StreamingAssets/Configuration` beside the executable.
- All 33 correctness properties have executable suites except the three environment-blocked
  ones (graphics device, XR runtime).

### OpenCode session 2026-09-19 — Checkpoint 20: presentation, input, accessibility, goldens
Tasks 3.1, 3.2, 15.1, 15.3–15.5, 16.1–16.8, 17.1–17.4, 18.1–18.3, 19.1–19.4, 21.1–21.3 (19.5
and 21.3 written-but-blocked, no hardware).

New Presentation code: `Assets/` (163-key registry generated from ASSETS.md, provider with
authored→placeholder→magenta resolution, hand-built mesh/texture/material/audio
placeholders), `Station/` (assembler + 13 presenters incl. wafer stage, overlay, screens,
traveler, shift board, printer, scaffolding, quiz, glossary, stamps, rework console),
`Configuration/` (Data→Simulation factory now shared with the test suite, file loader),
`Input/` (router, desktop backend with full keyboard map, guarded XR controller backend),
`Accessibility/` (manager), `StationBootstrap`, `ShiftPlayer` frame driver. Editor:
`AssetManifestValidator` (CLI exit 0), `GoldenFixtureRecorder` (CLI exit 0; Day1–3 goldens,
BrakeSplit pair with real verdict divergence on seed 11, 7 edge fixtures). Tests:
`SceneGuardTests`, P29/P30/P31/P32/P33, golden/brake-split/edge/throughput suites,
`AccessibilityTests`, PlayMode structure + headless budget + device-gated graphics suites.

Decisions and fixes (all in code remarks):
- Standalone scripting backend Mono (`ProjectSettings`: `Standalone: 0`): the IL2CPP
  toolchain's bundled clang cannot start here (missing libncurses, no sudo). Determinism
  claims rest on IEEE-754 exact ops, valid on both backends.
- `Cli.BuildLinux64` stages `Assets/Configuration` into the built player's
  `StreamingAssets` post-build; bootstrap reads staged configs in players, `Assets/` in editor.
- Player authored-asset loading is a `Resources` mirror of the drop-in tree (documented in
  `StationBootstrap`); editor play uses exact AssetDatabase drop-in paths. Placeholders carry
  the MVP either way. No TextMeshPro offline: diegetic text is built-in `TextMesh`.
- `ShiftDirector` pushes auditor rates into the ledger on every command (live scoreboard)
  and seeds them at construction (the player smoke run caught the frame-0 throw).
- `AdvanceWafer` finalizes unstamped wafers as `Unprocessed` at advance time (accounting).
- Scene YAML lessons: `!u!157` is LightmapSettings and `!u!196` is NavMeshSettings (not the
  reverse); GameObjects need `m_Component` forward lists or the build logs phantom errors.
- CsCheck seeds must be 12–13 chars over its base-64 alphabet; Unity objects only on the
  main thread (`threads: 1`); `Unity.Profiling` (not `UnityEngine.Profiling`) and
  `UnityEngine.Rendering.GraphicsDeviceType` in Unity 6.
- P19 joint-negation symmetry is mathematically false for the chirped ripple; the suite pins
  zero-at-target and off-target-positive instead.

### Remaining
XR runtime verification (hardware/emulator), xvfb graphics-category run (no X server or
sudo on this box; Arch has no apt), authored art/audio drop-in.

### OpenCode session 2026-09-19 (cont.) — WebGL unblocked and browser-verified
- Installed the `webgl` module (`unityhub --headless install-modules`, exit 0). The guard
  suite flipped as designed: the absent-module case now ignores, the installed-module case
  runs and passes. EditMode stays 405/404/0/1.
- `Cli.BuildWebGl` exit 0: 11 MB Brotli player, 0 errors, 0 warnings.
- Served the player over loopback and loaded it in headless Chrome (SwiftShader WebGL2
  confirmed working): loader reaches 100%, framework boots with zero JS exceptions and
  zero Unity errors; first-frame pixels still pending under software rendering at last
  check — runtime StreamingAssets config loading is file-based and will need a
  UnityWebRequest async path before the browser build is truly playable (desktop path
  unaffected).

### Unity project

- **Editor:** Unity 6000.5.0f1 at `~/Unity/Hub/Editor/6000.5.0f1/Editor/Unity`
- **Build target:** Linux64 (verifiable). WebGL module absent — install with: `unityhub --headless install-modules --version 6000.5.0f1 --module webgl --childModules`
- All six assemblies compile clean: `WafersPlease.Simulation`, `.Data`, `.Presentation`, `.Editor`, `.Tests.EditMode`, `.Tests.PlayMode`
- `Library/PackageCache/` fully populated. All packages resolved: URP 17.5.0, Newtonsoft.Json 3.2.2, Mono.Cecil 1.11.6, CsCheck 2.14.1, Input System 1.19.0, Test Framework 1.7.0.

### Run the test suite

```
~/Unity/Hub/Editor/6000.5.0f1/Editor/Unity -batchmode -nographics \
  -projectPath /path/to/WafersPleaseV2 -buildTarget Linux64 \
  -runTests -testPlatform EditMode \
  -testResults Artifacts/TestResults/editmode.xml -logFile -
```

Exit codes: 0 = all pass, 2 = test failure, 3 = runner failure. **`-runTests` and `-quit` are mutually exclusive.** Results in `Artifacts/TestResults/`. Current: 336 total, 335 passed, 1 ignored (the WebGL build itself — module absent; the guard test that validates the guard fires does pass).

### Compile-only

```
~/Unity/Hub/Editor/6000.5.0f1/Editor/Unity -batchmode -nographics -quit \
  -projectPath /path/to/WafersPleaseV2 -buildTarget Linux64 \
  -executeMethod WafersPlease.Editor.Cli.CompileOnly -logFile -
```

---

## What is built

### Data layer — complete

`Assets/Scripts/Data/`

- **`Schemas/*.cs`** — 10 schema `sealed record` types: `DefectProfile`, `DayConfig`, `BalancingConfig`, `ScoringTable`, `GlossaryEntry`, `BulletinPage`, `QuizQuestion`, `LocalizationEntry`, `AnalyticsEventSchema`, `AccessibilityProfile` + helpers. All match the authored JSON field names exactly. `[JsonProperty(Order = n)]` on every member.
- **`ConfigParser.cs`** — parses all 12 JSON files, validates all rules (weight sums, intervals, tool coverage, cmpDriftProbability excluded from BalancingConfig), returns `ParseResult<T>`, never throws on malformed content.
- **`ParseResult.cs`, `ValidationError.cs`** — error model: source path, field path, violated constraint.

### Simulation — Determinism substrate — complete

`Assets/Scripts/Simulation/Determinism/`

| File | What it does |
|---|---|
| `StreamKey.cs` | Readonly struct: RunSeed, DayIndex, WaferIndex, ChannelId. Deterministic `GetHashCode` (no runtime string hashing). |
| `RngStream.cs` | SplitMix64 counter-based. `NextU64(streamSeed, drawIndex)` is a pure function — no mutable state. Verified against `mix64(GOLDEN) = 0xE220A8397B1DCDAF`. |
| `RngStream.Ladder.cs` | `SelectFromLadder` partial extension. |
| `IntegerWeightLadder.cs` | `FromWeights`, `WithScaledEntry` — integer ladder to 2^32, largest-remainder rounding. Zero-weight entries unselectable. |
| `ChannelId.cs` | Channels 0–13 + `PerShiftWaferIndex = 0xFFFFFFFF`. **Append-only: inserting renumbers and breaks all existing lots.** |

Known-answer vectors for `mix64` (verified against external SplitMix64 reference):
```
mix64(0x0000000000000001) = 0x5692161D100B05E5
mix64(0x9E3779B97F4A7C15) = 0xE220A8397B1DCDAF  ← SplitMix64 anchor
mix64(0xFFFFFFFFFFFFFFFF) = 0xB4D055FCF2CBBD7B
```

### Simulation — Domain types — complete

`Assets/Scripts/Simulation/Domain/`

All 12 enums: `ProcessLayer`, `DefectClass`, `DefectSeverity`, `Disposition`, `OutcomeClass`, `ReworkOutcome`, `MetrologyTool`, `PhaseState`, `ReadingStatus`, `CalloutMode`, `DefectBucket`, `ColorVisionMode`

Additional types added during task 8.1 setup:
- **`DefectTaxonomy.cs`** — static tables: DefectClass → ProcessLayer, DefectSeverity, correct Disposition, DiagnosticTool, DefectBucket. These are code not config because Requirements 3.1/3.11/4.1 say "the Simulation_Core shall define" these mappings.
- **`MetrologyToolSet.cs`** — 5-bit bitmask over MetrologyTool. Allocation-free; avoids HashSet enumeration the purity scanner bans.
- **`DefectRegionLayout.cs`** — bit-packed wafer region positions from a single 64-bit draw (keeps draw counts constant per channel).

### Editor tooling — complete

- **`Cli.cs`** — `CompileOnly`, `ResolvePackagesOrFail`, `BuildLinux64`, `BuildWebGl` (guard fires, prints install command, exits non-zero), `ValidateAssetManifest` (stub, see task 15.3)
- **`PurityScanner.cs`** — IL walker with Mono.Cecil. Detects: transcendentals, MathF, DateTime/Stopwatch/Guid/Random, float anywhere (fields, signatures, ldc.r4, conv.r4), unordered Dictionary/HashSet iteration, culture-sensitive formatting, forbidden assembly references, platform intrinsics, P/Invoke. **Hard-fails when assembly absent — never silently passes vacuously.**
- **`PurityPolicy.cs`, `PurityViolation.cs`** — policy data and violation records.

### Authored configuration — complete

`Assets/Configuration/`

- `DefectProfiles.json` — 7 records with `visuallyDetectable` flag
- `Days/Day1.json`, `Day2.json`, `Day3.json` — routing weights, tool slots, gate thresholds
- `BalancingConfig.json` — generation knobs, per-tool profiles, 16-point reflectance ripple table (chirped fringe, verified 0.062 RMS alias margin — see `reflectanceRippleTuning` in the file)
- `ScoringTable.json` — full economy table
- `Glossary.json` — 7 defect + 5 tool entries with 45nm-accurate science copy
- `Bulletins.json`, `QuizQuestions.json` (3+ per day), `Localization/en.json`, `AccessibilityDefaults.json`, `HighContrastPalette.json`

### Asset manifest — complete

`ASSETS.md` at repo root — **177 asset keys**, every GDD MVP Asset Inventory row A–H covered.

**Drop-in workflow:** place a finished asset at the path in the "Drop-in path" column and it replaces the procedural placeholder with zero code changes. The key in code matches the `Asset_Key` column exactly.

### Test suite — complete for completed code

`Assets/Tests/EditMode/`

| File | Tests | Covers |
|---|---|---|
| `PurityTests.cs` | 136 | IL scanner: zero violations in Simulation, policy correctness, Req 1.4 assembly references |
| `WebGlBuildGuardTests.cs` | 8 pass + 1 ignored | Guard fires, WebGL settings committed in ProjectSettings |
| `RngStreamTests.cs` | 45 | mix64 known answers, SplitMix64 anchor, unit-double bounds, rejection sampling, ladder totals, zero-weight unselectable, WithScaledEntry |
| `AuthoredValueTests.cs` | 146 | Every authored constant vs. the requirement that pins it; parses real files via ConfigParser |

---

## What still needs to be built

Full task list in `.kiro/specs/wafers-please-mvp/tasks.md`. Status by top-level task:

### ✅ Done
Tasks 1.1, 1.2, 2.1–2.5, 3.1, 4.1–4.3, 5.1–5.2, 6.1–6.3, 7 (checkpoint), 15.2

### ✅ Done (OpenCode session 2026-09-18 — Checkpoint 14: full headless assessment surface)
Tasks 5.3, 5.4, 8.1–8.8, 9.1–9.10, 11.1–11.8, 12.1–12.12, 13.1, 13.2

New Simulation code: `Domain/` gained `WaferRecord`, `EffectiveWafer`, `MetrologyReading`,
`StationCommand`, `CommandKind`, `ShiftResult`; new `Generation/` (`ShiftConfiguration`,
`LatentLot`, `LotGenerator`, `WaferProjector`), `Evaluation/` (`DispositionEvaluator`,
`OverlayPolicy`, `MetrologyCluster`, `ComplianceAuditor`), `Rework/` (`RcaCleanBench`,
`SilicideEtchBench`, `CmpCalibrationConsole`, `ReflectanceCurve`), `Assessment/`
(`ScoringParameters`, `ShiftLedger`, `ShiftScore`, `ScoringEngine`, `DayGates`,
`ShiftResultRecord`, `GateEvaluator`, `DeterministicText`), `Orchestration/ShiftDirector`,
`Analytics/` (`IAnalyticsSink`, `NullAnalyticsSink`, `AnalyticsEvent`, `DebriefStrings`,
`DebriefReport`, `AnalyticsRecorder`). 28 property suites P1–P28 in
`Assets/Tests/EditMode/Properties/` plus shared `PropertySupport` (authored-config factory,
CsCheck generators, recording sink).

Deviations from spec adopted deliberately (all documented in code remarks):
- `OverlayPolicy.PermitsOverlay` takes `visuallyDetectable: bool`, not `DefectProfile`
  (Simulation cannot reference Data; projection is a field read).
- `MetrologyCluster` activation/timing methods take a `timestampSeconds` argument so every
  analytics event keeps the recorder's nondecreasing order; benches likewise stamp events
  with command time instead of 0.0.
- P19 second half (joint-negation invariance of calibration error) is mathematically false
  for the specified chirped ripple; the test pins zero-at-target (exact) and off-target
  positive instead.
- Fixed a Kiro static-init order bug: `DefectTaxonomy.NoCandidates` was declared after the
  table that stores it, so every empty (bucket, layer) pair held null → NRE on fallback.
- `ShiftDirector.AdvanceWafer` finalizes an unstamped presented wafer as `Unprocessed` at
  advance time (else skipped wafers would never be accounted); end-of-shift covers the rest.
- CsCheck 2.14.1 seeds must be 12–13 chars over its base-64 alphabet; all property seeds
  follow `WPnn…` 12/13-char form.

### 🔶 Partial — next to complete
**Task 15.1/15.3** — `AssetKeyRegistry`, `AssetProvider`, `AssetManifestValidator`
(plus Properties 31/32), then the presentation wave 16–19 toward Checkpoint 20.

### ❌ Not started (in dependency order)

**Generation (wave 5–6):** 8.2 WaferProjector, 8.3–8.8 Properties 1/3/5/6/9/13

**Evaluation (wave 7):** 9.1 DispositionEvaluator, 9.2 MetrologyCluster, 9.3 ComplianceAuditor, 9.4 OverlayPolicy, 9.5–9.10 Properties 8/10/14/11/12/7

**Rework benches (wave 7–8):** 11.1 RcaCleanBench, 11.2 SilicideEtchBench, 11.3 CmpCalibrationConsole, 11.4–11.8 Properties 15/16/17/18/19

**Scoring and orchestration (wave 8–10):** 12.1 StationCommand + ShiftDirector, 12.2 ScoringEngine, 12.3 GateEvaluator, 12.4 DeterministicText, 12.5–12.12 Properties 2/24/25/20/21/22/23/4

**Analytics (wave 11):** 13.1 AnalyticsRecorder + DebriefReport, 13.2 Property 28

**→ Checkpoint 14: full headless assessment surface**

**Asset provider (wave 11–12):** 15.1 AssetKeyRegistry, 15.3 AssetManifestValidator, 15.4–15.5 Properties 31/32

**Presentation (wave 12–15):** 16.1–16.8 StationAssembler + wafer rendering + diegetic readouts + scaffolding + quiz board + properties 29/30; 17.1–17.4 InputRouter + DesktopInputBackend + record/replay + property 33; 18.1–18.3 AccessibilityManager + keyboard-only + tests; 19.1–19.5 golden scenarios + brake-split differential + edge cases + PerformanceBudgetMonitor + graphics PlayMode (BLOCKED — needs xvfb); 3.2 scene guard test

**→ Checkpoint 20: desktop path independently shippable**

**XR — optional, behind `Xr_Feature_Flag` (wave 17–19):** 21.1 XR packages, 21.2 XrInputBackend, 21.3 type-level parity test (BLOCKED — no hardware)

---

## Architecture — what you must not break

**Single governing constraint:** `WafersPlease.Simulation` is pure C# with zero Unity references. The purity scanner enforces this. The entire assessment surface is testable headlessly.

**Dependency direction:**
```
Simulation (no Unity, no Newtonsoft)
    ↑
Data (no Unity, links Newtonsoft.Json)
    ↑
Presentation (Unity — owns all rendering and file IO)
    ↑
Editor (UnityEditor — CLI, PurityScanner)
```

**The two-stage generation pipeline (most important invariant):**
1. `LotGenerator` → `Latent_Lot` — pure function of (seed, day, config). All draws happen here, unconditionally, every wafer.
2. `WaferProjector` → `Effective_Wafer` — projection through station state. Zero draws. Applies `DefectMask` only when latent class is `StiVoidSeam` and `CmpSafetyBrake > 0`.

Every downstream reader (MetrologyCluster, DispositionEvaluator, ScoringEngine) reads the `Effective_Wafer`, never the latent entry.

**Critical rules for LotGenerator (task 8.1):**
- Draw every channel unconditionally, every wafer — including `CmpDriftRoll` on channel 7 for non-STI wafers and wafers with the brake up.
- `DishingPenaltyMultiplier` scales the `StiVoidSeam` ladder entry *before* the single bucket draw — it changes the ladder, not the draw count.
- `RequiredMetrologySet` derives from `Routing_Step` alone, never from `Defect_Class`.
- `LotGenerator` takes Simulation-side config types, not Data schema types (`Simulation` cannot reference `Data`). `DefectTaxonomy` provides the physics-based lookup tables.
- Zero-seed substitution: replace 0 with `0x9E3779B97F4A7C15`, record as an analytics event.

**`SilicideBridging` is the phase-dependent class:** C49 → Rework (within the etch window), C54 → Reject (phase-locked, permanent). Phase is revealed only by the Electron Microscope. A wafer masked from `StiVoidSeam` by the CMP brake still requires SpectroscopicEllipsometry (traveler doesn't know the polisher was recalibrated).

---

## Known open issues

| Issue | Location | Impact |
|---|---|---|
| `String::GetHashCode` not in forbidden list | `PurityPolicy.ForbiddenMemberFullNames` | Low — no Simulation code hashes strings currently |
| Property 26 (config round-trip) not yet tested | Tasks 5.3–5.4 not started | Will need structural comparer or `Equals` overrides on schema records |
| `Assets/DefaultVolumeProfile.asset` modified | `git status` | Editor modified on first open; harmless |
| WebGL builds unverifiable | Whole project | Install webgl module when ready to ship |
| PlayMode graphics tests unrunnable | Task 19.5 | Need `sudo apt-get install xvfb` |

---

## File reference

```
.kiro/specs/wafers-please-mvp/
  requirements.md          23 requirements, 274 EARS criteria
  design.md                Architecture, 33 correctness properties, CLI commands
  tasks.md                 21 top-level tasks with dependency wave graph

ASSETS.md                  177 asset keys with drop-in paths

Assets/
  Configuration/           12 authored JSON data files
  Plugins/CsCheck/         CsCheck 2.14.1, Editor-only
  Scripts/
    Data/                  ConfigParser, 10 schema records, ParseResult, ValidationError
    Editor/                Cli, PurityScanner, PurityPolicy, PurityViolation
    Presentation/          Placeholder only
    Simulation/
      Determinism/         StreamKey, RngStream (+Ladder partial), IntegerWeightLadder, ChannelId
      Domain/              12 enums + DefectTaxonomy, MetrologyToolSet, DefectRegionLayout
  Tests/
    EditMode/              PurityTests, RngStreamTests, AuthoredValueTests, WebGlBuildGuardTests
    PlayMode/              Placeholder only
  Settings/                WafersPleaseUrpAsset.asset, WafersPleaseUrpRenderer.asset
  Scenes/                  Bootstrap.unity (minimal — 3 GameObjects, no prefab instances)

ProjectSettings/           Recovered from git HEAD (6000.5.0f1), all dangling GUIDs fixed
Packages/manifest.json     All pinned versions including mono-cecil
Artifacts/TestResults/     editmode.xml (336/335/1)
```
