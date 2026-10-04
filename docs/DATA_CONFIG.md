# Wafers Please — Data Configuration

## Design Principle
All game data is defined in ScriptableObjects. No hardcoded values. This allows:
- Non-engineer team members to author/edit game content
- Test scenarios with deterministic seed data
- Day-by-day rule shifting without code changes
- Quick balancing iterations

---

## ScriptableObject Schemas

### 1. DefectProfileSO

**Path**: `Assets/Config/Defects/`
**Filename**: `BowingWarping.asset`, `STIVoid.asset`, etc.

```csharp
[CreateAssetMenu(fileName = "NewDefect", menuName = "Wafers/Defect Profile")]
class DefectProfileSO : ScriptableObject {
    public string displayName;
    public DefectClass defectClass;          // enum: Parametric, Catastrophic
    public ToolType requiredTool;            // which tool detects this
    public ActionPath defaultAction;         // Accept / Reject / Rework
    public LightingCondition visibility;     // what lighting reveals it
    public float severityRangeMin;           // 0.0–1.0
    public float severityRangeMax;
    public string[] diagnosticIndicators;    // what the instrument shows
    public string glossaryEntry;             // educational text
}
```

### 2. DayConfigSO

**Path**: `Assets/Config/Days/`
**Filename**: `Day1_Substrate.asset`, `Day2_GateStack.asset`, `Day3_BEOL.asset`

```csharp
[CreateAssetMenu(fileName = "NewDay", menuName = "Wafers/Day Config")]
class DayConfigSO : ScriptableObject {
    public int dayNumber;
    public string briefingText;
    public float timeLimitMinutes;           // shift duration
    public float salaryTarget;               // pass income gate
    public float competencyTarget;           // pass competency gate
    public DefectProfileSO[] allowedDefects; // which defects can appear
    public ToolType[] availableTools;        // which tools are unlocked
    public int wafersPerLot;                 // how many wafers in shift
    public float defectDensity;              // % of wafers with defects
    public bool showContextPrompts;           // scaffolding hints (Day 1 only)
}
```

### 3. RuleMatrixSO

**Path**: `Assets/Config/Rules/`
**Filename**: `Day1_Rules.asset`, etc.

```csharp
[CreateAssetMenu(fileName = "NewRuleMatrix", menuName = "Wafers/Rule Matrix")]
class RuleMatrixSO : ScriptableObject {
    public RuleEntry[] rules;
}

[Serializable]
struct RuleEntry {
    public DefectProfileSO defect;
    public ActionPath correctAction;         // Accept / Reject / Rework
    public string ruleText;                  // displayed on clipboard
    public float toleranceThreshold;         // how close to spec limits
}
```

### 4. ScoringConfigSO

**Path**: `Assets/Config/Scoring/`
**Filename**: `Day1_Scoring.asset`, etc.

```csharp
[CreateAssetMenu(fileName = "NewScoring", menuName = "Wafers/Scoring Config")]
class ScoringConfigSO : ScriptableObject {
    public float baseSalaryPerWafer;
    public float acceptBonus;
    public float falseAcceptPenalty;
    public float falseRejectPenalty;
    public float reworkSuccessReward;
    public float reworkFailurePenalty;
    public float processCompliancePenalty;    // out-of-sequence
    public float timeBonusMultiplier;         // bonus for speed
    public float falseAcceptKillerThreshold;  // % of FA that are killer defects
}
```

### 5. ToolConfigSO

**Path**: `Assets/Config/Tools/`
**Filename**: `StylusProfilometer.asset`, etc.

```csharp
[CreateAssetMenu(fileName = "NewTool", menuName = "Wafers/Tool Config")]
class ToolConfigSO : ScriptableObject {
    public ToolType type;
    public string displayName;
    public float scanTimeSeconds;             // how long to read
    public float accuracy;                    // 0.0–1.0 data reliability
    public bool isUnlockedByDefault;
    public int unlockDay;                     // which day unlocks this
}
```

### 6. ReworkConfigSO

**Path**: `Assets/Config/Rework/`
**Filename**: `RCAClean.asset`, `SilicideWetEtch.asset`, `CMPCalibration.asset`

```csharp
[CreateAssetMenu(fileName = "NewRework", menuName = "Wafers/Rework Config")]
class ReworkConfigSO : ScriptableObject {
    public ReworkType type;
    public string instructionsText;
    public float idealTimingSeconds;          // perfect completion
    public float toleranceWindowSeconds;      // acceptable range
    public float failurePenalty;              // scrap risk on fail
    public string[] stepDescriptions;         // step-by-step guide
}
```

---

## Asset Organization

```
Assets/Config/
  Defects/
    BowingWarping.asset
    STIVoidSeam.asset
    InterfaceTraps.asset
    SilicideBridging.asset
    TungstenPlugVoid.asset
    SubstrateContamination.asset
  Days/
    Day1_Substrate.asset
    Day2_GateStack.asset
    Day3_BEOL.asset
  Rules/
    Day1_Rules.asset
    Day2_Rules.asset
    Day3_Rules.asset
  Scoring/
    Day1_Scoring.asset
    Day2_Scoring.asset
    Day3_Scoring.asset
  Tools/
    StylusProfilometer.asset
    SpectroscopicEllipsometry.asset
    XRayRefractometry.asset
    ElectronMicroscope.asset
    FourPointProbe.asset
  Rework/
    RCAClean.asset
    SilicideWetEtch.asset
    CMPCalibration.asset
  Scenarios/
    SeedSet_Golden.asset    — deterministic test scenarios
    SeedSet_Regression.asset
```

## Seedable Scenarios
```csharp
[CreateAssetMenu(fileName = "NewScenario", menuName = "Wafers/Scenario")]
class ScenarioSO : ScriptableObject {
    public int seed;
    public int waferCount;
    public DefectSpawnEntry[] forcedDefects;
}

[Serializable]
struct DefectSpawnEntry {
    public DefectProfileSO profile;
    public int waferIndex;          // which wafer in lot
    public float severity;
    public bool guaranteed;         // always appears
}
```
