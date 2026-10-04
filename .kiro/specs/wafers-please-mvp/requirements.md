# Requirements Document

## Introduction

Wafers Please MVP is a desktop-first, optional-VR training game in which the player acts as a 45nm-node fab inspection operator. The player inspects each incoming wafer with metrology instruments, stamps one of three dispositions (Accept, Reject, Rework), executes node-specific rework mini-procedures, and must clear both a salary gate and a competency gate to advance through three instructional days.

This document converts the authoritative game design document (`Wafers Please_ MVP Game Design Document (Training-First).md`) into testable requirements. Where the design document left a mechanic underspecified, this document resolves the mechanic into deterministic, measurable rules. Every such resolution is recorded in the Resolved Ambiguities section so the resolution can be traced back to the design document intent.

The implementation target is Unity 6 (editor `6000.5.0f1`) with the Universal Render Pipeline, built for WebGL, written in C#, with the simulation layer authored as engine-agnostic plain C# so that all scoring and generation logic is verifiable in headless batch-mode tests.

### Scope Boundaries

The following design document Section 15 exclusions are explicit non-goals for this MVP and no requirement in this document depends on them: physical traversal of a larger fab facility or multi-room cleanrooms; interactive control of photolithography scanner configurations or high-temperature furnaces; multiplayer team inspection runs or supervisor roleplay modes; post-fab packaging, dicing, or wire-bonding validation loops.

All art and audio assets are procedurally generated or graybox placeholders for this MVP. Requirement 19 defines the key-to-asset contract and the manifest that allows finished assets to replace placeholders without modifying gameplay code.

### Resolved Ambiguities

| Design document location | Ambiguity | Resolution in this document |
| :---- | :---- | :---- |
| Section 7, STI Void row | Action Path reads "Reject / Scrap" | The single correct player Disposition is Reject. "Scrap" denotes the downstream routing consequence, not a distinct player action. See Requirement 3. |
| Section 7, Silicide Bridging row | Action Path reads "Rework (eligible ... if caught early)" | "Caught early" is resolved as the wafer's silicide Phase_State. Phase_State `C49` makes Rework the single correct Disposition; Phase_State `C54` makes Reject the single correct Disposition. Phase_State is generated deterministically from the run seed and is revealed only by the Electron Microscope. See Requirement 3. |
| Section 4, hotkeys 1-4 versus Section 7's five named tools | Five diagnostic tools cannot map onto four hotkeys | Hotkeys 1 through 4 address four Tool_Slots. Each Day_Config mounts at most four tools into Tool_Slots. Routing_Step weights per day are authored so that at most four distinct tools are ever required in one day. See Requirement 4 and Requirement 13. |
| Section 10 | The "SHIFT INCOME PERFORMANCE" diagram is absent from the document | Concrete income values, penalty magnitudes, salary quotas, and competency floors are defined in Requirement 10 and Requirement 11. |
| Section 8C | CMP Laser Endpoint Re-Calibration has no stated trigger tied to a Disposition | CMP calibration is a station maintenance action, not a Disposition outcome. A Cmp_Drift_Request is raised at `ShallowTrenchIsolation` Routing_Steps when the wafer's Cmp_Drift_Roll falls below the Day_Config `CmpDriftProbability` and the Cmp_Safety_Brake counter is zero. See Requirement 8. |
| Section 8C together with Section 16 | The CMP safety brake is a consequence of player action, yet Section 16 demands seed-determined lots | Generation is split into two stages. The Latent_Lot is a pure function of (Run_Seed, Day_Index, Shift_Configuration) and carries every Rng_Stream draw, including the per-wafer Cmp_Drift_Roll and the `DishingPenaltyMultiplier` weight adjustment. The Effective_Wafer is the presentation-time projection of a Latent_Lot entry through station state, and the Defect_Mask is the only projection rule. Masking executes zero draws, so the safety brake changes what the player sees without changing what the seed generated. See Requirement 2 and Requirement 8. |
| Section 7, subsurface defect descriptions | Section 12's unaided-visual detection path would let a player bypass tool selection by tilting the wafer | The Defect_Profile schema declares a Visually_Detectable boolean, true only for `BowingWarping`, `SubstrateContamination`, and `SilicideBridging`. The three subsurface classes, `StiVoidSeam`, `InterfaceTrapsRoughness`, and `TungstenPlugVoid`, render zero overlay until a revealing Tool_Activation completes. See Requirement 12 and Requirement 21. |
| Section 12, micro-quiz "permanent competency rating boosts" | A boost that fed shift scoring would break seed-determined scoring required by Section 16 | Quiz boosts apply only to `Operator_Profile.CumulativeCompetencyRating`. Shift_Score and Gate_Evaluator results exclude quiz boosts. See Requirement 15. |
| Section 14, "10% killer, 15% reworkable, 75% baseline acceptance" | Interface Traps / Roughness is a Reject-class parametric defect and fits none of the three named buckets | Generation uses three Defect_Buckets: `RejectClass`, `ReworkClass`, `Clean`, weighted 0.10 / 0.15 / 0.75. Defect_Severity (`Catastrophic` or `Parametric`) is a separate axis used only by scoring. See Requirement 8 and Requirement 10. |
| Section 16, "90 FPS under WebXR on mid-tier hardware" | Frame rate on unnamed hardware is not verifiable in an automated test environment | Expressed as a Performance_Budget with automatable proxies (allocation-free update loop, SetPass call ceiling, triangle ceiling, assembly time ceiling) plus a documented, non-automated frame-time target. See Requirement 22. |
| Section 4 | A WebGL/WebXR browser target is named, yet no local editor installation carries the `webgl` playback engine module | Editor `6000.5.0f1` is the target, because that editor version matches the version and the URP `17.5.0` pin already declared at `git HEAD`, avoiding an unsupported project downgrade. Linux standalone is the verifiable build target in this environment, and WebGL settings are committed but unbuilt until the `webgl` module is installed. See Requirement 1 and Requirement 22. |

## Glossary

### Product and Runtime Systems

- **Wafers_Please**: The complete MVP application, comprising the Simulation_Core, the Presentation_Layer, and the Data_Layer.
- **Simulation_Core**: The plain-C# assembly containing all generation, evaluation, scoring, and analytics logic, carrying no dependency on the UnityEngine assembly.
- **Presentation_Layer**: The Unity assembly containing rendering, interaction, audio, and station construction code.
- **Data_Layer**: The assembly containing authored configuration schemas and their deserialization code.
- **Project_Bootstrap**: The set of committed Unity project files and editor scripts that make the Unity project open, compile, and run tests from a clean checkout.
- **Station_Assembler**: The Presentation_Layer component that constructs the inspection bay, props, tools, and diegetic information surfaces at runtime from Data_Layer configuration.
- **Shift_Director**: The Simulation_Core component that advances the shift clock, presents wafers, accepts Station_Commands, and terminates the shift.
- **Lot_Generator**: The Simulation_Core component that produces the ordered sequence of Wafer_Records for one shift from a Run_Seed and a Day_Config.
- **Rng_Stream**: A deterministic counter-based pseudo-random number generator instance addressed by a Stream_Key.
- **Disposition_Evaluator**: The Simulation_Core component that maps a Wafer_Record and a stamped Disposition to an Outcome_Class.
- **Metrology_Cluster**: The Simulation_Core component that holds the four Tool_Slots for the active day and produces Metrology_Readings.
- **Compliance_Auditor**: The Simulation_Core component that determines Out_Of_Sequence violations and computes the Metrology_Optimization_Rate.
- **Rca_Clean_Bench**: The Simulation_Core component implementing the dual-tank SC-1 and SC-2 rework mini-game.
- **Silicide_Etch_Bench**: The Simulation_Core component implementing the selective silicide wet etch rework mini-game.
- **Cmp_Calibration_Console**: The Simulation_Core component implementing the CMP laser endpoint re-calibration mini-game.
- **Cmp_Safety_Brake**: The integer counter of remaining wafers for which CMP automated safety braking is armed.
- **Scoring_Engine**: The Simulation_Core component that accumulates Shift_Score from Outcome_Classes, Rework_Outcomes, and Compliance_Auditor findings.
- **Gate_Evaluator**: The Simulation_Core component that compares a Shift_Score against the Salary_Gate and the Competency_Gate and emits a Shift_Result.
- **Analytics_Recorder**: The Simulation_Core component that appends Analytics_Events and aggregates them into a Debrief_Report.
- **Incident_Printer**: The Presentation_Layer prop that renders a Debrief_Report as an in-world printed sheet.
- **Scaffolding_Presenter**: The Presentation_Layer component that displays Scaffolding_Callouts according to the active Callout_Mode.
- **Quiz_Board**: The Presentation_Layer prop that presents the optional shift-end three-question review.
- **Input_Router**: The Presentation_Layer component that converts input backend events into Station_Commands and enqueues the Station_Commands into the Command_Stream.
- **Desktop_Input_Backend**: The Input_Router backend serving mouse and keyboard input.
- **Xr_Input_Backend**: The Input_Router backend serving WebXR hand and controller input, compiled only when the Xr_Feature_Flag is enabled.
- **Asset_Provider**: The Presentation_Layer service that resolves an Asset_Key to a runtime asset, falling back to a procedurally generated placeholder when no authored asset is present.
- **Asset_Manifest_Validator**: The editor-assembly test component that checks agreement between the Asset_Key_Registry and the Asset_Manifest document.
- **Accessibility_Manager**: The Presentation_Layer component that applies an Accessibility_Profile to rendering, audio, text, and timing tolerance.
- **Performance_Budget_Monitor**: The test-assembly component that samples runtime counters and asserts Performance_Budget ceilings.
- **Test_Harness**: The command-line entry points and editor scripts that compile the project and execute EditMode and PlayMode test suites in batch mode.

### Domain Terms

- **Run_Seed**: A 64-bit unsigned integer that, together with a Day_Index, fully determines the generated content of a shift.
- **Stream_Key**: The tuple (Run_Seed, Day_Index, Wafer_Index, Channel_Id) used to derive an independent Rng_Stream.
- **Channel_Id**: A stable integer identifying one generation concern (for example routing step selection, defect bucket selection, signal magnitude).
- **Day_Index**: The integer 1, 2, or 3 identifying the instructional day.
- **Day_Config**: The authored configuration record for one Day_Index, declaring Routing_Step weights, Tool_Slot assignments, Defect_Bucket weights, Shift_Duration, Lot_Size, Callout_Mode, Salary_Quota, and Competency_Floor.
- **Lot_Size**: The count of Wafer_Records generated for one shift.
- **Shift_Duration**: The shift clock length in seconds.
- **Routing_Step**: The Process_Layer at which a wafer enters the inspection station.
- **Process_Layer**: One of `SubstratePreparation`, `ShallowTrenchIsolation`, `HighKMetalGate`, `StrainAndSilicide`, `BackEndOfLine`.
- **Wafer_Record**: The immutable generated description of one wafer, carrying a Wafer_Index, a Routing_Step, a Defect_Class, a Defect_Severity, a Signal_Magnitude, a Phase_State, an Organic_Load, a Metallic_Load, a Cmp_Drift_Roll, and a Required_Metrology_Set. A Wafer_Record holds latent field values and is one entry of a Latent_Lot.
- **Latent_Lot**: The ordered sequence of Wafer_Records for one shift, produced by the Lot_Generator as a function of the Run_Seed, the Day_Index, and the Shift_Configuration alone. Every Rng_Stream draw of the generation stage occurs while the Latent_Lot is produced.
- **Effective_Wafer**: The presentation-time projection of one Latent_Lot entry through the current station state, carrying the Wafer_Index, the Routing_Step, the Signal_Magnitude, the Phase_State, the Organic_Load, the Metallic_Load, and the Required_Metrology_Set of that Latent_Lot entry, together with an Effective_Wafer Defect_Class and an Effective_Wafer Defect_Severity.
- **Defect_Mask**: The projection rule that replaces a latent Defect_Class of `StiVoidSeam` with an Effective_Wafer Defect_Class of `Clean` and an Effective_Wafer Defect_Severity of `None` while the Cmp_Safety_Brake counter is greater than zero. The Defect_Mask executes zero Rng_Stream draws.
- **Cmp_Drift_Roll**: The normalized value in the closed interval [0, 1] drawn for every Wafer_Record from that Wafer_Record Stream_Key on the CMP drift Channel_Id, compared against the Day_Config `CmpDriftProbability` to decide whether the Cmp_Calibration_Console raises a Cmp_Drift_Request.
- **Defect_Class**: One of `Clean`, `BowingWarping`, `StiVoidSeam`, `InterfaceTrapsRoughness`, `SilicideBridging`, `TungstenPlugVoid`, `SubstrateContamination`.
- **Visually_Detectable**: The Defect_Profile boolean field that is `true` when the Defect_Class produces a surface signature observable under cross-illumination without a Tool_Activation, and `false` when the Defect_Class is subsurface.
- **Defect_Bucket**: One of `RejectClass`, `ReworkClass`, `Clean`, used only by the Lot_Generator to select a Defect_Class.
- **Defect_Severity**: One of `None`, `Parametric`, `Catastrophic`, used only by the Scoring_Engine.
- **Signal_Magnitude**: A normalized value in the closed interval [0, 1] describing how far a defect signal sits beyond the Control_Limit.
- **Control_Limit**: The per-tool normalized threshold above which a Signal_Magnitude produces a non-`InSpec` Metrology_Reading.
- **Marginal_Band**: The per-tool normalized width immediately above the Control_Limit within which a Metrology_Reading reports `Marginal` instead of `OutOfSpec`.
- **Phase_State**: One of `NotApplicable`, `C49`, `C54`, describing the titanium silicide phase of a wafer.
- **Organic_Load**: A normalized value in [0, 1] determining the SC-1 target soak time.
- **Metallic_Load**: A normalized value in [0, 1] determining the SC-2 target soak time.
- **Metrology_Tool**: One of `StylusProfilometer`, `FourPointProbeSims`, `SpectroscopicEllipsometry`, `XrayRefractometry`, `ElectronMicroscope`.
- **Tool_Slot**: One of the four addressable positions in the Metrology_Cluster, numbered 1 through 4 and bound to hotkeys 1 through 4.
- **Reveal_Set**: The set of Defect_Classes that a given Metrology_Tool can detect.
- **Metrology_Reading**: The result of one Tool_Activation, carrying a Reading_Status and per-channel numeric values.
- **Reading_Status**: One of `InSpec`, `Marginal`, `OutOfSpec`.
- **Tool_Activation**: One completed use of one Metrology_Tool on one Wafer_Record, consuming Dwell_Seconds of shift clock.
- **Dwell_Seconds**: The per-tool shift clock cost of one Tool_Activation.
- **Required_Metrology_Set**: The set of Metrology_Tools that the Traveler_Clipboard lists as mandatory for a wafer, derived from the wafer's Routing_Step.
- **Disposition**: One of `Accept`, `Reject`, `Rework`, stamped by the player.
- **Outcome_Class**: One of `CorrectAccept`, `CorrectReject`, `CorrectRework`, `FalseAcceptKiller`, `FalseAcceptParametric`, `FalseReject`, `MissedRework`, `ImproperRework`, `Unprocessed`.
- **Rework_Outcome**: One of `Success`, `PartialCredit`, `Scrap`, `CalibrationFailed`.
- **Out_Of_Sequence**: A compliance violation recorded when a Disposition is stamped while at least one Metrology_Tool in the Required_Metrology_Set has zero Tool_Activations on that Wafer_Record.
- **Metrology_Optimization_Rate**: The ratio of Productive_Activations to total Tool_Activations across a shift.
- **Productive_Activation**: A Tool_Activation that is either the first activation of a Metrology_Tool belonging to the wafer's Required_Metrology_Set, or an activation that produces a `Marginal` or `OutOfSpec` Reading_Status.
- **Station_Command**: One immutable player intent record in the Command_Stream, for example `SelectToolSlot`, `ActivateTool`, `TiltWafer`, `SetIlluminationAngle`, `Stamp`, `SubmergeTank`, `RaiseTank`, `TriggerAgitation`, `AdjustCalibrationKnob`, `ConfirmCalibration`, `AdvanceWafer`.
- **Command_Stream**: The ordered, timestamped sequence of Station_Commands consumed by the Shift_Director.
- **Shift_Score**: The record produced by the Scoring_Engine for one shift, carrying Salary_Total, Competency_Score, per-Outcome_Class counts, Metrology_Optimization_Rate, and Latency_By_Layer.
- **Salary_Total**: The signed sum of income and penalties for one shift, expressed in Credits.
- **Credit**: The unit of in-game currency.
- **Competency_Score**: A value in [0, 1] computed as the weighted sum of Disposition_Accuracy, Killer_Containment, Metrology_Optimization_Rate, and Process_Compliance.
- **Disposition_Accuracy**: The ratio of correct Outcome_Classes to stamped wafers.
- **Killer_Containment**: One minus the ratio of `FalseAcceptKiller` outcomes to presented wafers whose Defect_Severity is `Catastrophic`.
- **Process_Compliance**: One minus the ratio of Out_Of_Sequence violations to total Required_Metrology_Set membership checks.
- **Latency_By_Layer**: Per-Process_Layer mean and maximum seconds elapsed between wafer presentation and Disposition stamping.
- **Salary_Gate**: The condition that Salary_Total is greater than or equal to the Day_Config Salary_Quota.
- **Competency_Gate**: The conjunction of Competency_Score at or above the Competency_Floor, Disposition_Accuracy at or above the Min_Disposition_Accuracy, and Killer_False_Accept_Rate at or below the Max_Killer_False_Accept_Rate.
- **Shift_Result**: One of `Passed`, `Repeat`, `Terminated`.
- **Repeat_Count**: The number of consecutive non-`Passed` Shift_Results recorded for one Day_Index.
- **Debrief_Report**: The aggregated assessment document produced by the Analytics_Recorder at shift end.
- **Analytics_Event**: One immutable, timestamped record appended by the Analytics_Recorder.
- **Scaffolding_Callout**: An in-world technical explanation shown when a metrology deviation is observed.
- **Callout_Mode**: One of `Always`, `FirstOccurrencePerDefectClass`, `Disabled`.
- **Operator_Profile**: The persisted player record carrying CumulativeCompetencyRating, current Day_Index, and Repeat_Count.
- **Balancing_Config**: The authored record carrying Defect_Bucket weights, Ambiguity_Tolerance, and Tool_Operation_Speed_Multiplier.
- **Ambiguity_Tolerance**: A value in [0, 1] that controls how close generated Signal_Magnitudes drift toward the Control_Limit.
- **Tool_Operation_Speed_Multiplier**: A positive multiplier applied to Dwell_Seconds and to mini-game tolerance bands.
- **Accessibility_Profile**: The authored record carrying High_Contrast_Overlay, Text_Scale, Audio_Cue_Volume, Color_Vision_Mode, Reduced_Motion, and Extended_Timing_Tolerance.
- **Shift_Configuration**: The immutable snapshot of Day_Config, Balancing_Config, and Accessibility_Profile that, with the Run_Seed and the Command_Stream, determines a Shift_Score.
- **Asset_Key**: A stable string identifier used by Presentation_Layer code to request an asset.
- **Asset_Key_Registry**: The single Simulation_Core-adjacent declaration listing every Asset_Key that Wafers_Please code requests.
- **Asset_Manifest**: The human-readable document at repository path `ASSETS.md` enumerating every Asset_Key with its placeholder, priority, expected format, and drop-in path.
- **Xr_Feature_Flag**: The build-time scripting define and runtime setting that enables the Xr_Input_Backend.
- **Performance_Budget**: The set of automatable runtime ceilings declared in Requirement 22.
- **Golden_Scenario**: A committed fixture pairing a Run_Seed, a Shift_Configuration, and a Command_Stream with an expected Shift_Score.

## Requirements

### Requirement 1: Unity Project Bootstrap

**User Story:** As a developer, I want the Unity project to open, compile, and run its test suites from a clean checkout, so that I can verify gameplay logic without manual editor setup.

#### Acceptance Criteria

1. THE Project_Bootstrap SHALL commit `ProjectSettings/ProjectVersion.txt` declaring editor version `6000.5.0f1`.
2. THE Project_Bootstrap SHALL commit `Packages/manifest.json` declaring the Universal Render Pipeline package, the Input System package, the Test Framework package, and the JSON serialization module.
3. THE Project_Bootstrap SHALL commit exactly four assembly definition files named `WafersPlease.Simulation`, `WafersPlease.Data`, `WafersPlease.Presentation`, and `WafersPlease.Editor`, plus two test assembly definition files named `WafersPlease.Tests.EditMode` and `WafersPlease.Tests.PlayMode`.
4. THE `WafersPlease.Simulation` assembly definition SHALL declare zero references to the `UnityEngine` assembly and zero references to the `UnityEditor` assembly.
5. THE Project_Bootstrap SHALL commit one hand-authored Unity scene file at `Assets/Scenes/Bootstrap.unity` containing a camera, a directional light, and a single component that invokes the Station_Assembler.
6. WHEN the Test_Harness runs the batch-mode compile command, THE Project_Bootstrap SHALL produce zero compilation errors.
7. IF a required Unity package is absent from the local package cache, THEN THE Test_Harness SHALL report the missing package identifier and exit with a non-zero status code.
8. THE Project_Bootstrap SHALL commit a Universal Render Pipeline asset at `Assets/Settings/WafersPleaseUrpAsset.asset` and reference the Universal Render Pipeline asset from `ProjectSettings/GraphicsSettings.asset`.
9. WHERE the build target is WebGL, THE Project_Bootstrap SHALL set the WebGL compression format to Brotli and set the managed stripping level to `Low`.
10. THE Project_Bootstrap SHALL commit a documented command-line invocation that installs the WebGL playback engine module, because the module is absent from every local editor installation.

### Requirement 2: Deterministic Seeded Generation

**User Story:** As a training administrator, I want identical seeds to produce identical lots and identical scores, so that trainee results are comparable and regressions are detectable.

#### Acceptance Criteria

1. THE Lot_Generator SHALL derive every generated value from an Rng_Stream addressed by a Stream_Key composed of the Run_Seed, the Day_Index, the Wafer_Index, and a Channel_Id.
2. WHEN the Lot_Generator receives the same Run_Seed, the same Day_Index, and the same Shift_Configuration twice, THE Lot_Generator SHALL emit two Latent_Lots whose Wafer_Records are equal field by field at every Wafer_Index.
3. WHEN a Channel_Id draw count changes for one Wafer_Index, THE Lot_Generator SHALL emit unchanged values for every other Wafer_Index.
4. WHEN the Scoring_Engine consumes the same Run_Seed, the same Shift_Configuration, and the same Command_Stream twice, THE Scoring_Engine SHALL emit two Shift_Scores whose fields are equal field by field.
5. THE Simulation_Core SHALL exclude wall-clock time, system locale, floating-point platform intrinsics, and unordered hash-set iteration from every code path that produces a Wafer_Record or a Shift_Score.
6. THE Rng_Stream SHALL implement a counter-based algorithm whose output depends only on the Stream_Key and a draw index.
7. IF the Run_Seed is zero, THEN THE Lot_Generator SHALL substitute the constant `0x9E3779B97F4A7C15` and record the substitution as an Analytics_Event.
8. THE Simulation_Core SHALL serialize a Shift_Score to a stable text form in which field order is fixed and floating-point values are written with 9 significant digits.
9. THE Lot_Generator SHALL derive the Latent_Lot from the Run_Seed, the Day_Index, and the Shift_Configuration alone, and SHALL read zero values from the Command_Stream, from the Cmp_Safety_Brake counter, and from a pending Cmp_Drift_Request.
10. THE Scoring_Engine SHALL derive the Shift_Score from the Run_Seed, the Shift_Configuration, and the Command_Stream alone.
11. THE Shift_Director SHALL derive each Effective_Wafer from one Latent_Lot entry and the current station state, and THE Shift_Director SHALL execute zero Rng_Stream draws while deriving an Effective_Wafer.
12. THE Shift_Director SHALL copy the Wafer_Index, the Routing_Step, the Signal_Magnitude, the Phase_State, the Organic_Load, the Metallic_Load, and the Required_Metrology_Set of a Latent_Lot entry unchanged into the Effective_Wafer, and THE Defect_Mask SHALL be the only rule that sets an Effective_Wafer Defect_Class or an Effective_Wafer Defect_Severity to a value differing from the Latent_Lot entry.
13. THE Metrology_Cluster, the Disposition_Evaluator, the Compliance_Auditor, the Scoring_Engine, and the Presentation_Layer SHALL read the Effective_Wafer, and THE Lot_Generator SHALL be the only component that reads a Latent_Lot entry.

### Requirement 3: Defect Taxonomy And Disposition Correctness

**User Story:** As a trainee, I want exactly one correct disposition for every wafer, so that feedback on my judgement is unambiguous.

#### Acceptance Criteria

1. THE Simulation_Core SHALL define the Defect_Class to Defect_Severity to correct-Disposition mapping as: `Clean` maps to `None` and `Accept`; `BowingWarping` maps to `Catastrophic` and `Reject`; `StiVoidSeam` maps to `Catastrophic` and `Reject`; `InterfaceTrapsRoughness` maps to `Parametric` and `Reject`; `SilicideBridging` with Phase_State `C49` maps to `Catastrophic` and `Rework`; `SilicideBridging` with Phase_State `C54` maps to `Catastrophic` and `Reject`; `TungstenPlugVoid` maps to `Catastrophic` and `Reject`; `SubstrateContamination` maps to `Parametric` and `Rework`.
2. THE Disposition_Evaluator SHALL emit exactly one Outcome_Class for each pair of Effective_Wafer and stamped Disposition.
3. WHEN the stamped Disposition equals the correct Disposition for the Effective_Wafer and the correct Disposition is `Accept`, THE Disposition_Evaluator SHALL emit `CorrectAccept`.
4. WHEN the stamped Disposition equals the correct Disposition for the Effective_Wafer and the correct Disposition is `Reject`, THE Disposition_Evaluator SHALL emit `CorrectReject`.
5. WHEN the stamped Disposition equals the correct Disposition for the Effective_Wafer and the correct Disposition is `Rework`, THE Disposition_Evaluator SHALL emit `CorrectRework`.
6. WHEN the stamped Disposition is `Accept` and the Effective_Wafer Defect_Severity is `Catastrophic`, THE Disposition_Evaluator SHALL emit `FalseAcceptKiller`.
7. WHEN the stamped Disposition is `Accept` and the Effective_Wafer Defect_Severity is `Parametric`, THE Disposition_Evaluator SHALL emit `FalseAcceptParametric`.
8. WHEN the stamped Disposition is `Reject` and the Effective_Wafer Defect_Class is `Clean`, THE Disposition_Evaluator SHALL emit `FalseReject`.
9. WHEN the stamped Disposition is `Reject` and the correct Disposition for the Effective_Wafer is `Rework`, THE Disposition_Evaluator SHALL emit `MissedRework`.
10. WHEN the stamped Disposition is `Rework` and the correct Disposition for the Effective_Wafer is not `Rework`, THE Disposition_Evaluator SHALL emit `ImproperRework`.
11. THE Simulation_Core SHALL assign each Defect_Class to exactly one Process_Layer as: `BowingWarping` and `SubstrateContamination` to `SubstratePreparation`; `StiVoidSeam` to `ShallowTrenchIsolation`; `InterfaceTrapsRoughness` to `HighKMetalGate`; `SilicideBridging` to `StrainAndSilicide`; `TungstenPlugVoid` to `BackEndOfLine`.
12. THE Lot_Generator SHALL assign a Defect_Class other than `Clean` to a Wafer_Record only when the Process_Layer of that Defect_Class equals the Routing_Step of that Wafer_Record.
13. WHERE the Wafer_Record Defect_Class is `SilicideBridging`, THE Lot_Generator SHALL assign a Phase_State of `C49` or `C54`, and WHERE the Wafer_Record Defect_Class is any other value, THE Lot_Generator SHALL assign a Phase_State of `NotApplicable`.
14. THE Disposition_Evaluator SHALL resolve the correct Disposition from the Effective_Wafer Defect_Class and the Effective_Wafer Phase_State through the criterion 1 mapping, so that an Effective_Wafer whose Defect_Class is `Clean` because the Defect_Mask applied carries the correct Disposition `Accept`.

### Requirement 4: Metrology Tool Model

**User Story:** As a trainee, I want each instrument to reveal only what that instrument physically measures, so that I learn which tool answers which question.

#### Acceptance Criteria

1. THE Simulation_Core SHALL define the Metrology_Tool to Reveal_Set mapping as: `StylusProfilometer` reveals `BowingWarping`; `FourPointProbeSims` reveals `SubstrateContamination`; `SpectroscopicEllipsometry` reveals `StiVoidSeam`; `XrayRefractometry` reveals `InterfaceTrapsRoughness`; `ElectronMicroscope` reveals `SilicideBridging` and `TungstenPlugVoid`.
2. WHEN the Metrology_Cluster completes a Tool_Activation of a Metrology_Tool whose Reveal_Set excludes the Effective_Wafer Defect_Class, THE Metrology_Cluster SHALL emit a Metrology_Reading with Reading_Status `InSpec`.
3. WHEN the Metrology_Cluster completes a Tool_Activation of a Metrology_Tool whose Reveal_Set includes the Effective_Wafer Defect_Class and the Signal_Magnitude exceeds the sum of the Control_Limit and the Marginal_Band, THE Metrology_Cluster SHALL emit a Metrology_Reading with Reading_Status `OutOfSpec`.
4. WHEN the Metrology_Cluster completes a Tool_Activation of a Metrology_Tool whose Reveal_Set includes the Effective_Wafer Defect_Class and the Signal_Magnitude lies in the half-open interval from the Control_Limit up to the sum of the Control_Limit and the Marginal_Band, THE Metrology_Cluster SHALL emit a Metrology_Reading with Reading_Status `Marginal`.
5. WHERE the Effective_Wafer Defect_Class is `SilicideBridging`, THE Metrology_Cluster SHALL include the Phase_State value in the `ElectronMicroscope` Metrology_Reading channels.
6. THE Metrology_Cluster SHALL exclude the Phase_State value from every Metrology_Reading produced by a Metrology_Tool other than `ElectronMicroscope`.
7. THE Metrology_Cluster SHALL bind Tool_Slot 1 through Tool_Slot 4 to the Metrology_Tools declared by the active Day_Config, and THE Metrology_Cluster SHALL leave a Tool_Slot empty when the active Day_Config declares no Metrology_Tool for that Tool_Slot.
8. WHEN the Input_Router enqueues a `SelectToolSlot` Station_Command naming an empty Tool_Slot, THE Metrology_Cluster SHALL retain the previously selected Tool_Slot and record an Analytics_Event of type `EmptySlotSelected`.
9. THE Simulation_Core SHALL define base Dwell_Seconds as: `StylusProfilometer` 6.0; `FourPointProbeSims` 5.0; `SpectroscopicEllipsometry` 7.0; `XrayRefractometry` 8.0; `ElectronMicroscope` 10.0.
10. WHEN a Tool_Activation completes, THE Shift_Director SHALL decrement the shift clock by the product of the base Dwell_Seconds and the Tool_Operation_Speed_Multiplier.
11. WHILE a Tool_Activation is in progress, THE Metrology_Cluster SHALL reject further `ActivateTool` Station_Commands and record an Analytics_Event of type `ToolBusy`.
12. THE Simulation_Core SHALL define a Control_Limit and a Marginal_Band for each Metrology_Tool in the Balancing_Config, with each Control_Limit in the open interval (0, 1) and each Marginal_Band greater than zero.

### Requirement 5: Process Sequence Compliance

**User Story:** As a fab compliance officer, I want the game to log a strike when an operator stamps a wafer without running the required verification tools, so that trainees internalize mandatory sequence discipline.

#### Acceptance Criteria

1. THE Lot_Generator SHALL set the Wafer_Record Required_Metrology_Set to the set of Metrology_Tools whose Reveal_Set contains at least one Defect_Class assigned to the Wafer_Record Routing_Step, intersected with the Metrology_Tools mounted by the active Day_Config.
2. THE Lot_Generator SHALL derive the Required_Metrology_Set from the Wafer_Record Routing_Step alone and SHALL exclude the Wafer_Record Defect_Class from the Required_Metrology_Set derivation.
3. THE Defect_Mask SHALL leave the Required_Metrology_Set unchanged, because criterion 2 derives the Required_Metrology_Set from the Routing_Step alone and the Defect_Mask changes no Routing_Step.
4. WHEN a `Stamp` Station_Command is consumed for an Effective_Wafer, THE Compliance_Auditor SHALL record one Out_Of_Sequence violation for each Metrology_Tool in the Required_Metrology_Set that has zero Tool_Activations on that Effective_Wafer.
5. THE Compliance_Auditor SHALL record Out_Of_Sequence violations independently of the Outcome_Class emitted by the Disposition_Evaluator.
6. THE Compliance_Auditor SHALL classify a Tool_Activation as a Productive_Activation when the Tool_Activation is the first activation of a Metrology_Tool belonging to the Effective_Wafer Required_Metrology_Set.
7. THE Compliance_Auditor SHALL classify a Tool_Activation as a Productive_Activation when the resulting Reading_Status is `Marginal` or `OutOfSpec`.
8. THE Compliance_Auditor SHALL classify every Tool_Activation that satisfies neither criterion 6 nor criterion 7 as an unproductive activation.
9. THE Compliance_Auditor SHALL compute the Metrology_Optimization_Rate as the count of Productive_Activations divided by the count of all Tool_Activations in the shift.
10. IF the count of all Tool_Activations in the shift is zero, THEN THE Compliance_Auditor SHALL report a Metrology_Optimization_Rate of 0.0.
11. THE Compliance_Auditor SHALL compute Process_Compliance as one minus the quotient of total Out_Of_Sequence violations divided by the summed cardinality of the Required_Metrology_Sets of all stamped Effective_Wafers.
12. IF the summed cardinality of the Required_Metrology_Sets of all stamped Effective_Wafers is zero, THEN THE Compliance_Auditor SHALL report a Process_Compliance of 1.0.

### Requirement 6: RCA-Clean Rework Mini-Game

**User Story:** As a trainee, I want to run the dual-tank RCA clean with real timing consequences, so that I learn that under-soaking leaves metallic contamination and over-soaking degrades the substrate.

#### Acceptance Criteria

1. WHEN a `Stamp` Station_Command with Disposition `Rework` is consumed for an Effective_Wafer whose Defect_Class is `SubstrateContamination`, THE Shift_Director SHALL start the Rca_Clean_Bench for that Effective_Wafer.
2. THE Rca_Clean_Bench SHALL compute the SC-1 target soak seconds as 4.0 plus the product of the Organic_Load and 8.0.
3. THE Rca_Clean_Bench SHALL compute the SC-2 target soak seconds as 3.0 plus the product of the Metallic_Load and 7.0.
4. THE Rca_Clean_Bench SHALL compute the per-tank tolerance seconds as the product of 1.5, the Tool_Operation_Speed_Multiplier, and the Extended_Timing_Tolerance multiplier.
5. THE Rca_Clean_Bench SHALL measure a tank soak duration as the elapsed shift seconds between the `SubmergeTank` Station_Command and the matching `RaiseTank` Station_Command for that tank.
6. WHEN the absolute difference between a tank soak duration and that tank's target soak seconds is at most the tolerance seconds, THE Rca_Clean_Bench SHALL classify that tank as `Optimal`.
7. WHEN the absolute difference between a tank soak duration and that tank's target soak seconds exceeds the tolerance seconds and is at most twice the tolerance seconds, THE Rca_Clean_Bench SHALL classify that tank as `Marginal`.
8. WHEN the absolute difference between a tank soak duration and that tank's target soak seconds exceeds twice the tolerance seconds, THE Rca_Clean_Bench SHALL classify that tank as `Failed`.
9. IF a `SubmergeTank` Station_Command names the SC-2 tank while the SC-1 tank has zero completed soaks, THEN THE Rca_Clean_Bench SHALL emit a Rework_Outcome of `Scrap` and record an Analytics_Event of type `ChemistryOutOfOrder`.
10. WHEN both tanks are classified `Optimal`, THE Rca_Clean_Bench SHALL emit a Rework_Outcome of `Success`.
11. WHEN at least one tank is classified `Marginal` and no tank is classified `Failed`, THE Rca_Clean_Bench SHALL emit a Rework_Outcome of `PartialCredit`.
12. WHEN at least one tank is classified `Failed`, THE Rca_Clean_Bench SHALL emit a Rework_Outcome of `Scrap`.
13. THE Rca_Clean_Bench SHALL record, for each tank, an Analytics_Event of type `UnderSoak` when the soak duration is below the target soak seconds and an Analytics_Event of type `OverSoak` when the soak duration is above the target soak seconds.
14. WHILE the Rca_Clean_Bench is active, THE Shift_Director SHALL continue decrementing the shift clock.
15. IF the shift clock reaches zero while the Rca_Clean_Bench is active, THEN THE Rca_Clean_Bench SHALL emit a Rework_Outcome of `Scrap` and record an Analytics_Event of type `ReworkAbandoned`.

### Requirement 7: Selective Silicide Wet Etch Rework Mini-Game

**User Story:** As a trainee, I want to trigger the ultrasonic agitation wash inside the C49 phase window, so that I learn why the titanium phase transition sets an irreversible deadline.

#### Acceptance Criteria

1. WHEN a `Stamp` Station_Command with Disposition `Rework` is consumed for an Effective_Wafer whose Defect_Class is `SilicideBridging` and whose Phase_State is `C49`, THE Shift_Director SHALL start the Silicide_Etch_Bench for that Effective_Wafer.
2. THE Silicide_Etch_Bench SHALL derive a C49 window open time in the closed interval [2.0, 6.0] seconds and a C49 window close time in the closed interval [8.0, 14.0] seconds from the Wafer_Record Stream_Key, with the close time strictly greater than the open time.
3. THE Silicide_Etch_Bench SHALL define the core band as the central 60 percent of the interval between the window open time and the window close time.
4. THE Silicide_Etch_Bench SHALL accept at most one `TriggerAgitation` Station_Command per mini-game instance.
5. WHEN a `TriggerAgitation` Station_Command arrives at a time inside the core band, THE Silicide_Etch_Bench SHALL emit a Rework_Outcome of `Success`.
6. WHEN a `TriggerAgitation` Station_Command arrives at a time inside the C49 window and outside the core band, THE Silicide_Etch_Bench SHALL emit a Rework_Outcome of `PartialCredit`.
7. IF a `TriggerAgitation` Station_Command arrives at a time before the window open time, THEN THE Silicide_Etch_Bench SHALL emit a Rework_Outcome of `Scrap` and record an Analytics_Event of type `PrematureAgitation`.
8. IF a `TriggerAgitation` Station_Command arrives at a time after the window close time, THEN THE Silicide_Etch_Bench SHALL emit a Rework_Outcome of `Scrap` and record an Analytics_Event of type `C54PhaseLocked`.
9. IF the window close time elapses with zero `TriggerAgitation` Station_Commands received, THEN THE Silicide_Etch_Bench SHALL emit a Rework_Outcome of `Scrap` and record an Analytics_Event of type `BridgeLockedIn`.
10. THE Shift_Director SHALL start the Silicide_Etch_Bench only for Effective_Wafers whose Phase_State is `C49`.
11. WHILE the Silicide_Etch_Bench is active, THE Silicide_Etch_Bench SHALL expose the elapsed phase time and the measured resistance channel value to the Presentation_Layer without exposing the window open time or the window close time.

### Requirement 8: CMP Laser Endpoint Re-Calibration Mini-Game

**User Story:** As a trainee, I want correct CMP endpoint calibration to visibly protect the next several wafers, so that I learn that tool maintenance prevents downstream dishing defects.

#### Acceptance Criteria

1. THE Lot_Generator SHALL draw a Cmp_Drift_Roll for every Wafer_Record from that Wafer_Record Stream_Key on the CMP drift Channel_Id, independently of the Cmp_Safety_Brake counter, of a pending Cmp_Drift_Request, and of the Command_Stream.
2. WHEN the Shift_Director presents an Effective_Wafer whose Routing_Step is `ShallowTrenchIsolation` while the Cmp_Safety_Brake counter is zero and the Cmp_Drift_Roll of the corresponding Wafer_Record is less than the Day_Config `CmpDriftProbability`, THE Cmp_Calibration_Console SHALL raise a Cmp_Drift_Request.
3. WHILE the Cmp_Safety_Brake counter is greater than zero, THE Cmp_Calibration_Console SHALL raise zero Cmp_Drift_Requests.
4. WHILE no Cmp_Drift_Request is pending, THE Cmp_Calibration_Console SHALL reject `AdjustCalibrationKnob` and `ConfirmCalibration` Station_Commands and record an Analytics_Event of type `ConsoleInert`.
5. THE Cmp_Calibration_Console SHALL expose exactly two adjustable knobs named `Gain` and `Phase`, each accepting a value in the closed interval [0, 1].
6. THE Cmp_Calibration_Console SHALL derive a target `Gain` value and a target `Phase` value from the Wafer_Record Stream_Key.
7. THE Cmp_Calibration_Console SHALL compute the calibration error as the root mean square of the difference between the player reflectance curve and the reference reflectance curve, sampled at 64 evenly spaced points.
8. WHEN a `ConfirmCalibration` Station_Command is consumed and the calibration error is at most the Balancing_Config `OptimalRms` value of 0.05, THE Cmp_Calibration_Console SHALL emit a Rework_Outcome of `Success` and set the Cmp_Safety_Brake counter to 5.
9. WHEN a `ConfirmCalibration` Station_Command is consumed and the calibration error exceeds the `OptimalRms` value and is at most the Balancing_Config `MarginalRms` value of 0.12, THE Cmp_Calibration_Console SHALL emit a Rework_Outcome of `PartialCredit` and set the Cmp_Safety_Brake counter to 2.
10. WHEN a `ConfirmCalibration` Station_Command is consumed and the calibration error exceeds the `MarginalRms` value, THE Cmp_Calibration_Console SHALL emit a Rework_Outcome of `CalibrationFailed` and leave the Cmp_Safety_Brake counter unchanged.
11. WHEN the Shift_Director presents an Effective_Wafer while the Cmp_Safety_Brake counter is greater than zero, THE Shift_Director SHALL decrement the Cmp_Safety_Brake counter by 1.
12. WHILE the Cmp_Safety_Brake counter is greater than zero, THE Shift_Director SHALL apply the Defect_Mask when projecting a Latent_Lot entry whose Defect_Class is `StiVoidSeam`, setting the Effective_Wafer Defect_Class to `Clean` and the Effective_Wafer Defect_Severity to `None`.
13. THE Defect_Mask SHALL apply to a latent Defect_Class of `StiVoidSeam` alone, and THE Shift_Director SHALL copy every other latent Defect_Class into the Effective_Wafer Defect_Class unchanged.
14. THE Defect_Mask SHALL execute zero Rng_Stream draws, so that the draw count per Channel_Id per Wafer_Index is equal with the Cmp_Safety_Brake counter at zero and with the Cmp_Safety_Brake counter greater than zero.
15. THE Lot_Generator SHALL multiply the `StiVoidSeam` selection weight by the Balancing_Config `DishingPenaltyMultiplier` value of 2.0 for every Wafer_Record whose Routing_Step is `ShallowTrenchIsolation` and whose Cmp_Drift_Roll is less than the Day_Config `CmpDriftProbability`, independently of the Cmp_Safety_Brake counter, of a pending Cmp_Drift_Request, and of the Command_Stream.
16. THE Cmp_Calibration_Console SHALL destroy zero Wafer_Records, because CMP calibration operates on the polishing tool and not on a wafer.

### Requirement 9: Economy And Scoring

**User Story:** As a trainee, I want every action to have a stated financial consequence, so that I can reason about the cost of a mistake.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL award income in Credits per Outcome_Class as: `CorrectAccept` 100; `CorrectReject` 100; `CorrectRework` 100.
2. THE Scoring_Engine SHALL apply penalties in Credits per Outcome_Class as: `FalseAcceptKiller` negative 500; `FalseAcceptParametric` negative 250; `FalseReject` negative 200; `MissedRework` negative 150; `ImproperRework` negative 100; `Unprocessed` negative 25.
3. THE Scoring_Engine SHALL apply a penalty of negative 50 Credits for each Out_Of_Sequence violation recorded by the Compliance_Auditor.
4. WHEN a Rework_Outcome of `Success` is emitted for an Effective_Wafer, THE Scoring_Engine SHALL award an additional salvage bonus of 50 Credits.
5. WHEN a Rework_Outcome of `PartialCredit` is emitted for an Effective_Wafer, THE Scoring_Engine SHALL award an additional salvage bonus of 0 Credits.
6. WHEN a Rework_Outcome of `Scrap` is emitted for an Effective_Wafer, THE Scoring_Engine SHALL withhold the `CorrectRework` income and apply a scrap cost of negative 100 Credits.
7. WHEN a Rework_Outcome of `CalibrationFailed` is emitted, THE Scoring_Engine SHALL apply a tool time cost of negative 25 Credits.
8. THE Scoring_Engine SHALL compute Salary_Total as the signed sum of all income, salvage bonuses, penalties, and costs accumulated during the shift.
9. THE Scoring_Engine SHALL compute Disposition_Accuracy as the count of `CorrectAccept`, `CorrectReject`, and `CorrectRework` outcomes divided by the count of stamped Effective_Wafers.
10. IF the count of stamped Effective_Wafers is zero, THEN THE Scoring_Engine SHALL report a Disposition_Accuracy of 0.0.
11. THE Scoring_Engine SHALL compute Killer_Containment as one minus the quotient of the count of `FalseAcceptKiller` outcomes divided by the count of presented Effective_Wafers whose Effective_Wafer Defect_Severity is `Catastrophic`.
12. IF the count of presented Effective_Wafers whose Effective_Wafer Defect_Severity is `Catastrophic` is zero, THEN THE Scoring_Engine SHALL report a Killer_Containment of 1.0.
13. THE Scoring_Engine SHALL compute Competency_Score as the sum of the products of Disposition_Accuracy and weight 0.50, Killer_Containment and weight 0.25, Metrology_Optimization_Rate and weight 0.15, and Process_Compliance and weight 0.10.
14. THE Scoring_Engine SHALL clamp Competency_Score to the closed interval [0, 1].
15. THE Balancing_Config SHALL declare the four Competency_Score weights, and THE Scoring_Engine SHALL reject a Balancing_Config whose four weights do not sum to 1.0 within a tolerance of 0.000001.
16. THE Scoring_Engine SHALL record Latency_By_Layer as the mean and maximum seconds between wafer presentation and `Stamp` Station_Command consumption, grouped by the Effective_Wafer Routing_Step.
17. THE Scoring_Engine SHALL exclude Effective_Wafers with Outcome_Class `Unprocessed` from the Disposition_Accuracy denominator and from Latency_By_Layer.

### Requirement 10: Dual-Gate Shift Evaluation

**User Story:** As a training administrator, I want shift progression to require both financial output and demonstrated competency, so that neither reckless speed nor slow perfectionism passes.

#### Acceptance Criteria

1. THE Gate_Evaluator SHALL evaluate the Salary_Gate as satisfied when Salary_Total is greater than or equal to the Day_Config Salary_Quota.
2. THE Gate_Evaluator SHALL evaluate the Competency_Gate as satisfied when Competency_Score is greater than or equal to the Day_Config Competency_Floor, Disposition_Accuracy is greater than or equal to the Day_Config Min_Disposition_Accuracy, and the quotient of `FalseAcceptKiller` count divided by the count of presented Effective_Wafers whose Effective_Wafer Defect_Severity is `Catastrophic` is less than or equal to the Day_Config Max_Killer_False_Accept_Rate.
3. WHEN both the Salary_Gate and the Competency_Gate are satisfied, THE Gate_Evaluator SHALL emit a Shift_Result of `Passed` and reset the Repeat_Count for the Day_Index to zero.
4. WHEN at least one gate is unsatisfied and the Repeat_Count for the Day_Index is less than 2, THE Gate_Evaluator SHALL emit a Shift_Result of `Repeat` and increment the Repeat_Count for the Day_Index by 1.
5. WHEN at least one gate is unsatisfied and the Repeat_Count for the Day_Index is greater than or equal to 2, THE Gate_Evaluator SHALL emit a Shift_Result of `Terminated`.
6. WHEN the Gate_Evaluator emits a Shift_Result of `Repeat`, THE Shift_Director SHALL start the same Day_Index with a Run_Seed derived from the previous Run_Seed and the Repeat_Count.
7. WHEN the Gate_Evaluator emits a Shift_Result of `Repeat`, THE Scaffolding_Presenter SHALL set the active Callout_Mode to `Always` for the repeated shift.
8. WHEN the Gate_Evaluator emits a Shift_Result of `Passed` and the Day_Index is less than 3, THE Shift_Director SHALL advance the Operator_Profile Day_Index by 1.
9. WHEN the Gate_Evaluator emits a Shift_Result of `Passed` and the Day_Index equals 3, THE Shift_Director SHALL emit a run completion event and present the final Debrief_Report.
10. THE Day_Config SHALL declare Salary_Quota values of 900 Credits for Day_Index 1, 1400 Credits for Day_Index 2, and 1900 Credits for Day_Index 3.
11. THE Day_Config SHALL declare Competency_Floor values of 0.70 for Day_Index 1, 0.78 for Day_Index 2, and 0.85 for Day_Index 3.
12. THE Day_Config SHALL declare Min_Disposition_Accuracy values of 0.60 for Day_Index 1, 0.75 for Day_Index 2, and 0.85 for Day_Index 3.
13. THE Day_Config SHALL declare Max_Killer_False_Accept_Rate values of 0.30 for Day_Index 1, 0.20 for Day_Index 2, and 0.10 for Day_Index 3.
14. THE Gate_Evaluator SHALL emit, alongside the Shift_Result, a per-gate reason record naming each unsatisfied condition and the numeric shortfall for that condition.

### Requirement 11: Shift Loop And Timing

**User Story:** As a trainee, I want a continuous 8 to 12 minute shift with a clear end and a printed debrief, so that each session is a bounded, reviewable unit of practice.

#### Acceptance Criteria

1. THE Day_Config SHALL declare a Shift_Duration in the closed interval [480, 720] seconds.
2. THE Day_Config SHALL declare Shift_Duration values of 480 seconds for Day_Index 1, 600 seconds for Day_Index 2, and 720 seconds for Day_Index 3.
3. THE Day_Config SHALL declare Lot_Size values of 12 for Day_Index 1, 16 for Day_Index 2, and 20 for Day_Index 3.
4. WHEN a shift starts, THE Shift_Director SHALL present the Effective_Wafer projected from the Latent_Lot entry at Wafer_Index 0 and set the shift clock to the Day_Config Shift_Duration.
5. WHILE an Effective_Wafer is presented, THE Shift_Director SHALL accept `SelectToolSlot`, `ActivateTool`, `TiltWafer`, `SetIlluminationAngle`, and `Stamp` Station_Commands.
6. WHEN a `Stamp` Station_Command is consumed and no rework mini-game starts, THE Shift_Director SHALL present the next Effective_Wafer after an intake delay of 1.5 seconds.
7. WHEN a rework mini-game emits a Rework_Outcome, THE Shift_Director SHALL present the next Effective_Wafer after an intake delay of 1.5 seconds.
8. WHEN the Wafer_Index of the presented Effective_Wafer equals the Lot_Size minus 1 and a Disposition is stamped for that Effective_Wafer, THE Shift_Director SHALL end the shift.
9. WHEN the shift clock reaches zero, THE Shift_Director SHALL end the shift.
10. WHEN the Shift_Director ends the shift, THE Shift_Director SHALL assign Outcome_Class `Unprocessed` to the presented Effective_Wafer if that Effective_Wafer has no stamped Disposition, and to every Latent_Lot entry with a Wafer_Index greater than the presented Wafer_Index.
11. WHEN the Shift_Director ends the shift, THE Scoring_Engine SHALL produce a Shift_Score and THE Gate_Evaluator SHALL produce a Shift_Result before THE Incident_Printer renders the Debrief_Report.
12. WHEN the Incident_Printer completes rendering the Debrief_Report, THE Quiz_Board SHALL present the optional three-question review.
13. THE Shift_Director SHALL charge every rework mini-game elapsed second against the shift clock.
14. THE Shift_Director SHALL charge the intake delay against the shift clock.

### Requirement 12: Wafer Inspection Presentation

**User Story:** As a trainee, I want to physically tilt the wafer under cross-lighting and read instrument screens, so that visual inspection is a skill rather than a menu selection.

#### Acceptance Criteria

1. THE Station_Assembler SHALL construct a wafer mount stage, a cross-illumination dial, a metrology instrumentation cluster of four screens, a traveler clipboard, three routing stamps, a glossary tablet, an overhead shift board, an incident printer, and a rework console.
2. WHEN a `TiltWafer` Station_Command is consumed, THE Presentation_Layer SHALL rotate the wafer mount stage by the commanded yaw delta and pitch delta, clamped to the closed interval [-60, 60] degrees for each axis.
3. WHEN a `SetIlluminationAngle` Station_Command is consumed, THE Presentation_Layer SHALL set the cross-illumination angle to the commanded value, clamped to the closed interval [0, 180] degrees.
4. WHERE criterion 6 permits a defect overlay for the Effective_Wafer Defect_Class, WHILE the wafer stage yaw and pitch place a defect region within the specular grazing band of the cross-illumination angle, THE Presentation_Layer SHALL render the defect overlay for that region at full opacity.
5. WHERE criterion 6 permits a defect overlay for the Effective_Wafer Defect_Class, WHILE the wafer stage yaw and pitch place a defect region outside the specular grazing band of the cross-illumination angle, THE Presentation_Layer SHALL render the defect overlay for that region at reduced opacity.
6. THE Presentation_Layer SHALL permit a defect overlay for the Effective_Wafer Defect_Class when a completed Tool_Activation has revealed that Defect_Class, and THE Presentation_Layer SHALL permit a defect overlay for the Effective_Wafer Defect_Class when the Defect_Profile Visually_Detectable field for that Defect_Class is `true` and the Signal_Magnitude exceeds the Balancing_Config `VisualDetectionThreshold`.
7. WHILE the Defect_Profile Visually_Detectable field for the Effective_Wafer Defect_Class is `false` and zero Tool_Activations that reveal that Defect_Class have completed on the presented Effective_Wafer, THE Presentation_Layer SHALL render zero defect overlay pixels, at every Signal_Magnitude in [0, 1], every wafer stage yaw in [-60, 60] degrees, every wafer stage pitch in [-60, 60] degrees, and every cross-illumination angle in [0, 180] degrees.
8. THE Presentation_Layer SHALL display each Metrology_Reading on the instrumentation cluster screen bound to the Tool_Slot that produced the Metrology_Reading.
9. THE Traveler_Clipboard SHALL display the presented Effective_Wafer Routing_Step, the Required_Metrology_Set, the active Day_Config rule text, and the target work-function metal for the Routing_Step.
10. WHEN a routing stamp is pressed, THE Input_Router SHALL enqueue exactly one `Stamp` Station_Command carrying the Disposition bound to that stamp.
11. WHEN a `Stamp` Station_Command has been consumed for the presented Effective_Wafer, THE Presentation_Layer SHALL disable all three routing stamps until the next Effective_Wafer is presented.

### Requirement 13: Day Progression And Rule Configuration

**User Story:** As a trainee, I want each day to introduce new material science and new rules on top of what I already learned, so that cognitive load grows in a manageable order.

#### Acceptance Criteria

1. THE Day_Config for Day_Index 1 SHALL declare Routing_Step weights of 1.0 for `SubstratePreparation` and 0.0 for every other Process_Layer.
2. THE Day_Config for Day_Index 1 SHALL mount `StylusProfilometer` in Tool_Slot 1 and `FourPointProbeSims` in Tool_Slot 2, and SHALL leave Tool_Slot 3 and Tool_Slot 4 empty.
3. THE Day_Config for Day_Index 2 SHALL declare Routing_Step weights of 0.25 for `SubstratePreparation`, 0.375 for `ShallowTrenchIsolation`, 0.375 for `HighKMetalGate`, and 0.0 for every other Process_Layer.
4. THE Day_Config for Day_Index 2 SHALL mount `StylusProfilometer` in Tool_Slot 1, `FourPointProbeSims` in Tool_Slot 2, `SpectroscopicEllipsometry` in Tool_Slot 3, and `XrayRefractometry` in Tool_Slot 4.
5. THE Day_Config for Day_Index 3 SHALL declare Routing_Step weights of 0.15 for `SubstratePreparation`, 0.15 for `ShallowTrenchIsolation`, 0.35 for `StrainAndSilicide`, 0.35 for `BackEndOfLine`, and 0.0 for `HighKMetalGate`.
6. THE Day_Config for Day_Index 3 SHALL mount `StylusProfilometer` in Tool_Slot 1, `FourPointProbeSims` in Tool_Slot 2, `SpectroscopicEllipsometry` in Tool_Slot 3, and `ElectronMicroscope` in Tool_Slot 4.
7. THE Day_Config_Loader SHALL reject a Day_Config in which a Process_Layer carries a Routing_Step weight greater than zero while a Defect_Class assigned to that Process_Layer has a diagnostic Metrology_Tool that is mounted in no Tool_Slot.
8. THE Day_Config_Loader SHALL reject a Day_Config whose Routing_Step weights do not sum to 1.0 within a tolerance of 0.000001.
9. THE Day_Config for Day_Index 1 SHALL declare a Callout_Mode of `Always`.
10. THE Day_Config for Day_Index 2 SHALL declare a Callout_Mode of `FirstOccurrencePerDefectClass`.
11. THE Day_Config for Day_Index 3 SHALL declare a Callout_Mode of `Disabled`.
12. THE Day_Config for Day_Index 2 and the Day_Config for Day_Index 3 SHALL declare a work-function metal requirement of `TiN` for PMOS routing and `TiAl` for NMOS routing, and THE Traveler_Clipboard SHALL display the requirement for the presented Effective_Wafer.
13. THE Day_Config for Day_Index 1 SHALL declare a `CmpDriftProbability` of 0.0, and THE Day_Config for Day_Index 2 and the Day_Config for Day_Index 3 SHALL declare a `CmpDriftProbability` of 0.25.
14. THE Day_Config_Loader SHALL load every Day_Config from an authored data file and SHALL contain zero hard-coded Day_Config values in the Simulation_Core.
15. THE Day_Config SHALL be the only authored record that declares a `CmpDriftProbability`, and THE Cmp_Calibration_Console SHALL read `CmpDriftProbability` from the active Day_Config.

### Requirement 14: Defect Density And Balancing Knobs

**User Story:** As a training designer, I want the difficulty of incoming lots to be adjustable from data, so that I can tune the experience without recompiling.

#### Acceptance Criteria

1. THE Balancing_Config SHALL declare Defect_Bucket weights with default values of 0.10 for `RejectClass`, 0.15 for `ReworkClass`, and 0.75 for `Clean`.
2. THE Lot_Generator SHALL reject a Balancing_Config whose three Defect_Bucket weights do not sum to 1.0 within a tolerance of 0.000001.
3. THE Lot_Generator SHALL select a Defect_Bucket for each Wafer_Record by a weighted draw from the Defect_Bucket weights using the Wafer_Record Stream_Key.
4. WHEN the selected Defect_Bucket contains no Defect_Class assigned to the Wafer_Record Routing_Step, THE Lot_Generator SHALL assign the Defect_Class `Clean` and record an Analytics_Event of type `BucketFallback`.
5. THE Lot_Generator SHALL execute an equal number of Rng_Stream draws on each Channel_Id for a given Wafer_Index across every Command_Stream, so that the draw count is independent of player behaviour.
6. THE Balancing_Config SHALL declare an Ambiguity_Tolerance in the closed interval [0, 1] with a default value of 0.35.
7. THE Lot_Generator SHALL draw a Signal_Magnitude for a defective Wafer_Record from the closed interval bounded below by the product of the tool Control_Limit and the quantity one minus half the Ambiguity_Tolerance, and bounded above by 1.0.
8. THE Balancing_Config SHALL declare a Tool_Operation_Speed_Multiplier greater than zero with a default value of 1.0.
9. THE Balancing_Config SHALL declare a `VisualDetectionThreshold` in the closed interval [0, 1] with a default value of 0.80.
10. THE Balancing_Config SHALL declare a `DishingPenaltyMultiplier`, an `OptimalRms`, a `MarginalRms`, and the four Competency_Score weights, and THE Balancing_Config SHALL declare zero `CmpDriftProbability` fields, because the Day_Config is the authoritative declaration site for `CmpDriftProbability`.
11. THE Data_Layer SHALL load the Balancing_Config from an authored data file and SHALL expose every declared field as a read-only value to the Simulation_Core.
12. THE Data_Layer SHALL report a validation error naming the offending field when a Balancing_Config field falls outside the declared interval for that field.

### Requirement 15: Educational Scaffolding And Micro-Quiz

**User Story:** As a trainee, I want in-world explanations while I am learning and an optional quiz at shift end, so that I understand the physics behind each defect rather than memorizing patterns.

#### Acceptance Criteria

1. THE Station_Assembler SHALL construct an in-world glossary tablet beside the inspection bay that presents one glossary entry per Defect_Class and one glossary entry per Metrology_Tool.
2. WHILE the active Callout_Mode is `Always`, THE Scaffolding_Presenter SHALL display a Scaffolding_Callout for every Metrology_Reading whose Reading_Status is `Marginal` or `OutOfSpec`.
3. WHILE the active Callout_Mode is `FirstOccurrencePerDefectClass`, THE Scaffolding_Presenter SHALL display a Scaffolding_Callout for the first Metrology_Reading in the shift that reveals each Defect_Class and SHALL suppress subsequent Scaffolding_Callouts for that Defect_Class.
4. WHILE the active Callout_Mode is `Disabled`, THE Scaffolding_Presenter SHALL display zero Scaffolding_Callouts.
5. THE Scaffolding_Presenter SHALL load Scaffolding_Callout text from an authored localization data file keyed by Defect_Class.
6. WHEN the Quiz_Board is presented, THE Quiz_Board SHALL select exactly three questions from the authored question pool using an Rng_Stream keyed by the Run_Seed and the Day_Index.
7. THE Quiz_Board SHALL accept a skip command that closes the Quiz_Board without recording an answer.
8. WHEN the player submits a correct answer to a Quiz_Board question, THE Quiz_Board SHALL increase the Operator_Profile CumulativeCompetencyRating by 0.01, clamped to the closed interval [0, 1].
9. THE Quiz_Board SHALL apply zero changes to Shift_Score, to Salary_Total, to Competency_Score, and to Shift_Result.
10. THE authored question pool SHALL contain at least three questions per Day_Index, and each question SHALL declare exactly one correct answer and at least two incorrect answers.

### Requirement 16: Assessment Analytics And Debrief Report

**User Story:** As a training administrator, I want a printed diagnostic sheet at the end of every shift, so that errors convert into explicit learning objectives.

#### Acceptance Criteria

1. THE Analytics_Recorder SHALL append one Analytics_Event for each Tool_Activation, each `Stamp` Station_Command, each Rework_Outcome, each Out_Of_Sequence violation, and each Scaffolding_Callout display.
2. THE Analytics_Event schema SHALL declare a shift-relative timestamp in seconds, an event type string, a Wafer_Index, and a string-keyed payload map.
3. THE Analytics_Recorder SHALL append Analytics_Events in nondecreasing timestamp order.
4. THE Debrief_Report SHALL report Failure_Mode_Identification as the count and rate of correct separations of `Parametric` from `Catastrophic` Effective_Wafer Defect_Severity across stamped Effective_Wafers.
5. THE Debrief_Report SHALL report the Metrology_Optimization_Rate computed by the Compliance_Auditor.
6. THE Debrief_Report SHALL report Latency_By_Layer as the mean and maximum seconds per Process_Layer.
7. THE Debrief_Report SHALL report Salary_Total, Competency_Score, the Shift_Result, and the per-gate reason record.
8. WHEN a Defect_Class accounts for at least 30 percent of the shift's incorrect Outcome_Classes, THE Analytics_Recorder SHALL include the authored Analytical_Error_Capture string for that Defect_Class in the Debrief_Report.
9. WHEN the Debrief_Report includes at least one Analytical_Error_Capture string, THE Analytics_Recorder SHALL include the authored Recommended_Remediation string associated with that Defect_Class.
10. THE Analytics_Recorder SHALL serialize the Debrief_Report to a deterministic text form with fixed field order.
11. THE Incident_Printer SHALL render the Debrief_Report as an in-world printed sheet parented to the incident printer prop.

### Requirement 17: Diegetic Interface Constraint

**User Story:** As a player, I want every readout to exist as a physical object in the cleanroom, so that immersion is never broken by a floating menu.

#### Acceptance Criteria

1. THE Station_Assembler SHALL render every gameplay information surface as a world-space renderer parented to a station prop.
2. THE Station_Assembler SHALL construct zero screen-space overlay canvases for gameplay information.
3. THE Station_Assembler SHALL construct at most one screen-space overlay canvas, tagged `SystemOverlay`, reserved for the pause menu and the accessibility settings panel.
4. THE Overhead_Shift_Board SHALL display the remaining shift clock seconds, the Salary_Total, the Day_Config Salary_Quota, and the count of stamped Effective_Wafers against the Lot_Size.
5. THE Traveler_Clipboard SHALL be the only surface that displays the active Day_Config rule text.
6. THE Incident_Printer SHALL be the only surface that displays the Debrief_Report.
7. THE Presentation_Layer SHALL render every Scaffolding_Callout as a world-space surface anchored to the metrology instrumentation cluster.

### Requirement 18: Input Model And Cross-Platform Parity

**User Story:** As a trainee, I want the desktop and VR paths to score identically, so that my results are comparable regardless of hardware.

#### Acceptance Criteria

1. THE Desktop_Input_Backend SHALL map left mouse button drag over the wafer mount stage to `TiltWafer` Station_Commands.
2. THE Desktop_Input_Backend SHALL map keyboard keys 1, 2, 3, and 4 to `SelectToolSlot` Station_Commands naming Tool_Slot 1, Tool_Slot 2, Tool_Slot 3, and Tool_Slot 4.
3. THE Desktop_Input_Backend SHALL map a left mouse button click on a routing stamp to a `Stamp` Station_Command carrying the Disposition bound to that stamp.
4. THE Desktop_Input_Backend SHALL map mouse scroll over the cross-illumination dial to `SetIlluminationAngle` Station_Commands.
5. THE Input_Router SHALL convert every input backend event into a Station_Command and SHALL enqueue every Station_Command into the Command_Stream.
6. THE Simulation_Core SHALL read player intent exclusively from the Command_Stream and SHALL reference zero input device types.
7. WHERE the Xr_Feature_Flag is disabled, THE Project_Bootstrap SHALL exclude the Xr_Input_Backend from compilation and THE Wafers_Please desktop build SHALL remain fully playable.
8. WHERE the Xr_Feature_Flag is enabled, THE Xr_Input_Backend SHALL emit the same Station_Command type set as the Desktop_Input_Backend.
9. WHEN the Simulation_Core replays one Command_Stream against one Run_Seed and one Shift_Configuration, THE Scoring_Engine SHALL produce a Shift_Score that is independent of which input backend produced the Command_Stream.
10. THE Test_Harness SHALL record a Command_Stream to a text file and SHALL replay a recorded Command_Stream from a text file.

### Requirement 19: Placeholder Asset Provider And Asset Manifest

**User Story:** As a developer, I want every art and audio asset behind a stable key with a procedural placeholder, so that finished assets can be dropped in later without touching gameplay code.

#### Acceptance Criteria

1. THE Asset_Key_Registry SHALL declare every Asset_Key that Wafers_Please code requests, as compile-time constants in one location.
2. WHEN the Asset_Provider receives an Asset_Key for which an authored asset exists at the mapped path, THE Asset_Provider SHALL return the authored asset.
3. WHEN the Asset_Provider receives an Asset_Key for which no authored asset exists at the mapped path, THE Asset_Provider SHALL return a procedurally generated placeholder and record an Analytics_Event of type `PlaceholderUsed`.
4. IF the Asset_Provider receives an Asset_Key that the Asset_Key_Registry does not declare, THEN THE Asset_Provider SHALL return a magenta error placeholder and record an Analytics_Event of type `UnknownAssetKey`.
5. THE Asset_Provider SHALL generate mesh placeholders from primitive shapes, texture placeholders through the Texture2D API, material placeholders from Universal Render Pipeline shader presets, and audio placeholders as synthesized clips.
6. THE Presentation_Layer SHALL request every mesh, texture, material, audio clip, and text string through the Asset_Provider and SHALL contain zero direct asset path literals.
7. THE Asset_Manifest SHALL exist at repository path `ASSETS.md`.
8. THE Asset_Manifest SHALL contain one row per Asset_Key declaring the Asset_Key string, the placeholder implementation currently standing in, a priority of `P0`, `P1`, or `P2`, the expected file format, the expected dimensions or triangle budget, and the repository path at which the authored asset is to be placed.
9. THE Asset_Manifest SHALL cover every entry of the game design document MVP Asset Inventory sections A through H.
10. WHEN the Asset_Manifest_Validator runs, THE Asset_Manifest_Validator SHALL report every Asset_Key declared in the Asset_Key_Registry that is absent from the Asset_Manifest.
11. WHEN the Asset_Manifest_Validator runs, THE Asset_Manifest_Validator SHALL report every Asset_Key present in the Asset_Manifest that is absent from the Asset_Key_Registry.
12. THE Asset_Manifest_Validator SHALL report a failure when the Asset_Key set declared by the Asset_Key_Registry differs from the Asset_Key set listed in the Asset_Manifest.

### Requirement 20: Accessibility Profiles

**User Story:** As a trainee with a visual or motor impairment, I want contrast, text size, audio, and timing options, so that the training content remains reachable.

#### Acceptance Criteria

1. THE Accessibility_Profile SHALL declare High_Contrast_Overlay as a boolean, Text_Scale as a value in the closed interval [0.75, 2.0], Audio_Cue_Volume as a value in the closed interval [0, 1], Color_Vision_Mode as one of `None`, `Protanopia`, `Deuteranopia`, `Tritanopia`, Reduced_Motion as a boolean, and Extended_Timing_Tolerance as a boolean.
2. WHILE High_Contrast_Overlay is enabled, THE Accessibility_Manager SHALL render defect overlays using the high-contrast palette declared in the Data_Layer.
3. WHEN Text_Scale changes, THE Accessibility_Manager SHALL scale every world-space text surface by the new Text_Scale value.
4. WHILE Color_Vision_Mode is a value other than `None`, THE Accessibility_Manager SHALL substitute the palette authored for that Color_Vision_Mode and SHALL pair every color-coded state with a distinct shape or pattern.
5. WHILE Reduced_Motion is enabled, THE Accessibility_Manager SHALL set every non-essential prop animation duration to zero seconds.
6. WHILE Extended_Timing_Tolerance is enabled, THE Accessibility_Manager SHALL supply a tolerance multiplier of 1.5 to the Rca_Clean_Bench, the Silicide_Etch_Bench, and the Cmp_Calibration_Console.
7. THE Shift_Configuration SHALL include the Accessibility_Profile, so that a Shift_Score remains reproducible from a Run_Seed, a Shift_Configuration, and a Command_Stream.
8. THE Accessibility_Manager SHALL provide keyboard-only operation of every Station_Command available to the Desktop_Input_Backend.
9. THE Data_Layer SHALL declare every color pair used for gameplay state with a documented contrast ratio, and THE Data_Layer SHALL declare a target contrast ratio of at least 4.5 to 1 for text surfaces.

### Requirement 21: Configuration Data Schemas

**User Story:** As a training designer, I want all content authored as validated data files, so that days, defects, scoring, and copy can change without code edits.

#### Acceptance Criteria

1. THE Data_Layer SHALL define a Defect_Profile schema declaring a Defect_Class, a Process_Layer, a Defect_Severity, a correct Disposition, a diagnostic Metrology_Tool, a Control_Limit, a Marginal_Band, a Visually_Detectable boolean, and an Asset_Key for the defect overlay.
2. THE Data_Layer SHALL declare Visually_Detectable as `true` in the Defect_Profile of `BowingWarping`, `SubstrateContamination`, and `SilicideBridging`, and as `false` in the Defect_Profile of `StiVoidSeam`, `InterfaceTrapsRoughness`, and `TungstenPlugVoid`.
3. THE Data_Layer SHALL define a Day_Config schema declaring the Day_Index, Routing_Step weights, Tool_Slot assignments, Shift_Duration, Lot_Size, Callout_Mode, Salary_Quota, Competency_Floor, Min_Disposition_Accuracy, Max_Killer_False_Accept_Rate, CmpDriftProbability, rule text keys, and work-function metal requirements.
4. THE Data_Layer SHALL define a Scoring_Table schema declaring the income value per Outcome_Class, the penalty value per Outcome_Class, the salvage bonus per Rework_Outcome, the Out_Of_Sequence penalty, the scrap cost, the calibration tool time cost, and the four Competency_Score weights.
5. THE Data_Layer SHALL define a Glossary_Entry schema declaring a key, a title, a plain-language definition, a physics explanation, and an Asset_Key for the diagram.
6. THE Data_Layer SHALL define a Bulletin_Page schema declaring a Day_Index, a page ordinal, a heading key, and a body key.
7. THE Data_Layer SHALL define a Quiz_Question schema declaring a Day_Index, a question key, one correct answer key, and at least two incorrect answer keys.
8. THE Data_Layer SHALL define a Localization_Entry schema declaring a string key, a locale code, and a value, with `en` as the baseline locale.
9. THE Data_Layer SHALL define an Analytics_Event schema declaring a timestamp, an event type, a Wafer_Index, and a string-keyed payload map.
10. WHEN the Data_Layer loads a configuration file whose contents violate the declared schema, THE Data_Layer SHALL report a validation error naming the file path, the field, and the violated constraint, and THE Shift_Director SHALL refuse to start a shift.
11. THE Data_Layer SHALL round-trip every configuration schema, so that deserializing an authored file and re-serializing the result produces an equivalent configuration record.

### Requirement 22: Performance Budget

**User Story:** As a developer, I want automatable performance ceilings, so that regressions are caught without access to target hardware.

#### Acceptance Criteria

1. WHILE a shift is in progress and no wafer transition is occurring, THE Presentation_Layer SHALL allocate zero managed bytes per frame in the per-frame update path.
2. THE Station_Assembler SHALL produce a station whose steady-state SetPass call count is at most 150.
3. THE Station_Assembler SHALL produce a station whose visible triangle count is at most 250000.
4. WHEN the Station_Assembler runs, THE Station_Assembler SHALL complete station construction within 2000 milliseconds.
5. THE Simulation_Core SHALL complete one full simulated shift of 20 Wafer_Records from a recorded Command_Stream within 250 milliseconds of processor time.
6. THE Performance_Budget SHALL declare a documented target frame time of 11.1 milliseconds, corresponding to 90 frames per second under WebXR rendering on mid-tier hardware.
7. THE Performance_Budget SHALL mark the target frame time declared in criterion 6 as manually verified, because frame time measurement requires profiling on target hardware that a batch-mode test run cannot reach.
8. THE Performance_Budget_Monitor SHALL sample SetPass call count, triangle count, managed allocation bytes, and station construction milliseconds, and SHALL report a failure naming each ceiling that a sample exceeds.

### Requirement 23: Test Infrastructure And Verification

**User Story:** As a developer, I want simulation logic verified without a scene and interaction flows verified in a running scene, so that correctness is provable from the command line.

#### Acceptance Criteria

1. THE Test_Harness SHALL provide a batch-mode command that compiles the project and exits with a non-zero status code when compilation reports at least one error.
2. THE Test_Harness SHALL provide a batch-mode command that runs the `WafersPlease.Tests.EditMode` suite and writes results to an NUnit XML file.
3. THE Test_Harness SHALL provide a batch-mode command that runs the `WafersPlease.Tests.PlayMode` suite and writes results to an NUnit XML file.
4. THE `WafersPlease.Tests.EditMode` suite SHALL cover the Lot_Generator, the Disposition_Evaluator, the Metrology_Cluster, the Compliance_Auditor, the Rca_Clean_Bench, the Silicide_Etch_Bench, the Cmp_Calibration_Console, the Scoring_Engine, the Gate_Evaluator, the Analytics_Recorder, and the Data_Layer schemas.
5. THE `WafersPlease.Tests.PlayMode` suite SHALL cover Station_Assembler construction, the diegetic interface constraint, Desktop_Input_Backend to Station_Command mapping, and the Performance_Budget ceilings.
6. THE Test_Harness SHALL commit at least one Golden_Scenario per Day_Index, each pairing a Run_Seed, a Shift_Configuration, and a Command_Stream with an expected serialized Shift_Score.
7. WHEN a Golden_Scenario is replayed, THE Test_Harness SHALL compare the produced serialized Shift_Score against the committed expected serialized Shift_Score and SHALL report a failure on any difference.
8. THE Test_Harness SHALL provide a property-based testing library reference in the `WafersPlease.Tests.EditMode` assembly and SHALL configure every property test to execute at least 100 generated cases.
9. THE Test_Harness SHALL provide an edge-case Wafer_Record fixture set covering Signal_Magnitude at the Control_Limit boundary, Signal_Magnitude at the Marginal_Band boundary, Lot_Size of 1, zero Tool_Activations, and a shift clock that reaches zero during each rework mini-game.
10. THE Test_Harness SHALL commit a Golden_Scenario pair sharing one Run_Seed and one Day_Index in which the first Command_Stream completes a successful CMP calibration and the second Command_Stream completes zero CMP calibrations, and THE Test_Harness SHALL report a failure when the two Latent_Lots differ at any Wafer_Index in any field.
