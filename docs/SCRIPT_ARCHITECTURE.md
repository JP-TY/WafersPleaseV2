# Wafers Please — Script Architecture

## Namespace Convention
```
WafersPlease
  .Core             — base classes, interfaces, shared types
  .Systems          — game systems
    .Wafers         — wafer state, defect spawning
    .Inspection     — metrology tools, lighting
    .Decision       — stamp, traveler routing
    .Rework         — 3 minigame types
    .Scoring        — economy, dual-gate evaluation
    .Progression    — day config, rule shifting
    .Analytics      — competency tracking, debrief
    .UI             — diegetic UI components
  .Interaction      — input abstraction (desktop + VR)
  .Config           — ScriptableObject definitions
  .Editor           — custom editor tools
```

## Folder Layout
```
Assets/Scripts/
  Core/
    WaferState.cs
    DefectProfile.cs
    MetrologyData.cs
    Disposition.cs (Accept / Reject / Rework)
    IInputAdapter.cs
    GameEvent.cs (event channel SO)
  Systems/
    Wafers/
      WaferController.cs
      WaferSpawner.cs
      DefectManager.cs
    Inspection/
      InspectionToolBase.cs (abstract)
      StylusProfilometer.cs
      SpectroscopicEllipsometry.cs
      XRayRefractometry.cs
      ElectronMicroscope.cs
      FourPointProbe.cs
      LightingController.cs
    Decision/
      StampInteractable.cs
      TravelerController.cs
      DecisionValidator.cs
    Rework/
      ReworkMinigameBase.cs (abstract)
      RCACleanController.cs
      SilicideWetEtchController.cs
      CMPCalibrationController.cs
    Scoring/
      ScoreManager.cs
      DualGateEvaluator.cs
      PenaltyTracker.cs
    Progression/
      DayManager.cs
      RuleEnforcer.cs
    Analytics/
      SessionTracker.cs
      CompetencyMetrics.cs
      DebriefGenerator.cs
    UI/
      DiegeticCanvas.cs
      ShiftBoardDisplay.cs
      InstrumentPanel.cs
      GlossaryTablet.cs
      IncidentPrinter.cs
  Interaction/
    DesktopInputAdapter.cs
    VRInputAdapter.cs
    IInputAdapter.cs
  Config/
    DefectProfileSO.cs
    DayConfigSO.cs
    RuleMatrixSO.cs
    ScoringConfigSO.cs
    ToolConfigSO.cs
    ReworkConfigSO.cs
```

## Base Classes & Interfaces

### InspectionToolBase
```csharp
abstract class InspectionToolBase : MonoBehaviour {
    public abstract ToolType Type { get; }
    public abstract MetrologyData ReadData(WaferController wafer);
    public abstract void ShowReadout();
    public virtual bool IsAvailable { get; } = true;
}
```

### ReworkMinigameBase
```csharp
abstract class ReworkMinigameBase : MonoBehaviour {
    public abstract ReworkType Type { get; }
    public abstract bool Execute();
    public abstract float SuccessRate();
    public event Action<ReworkResult> OnComplete;
}
```

### IInputAdapter
```csharp
interface IInputAdapter {
    bool IsVRActive { get; }
    event Action<Vector2> OnWaferTilt;
    event Action<int> OnToolSelect;
    event Action<StampType> OnStampPressed;
}
```

## Event System
Use `GameEventSO` (ScriptableObject event channels) for system communication:
- `WaferArrivedEvent` → InspectionSystem enables controls
- `InspectionCompleteEvent` → DecisionSystem enables stamps
- `DecisionMadeEvent` → ScoringSystem + ReworkSystem
- `ReworkCompleteEvent` → ScoringSystem
- `ShiftEndEvent` → AnalyticsSystem → DebriefSystem

## DI Approach
Simple service locator pattern via a `GameManager` singleton that holds references to all systems. Each system is initialized in order of dependency.
