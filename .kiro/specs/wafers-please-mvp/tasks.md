# Implementation Plan: Wafers Please MVP

## Overview

Implementation language is **C#**, targeting Unity editor `6000.5.0f1` at `~/Unity/Hub/Editor/6000.5.0f1/Editor/Unity`.

The plan follows the dependency order the design establishes. A compiling, headless-testable skeleton comes first: recovered project settings, the six assembly definitions, the batch-mode CLI, and the IL purity scanner. Only then does `WafersPlease.Simulation` gain logic, in the order that later stages consume earlier ones — determinism substrate, schemas, generation, evaluation, rework benches, scoring, analytics. Every one of those is verifiable in EditMode with no scene and no graphics device, so the whole assessment surface is proven before any presentation code exists. Presentation, input, and accessibility follow. XR sits last, behind `Xr_Feature_Flag`, because Requirement 18.7 requires the desktop build to ship independently.

Each of the 33 correctness properties in `design.md` is implemented by exactly one property-based test task, tagged with its property number and the requirement clauses it validates.

### Verification commands

Tasks reference these batch-mode invocations from the design's CLI section.

```bash
UNITY="$HOME/Unity/Hub/Editor/6000.5.0f1/Editor/Unity"
PROJ="/home/jpty/WafersPleaseV2"
RESULTS="$PROJ/Artifacts/TestResults"
```

- **Compile:** `"$UNITY" -batchmode -nographics -quit -projectPath "$PROJ" -buildTarget Linux64 -executeMethod WafersPlease.Editor.Cli.CompileOnly -logFile -`
- **EditMode:** `"$UNITY" -batchmode -nographics -projectPath "$PROJ" -buildTarget Linux64 -runTests -testPlatform EditMode -testResults "$RESULTS/editmode.xml" -logFile -`
- **PlayMode (headless):** `"$UNITY" -batchmode -nographics -projectPath "$PROJ" -buildTarget Linux64 -runTests -testPlatform PlayMode -testCategory Headless -testResults "$RESULTS/playmode-headless.xml" -logFile -`
- **Linux build:** `"$UNITY" -batchmode -nographics -quit -projectPath "$PROJ" -buildTarget Linux64 -executeMethod WafersPlease.Editor.Cli.BuildLinux64 -logFile -`

`-runTests` and `-quit` are mutually exclusive; the test runner exits on its own with 0 on pass, 2 on test failure, 3 on run failure.

### Environment limits

Three verification surfaces are unreachable on this machine. Tasks touching them are marked optional (`*`) or flagged **BLOCKED** so a task runner does not stall. None is dropped.

| Surface | Why unreachable | Task |
| :---- | :---- | :---- |
| WebGL player build | `webgl` module absent from both installed editors; `PlaybackEngines` has no `WebGLSupport` | 2.5 |
| PlayMode `Graphics` category | No `xvfb` installed, no display | 19.5 |
| XR runtime parity, 90 FPS WebXR | No XR hardware or WebXR emulator | 21.3 |

## Tasks

- [ ] 1. Recover the Unity project from git HEAD
  - [ ] 1.1 Restore project settings and author the package manifest
    - Run `git checkout HEAD -- ProjectSettings/` to restore all 31 settings assets; confirm `ProjectSettings/ProjectVersion.txt` reads `6000.5.0f1 (88b47c5e7076)` and make no edit to it
    - Delete `Packages/packages-lock.json`; confirm no `Library/` directory exists before first open
    - Author `Packages/manifest.json` with the design's adapted dependency set: URP `17.5.0`, `com.unity.test-framework` `1.7.0`, `com.unity.nuget.newtonsoft-json` `3.2.2`, `com.unity.inputsystem` `1.19.0`, `com.unity.ide.rider` `3.0.38`, `com.unity.feature.development` `1.0.2`, plus the eleven retained `com.unity.modules.*` entries
    - Omit `learn.iet-framework`, `multiplayer.center`, `timeline`, and both linux cross-compilation packages on scope grounds
    - Edit `ProjectSettings/ProjectSettings.asset`: set `webGLCompressionFormat: 0` (Brotli) and WebGL `managedStrippingLevel` to `Low`
    - Strip XR loaders from `ProjectSettings/XRSettings.asset` while `Xr_Feature_Flag` is off
    - _Requirements: 1.1, 1.2, 1.9, 18.7_

  - [ ] 1.2 Commit the URP asset and wire it into graphics settings
    - Create `Assets/Settings/WafersPleaseUrpAsset.asset` and its `.meta`
    - Reference it from `ProjectSettings/GraphicsSettings.asset` as the default render pipeline
    - _Requirements: 1.8_

- [ ] 2. Establish the assembly skeleton, CLI harness, and purity scanner
  - [ ] 2.1 Create the six assembly definitions and vendor CsCheck
    - Create `Assets/Scripts/Simulation/WafersPlease.Simulation.asmdef` with zero references
    - Create `Assets/Scripts/Data/WafersPlease.Data.asmdef` referencing `WafersPlease.Simulation` plus `Newtonsoft.Json` through `precompiledReferences` with `overrideReferences: true`, and no `UnityEngine` reference
    - Create `Assets/Scripts/Presentation/WafersPlease.Presentation.asmdef`, `Assets/Scripts/Editor/WafersPlease.Editor.asmdef` (`includePlatforms: [Editor]`, references `Mono.Cecil`), `Assets/Tests/EditMode/WafersPlease.Tests.EditMode.asmdef` (`includePlatforms: [Editor]`), and `Assets/Tests/PlayMode/WafersPlease.Tests.PlayMode.asmdef`
    - Vendor `Assets/Plugins/CsCheck/CsCheck.dll` (version 2.14.1) with a `.meta` restricting it to the Editor platform; Git LFS must be initialized in the clone because `.gitattributes` routes `*.dll` through LFS
    - Add one placeholder type per assembly so the project compiles with zero errors
    - _Requirements: 1.3, 1.4, 23.8_

  - [ ] 2.2 Implement the batch-mode CLI entry points
    - Create `Assets/Scripts/Editor/Cli.cs` with `CompileOnly`, `ResolvePackagesOrFail`, `BuildLinux64`, `BuildWebGl`, and `ValidateAssetManifest`
    - `CompileOnly` exits 0 on success, 1 with the error list on stderr
    - `ResolvePackagesOrFail` reports the missing package identifier and exits non-zero
    - `BuildWebGl` detects the absent playback engine directory and prints exactly `unityhub --headless install-modules --version 6000.5.0f1 --module webgl --childModules` before exiting non-zero
    - Verify with the Compile command above
    - _Requirements: 1.6, 1.7, 1.10, 23.1_

  - [ ] 2.3 Implement the IL purity scanner
    - Create `Assets/Scripts/Editor/PurityScanner.cs` walking `WafersPlease.Simulation.dll` with Mono.Cecil
    - Flag any `call`/`callvirt` to the forbidden set (`Sin`, `Cos`, `Tan`, `Asin`, `Acos`, `Atan`, `Atan2`, `Exp`, `Log`, `Log10`, `Log2`, `Pow`, `Cbrt`, all `MathF.*`, `DateTime`, `Stopwatch`, `Environment.TickCount`, `Guid.NewGuid`, `System.Random`), any `float32` in a signature or field, and any assembly reference outside the BCL allowlist
    - Return a `PurityViolation` list naming type, method, and offending member
    - _Requirements: 2.5_

  - [ ]* 2.4 Write the EditMode purity suite
    - Create `Assets/Tests/EditMode/PurityTests.cs` asserting zero `UnityEngine` and `UnityEditor` references, zero `float`, zero banned members, and zero nondeterministic API calls in `WafersPlease.Simulation`
    - Table-driven unit tests, not property tests: these are structural assertions about a compiled assembly
    - _Requirements: 1.4, 2.5, 18.6_

  - [ ]* 2.5 Add the WebGL build path guard test
    - **BLOCKED in this environment:** the `webgl` module is absent, so no WebGL player can be produced or validated here
    - Create `Assets/Tests/EditMode/WebGlBuildGuardTests.cs` asserting that `Cli.BuildWebGl` detects the missing playback engine and emits the documented install command rather than failing inside the build
    - This tests the guard, not the build. The build itself stays unverified until the module is installed
    - _Requirements: 1.9, 1.10_

- [ ] 3. Author the bootstrap scene and its guard test
  - [ ] 3.1 Create Bootstrap.unity and the StationBootstrap component
    - Create `Assets/Scenes/Bootstrap.unity` with the four scene singletons plus exactly three GameObjects: `Main Camera`, `Directional Light`, and `Bootstrap`
    - Set `m_GIWorkflowMode` to on-demand; bake no lighting
    - Create `Assets/Scripts/Presentation/StationBootstrap.cs` as the single component on `Bootstrap`; it loads configuration, constructs `AssetProvider`, and invokes `StationAssembler`
    - Leave the assembler call behind a minimal seam; task 16.1 completes the wiring so no code is orphaned
    - _Requirements: 1.5, 17.1_

  - [ ]* 3.2 Write the scene guard suite
    - Create `Assets/Tests/EditMode/SceneGuardTests.cs` parsing `Assets/Scenes/Bootstrap.unity` as text
    - Assert at most three `--- !u!1 &` GameObject documents, zero `--- !u!1001 &` PrefabInstance documents, no lightmap payload, and a file size below a committed ceiling
    - _Requirements: 1.5_

- [ ] 4. Implement the determinism substrate
  - [ ] 4.1 Implement StreamKey, RngStream, and the channel registry
    - Create `Assets/Scripts/Simulation/Determinism/StreamKey.cs` as a readonly struct over `RunSeed`, `DayIndex`, `WaferIndex`, `ChannelId`
    - Create `Assets/Scripts/Simulation/Determinism/RngStream.cs` implementing the SplitMix64 `mix64`, `stream_seed`, and `next_u64(stream_seed, draw_index)` construction from the design, using only XOR, wrapping multiply, wrapping add, and logical shift
    - Implement `NextUnitDouble` as the top 53 bits scaled by `2^-53`, `NextBelow` by rejection sampling, and a range double as `lo + (hi - lo) * unit`
    - Create `Assets/Scripts/Simulation/Determinism/ChannelId.cs` declaring the append-only ids 0 through 13 exactly as tabulated in the design, with the per-shift sentinel `WaferIndex = 0xFFFFFFFF`
    - _Requirements: 2.1, 2.6_

  - [ ] 4.2 Implement the integer weight ladder
    - Create `Assets/Scripts/Simulation/Determinism/IntegerWeightLadder.cs` with `FromWeights` converting weights to a cumulative ladder scaled to `2^32` under a documented largest-remainder rounding rule, and `WithScaledEntry` for the `DishingPenaltyMultiplier` adjustment
    - Selection compares `next_u64() >>> 32` against the ladder, so no floating-point comparison decides a defect
    - _Requirements: 2.1, 2.5, 8.15, 14.3_

  - [ ]* 4.3 Write unit tests for the substrate
    - Create `Assets/Tests/EditMode/RngStreamTests.cs` asserting known-answer `mix64` vectors, `NextUnitDouble` staying in `[0, 1)`, rejection sampling being unbiased over a small bound, ladder weights summing to `2^32`, and `WithScaledEntry` changing the ladder without changing its length
    - Unit tests rather than property tests: these pin the exact bit-level construction the design specifies
    - _Requirements: 2.1, 2.5, 2.6_

- [ ] 5. Implement the data layer schemas and parsers
  - [ ] 5.1 Define the schema record types
    - Create `Assets/Scripts/Data/Schemas/` with `DefectProfile.cs`, `DayConfig.cs`, `BalancingConfig.cs`, `ScoringTable.cs`, `GlossaryEntry.cs`, `BulletinPage.cs`, `QuizQuestion.cs`, `LocalizationEntry.cs`, `AnalyticsEventSchema.cs`, and `AccessibilityProfile.cs`
    - Declare `[JsonProperty(Order = n)]` on every member so serialization order is fixed
    - `DefectProfile` carries `visuallyDetectable`; `DayConfig` carries `cmpDriftProbability`; `BalancingConfig` declares no `cmpDriftProbability` field
    - Create the shared enums in `Assets/Scripts/Simulation/Domain/`: `ProcessLayer`, `DefectClass`, `DefectSeverity`, `Disposition`, `OutcomeClass`, `ReworkOutcome`, `MetrologyTool`, `PhaseState`, `ReadingStatus`, `CalloutMode`, `DefectBucket`
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 20.1, 14.10_

  - [ ] 5.2 Implement ConfigParser and the validation model
    - Create `Assets/Scripts/Data/ConfigParser.cs` with one `Parse*` method per schema plus `Serialize<T>`, configured with `Formatting.Indented`, `FloatParseHandling.Double`, and `CultureInfo.InvariantCulture`
    - Create `Assets/Scripts/Data/ParseResult.cs` and `Assets/Scripts/Data/ValidationError.cs` carrying source path, field path, and violated constraint
    - The parser is total: it returns `ParseResult` and throws on no input. It parses `string` and performs no file IO
    - Aggregate all errors in one pass rather than throwing on the first
    - Implement the validation rules: interval membership for every bounded field, routing-step weight sum (13.8), defect-bucket weight sum (14.2), competency-weight sum (9.15), tool-coverage (13.7), and rejection of a `cmpDriftProbability` field appearing in `BalancingConfig` (14.10)
    - _Requirements: 21.10, 14.11, 14.12, 13.7, 13.8, 14.2, 9.15, 14.10, 13.15_

  - [ ]* 5.3 Write the configuration round-trip property test
    - Create `Assets/Tests/EditMode/Properties/ConfigRoundTripProperty.cs`
    - **Property 26: Configuration round-trips through serialization** — for any valid configuration record of any of the eight authored schema types, parsing then serializing then parsing again produces a record equal to the first, and serializing twice produces byte-identical text
    - **Validates: Requirements 21.11, 2.8**

  - [ ]* 5.4 Write the parser totality property test
    - Create `Assets/Tests/EditMode/Properties/ConfigParsingTotalityProperty.cs`
    - **Property 27: Configuration parsing is total and reports the offending field** — for any input string `ConfigParser` returns a `ParseResult` without throwing, and for any input violating the declared schema the result carries at least one `ValidationError` naming source path, field path, and violated constraint
    - **Validates: Requirements 21.10, 14.12, 13.7, 13.8, 9.15, 14.2**

- [ ] 6. Author the configuration content
  - [ ] 6.1 Author the gameplay configuration files
    - Create `Assets/Configuration/DefectProfiles.json` with seven records, `visuallyDetectable` true for `BowingWarping`, `SubstrateContamination`, `SilicideBridging` and false for `StiVoidSeam`, `InterfaceTrapsRoughness`, `TungstenPlugVoid`
    - Create `Assets/Configuration/Days/Day1.json`, `Day2.json`, `Day3.json` with the authored routing weights, tool slots, shift durations 480/600/720, lot sizes 12/16/20, callout modes `Always`/`FirstOccurrencePerDefectClass`/`Disabled`, salary quotas 900/1400/1900, competency floors 0.70/0.78/0.85, min disposition accuracy 0.60/0.75/0.85, max killer false-accept 0.30/0.20/0.10, and `cmpDriftProbability` 0.0/0.25/0.25
    - Create `Assets/Configuration/BalancingConfig.json` with bucket weights 0.10/0.15/0.75, `ambiguityTolerance` 0.35, `toolOperationSpeedMultiplier` 1.0, `visualDetectionThreshold` 0.80, `dishingPenaltyMultiplier` 2.0, `optimalRms` 0.05, `marginalRms` 0.12, competency weights 0.50/0.25/0.15/0.10, per-tool control limits and marginal bands, and the 16 reflectance ripple control points
    - Create `Assets/Configuration/ScoringTable.json` with income 100 per correct outcome; penalties -500/-250/-200/-150/-100/-25; out-of-sequence -50; salvage 50/0; scrap cost -100; calibration tool-time cost -25
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 11.1, 11.2, 11.3, 10.10, 10.11, 10.12, 10.13, 14.1, 14.6, 14.8, 14.9, 14.10, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 4.9, 4.12, 21.2_

  - [ ] 6.2 Author the copy, localization, and accessibility content
    - Create `Assets/Configuration/Glossary.json` with one entry per `DefectClass` and per `MetrologyTool`
    - Create `Assets/Configuration/Bulletins.json`, `Assets/Configuration/QuizQuestions.json` with at least three questions per `Day_Index`, each declaring one correct and at least two incorrect answers
    - Create `Assets/Configuration/Localization/en.json` as the baseline locale, including scaffolding callout text keyed by `DefectClass`
    - Create `Assets/Configuration/AccessibilityDefaults.json` and `Assets/Configuration/HighContrastPalette.json` with per-pair documented contrast ratios and a text target of at least 4.5:1
    - _Requirements: 21.5, 21.6, 21.7, 21.8, 15.1, 15.5, 15.10, 20.1, 20.9_

  - [ ]* 6.3 Write authored-value unit tests
    - Create `Assets/Tests/EditMode/AuthoredValueTests.cs` as a table-driven suite asserting every authored constant against the requirement that pins it
    - Cover the defect-to-severity-to-disposition mapping, the defect-to-process-layer assignment, the tool-to-reveal-set mapping, dwell seconds, gate thresholds, shift durations, lot sizes, and callout modes
    - Property tests add nothing here: these criteria pin specific constants
    - _Requirements: 3.1, 3.11, 4.1, 4.9, 9.1, 9.2, 10.10, 10.11, 10.12, 10.13, 11.2, 11.3, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.9, 13.10, 13.11, 13.13, 14.1, 14.6, 14.8, 14.9_

- [ ] 7. Checkpoint - skeleton and data layer
  - Run the Compile and EditMode commands. Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement the two-stage generation pipeline
  - [ ] 8.1 Implement WaferRecord, EffectiveWafer, and LotGenerator
    - Create `Assets/Scripts/Simulation/Domain/WaferRecord.cs` and `EffectiveWafer.cs` as readonly structs with the fields tabulated in the design; `MetrologyToolSet` is a bitmask over the five tools, not a `HashSet`
    - Create `Assets/Scripts/Simulation/Generation/LotGenerator.cs` producing a `LatentLot` from `(runSeed, dayIndex, shiftConfiguration)` alone, reading nothing from the command stream, the brake counter, or a pending drift request
    - Draw every channel exactly once per wafer unconditionally, including channels the wafer will not use, so draw-count invariance is structural
    - Draw `CmpDriftRoll` on channel 7 for every wafer regardless of routing step or brake state
    - Apply `DishingPenaltyMultiplier` by scaling the `StiVoidSeam` ladder entry before the single bucket draw, so the multiplier never changes the draw count
    - Substitute `0x9E3779B97F4A7C15` for a zero `Run_Seed` and record the substitution as an analytics event
    - Assign a non-`Clean` defect only when its process layer equals the wafer's routing step; fall back to `Clean` with a `BucketFallback` event otherwise
    - Assign `PhaseState` `C49` or `C54` only for `SilicideBridging`, `NotApplicable` otherwise
    - Draw `Signal_Magnitude` for a defective wafer from `[controlLimit * (1 - ambiguityTolerance / 2), 1.0]`
    - Derive `RequiredMetrologySet` from routing step alone, intersected with the day's mounted tools
    - _Requirements: 2.1, 2.2, 2.7, 2.9, 3.12, 3.13, 5.1, 5.2, 8.1, 8.15, 14.3, 14.4, 14.5, 14.7_

  - [ ] 8.2 Implement WaferProjector and the defect mask
    - Create `Assets/Scripts/Simulation/Generation/WaferProjector.cs` with `Project(in WaferRecord, int cmpSafetyBrake)` and `IsMasked`
    - The projector holds no `RngStream` and receives no `Run_Seed`, so masking structurally cannot draw
    - Copy `WaferIndex`, `RoutingStep`, `SignalMagnitude`, `PhaseState`, `OrganicLoad`, `MetallicLoad`, and `RequiredMetrologySet` verbatim; set only `DefectClass` and `DefectSeverity` when the mask applies
    - Apply the mask exactly when the latent class is `StiVoidSeam` and the brake is greater than zero, setting `Clean`/`None`; record provenance in `WasMasked` for analytics only
    - _Requirements: 2.11, 2.12, 2.13, 5.3, 8.12, 8.13, 8.14_

  - [ ]* 8.3 Write the latent purity property test
    - Create `Assets/Tests/EditMode/Properties/LatentPurityProperty.cs`
    - **Property 1: Latent generation is a pure function of the seed triple** — for any `Run_Seed`, `Day_Index`, and `Shift_Configuration`, two independent invocations of `LotGenerator.Generate` produce `Latent_Lots` of equal length whose `Wafer_Records` are field-by-field equal at every `Wafer_Index`
    - **Validates: Requirements 2.1, 2.2, 2.9**

  - [ ]* 8.4 Write the draw-count invariance property test
    - Create `Assets/Tests/EditMode/Properties/DrawCountInvarianceProperty.cs` with an instrumented `RngStream` counting draws per channel
    - **Property 3: Channel draw counts are invariant and locally scoped** — for any `Run_Seed`, `Day_Index`, `Shift_Configuration`, and `Wafer_Index`, the number of draws taken on each `Channel_Id` is the same across every `Command_Stream`; and for any change to the draw count on one `Wafer_Index`, every `Wafer_Record` at a different `Wafer_Index` is unchanged
    - **Validates: Requirements 2.3, 2.6, 14.5**

  - [ ]* 8.5 Write the defect-placement property test
    - Create `Assets/Tests/EditMode/Properties/DefectPlacementProperty.cs`
    - **Property 9: A defect is generated only at the routing step that produces it** — for any `Run_Seed`, `Day_Index`, and `Shift_Configuration`, every `Wafer_Record` whose `Defect_Class` is not `Clean` has a `Routing_Step` equal to the `Process_Layer` assigned to that `Defect_Class`, and carries a `Phase_State` other than `NotApplicable` exactly when its `Defect_Class` is `SilicideBridging`
    - **Validates: Requirements 3.11, 3.12, 3.13, 14.4**

  - [ ]* 8.6 Write the required-metrology-set derivation property test
    - Create `Assets/Tests/EditMode/Properties/RequiredMetrologySetProperty.cs`
    - **Property 13: The required metrology set derives from routing step alone** — for any two `Wafer_Records` sharing a `Routing_Step` under one `Day_Config`, the two `Required_Metrology_Sets` are equal regardless of `Defect_Class`, `Signal_Magnitude`, or `Cmp_Safety_Brake` value
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 8.7 Write the projection field-preservation property test
    - Create `Assets/Tests/EditMode/Properties/ProjectionPreservationProperty.cs`
    - **Property 5: Projection preserves every field except defect identity** — for any `Wafer_Record` and any `Cmp_Safety_Brake` value, the `Effective_Wafer` produced by `WaferProjector.Project` carries the `Wafer_Index`, `Routing_Step`, `Signal_Magnitude`, `Phase_State`, `Organic_Load`, `Metallic_Load`, and `Required_Metrology_Set` of that `Wafer_Record` unchanged, and differs from it at most in `Defect_Class` and `Defect_Severity`
    - **Validates: Requirements 2.12, 5.3, 8.13**

  - [ ]* 8.8 Write the defect-mask scope property test
    - Create `Assets/Tests/EditMode/Properties/DefectMaskScopeProperty.cs`
    - **Property 6: The defect mask applies to STI void seams alone and only while the brake is armed** — for any `Wafer_Record` and any `Cmp_Safety_Brake` value, the `Effective_Wafer` `Defect_Class` is `Clean` with `Defect_Severity` `None` exactly when the latent `Defect_Class` is `StiVoidSeam` and the brake is greater than zero, and equals the latent `Defect_Class` in every other case
    - **Validates: Requirements 8.12, 8.13**

- [ ] 9. Implement evaluation and the overlay policy
  - [ ] 9.1 Implement DispositionEvaluator
    - Create `Assets/Scripts/Simulation/Evaluation/DispositionEvaluator.cs` with `CorrectDispositionFor` and `Evaluate`
    - Resolve the correct disposition from `Effective_Wafer` `DefectClass` and `PhaseState`, so a masked wafer correctly resolves to `Accept`
    - Emit exactly one `OutcomeClass` for every wafer-disposition pair and never fail
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.14_

  - [ ] 9.2 Implement MetrologyCluster
    - Create `Assets/Scripts/Simulation/Evaluation/MetrologyCluster.cs` with `MountFromDayConfig`, `Activate`, `TrySelectSlot`, and `IsBusy`
    - Return `InSpec` when the tool's reveal set excludes the effective defect class; `OutOfSpec` above `controlLimit + marginalBand`; `Marginal` within `[controlLimit, controlLimit + marginalBand)`
    - Populate the phase channel only for `ElectronMicroscope`
    - Bind slots 1 through 4 from the day config, leave undeclared slots empty, retain the prior selection with an `EmptySlotSelected` event on an empty-slot selection, and reject re-entrant activation with a `ToolBusy` event
    - Create `Assets/Scripts/Simulation/Domain/MetrologyReading.cs`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.11, 4.12_

  - [ ] 9.3 Implement ComplianceAuditor
    - Create `Assets/Scripts/Simulation/Evaluation/ComplianceAuditor.cs` with `RecordActivation`, `AuditStamp`, `MetrologyOptimizationRate`, and `ProcessCompliance`
    - Record one out-of-sequence violation per required tool with zero activations at stamp time, independently of the outcome class
    - Classify a productive activation as the first activation of a required tool or any activation yielding `Marginal` or `OutOfSpec`
    - Report a rate of 0.0 when total activations are zero, and a compliance of 1.0 when the summed required-set cardinality is zero
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12_

  - [ ] 9.4 Implement OverlayPolicy
    - Create `Assets/Scripts/Simulation/Evaluation/OverlayPolicy.cs` with `PermitsOverlay(in EffectiveWafer, DefectProfile, bool revealedByTool, double visualDetectionThreshold)`
    - A single pure predicate in `Simulation_Core`, not a shader-side heuristic: permit exactly when a revealing activation has completed, or when `visuallyDetectable` is true and `SignalMagnitude` exceeds the threshold
    - _Requirements: 12.6, 12.7, 21.1, 21.2_

  - [ ]* 9.5 Write the disposition totality property test
    - Create `Assets/Tests/EditMode/Properties/DispositionTotalityProperty.cs`
    - **Property 8: Disposition evaluation is total and single-valued** — for any `Effective_Wafer` and any `Disposition`, `DispositionEvaluator.Evaluate` returns exactly one `Outcome_Class` and never fails
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

  - [ ]* 9.6 Write the reading-status property test
    - Create `Assets/Tests/EditMode/Properties/ReadingStatusProperty.cs` with generators concentrating `Signal_Magnitude` at `Control_Limit` and `Control_Limit + Marginal_Band`
    - **Property 10: Reading status is determined by reveal set membership and the control limit bands** — for any `Effective_Wafer` and any `Metrology_Tool`, the resulting `Reading_Status` is `InSpec` when the reveal set excludes the defect class, `OutOfSpec` when it includes the class and `Signal_Magnitude` exceeds `Control_Limit + Marginal_Band`, and `Marginal` when it includes the class and `Signal_Magnitude` lies in `[Control_Limit, Control_Limit + Marginal_Band)`; and the phase channel is present exactly when the tool is `ElectronMicroscope`
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

  - [ ]* 9.7 Write the compliance-rate property test
    - Create `Assets/Tests/EditMode/Properties/ComplianceRateProperty.cs`
    - **Property 14: Compliance rates stay within their unit intervals and respond monotonically** — for any `Command_Stream`, the `Metrology_Optimization_Rate` and `Process_Compliance` both lie in `[0, 1]`; adding one unproductive `Tool_Activation` does not increase the `Metrology_Optimization_Rate`; and adding one `Out_Of_Sequence` violation does not increase `Process_Compliance`
    - **Validates: Requirements 5.9, 5.10, 5.11, 5.12**

  - [ ]* 9.8 Write the masked-wafer consistency property test
    - Create `Assets/Tests/EditMode/Properties/MaskedWaferConsistencyProperty.cs`; this is the cross-evaluator guard on the two-stage split
    - **Property 7: A masked wafer is clean to every evaluator** — for any `Wafer_Record` whose latent `Defect_Class` is `StiVoidSeam` and any `Cmp_Safety_Brake` value greater than zero, stamping `Accept` on the resulting `Effective_Wafer` produces `CorrectAccept`, stamping `Reject` produces `FalseReject`, that wafer is excluded from the `Killer_Containment` denominator, and every `Metrology_Reading` on it reports `InSpec`
    - **Validates: Requirements 2.13, 3.6, 3.8, 3.14, 4.2, 9.11, 10.2**

  - [ ]* 9.9 Write the subsurface overlay suppression property test
    - Create `Assets/Tests/EditMode/Properties/SubsurfaceOverlayProperty.cs`
    - **Property 11: A subsurface defect renders no overlay before a revealing activation** — for any `Effective_Wafer` whose `Defect_Class` has `Visually_Detectable` false, for any `Signal_Magnitude` in `[0, 1]`, for any wafer stage yaw and pitch in `[-60, 60]` degrees, and for any cross-illumination angle in `[0, 180]` degrees, `OverlayPolicy.PermitsOverlay` returns false until a `Tool_Activation` that reveals that `Defect_Class` has completed
    - **Validates: Requirements 12.6, 12.7, 21.2**

  - [ ]* 9.10 Write the overlay admission property test
    - Create `Assets/Tests/EditMode/Properties/OverlayAdmissionProperty.cs`
    - **Property 12: The overlay policy admits the unaided path only for surface defects** — for any `Effective_Wafer` and `Defect_Profile`, `OverlayPolicy.PermitsOverlay` returns true exactly when a revealing `Tool_Activation` has completed, or when `Visually_Detectable` is true and `Signal_Magnitude` exceeds `VisualDetectionThreshold`
    - **Validates: Requirements 12.6, 21.1**

- [ ] 10. Checkpoint - generation and evaluation
  - Run the Compile and EditMode commands. Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement the three rework benches
  - [ ] 11.1 Implement RcaCleanBench
    - Create `Assets/Scripts/Simulation/Rework/RcaCleanBench.cs` as an explicit finite state machine over `Idle`, `Sc1Soaking`, `Sc1Done`, `Sc2Soaking`, `Resolved`, `Scrapped`, so clock exhaustion is just another transition
    - SC-1 target `4.0 + organicLoad * 8.0`; SC-2 target `3.0 + metallicLoad * 7.0`; tolerance `1.5 * toolOperationSpeedMultiplier * extendedTimingToleranceMultiplier`
    - Classify `Optimal` within tolerance, `Marginal` within twice tolerance, `Failed` beyond
    - Emit `Success` when both tanks are `Optimal`, `PartialCredit` on any `Marginal` with no `Failed`, `Scrap` on any `Failed`
    - Scrap with `ChemistryOutOfOrder` when SC-2 is submerged before an SC-1 soak completes; scrap with `ReworkAbandoned` when the clock reaches zero while active
    - Record `UnderSoak` and `OverSoak` events per tank; expose `Outcome` as nullable, non-null exactly once
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.15, 20.6_

  - [ ] 11.2 Implement SilicideEtchBench
    - Create `Assets/Scripts/Simulation/Rework/SilicideEtchBench.cs` as an explicit state machine
    - Derive the window open time in `[2.0, 6.0]` and close time in `[8.0, 14.0]` from the wafer `Stream_Key` on channels 10 and 11, with close strictly greater than open
    - Define the core band as the central 60 percent of the window; accept at most one `TriggerAgitation` per instance
    - Emit `Success` inside the core band, `PartialCredit` inside the window but outside the core band, `Scrap` with `PrematureAgitation` before open, `Scrap` with `C54PhaseLocked` after close, and `Scrap` with `BridgeLockedIn` when the close time elapses with no agitation
    - Start only for `PhaseState` `C49`; expose elapsed phase time and the resistance channel without exposing the window bounds
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 20.6_

  - [ ] 11.3 Implement CmpCalibrationConsole and the reflectance curve
    - Create `Assets/Scripts/Simulation/Rework/CmpCalibrationConsole.cs` and `Assets/Scripts/Simulation/Rework/ReflectanceCurve.cs`
    - Implement `R(t; gain, phase) = envelope(t) * ripple(t, phase) * gain_scale(gain)` with `envelope(t) = (1-t)^2 * (3 - 2*(1-t))`, `ripple` as piecewise-linear interpolation over the 16 authored control points, and `gain_scale(g) = 0.5 + g`. Use no transcendental function; RMS uses the single exactly-rounded `Math.Sqrt`
    - Compute calibration error as RMS over 64 evenly spaced sample points; derive target gain and phase from the wafer `Stream_Key` on channels 8 and 9
    - Expose exactly two knobs accepting `[0, 1]`; reject knob and confirm commands with a `ConsoleInert` event while no drift request is pending
    - Emit `Success` and arm the brake to 5 at or below `optimalRms`, `PartialCredit` and arm to 2 at or below `marginalRms`, `CalibrationFailed` leaving the counter unchanged above it; destroy zero wafer records
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.16, 13.15, 20.6, 2.5_

  - [ ]* 11.4 Write the RCA bench termination property test
    - Create `Assets/Tests/EditMode/Properties/RcaBenchTerminationProperty.cs`
    - **Property 15: The RCA clean bench terminates with exactly one outcome** — for any sequence of tank commands and any shift clock length, the `Rca_Clean_Bench` reaches a terminal state having emitted exactly one `Rework_Outcome`, and that outcome is `Success` only when both tanks classify `Optimal`, `PartialCredit` only when at least one tank classifies `Marginal` and none `Failed`, and `Scrap` whenever a tank classifies `Failed`, the SC-2 tank is submerged before an SC-1 soak completes, or the clock reaches zero while the bench is active
    - **Validates: Requirements 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.15**

  - [ ]* 11.5 Write the soak symmetry property test
    - Create `Assets/Tests/EditMode/Properties/SoakSymmetryProperty.cs`
    - **Property 16: Tank soak classification is symmetric about the target** — for any target soak seconds, tolerance, and deviation magnitude, an under-soak and an over-soak of equal magnitude classify identically, and classification is monotonically non-improving as the deviation magnitude grows
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.13**

  - [ ]* 11.6 Write the C49 window property test
    - Create `Assets/Tests/EditMode/Properties/C49WindowProperty.cs`
    - **Property 17: The silicide etch bench honours the C49 window** — for any `Run_Seed` and `Wafer_Index`, the derived C49 window has a close time strictly greater than its open time, and for any agitation time the `Silicide_Etch_Bench` emits `Success` exactly when the agitation falls inside the central 60 percent core band, `PartialCredit` exactly when it falls inside the window but outside the core band, and `Scrap` otherwise, including when no agitation arrives before the close time
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9**

  - [ ]* 11.7 Write the brake arming property test
    - Create `Assets/Tests/EditMode/Properties/BrakeArmingProperty.cs`
    - **Property 18: Calibration quality maps monotonically onto brake arming** — for any two calibration attempts, the attempt with the lower calibration error arms the `Cmp_Safety_Brake` to a value at least as large as the other, with `Success` arming 5, `PartialCredit` arming 2, and `CalibrationFailed` leaving the counter unchanged; and no calibration attempt destroys a `Wafer_Record`
    - **Validates: Requirements 8.8, 8.9, 8.10, 8.16**

  - [ ]* 11.8 Write the calibration error symmetry property test
    - Create `Assets/Tests/EditMode/Properties/CalibrationErrorProperty.cs`
    - **Property 19: Calibration error is symmetric and zero at the target** — for any target `Gain` and `Phase`, the calibration error is zero when the player values equal the targets, and is unchanged when the signed knob deviations are both negated
    - **Validates: Requirements 8.6, 8.7**

- [ ] 12. Implement shift orchestration, scoring, and gating
  - [ ] 12.1 Implement StationCommand and ShiftDirector
    - Create `Assets/Scripts/Simulation/Domain/StationCommand.cs` with the timestamp, kind, int argument, and two double arguments
    - Create `Assets/Scripts/Simulation/Orchestration/ShiftDirector.cs` with `Consume`, `Advance`, `Presented`, `ShiftClockSeconds`, `CmpSafetyBrake`, and `Ended`
    - Fix the presentation order explicitly as **project, then decrement**, so a brake value of 1 protects exactly the next wafer presented and no more
    - Raise a drift request when the routing step is `ShallowTrenchIsolation`, the brake is zero, and the drift roll is below the day's probability
    - Charge tool dwell scaled by `toolOperationSpeedMultiplier`, rework elapsed seconds, and the 1.5 second intake delay against the clock
    - End the shift on the last wafer stamped or on clock zero, assigning `Unprocessed` to the presented unstamped wafer and to every higher `Wafer_Index`
    - Start the correct rework bench on a `Rework` stamp; `Simulation_Core` throws on no reachable input
    - _Requirements: 2.11, 4.10, 6.1, 6.14, 7.1, 7.10, 8.2, 8.3, 8.11, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.13, 11.14_

  - [ ] 12.2 Implement ScoringEngine
    - Create `Assets/Scripts/Simulation/Assessment/ScoringEngine.cs` and `Assets/Scripts/Simulation/Domain/ShiftScore.cs`
    - Accumulate `Salary_Total` as the signed sum of income, salvage bonuses, penalties, out-of-sequence penalties, scrap cost, and calibration tool-time cost, all read from `ScoringTable`
    - Withhold `CorrectRework` income on a `Scrap` outcome
    - Compute `Disposition_Accuracy` (0.0 when nothing is stamped), `Killer_Containment` (1.0 when no presented wafer is `Catastrophic`), and `Competency_Score` as the weighted sum clamped to `[0, 1]`
    - Exclude `Unprocessed` from the accuracy denominator and from `Latency_By_Layer`; group latency mean and maximum by routing step
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.16, 9.17_

  - [ ] 12.3 Implement GateEvaluator
    - Create `Assets/Scripts/Simulation/Assessment/GateEvaluator.cs` and `ShiftResultRecord.cs`
    - Evaluate the salary gate and the three-part competency gate; emit exactly one `Shift_Result`
    - Emit `Passed` when both gates hold, `Repeat` when a gate fails and the repeat count is below 2, `Terminated` at 2 or above
    - Emit a per-gate reason record naming each unsatisfied condition with its non-negative numeric shortfall
    - Derive the repeat `Run_Seed` from the previous seed and the repeat count; force `Always` callouts on a repeat; advance or complete the day on a pass
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.14_

  - [ ] 12.4 Implement deterministic serialization
    - Create `Assets/Scripts/Simulation/Assessment/DeterministicText.cs` serializing `ShiftScore` and `DebriefReport` with fixed field order, `G9` formatting, and `CultureInfo.InvariantCulture`
    - No error path consults wall-clock time or produces locale-dependent text
    - _Requirements: 2.8, 16.10_

  - [ ]* 12.5 Write the station-state independence property test
    - Create `Assets/Tests/EditMode/Properties/LatentIndependenceProperty.cs` replaying two command streams through `ShiftDirector`
    - **Property 2: Latent generation is independent of station state and player behaviour** — for any `Run_Seed`, `Day_Index`, `Shift_Configuration`, and any two `Command_Streams`, the `Latent_Lot` produced while replaying the first stream equals the `Latent_Lot` produced while replaying the second, field by field at every `Wafer_Index`, in particular when one stream completes a successful CMP calibration and the other completes none
    - **Validates: Requirements 2.9, 8.1, 8.14, 8.15, 14.5**

  - [ ]* 12.6 Write the wafer accounting property test
    - Create `Assets/Tests/EditMode/Properties/WaferAccountingProperty.cs`
    - **Property 24: Every generated wafer is accounted for exactly once at shift end** — for any `Run_Seed`, `Shift_Configuration`, and `Command_Stream`, the per-`Outcome_Class` counts in the `Shift_Score` sum to the `Lot_Size`, and every `Wafer_Index` below the `Lot_Size` contributes exactly one `Outcome_Class`
    - **Validates: Requirements 11.8, 11.9, 11.10, 9.17**

  - [ ]* 12.7 Write the shift clock property test
    - Create `Assets/Tests/EditMode/Properties/ShiftClockProperty.cs`
    - **Property 25: The shift clock is monotonically non-increasing and charges every consumer** — for any `Command_Stream`, the shift clock never increases, and its total decrease equals the sum of `Tool_Activation` dwell costs scaled by `Tool_Operation_Speed_Multiplier`, rework bench elapsed seconds, and intake delays
    - **Validates: Requirements 4.10, 11.13, 11.14, 6.14**

  - [ ]* 12.8 Write the salary ledger property test
    - Create `Assets/Tests/EditMode/Properties/SalaryLedgerProperty.cs`
    - **Property 20: Salary total is the signed sum of its ledger entries** — for any multiset of `Outcome_Classes`, `Rework_Outcomes`, and `Out_Of_Sequence` violations, the `Salary_Total` equals the sum of the corresponding `Scoring_Table` entries, and is order-independent with respect to the sequence in which those entries were accumulated
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8**

  - [ ]* 12.9 Write the scoring bounds property test
    - Create `Assets/Tests/EditMode/Properties/ScoringBoundsProperty.cs`
    - **Property 21: Scoring rates are bounded and correctly degenerate** — for any `Command_Stream`, `Disposition_Accuracy`, `Killer_Containment`, and `Competency_Score` all lie in `[0, 1]`; `Disposition_Accuracy` is 0.0 when no wafer is stamped; `Killer_Containment` is 1.0 when no presented `Effective_Wafer` carries `Catastrophic` severity; and `Unprocessed` outcomes are excluded from the accuracy denominator and from `Latency_By_Layer`
    - **Validates: Requirements 9.9, 9.10, 9.11, 9.12, 9.14, 9.17**

  - [ ]* 12.10 Write the scoring monotonicity property test
    - Create `Assets/Tests/EditMode/Properties/ScoringMonotonicityProperty.cs`
    - **Property 22: Replacing an error with a correct outcome never lowers the score** — for any `Command_Stream` in which one stamped wafer's `Outcome_Class` is replaced by the correct `Outcome_Class` for that `Effective_Wafer`, the resulting `Salary_Total` is greater than or equal to the original and the resulting `Competency_Score` is greater than or equal to the original
    - **Validates: Requirements 9.1, 9.2, 9.13**

  - [ ]* 12.11 Write the gate totality property test
    - Create `Assets/Tests/EditMode/Properties/GateTotalityProperty.cs`
    - **Property 23: Gate evaluation is a total function with a consistent reason record** — for any `Shift_Score`, `Day_Config`, and `Repeat_Count`, the `Gate_Evaluator` emits exactly one `Shift_Result`; the result is `Passed` exactly when both gates are satisfied; and the accompanying reason record names an unsatisfied condition with a non-negative numeric shortfall if and only if the result is not `Passed`
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.14**

  - [ ]* 12.12 Write the scoring determinism property test
    - Create `Assets/Tests/EditMode/Properties/ScoringDeterminismProperty.cs`
    - **Property 4: Scoring is a function of seed, configuration, and command stream** — for any `Run_Seed`, `Shift_Configuration`, and `Command_Stream`, two replays produce `Shift_Scores` that are equal field by field, and their serialized text forms are byte-identical
    - **Validates: Requirements 2.4, 2.8, 2.10, 18.9**

- [ ] 13. Implement analytics and the debrief report
  - [ ] 13.1 Implement AnalyticsRecorder and DebriefReport
    - Create `Assets/Scripts/Simulation/Analytics/AnalyticsEvent.cs` using a `SortedDictionary<string,string>` payload so iteration order is part of the contract
    - Create `Assets/Scripts/Simulation/Analytics/AnalyticsRecorder.cs` implementing `IAnalyticsSink` with `Append` enforcing nondecreasing timestamps, and `Aggregate` producing a `DebriefReport`
    - Append an event for each tool activation, stamp, rework outcome, out-of-sequence violation, and scaffolding callout display
    - Report failure-mode identification, metrology optimization rate, latency by layer, salary total, competency score, shift result, and the per-gate reason record
    - Include the authored analytical error capture and recommended remediation strings when a defect class accounts for at least 30 percent of incorrect outcomes
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 21.9_

  - [ ]* 13.2 Write the analytics ordering property test
    - Create `Assets/Tests/EditMode/Properties/AnalyticsOrderingProperty.cs`
    - **Property 28: Analytics events are appended in nondecreasing timestamp order and serialize deterministically** — for any sequence of recorded `Analytics_Events`, the appended stream is nondecreasing in timestamp, and serializing the resulting `Debrief_Report` twice produces byte-identical text
    - **Validates: Requirements 16.3, 16.10**

- [ ] 14. Checkpoint - full assessment surface verified headlessly
  - Run the Compile and EditMode commands. Every correctness property except the presentation, asset, and input ones should now pass. Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement the asset provider and the asset manifest
  - [ ] 15.1 Implement AssetKeyRegistry and AssetProvider
    - Create `Assets/Scripts/Presentation/Assets/AssetKeyRegistry.cs` declaring every `Asset_Key` as compile-time constants in this one location, plus an `All` enumeration
    - Create `Assets/Scripts/Presentation/Assets/IAssetProvider.cs` and `AssetProvider.cs` resolving in three steps: authored asset at the mapped path, else procedural placeholder with a `PlaceholderUsed` event, else magenta error material with an `UnknownAssetKey` event
    - Generate mesh placeholders from primitives, textures through `Texture2D`, materials from URP `Lit`/`Unlit` presets, and audio as synthesized clips
    - `AssetProvider` is total: every request returns a non-null asset of the requested kind
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [ ] 15.2 Author the ASSETS.md manifest
    - Create `ASSETS.md` at the repository root with one table row per `Asset_Key`
    - Each row declares the key string, the placeholder currently standing in, a `P0`/`P1`/`P2` priority, the expected file format, the expected dimensions or triangle budget, and the repository path for the authored asset
    - Cover every entry of the game design document MVP Asset Inventory sections A through H
    - This is a stated user deliverable, not just a test fixture
    - _Requirements: 19.7, 19.8, 19.9_

  - [ ] 15.3 Implement AssetManifestValidator
    - Create `Assets/Scripts/Editor/AssetManifestValidator.cs` parsing the key set from the `ASSETS.md` table and comparing it against `AssetKeyRegistry.All`
    - Report both directions of the difference by name; report failure when the two sets differ
    - Wire it to `Cli.ValidateAssetManifest`
    - _Requirements: 19.10, 19.11, 19.12_

  - [ ]* 15.4 Write the asset resolution property test
    - Create `Assets/Tests/EditMode/Properties/AssetResolutionProperty.cs`
    - **Property 31: Asset resolution is total** — for any string treated as an `Asset_Key`, the `Asset_Provider` returns a non-null asset of the requested kind — the authored asset, a procedural placeholder, or the magenta error placeholder — and records the corresponding analytics event
    - **Validates: Requirements 19.2, 19.3, 19.4**

  - [ ]* 15.5 Write the manifest agreement property test
    - Create `Assets/Tests/EditMode/Properties/ManifestAgreementProperty.cs`
    - **Property 32: The asset key registry and the asset manifest agree** — for any pair of `Asset_Key` sets parsed from `Asset_Key_Registry` and from `ASSETS.md`, the `Asset_Manifest_Validator` reports success exactly when the two sets are equal, and otherwise names every key present in one and absent from the other
    - **Validates: Requirements 19.10, 19.11, 19.12**

- [ ] 16. Implement the presentation layer
  - [ ] 16.1 Implement StationAssembler and complete the bootstrap wiring
    - Create `Assets/Scripts/Presentation/StationAssembler.cs` constructing at runtime the wafer mount stage, cross-illumination dial, four-screen metrology cluster, traveler clipboard, three routing stamps, glossary tablet, overhead shift board, incident printer, and rework console
    - Render every gameplay information surface as a world-space renderer parented to a station prop; construct zero screen-space canvases for gameplay information and at most one tagged `SystemOverlay`
    - Request every mesh, texture, material, audio clip, and text string through `IAssetProvider`; include zero direct asset path literals
    - Complete the `StationBootstrap` seam left open in task 3.1
    - _Requirements: 12.1, 15.1, 17.1, 17.2, 17.3, 19.6_

  - [ ] 16.2 Implement wafer inspection rendering
    - Create `Assets/Scripts/Presentation/WaferStagePresenter.cs` and `DefectOverlayRenderer.cs`
    - Apply `TiltWafer` yaw and pitch clamped to `[-60, 60]` degrees and `SetIlluminationAngle` clamped to `[0, 180]` degrees
    - Consult `OverlayPolicy` for every overlay decision; render full opacity inside the specular grazing band and reduced opacity outside it
    - Render zero overlay pixels whenever `OverlayPolicy` denies the overlay
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ] 16.3 Implement the diegetic readout surfaces
    - Create `Assets/Scripts/Presentation/MetrologyScreenPresenter.cs`, `TravelerClipboard.cs`, `OverheadShiftBoard.cs`, and `IncidentPrinter.cs`
    - Display each reading on the screen bound to the producing tool slot; disable all three stamps after a stamp until the next wafer is presented
    - The traveler clipboard is the only surface showing day rule text and the work-function metal; the incident printer is the only surface showing the debrief report
    - _Requirements: 12.8, 12.9, 12.11, 13.12, 16.11, 17.4, 17.5, 17.6_

  - [ ] 16.4 Implement ScaffoldingPresenter
    - Create `Assets/Scripts/Presentation/ScaffoldingPresenter.cs` rendering every callout as a world-space surface anchored to the metrology cluster
    - Honour `Always`, `FirstOccurrencePerDefectClass`, and `Disabled` callout modes; load callout text from the authored localization file keyed by defect class
    - Keep the callout-selection decision a pure, separately callable function so it is testable in EditMode without a scene
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 17.7_

  - [ ] 16.5 Implement QuizBoard and the glossary tablet
    - Create `Assets/Scripts/Presentation/QuizBoard.cs` and `GlossaryTablet.cs`
    - Select exactly three questions from the authored pool using an `RngStream` keyed by run seed and day index on channel 13 with the sentinel wafer index
    - Accept a skip command; increase `Operator_Profile.CumulativeCompetencyRating` by 0.01 clamped to `[0, 1]` on a correct answer; apply zero changes to shift score, salary, competency score, or shift result
    - _Requirements: 15.1, 15.6, 15.7, 15.8, 15.9_

  - [ ]* 16.6 Write the callout volume property test
    - Create `Assets/Tests/EditMode/Properties/CalloutVolumeProperty.cs`
    - **Property 29: Callout mode governs scaffolding volume** — for any sequence of `Metrology_Readings`, the `Scaffolding_Presenter` displays a callout for every `Marginal` or `OutOfSpec` reading under `Always`, at most one callout per `Defect_Class` under `FirstOccurrencePerDefectClass`, and zero callouts under `Disabled`
    - **Validates: Requirements 15.2, 15.3, 15.4**

  - [ ]* 16.7 Write the quiz isolation property test
    - Create `Assets/Tests/EditMode/Properties/QuizIsolationProperty.cs`
    - **Property 30: Quiz answers move only the cumulative rating** — for any sequence of quiz answers, the `Shift_Score`, `Salary_Total`, `Competency_Score`, and `Shift_Result` are unchanged, and `Operator_Profile.CumulativeCompetencyRating` stays within `[0, 1]`
    - **Validates: Requirements 15.8, 15.9**

  - [ ]* 16.8 Write the headless PlayMode structural suite
    - Create `Assets/Tests/PlayMode/StationStructureTests.cs` tagged `[Category("Headless")]`
    - Assert station construction completes, the hierarchy matches the expected prop set, zero screen-space canvases exist for gameplay information, and at most one `SystemOverlay` canvas exists
    - Verify with the PlayMode (headless) command
    - _Requirements: 17.1, 17.2, 17.3, 23.3, 23.5_

- [ ] 17. Implement the input layer
  - [ ] 17.1 Implement InputRouter and the backend seam
    - Create `Assets/Scripts/Presentation/Input/InputRouter.cs`, `IInputBackend.cs`, and `ICommandSink.cs`
    - Convert every backend event into a `StationCommand` and enqueue it into the command stream; backends produce commands and nothing else
    - _Requirements: 18.5, 18.6_

  - [ ] 17.2 Implement DesktopInputBackend
    - Create `Assets/Scripts/Presentation/Input/DesktopInputBackend.cs` using the Input System package
    - Map left-button drag over the wafer stage to `TiltWafer`, keys 1 through 4 to `SelectToolSlot`, a left click on a routing stamp to `Stamp` with that stamp's disposition, and scroll over the illumination dial to `SetIlluminationAngle`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 12.10_

  - [ ] 17.3 Implement command stream record and replay
    - Create `Assets/Scripts/Simulation/Orchestration/CommandStreamText.cs` writing and reading a command stream as invariant-culture text
    - Round-trip must be exact so a recorded stream replays identically
    - _Requirements: 18.10, 23.6_

  - [ ]* 17.4 Write the backend parity property test
    - Create `Assets/Tests/EditMode/Properties/BackendParityProperty.cs`
    - **Property 33: Input backend identity does not affect scoring** — for any `Command_Stream`, replaying it against one `Run_Seed` and one `Shift_Configuration` produces the same `Shift_Score` regardless of which backend produced the stream, and recording then replaying a stream from text reproduces it exactly
    - **Validates: Requirements 18.5, 18.6, 18.9, 18.10**

- [ ] 18. Implement accessibility
  - [ ] 18.1 Implement AccessibilityManager
    - Create `Assets/Scripts/Presentation/AccessibilityManager.cs` applying an `AccessibilityProfile`
    - Swap to the high-contrast palette, scale every world-space text surface by `Text_Scale`, substitute the color-vision palette and pair each color-coded state with a distinct shape or pattern, zero non-essential animation durations under `Reduced_Motion`, and supply the 1.5 tolerance multiplier to all three rework benches under `Extended_Timing_Tolerance`
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [ ] 18.2 Implement keyboard-only operation
    - Extend `DesktopInputBackend` with keyboard bindings covering every `StationCommand` it can otherwise produce by mouse
    - _Requirements: 20.8_

  - [ ]* 18.3 Write accessibility unit tests
    - Create `Assets/Tests/EditMode/AccessibilityTests.cs` asserting profile field intervals, the 1.5 tolerance multiplier reaching each bench, and every declared color pair meeting its documented contrast ratio with text at or above 4.5:1
    - Example-based rather than property-based: these assert authored values and a fixed multiplier
    - _Requirements: 20.1, 20.6, 20.9_

- [ ] 19. Implement golden scenarios, edge cases, and the performance monitor
  - [ ] 19.1 Commit the per-day golden scenarios
    - Create `Assets/Tests/Fixtures/Golden/Day1.golden.json`, `Day2.golden.json`, `Day3.golden.json`, each pairing a run seed, a shift configuration, and a command stream with an expected serialized shift score
    - Create `Assets/Tests/EditMode/GoldenScenarioTests.cs` replaying each and failing on any textual difference
    - The golden files also pin the project-then-decrement brake ordering, which changes five wafers per calibration without changing any type signature
    - _Requirements: 23.6, 23.7, 2.8_

  - [ ] 19.2 Commit the brake-split determinism differential
    - Create `Assets/Tests/Fixtures/Golden/BrakeSplit.a.json` and `BrakeSplit.b.json`: one run seed, one day index, the first stream completing a successful CMP calibration and the second completing none
    - Create `Assets/Tests/EditMode/BrakeSplitDifferentialTests.cs` asserting the two shift scores differ while the two latent lots are equal field by field at every wafer index
    - This is the direct guard on the two-stage split: it fails if anyone moves the drift roll behind a conditional or gates the dishing multiplier on the live brake counter
    - _Requirements: 23.10, 2.9, 8.1, 8.14, 8.15_

  - [ ] 19.3 Commit the edge-case fixture set
    - Create `Assets/Tests/Fixtures/EdgeCases/*.json` covering signal magnitude at the control limit boundary, at the marginal band boundary, lot size 1, zero tool activations, and a shift clock reaching zero during each of the three rework mini-games
    - Create `Assets/Tests/EditMode/EdgeCaseTests.cs` driving each fixture
    - _Requirements: 23.9_

  - [ ] 19.4 Implement PerformanceBudgetMonitor
    - Create `Assets/Tests/PlayMode/PerformanceBudgetMonitor.cs` sampling SetPass call count, triangle count, managed allocation bytes, and station construction milliseconds, reporting a failure naming each exceeded ceiling
    - Declare the documented 11.1 ms target frame time as a manually verified constant, not an automated assertion
    - Add `Assets/Tests/EditMode/SimulationThroughputTests.cs` asserting a 20-wafer recorded shift completes within 250 ms of processor time
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8_

  - [ ]* 19.5 Write the graphics-category PlayMode suite
    - **BLOCKED in this environment:** no `xvfb` is installed and no display is available, so this category cannot run here. It is written and committed, not executed
    - Create `Assets/Tests/PlayMode/GraphicsBudgetTests.cs` tagged `[Category("Graphics")]` sampling SetPass count, triangle count, and per-frame managed allocation
    - Running it requires `sudo apt-get install -y xvfb`, then the graphics command under `xvfb-run -a --server-args="-screen 0 1920x1080x24"`
    - _Requirements: 22.1, 22.2, 22.3, 22.8, 23.5_

- [ ] 20. Checkpoint - desktop path complete and shippable
  - Run the Compile, EditMode, PlayMode (headless), and Linux build commands. The desktop path must be independently shippable at this point per Requirement 18.7, before any XR work begins. Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Implement the XR path behind Xr_Feature_Flag
  - [ ]* 21.1 Add the XR feature flag and package set
    - Add the `WAFERS_XR` scripting define to `ProjectSettings/ProjectSettings.asset` as an opt-in symbol, left undefined by default
    - Add the deferred XR packages to `Packages/manifest.json` only under the flag, at the versions the editor bundles: `openxr` 1.17.1, `hands` 1.8.0, `interaction.toolkit` 3.5.0, `management` 4.5.4, `meta-openxr` 2.5.0, `arfoundation` 6.5.0, `androidxr-openxr` 1.3.1, `compositionlayers` 2.4.0, `core-utils` 2.6.0
    - Restore the XR loaders in `ProjectSettings/XRSettings.asset` only under the flag
    - Verify the desktop build still succeeds with the flag off
    - _Requirements: 18.7, 1.2_

  - [ ]* 21.2 Implement XrInputBackend
    - Create `Assets/Scripts/Presentation/Input/XrInputBackend.cs` inside `#if WAFERS_XR`
    - Emit the same `StationCommand` type set as `DesktopInputBackend` and nothing else, so parity reduces to a replay equality already covered by Property 33
    - _Requirements: 18.8, 18.9_

  - [ ]* 21.3 Add the XR parity type-level test and record the runtime gap
    - **BLOCKED in this environment:** no XR hardware and no WebXR emulator, so runtime parity and the 90 FPS WebXR target cannot be measured here
    - Create `Assets/Tests/EditMode/XrParityTests.cs` asserting at type level that `XrInputBackend` produces a subset of the `CommandKind` set that `DesktopInputBackend` produces
    - Record the unverified runtime claim rather than asserting it
    - _Requirements: 18.8, 22.6, 22.7_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Every test task is optional by that convention; the three environment-blocked tasks (2.5, 19.5, 21.3) are additionally flagged **BLOCKED** so a task runner does not stall on them.
- Each of the 33 correctness properties in `design.md` is implemented by exactly one task: P1 in 8.3, P2 in 12.5, P3 in 8.4, P4 in 12.12, P5 in 8.7, P6 in 8.8, P7 in 9.8, P8 in 9.5, P9 in 8.5, P10 in 9.6, P11 in 9.9, P12 in 9.10, P13 in 8.6, P14 in 9.7, P15 in 11.4, P16 in 11.5, P17 in 11.6, P18 in 11.7, P19 in 11.8, P20 in 12.8, P21 in 12.9, P22 in 12.10, P23 in 12.11, P24 in 12.6, P25 in 12.7, P26 in 5.3, P27 in 5.4, P28 in 13.2, P29 in 16.6, P30 in 16.7, P31 in 15.4, P32 in 15.5, P33 in 17.4.
- Every property test carries the comment `// Feature: wafers-please-mvp, Property {number}: {property text}` and runs at least 100 generated cases through CsCheck, per Requirement 23.8.
- Checkpoints at 7, 10, 14, and 20 are the incremental validation points. Checkpoint 14 is the significant one: the entire assessment surface is proven headlessly before any presentation code exists. Checkpoint 20 confirms the desktop path ships independently of XR.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.2"] },
    { "id": 1, "tasks": ["1.2", "2.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.1", "5.1"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.2", "5.2", "15.2"] },
    { "id": 4, "tasks": ["4.3", "5.3", "5.4", "6.3", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.5", "9.1", "9.4"] },
    { "id": 6, "tasks": ["8.4", "8.6", "8.7", "8.8", "9.2", "9.3"] },
    { "id": 7, "tasks": ["9.5", "9.6", "9.7", "9.9", "9.10", "11.1", "11.2", "11.3"] },
    { "id": 8, "tasks": ["9.8", "11.4", "11.5", "11.6", "11.7", "11.8", "12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "12.5", "12.6", "12.7"] },
    { "id": 10, "tasks": ["12.4", "12.8", "12.9", "12.10", "12.11", "13.1"] },
    { "id": 11, "tasks": ["12.12", "13.2", "15.1", "17.3"] },
    { "id": 12, "tasks": ["15.3", "15.4", "16.1", "17.1"] },
    { "id": 13, "tasks": ["15.5", "16.2", "16.3", "16.4", "16.5", "17.2"] },
    { "id": 14, "tasks": ["3.1", "16.6", "16.7", "17.4", "18.1"] },
    { "id": 15, "tasks": ["3.2", "16.8", "18.2", "19.1", "19.3"] },
    { "id": 16, "tasks": ["18.3", "19.2", "19.4", "19.5"] },
    { "id": 17, "tasks": ["21.1"] },
    { "id": 18, "tasks": ["21.2"] },
    { "id": 19, "tasks": ["21.3"] }
  ]
}
```
