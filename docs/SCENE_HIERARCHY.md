# Wafers Please — Scene Hierarchy Plan

## SampleScene Restructure

Replace the VR template contents with the cleanroom inspection station.

```
SampleScene.unity
│
├── [Environment] Room (Room.glb) — cleanroom shell
│   ├── Ceiling Panels
│   ├── Floor Panels
│   └── Back Wall (machinery silhouettes — P2)
│
├── [XR Origin Group] Complete XR Origin Set Up Hands Variant
│   ├── LeftHand Controller / TrackedHand
│   ├── RightHand Controller / TrackedHand
│   ├── Camera Offset / Main Camera
│   └── Locomotion System (teleport + turn)
│
├── [Inspection Station]
│   ├── Workbench (Workbench.glb)
│   │   ├── WaferMount (parent for wafer)
│   │   │   ├── Wafer (Wafer.glb) — dynamically spawned
│   │   │   └── TiltInteraction (grabbable area)
│   │   ├── LightingDials
│   │   │   ├── AngleDial (XRKnob)
│   │   │   └── IntensityDial (XRKnob)
│   │   └── InstrumentCluster (Console.glb)
│   │       ├── StylusProfilometer Panel
│   │       ├── Ellipsometry Panel
│   │       ├── XRay Panel
│   │       └── ElectronMicroscope Panel
│   │
│   ├── [Stamp Station]
│   │   ├── AcceptStamp (grabbable + stamp animation)
│   │   ├── RejectStamp
│   │   ├── ReworkStamp
│   │   └── TravelerClipboard
│   │       ├── TravelerDocument (paper with routing info)
│   │       └── StampZone (detection area)
│   │
│   ├── [FOUP Station]
│   │   ├── FOUP (Foup.glb) — wafer container
│   │   ├── WaferSlotIndicator
│   │   └── LotInfoPanel
│   │
│   └── [Rework Station]
│       ├── RCACleanConsole (Day 1)
│       ├── SilicideWashConsole (Day 3)
│       └── CMPCalibrationConsole (Day 2+)
│
├── [Diegetic UI]
│   ├── ShiftBoard (overhead display)
│   │   ├── TimeRemaining
│   │   ├── SalaryTarget
│   │   ├── WafersProcessed
│   │   └── QuotaIndicator
│   ├── IncidentPrinter
│   │   ├── PrinterBody
│   │   └── PaperOutput (spawns report)
│   ├── GlossaryTablet (DataSlate.glb)
│   │   └── InteractiveDisplay
│   └── AmbientSignage
│       ├── CleanroomSigns
│       └── SafetyPosters
│
├── [Lighting]
│   ├── Directional Light (cleanroom overhead)
│   ├── Post Process Volume (cleanroom LUT)
│   └── Ambient Light Probes
│
├── [Systems] (empty GameObjects with system scripts)
│   ├── GameManager
│   ├── DayManager
│   ├── WaferSpawner
│   ├── ScoreManager
│   ├── SessionTracker
│   └── EventSystem (from XR template)
│
└── [Teleportation]
    └── TeleportArea (floor bounds)
```

## Object Layering
| Layer | Objects |
|-------|---------|
| Default | Environment, Workbench, Props |
| Interactable | Wafer, Stamps, Knobs, Tools |
| UI | Instrument panels, Shift board, Tablet |
| Teleport | Floor area |

## BasicScene Alternative
For testing without full VR setup, BasicScene should contain:
- XR Origin (basic rig)
- Workbench + Wafer + 1 Instrument
- Stamp station + 1 diegetic UI element
