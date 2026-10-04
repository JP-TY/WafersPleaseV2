# Wafers Please — Game Systems Design

---

## 1. Wafer & Defect System

### Wafer State Machine
```
          ┌─────────┐
          │ Created │
          └────┬────┘
               │
          ┌────▼────┐
          │ Arrived │ ← from FOUP / lot
          └────┬────┘
               │ placed on stage
          ┌────▼─────┐
          │ Inspecting│ ← player can tilt/rotate
          └────┬─────┘
               │ decision made
          ┌────▼────┐
          │ Routed  │ → Accept / Reject / Rework path
          └─────────┘
```

### Defect Model
```csharp
[Serializable]
class DefectInstance {
    DefectProfile profile;   // type reference
    float severity;          // 0.0–1.0
    Vector2 position;        // position on wafer
    bool isIdentified;       // player identified it?
    bool correctlyDiagnosed; // did player choose right tool/action?
}
```

### Defect Taxonomy (from GDD)
| Defect | Tool | Disposition |
|--------|------|-------------|
| Bowing/Warping | Stylus Profilometer | Reject |
| STI Void/Seam | Spectroscopic Ellipsometry | Reject/Scrap |
| Interface Traps/Roughness | X-ray Refractometry | Reject |
| Silicide Bridging | Electron Microscope | Rework |
| Tungsten Plug Void | Electron Microscope | Reject |
| Substrate Contamination | Four-Point Probe / SIMS | Rework |

---

## 2. Metrology Tool System

### Tool Interface
```csharp
abstract class InspectionToolBase : MonoBehaviour {
    ToolType type;
    abstract MetrologyData ReadData(Wafer wafer, LightingState lighting);
    abstract void ShowReadout();
}
```

### Tool Types
- **Stylus Profilometer** — diamond-tipped topography scan, detects bowing/warping
- **Spectroscopic Ellipsometry** — thin-film optical density, detects STI voids
- **X-ray Refractometry** — sub-surface roughness, detects interface traps
- **Electron Microscope** — high-magnification surface array, detects bridging + plug voids
- **Four-Point Probe** — electrical resistance, detects contamination

Each tool produces a `MetrologyData` struct containing:
- Raw numeric readout(s)
- Threshold indicators (in-spec / borderline / out-of-spec)
- Visual instrument display (skeuomorphic screen)

---

## 3. Decision & Stamp System

### Three Stamp Actions
| Stamp | Effect | Feedback |
|-------|--------|----------|
| **Accept** | Wafer passes to next stage | Green light, clean sound |
| **Reject** | Wafer scrapped | Red light, buzzer |
| **Rework** | Wafer enters repair queue | Yellow light, processing hum |

### Undo Guard
Once stamped, decision is **irreversible** — no undo. Physical stamp animation must complete before next wafer.

### Traveler Routing
The "traveler" is a diegetic folder/paper that tracks state. Player stamps directly onto the traveler document, which slides into the next processing track.

---

## 4. Rework Minigame System

### A) RCA-Clean Sequence
**When**: Substrate Contamination
**Interaction**: Dual-tank wet chemical bench
- SC-1 Bath: timed alkaline solution (H₂O₂ + NH₄OH)
- SC-2 Bath: timed acidic solution (H₂O₂ + HCl)
**Failure**: Under-soak → threshold shifts; over-soak → boundary degradation
**UI**: Two timer sliders + temperature gauges

### B) Selective Silicide Wet Etch
**When**: Silicide Bridging (caught early)
**Interaction**: Ultrasonic agitation wash during C49 phase
**Failure**: Skipping wash → permanent short circuits (wafer scrap)
**UI**: Single toggle/trigger with visual feedback of phase transition

### C) CMP Laser Endpoint Re-Calibration
**When**: Over-grinding drift detected
**Interaction**: Manual oscilloscope curve matching
- Player aligns laser reflection curves to target
**Failure**: Misalignment → next 5 wafers at risk of dishing defects
**UI**: Two waveform displays (reference + current), adjustment knobs

---

## 5. Day Progression System

### Day Config
```csharp
[CreateAssetMenu]
class DayConfigSO : ScriptableObject {
    int dayNumber;
    DefectProfile[] allowedDefects;
    ToolType[] availableTools;
    RuleMatrixSO rules;
    ScoringConfigSO scoring;
    float timeLimitMinutes;
    string briefingText;
}
```

### Three Days (from GDD)
| Day | Focus | Defects | Tools | Rules |
|-----|-------|---------|-------|-------|
| 1 | Substrate | Bowing, Contamination | Profilometer, 4-Point Probe | Simple, generous tolerances |
| 2 | Gate Stack | Interface, STI Voids | Ellipsometry, X-ray | Strict parametric speed |
| 3 | BEOL | Plug Voids, Bridging | Electron Microscope | Complex judgment + time pressure |

---

## 6. Scoring & Economy System

### Dual-Gate Evaluation
```
[ INCOME GATE ]  AND  [ COMPETENCY GATE ]
     Must meet         Must meet threshold
   salary target       accuracy targets
```

### Penalties
| Violation | Penalty |
|-----------|---------|
| False Accept (killer) | High — catastrophic yield loss |
| False Reject (clean) | Moderate — wasted material |
| Process Out-of-Sequence | Minor — compliance strike |

### Scoring Config
```csharp
[CreateAssetMenu]
class ScoringConfigSO : ScriptableObject {
    float salaryTarget;
    float competencyTarget;
    float falseAcceptPenalty;
    float falseRejectPenalty;
    float reworkSuccessBonus;
    float reworkFailurePenalty;
}
```

---

## 7. Analytics & Debrief System

### Tracked Metrics
- Failure Mode Identification accuracy
- Metrology Optimization Rate (right tool for defect)
- Latency by Layer (seconds per step)
- False Accept / False Reject counts
- Process Compliance (rework success rate)

### Debrief Output
- **In-Game**: Incident Printer prints a paper report in the workspace
- **Text**: Shift report with scores, errors, recommended remediation
- **Remediation**: "Review Section 6 — Salicide Phase Transitions"

---

## 8. Diegetic UI System

No traditional HUD. All information exists as 3D objects in the workspace:

| Element | Physical Form |
|---------|--------------|
| Quota / Time display | Overhead shift board (LED panels) |
| Rulebook | Clipboard / traveler folder |
| Metrology data | Instrument display screens |
| Feedback | Stamp + printer output |
| Education | Glossary tablet (interactive 3D diagrams) |
| Score | Incident printer paper report |

---

## 9. Educational Scaffolding

- **Glossary Tablet**: Physical tablet with 3D crystal diagrams, process explanations, 45nm field guide
- **Context Prompts**: Technical callouts on Day 1, fade by Day 3
- **Micro-Quizzes**: Optional 3-question review boards at shift end — boost competency rating

---

## 10. Lighting System

Cross-illumination dials control how defects are visible:
- Adjustable angle + intensity
- Different defect types reveal under different lighting conditions
- Player must manipulate lighting to find all defects
