# Wafers Please — Implementation Roadmap

## Phase 0: Project Foundation (Setup)
_Goal: Script framework, config assets, prefab structure ready_

- [ ] Create `Assets/Scripts/` directory structure per `SCRIPT_ARCHITECTURE.md`
- [ ] Create all ScriptableObject base classes (DefectProfileSO, DayConfigSO, etc.)
- [ ] Create all C# enums (DefectClass, ToolType, ActionPath, Disposition, ReworkType, etc.)
- [ ] Create `IInputAdapter` interface + stubs for DesktopInputAdapter and VRInputAdapter
- [ ] Create `GameManager` singleton with service locator pattern
- [ ] Create `GameEventSO` event channel system
- [ ] Create all config assets in `Assets/Config/` with GDD-defined initial values
- [ ] Convert all 8 GLB models into prefabs with proper materials
- [ ] Set up URP material library for cleanroom aesthetic

## Phase 1: Core Inspection Loop
_Goal: Player can inspect a wafer, read metrology data, and make a decision_

- [ ] Implement `WaferState` + `WaferController` (state machine, tilt/rotation)
- [ ] Implement `WaferSpawner` (load from FOUP, place on stage)
- [ ] Implement `DefectManager` (attach defects to wafers based on DayConfig)
- [ ] Implement `InspectionToolBase` abstract class
- [ ] Implement Stylus Profilometer (numeric readout + topography display)
- [ ] Implement Four-Point Probe (resistance readout)
- [ ] Implement Spectroscopic Ellipsometry (optical density display)
- [ ] Implement X-ray Refractometry (roughness tracking display)
- [ ] Implement Electron Microscope (cross-section imaging display)
- [ ] Implement `LightingController` (angle + intensity dials affect defect visibility)
- [ ] Build wafer mount interactable (grab + rotate on workbench)
- [ ] Desktop: mouse-drag wafer rotation + hotkey tool selection
- [ ] VR: grab wafer + touch instrument panels
- [ ] Debug test: spawn wafer with known defect, inspect, verify readouts

## Phase 2: Decision & Stamp System
_Goal: Player can Accept/Reject/Rework and see consequences_

- [ ] Implement `StampInteractable` (3 stamps with physical animation)
- [ ] Implement `TravelerController` (diegetic routing document)
- [ ] Implement `DecisionValidator` (check player decision vs. correct action)
- [ ] Implement `ScoreManager` (base salary, bonuses, penalties)
- [ ] Implement `DualGateEvaluator` (salary + competency thresholds)
- [ ] Build stamp station in scene (3 stamps + traveler clipboard)
- [ ] Desktop: click stamp + confirm
- [ ] VR: grab stamp, physically press onto traveler
- [ ] Debug test: cycle through decisions, verify scoring

## Phase 3: Day Progression
_Goal: 3 playable shifts with shifting rules, defects, tools_

- [ ] Implement `DayManager` (load DayConfig, sequence shifts)
- [ ] Implement `RuleEnforcer` (check decisions against RuleMatrix)
- [ ] Create Day 1 config: substrate defects, 2 tools, simple rules
- [ ] Create Day 2 config: HKMG defects, strict rules, tool unlocks
- [ ] Create Day 3 config: BEOL defects, complex rules, time pressure
- [ ] Build shift timer + quota display on overhead board
- [ ] Build briefing screen at shift start (diegetic paper slip)
- [ ] Debug test: play through all 3 days, verify rule shifting

## Phase 4: Rework Minigames
_Goal: 3 node-specific rework interactions playable_

- [ ] Implement `ReworkMinigameBase` abstract class
- [ ] Implement RCACleanController (dual-tank chemical bath with timers)
- [ ] Implement SilicideWetEtchController (single-toggle ultrasonic wash)
- [ ] Implement CMPCalibrationController (oscilloscope curve matching)
- [ ] Build rework console area in scene
- [ ] Wire Rework decision → spawn correct minigame
- [ ] Wire minigame success/failure → ScoringSystem
- [ ] Debug test: each minigame with pass/fail paths

## Phase 5: Analytics & Debrief
_Goal: Shift-end report with tracked competencies_

- [ ] Implement `SessionTracker` (record every action with timestamps)
- [ ] Implement `CompetencyMetrics` (failure mode ID, tool optimization, latency)
- [ ] Implement `DebriefGenerator` (text report with scores + remediation)
- [ ] Build Incident Printer (diegetic printer animates + outputs paper)
- [ ] Wire shift end → printer → debrief text
- [ ] Implement micro-quiz system (optional 3-question review board)
- [ ] Debug test: run shift, verify analytics output matches actions

## Phase 6: Diegetic UI & Educational Systems
_Goal: All information exists as 3D objects in workspace_

- [ ] Build ShiftBoard overhead display (time, quota, salary)
- [ ] Build Traveler Clipboard (rulebook pages, lot info)
- [ ] Build Glossary Tablet (DataSlate.glb with interactive content)
- [ ] Implement context prompt scaffolding (Day 1 callouts, fade by Day 3)
- [ ] Build stamp pad with ink effect on traveler
- [ ] Add ambient cleanroom set dressing (panels, ducts, signage — P1/P2)
- [ ] Debug test: verify all UI is interactable in both desktop and VR

## Phase 7: Input Parity & Polish
_Goal: Desktop and VR input produce identical gameplay results_

- [ ] Complete `DesktopInputAdapter` (all mouse/keyboard mappings)
- [ ] Complete `VRInputAdapter` (hand tracking + controller fallback)
- [ ] Set up XR interaction layers (Interactable, UI, Teleport)
- [ ] Add hand poses for each interactable type
- [ ] Add controller-based interaction profiles
- [ ] Test parity: same seeded lot → same scores on desktop and VR
- [ ] Performance pass: draw calls, frame timing, URP settings

## Phase 8: Sound, VFX & Juice
_Goal: Audio-visual feedback for all actions_

- [ ] Implement SFX system (click, stamp, buzzer, cleanroom ambient)
- [ ] Implement defect detection audio cues (severity-based)
- [ ] Add stamp animation (mechanical press + paper impression)
- [ ] Add printer animation (paper feed + cut)
- [ ] Add lighting glow / emissive feedback on instrument panels
- [ ] (P1) Adaptive tension music layers
- [ ] (P1) Rework process sounds (spray, purge, cycle complete)

## Phase 9: QA, Testing & Build
_Goal: Ship-ready MVP_

- [ ] Create golden scenario set (known outcomes for regression testing)
- [ ] Create automated scoring test cases
- [ ] Input parity test scripts (desktop vs VR)
- [ ] Performance benchmark scene
- [ ] WebGL build target configuration
- [ ] Production audit per `production-audit` skill
- [ ] Final build + deploy

## Phase Mapping
```
Phases 0–2: Core loop (P0)
Phases 3–4: Content (P0)
Phases 5–6: Systems + UI (P1)
Phases 7–8: Polish (P1–P2)
Phase 9:     Ship (P0)
```
