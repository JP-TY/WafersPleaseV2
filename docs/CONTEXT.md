# Wafers Please — Project Context

## Identity
Semiconductor fab inspection training game. Desktop-first, optional VR (WebXR/OpenXR). Player evaluates 45nm wafers using metrology tools, stamps Accept/Reject/Rework decisions, meets salary + competency thresholds.

## Tech Stack
- **Engine**: Unity 6000.5.0f1 (Unity 6)
- **Pipeline**: URP 17.5.0 (Universal Render Pipeline)
- **XR**: OpenXR 1.17.1, XR Interaction Toolkit 3.5.0, XR Hands 1.8.0, Meta OpenXR 2.5.0
- **Input**: Input System 1.19.0
- **Targets**: Standalone (Linux x86_64) + Android (Meta Quest)
- **GDD**: `Wafers Please_ MVP Game Design Document (Training-First).md`

## Folder Conventions
```
Assets/
  Scripts/          — All custom C# code (namespace: WafersPlease.*)
  Prefabs/          — Custom game prefabs
  Config/           — ScriptableObject data assets
  Scenes/           — Unity scenes
  Models/           — GLB source models (imported)
  Materials/        — URP materials
  VRTemplateAssets/ — VR template (do not edit directly)
  Samples/          — XR samples (do not edit directly)
docs/               — Project documentation
```

## Key Architecture Decisions
- All game data defined via ScriptableObjects (no hardcoded tables)
- Diegetic-only UI: no floating HUD, all UI exists within the 3D workspace
- Hand-tracked VR primary; controller fallback; mouse+keyboard desktop parity
- Scoring uses dual-gate evaluation (salary + competency)
- Scene is a single cleanroom inspection station module

## Active Agent Skills
- `mindrally/skills@unity` — Unity C# patterns
- `unity-developer` — Unity dev best practices
- `sfkislev/flue@blender` — 3D modeling pipeline
- `blender-web-pipeline` — glTF export / optimization
- `game-development` (includes `vr-ar/`) — game + VR design patterns
