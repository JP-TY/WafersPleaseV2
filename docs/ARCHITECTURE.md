# Wafers Please — Architecture

## High-Level System Diagram

```
┌────────────────────────────────────────────────────────────┐
│                     Day Progression                         │
│  (DayConfigSO → RuleMatrix → DefectPool → ToolUnlocks)     │
└──────┬─────────────────────────────────────────┬───────────┘
       │ spawns wafers                           │ gates tools
       ▼                                         ▼
┌──────────────┐    ┌────────────────────┐    ┌──────────────┐
│ Wafer System │───▶│ Inspection System  │───▶│ Tool System  │
│ (state,      │    │ (metrology modes,  │    │ (profilom,   │
│  defects,    │    │  wafer tilting,    │    │  ellips, XR, │
│  severity)   │    │  lighting)         │    │  EM)         │
└──────────────┘    └────────────────────┘    └──────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│                  Decision & Stamp System                    │
│  (Accept / Reject / Rework → routing traveler)             │
└──────┬─────────────────────────────────────────┬───────────┘
       │ Reject / Accept                        │ Rework
       ▼                                         ▼
┌──────────────┐                          ┌──────────────┐
│ Scoring      │                          │ Rework       │
│ (penalties,  │                          │ Minigame     │
│  dual-gate)  │                          │ System       │
└──────┬───────┘                          │ (3 types)    │
       │                                  └──────┬───────┘
       ▼                                         │
┌────────────────────────────────────────────────────────────┐
│               Analytics & Debrief System                    │
│  (incident printer, tracked competencies, shift report)     │
└────────────────────────────────────────────────────────────┘
```

## Core Loop (Frame)
1. Wafer arrives via FOUP → placed on inspection stage
2. Player tilts/rotates wafer under cross-lighting
3. Player selects metrology tool → reads instrument data
4. Player identifies defect class + severity
5. Player stamps decision on routing traveler
6. If Rework → execute node-specific minigame
7. Wafer routed → scoring evaluated → next wafer

## System Dependency Graph
```
DayProgression → WaferSystem
DayProgression → ToolSystem (tool unlocks)
DayProgression → ScoringSystem (day rules)

WaferSystem → InspectionSystem (defect visibility)
WaferSystem → ScoringSystem (disposition)

InspectionSystem → ToolSystem (metrology data)
InspectionSystem → DecisionSystem (evidence)

DecisionSystem → StampInteraction
DecisionSystem → ReworkSystem (if Rework)
DecisionSystem → ScoringSystem (disposition)

ReworkSystem → ScoringSystem (success/fail)

ScoringSystem → AnalyticsSystem
ScoringSystem → DayProgression (gate)

AnalyticsSystem → DebriefSystem (shift report)
```

## Scene → Prefab → Script → SO Layering
```
Scene (.unity)
  └── Prefab (.prefab) — composite of GameObjects + components
       ├── MonoBehaviour (.cs) — game logic
       │    └── references ScriptableObject (.asset) — configuration
       └── Mesh + Materials — visual representation
```

## Key Principles
- **Separation of concerns**: Systems communicate through C# events / interfaces, not direct references
- **Data-driven gameplay**: Every tunable value lives in a ScriptableObject
- **Diegetic immersion**: No screen-space UI; all interactions happen on 3D objects
- **Input abstraction**: An `IInputAdapter` interface abstracts desktop vs VR input
