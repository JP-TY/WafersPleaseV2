# Wafers Please: MVP Game Design Document (Training-First)

## 1\) High Concept

Wafers Please is a desktop-first, optional-VR training game where players act as a fab inspection operator. The player evaluates wafers, decides Accept, Reject, or Rework, performs node-specific mini-procedures, and must meet both salary and competency thresholds to progress. The design goal is dual-purpose:

* **Build authentic, material-science-grounded intuition** for 45nm semiconductor inspection workflows.  
* **Preserve a tense, immersive, game-like loop** inspired by high-pressure industrial rule-check games.

## 2\) Player Fantasy And Pillars

**Player Fantasy**  
"I am a trusted cleanroom operator protecting high-value 45nm yields and diagnosing atomic-scale anomalies under structural shift pressure."  
**Design Pillars**

* **Training Accuracy First:** Every defect, tool choice, and failure signature maps directly to factual 45nm node constraints and innovations.  
* **Readable Realism:** Complex physical phenomena (e.g., quantum tunneling limits, lattice strain) are abstracted into visual and mechanical logic without losing scientific integrity.  
* **Diegetic Immersion:** The UI is entirely skeuomorphic; data feeds, metrology readouts, and tools exist physically within the virtual cleanroom space.  
* **Pressure with Feedback:** Quotas and time constraints generate mechanical tension, while data-driven post-shift debriefs convert errors into clear learning objectives.

## 3\) Target Audience And Learning Outcomes

**Primary Audience**

* Semiconductor manufacturing trainees and engineering students studying process integration.  
* Technical professionals seeking concrete context on historical material-science scaling steps.

**Measurable Competency Targets (MVP)**

* **Defect Discrimination Accuracy:** $\\ge 85\\%$ on mixed-lot runs by Day 3\.  
* **Parametric vs. Catastrophic Diagnostics:** Correct classification of failure modes $\\ge 80\\%$ of the time.  
* **False Accept Rate:** $\\le 10\\%$ on killer defects (e.g., open circuits, copper poisoning).  
* **Process Compliance:** $\\ge 70\\%$ success rate on precise multi-step chemical or tool re-calibration reworks.

## 4\) Platform, Session, Controls

**Platform**

* Desktop Browser (WebGL/WebXR-enabled, optimized for mouse \+ keyboard).  
* Optional WebXR Virtual Reality mode supporting 6-DoF standalone/tethered headsets.

**Session Model**

* Standard Shift: 8–12 minutes of active, continuous inspection gameplay.  
* MVP Scope: 3 progressive instructional days with procedural seed variations.

**Controls**

* **Desktop:** Left-click \+ drag to tilt and rotate the wafer under cross-lighting; hotkeys (1-4) for metrology mode switching; mechanical mouse clicks for stamp interactions.  
* **VR:** Direct 1:1 hand-tracked grabbing of tool interfaces, physical stamping gestures, and tactile knob turning for microscope adjustments.

## 5\) Core Loop

Code snippet flowchart TD

## 6\) Semiconductor Realism Envelope (45nm Node Focus)

The game focuses directly on the year 2007 structural shift, where traditional geometric scaling hit scaling barriers—forcing factories to transition from simple silicon dioxide insulation to advanced material-science architectures. Gameplay steps are structured around these actual 45nm integration milestones:

* **Substrate Preparation & Geometric Integrity:** Players learn that structural defects propagate upward. They must verify single-crystal lattice perfection and surface flatness, matching high-NA lithography depth-of-focus (DOF) limits.  
* **Shallow Trench Isolation (STI):** Focuses on isolation geometry. Operators check the integrity of sub-micron "moats" and verify laser-sensing configurations to ensure chemical-mechanical polishing (CMP) doesn't over-grind active silicon.  
* **High-K Metal Gate (HKMG) Stack:** Replaces the classic $\\text{SiO}\_2$ layer with Atomic Layer Deposition (ALD) of Hafnium Oxide to curb quantum tunneling current leakage. Players inspect sub-nanometer layers and work-function metal assignments ($\\text{TiN}$ for PMOS vs. $\\text{TiAl}$ for NMOS).  
* **Strain Engineering & Silicides:** Addresses mobility boosting via lattice manipulation (compressive $\\text{SiGe}$ for PMOS; tensile Silicon Nitride caps for NMOS) and audits the phase transitions of Titanium contact metallization to prevent short circuits.  
* **Back-End Copper Damascene & Plugs:** Covers additive copper metallurgy. Operators evaluate Tungsten onramp plugs for internal voiding and audit the integrity of Tantalum diffusion barriers designed to stop destructive copper poisoning of the active silicon substrate.

## 7\) Defect Taxonomy And 45nm Disposition Matrix

The player acts as the definitive gatekeeper between Parametric Yield (device works but leaks excessive power/fails timing) and Catastrophic Yield (complete mechanical non-functionality).

| Defect Class | Visual / Instrumental Signature | Diagnostic Metrology Tool | Operational Consequence | Action Path |
| :---- | :---- | :---- | :---- | :---- |
| Bowing & Warping | Surface topographic distortion lines; out of range specs. | Stylus Profilometer (Diamond-tipped topography) | Distorts high-NA lithography focus, causing completely blurred downstream patterning. | Reject (Irreversible structural deformation) |
| STI Void / Seam | Internal center-line gaps within the nanoscale trench isolation matrix. | Spectroscopic Ellipsometry (Thin-film optical density) | Sub-surface fill failure causing severe inter-device current leakage. | Reject / Scrap (Cannot be chemically extracted) |
| Interface Traps / Roughness | Sub-nanometer interface scattering signals; abnormal density fluctuations. | X-ray Refractometry (Sub-surface layer roughness tracking) | Snatches charge carriers and severely degrades transconductance/channel mobility. | Reject (Parametric yield failure; below baseline device speed) |
| Silicide Bridging | Bright, conductive metal residue stringers overlapping the oxide sidewall spacers. | Electron Microscope (High-magnification surface array) | Creates a direct electrical short circuit between the gate and source/drain contacts. | Rework (Eligible for secondary selective wet etch if caught early) |
| Tungsten Plug Void | Internal keyhole empty spaces or disconnected cores inside vertical onramps. | Electron Microscope (Cross-sectional inspection) | Creates open circuits across backend metallization layers, killing the chip. | Reject (Catastrophic failure; uncorrectable post-deposition) |
| Substrate Contamination | Spikes in local electrical resistance; localized traces of organic or metallic films. | Four-Point Probe / SIMS (Ion spectrometry) | Induces severe threshold voltage fluctuations across the finished CMOS pairs. | Rework (Can be completely cleaned via standard wet chemical benches) |

## 8\) Rework Mini-Interactions (Node-Specific)

When a wafer defect is designated as Rework, players must execute precise, timed, chemical or mechanical operations instead of just pressing a button. Missteps can destroy the wafer.  
**A) The RCA-Clean Sequence (Pre-Gate / Substrate Contamination)**  
Context: Used to clear hazardous trace residues before high-temperature oxide growth. Interaction: The player manages a dual-tank wet chemical bench.

* **SC-1 Bath:** Submerge the wafer in a timed, heated alkaline solution (Hydrogen Peroxide \+ Ammonium Hydroxide) to break down organic surface films.  
* **SC-2 Bath:** Submerge in an acidic solution (Hydrogen Peroxide \+ Hydrochloric Acid) to catch remaining heavy metal impurities.

**Failure Condition:** Under-soaking leaves active metal impurities that induce threshold shifts; over-soaking degrades underlying substrate boundaries.  
**B) Selective Silicide Wet Etch (Contact Optimization)**  
Context: Intended to remove stray Titanium stringers from sidewall spacers before they turn into permanent short circuits. Interaction: The operator triggers an ultrasonic agitation wash during the intermediate, high-resistance C49 phase. This strips unreacted pathway metals while leaving the contact points intact, preparing it for the final C54 phase high-temperature annealing transformation.  
**Failure Condition:** Proceeding without this wash locks in a permanent Silicide Bridge, turning the wafer into scrap.  
**C) CMP Laser Endpoint Re-Calibration**  
Context: Triggered when metrology shows a drift toward thin Silicon Nitride ($\\text{Si}\_3\\text{N}\_4$) stopping layers due to planarization over-grinding. Interaction: A skeuomorphic oscilloscope calibration interface requires the player to manually match laser sensing reflection curves.  
**Gameplay Impact:** Correct alignment locks the CMP tool's automated safety braking for the next 5 wafers, preventing downstream structural dishing defects.

## 9\) Rule System And Day Progression

The progression model layers cognitive load by systematically introducing material innovations alongside shifting factory rules.

* **Day 1: The Silicon Foundation (Onboarding)** \- Focus: Substrate geometry and early cleaning protocols. Defects: Bowing/Warping and Substrate Contamination. Tools: Stylus Profilometer and Four-Point Probe. Rule Matrix: Simple Accept vs. Rework guidelines; cleanroom tolerances are generous.  
* **Day 2: Breaking the Leakage Barrier (The Gate Stack)** \- Focus: The shift to High-K Metal Gates and ALD deployment. Defects: Interface Roughness and STI Voids. Tools: Spectroscopic Ellipsometry and X-ray Refractometry. Rule Matrix: Strict parametric speed evaluations are introduced. Players must match work-function metals ($\\text{TiN}$ vs. $\\text{TiAl}$) to the traveler routing card.  
* **Day 3: The Interconnect Maze (Back-End-Of-Line)** \- Focus: Copper metallization, diffusion block layers, and plugs. Defects: Tungsten Plug Voids and Silicide Sidewall Bridging. Tools: High-resolution Electron Microscopy. Rule Matrix: Complex judgment calls. Players must balance the high material cost of a selective wet chemical rework against immediate shift time limits.

## 10\) Economy, Scoring, And Gates

To win a shift, players must successfully pass a Dual-Gate Evaluation Strategy, which prevents both reckless speed runs and slow perfectionism.  
                  \[ SHIFT INCOME PERFORMANCE \]

**Financial Deductions & Penalties**

* **False Accept (Killer Defect):** High penalty. Results in immediate catastrophic yield drops downstream.  
* **False Reject (Clean Wafer):** Moderate penalty. Wastes premium base silicon material costs.  
* **Process Out-of-Sequence:** Minor penalty. Bypassing a required metrology verification tool logs a compliance strike.

## 11\) Assessment Model (Training Analytics)

At the end of every shift, an automated Incident Printer outputs an operational diagnostic sheet tracking the player's core engineering proficiencies.  
**Core Tracked Competencies**

* **Failure Mode Identification:** Accurate separation of parametric speed drops from catastrophic electrical open/short structures.  
* **Metrology Optimization Rate:** Measuring whether the player picked the right inspection tool for the target defect type without wasting time.  
* **Latency by Layer:** Seconds spent analyzing substrate steps versus complex metallization steps, highlighting pattern confusion.

**Diagnostic Feedback Output**

* **Analytical Error Capture:** "Operator frequently misidentifies conductive Titanium bridging as benign surface variance, risking downstream layout fires."  
* **Recommended Remediation Lab:** "Review Section 6 (Salicide Phase Transitions) and utilize the Electron Microscope array more frequently on Day 3 lots."

## 12\) Educational Scaffolding

* **In-World Fab Glossary Tablet:** A physical tablet resting beside the inspection bay containing interactive 3D crystal structure diagrams, process explanations, and field guides detailing the exact physics of 45nm innovations.  
* **Scaffolded Context Prompts:** During Day 1, unexpected metrology deviations display small technical callouts (e.g., "Bowing detected: Flatness deviation will push surface beyond high-NA depth-of-focus bounds"), which fade away by Day 3\.  
* **Shift-End Micro-Quizzes:** Optional interactive 3-question review boards that verify understanding of process steps (e.g., "Why did we use Hafnium Oxide instead of Silicon Dioxide here?") to award permanent competency rating boosts.

## 13\) Diegetic \+ Skeuomorphic Interface

The workspace is designed to match a real cleanroom environment. There are no traditional floating HUD elements or video game menu bars.

* **The Inspection Workspace:** Features a physical wafer mount stage flanked by cross-illumination dial systems and mechanical stage adjustment tracks.  
* **Metrology Instrumentation Cluster:** A group of display screens showing readout lines from the Stylus Profilometer, Spectroscopic Ellipsometry, and Electron Microscope.  
* **The Traveler Clipboard:** A physical folder containing the current lot profile, target doping specs, work-function metal requirements, and changing operational rules.  
* **Mechanical Routing Stamps:** Three spring-loaded heavy rubber stamps (ACCEPT, REJECT, REWORK) used to physically stamp the routing traveler and slide the lot into its downstream processing track.

## 14\) Balancing Knobs

* **Defect Density Modulators:** Adjusts the distribution of clean versus corrupted layers within incoming wafer lots (Standard default: $10\\%$ killer defects, $15\\%$ reworkable targets, $75\\%$ baseline acceptance).  
* **Ambiguity Tolerances:** Controls how close defect signals can drift to standard control limits before triggering an alert on metrology screens.  
* **Chemical/Tool Operation Speed:** Dictates the margin of error allowed on SC-1/SC-2 chemical baths and oscilloscope tuning adjustments.

## 15\) MVP Scope Boundaries

**In Scope**

* A single cleanroom inspection station module.  
* 3 fully playable, data-configured shifts covering early substrate preparation through backend metallization stages.  
* 6 core 45nm defect profiles mapped to specific metrology tools.  
* The 3 primary node rework mini-games (RCA-Clean, Phase Etch, Laser Calibration).  
* The dual-gate evaluation framework along with performance reporting.

**Out of Scope (Post-MVP)**

* Physical traversal of the larger fab facility or multi-room cleanrooms.  
* Interactive control of photolithography scanner configurations or high-temperature furnaces.  
* Multiplayer team inspection runs or supervisor roleplay modes.  
* Post-fab packaging, dicing, or wire-bonding validation loops.

## 16\) QA, Testing, And Success Criteria

* **Technical Verification Baseline:** Maintaining a stable 90 FPS frame rate under WebXR rendering contexts on mid-tier hardware targets.  
* **Scoring Reliability:** Ensuring identical procedural lot seeds generate identical performance scores across both mouse-driven and VR inputs.  
* **Training Efficacy Metric:** Verifying that uninitiated players can accurately explain the functional difference between parametric power leakage and catastrophic open short-circuits after finishing Day 3\.

## MVP Asset Inventory (Prioritized)

**Legend:** Priority: P0 must-have, P1 should-have, P2 nice-to-have. Placeholder-safe: Yes means graybox/temp asset acceptable for MVP test.  
**A) 3D Environment And Props**

* Cleanroom inspection bay module | P0 | Placeholder-safe: Yes | Purpose: core play space  
* Inspection workbench (modular) | P0 | Yes | Purpose: all object interactions  
* Wafer cassette/FOUP-style containers | P0 | Yes | Purpose: lot intake fantasy  
* Tool rack (cleaning/rework tools) | P0 | Yes | Purpose: physical action anchors  
* Overhead shift board display | P0 | Yes | Purpose: quota/time/salary at-a-glance  
* Ambient cleanroom set dressing (panels, ducts, signage) | P1 | Yes | Purpose: immersion  
* Secondary background machinery silhouettes | P2 | Yes | Purpose: depth and atmosphere

**B) Interactive Tools And Diegetic UI Props**

* Microscope body \+ stage \+ focus knob | P0 | Yes | Purpose: primary inspection interface  
* Illumination control dial/switches | P0 | Yes | Purpose: defect visibility modulation  
* Physical stamp set (accept/reject/rework) | P0 | No | Purpose: irreversible final action clarity  
* Clipboard rulebook \+ daily bulletin pages | P0 | Yes | Purpose: changing rules interface  
* In-world glossary tablet | P1 | Yes | Purpose: educational lookup  
* Incident printer object \+ paper output | P1 | Yes | Purpose: alerts/debrief diegesis  
* Rework console panel | P1 | Yes | Purpose: mini-interaction container

**C) Wafer And Defect Visual Assets**

* Base wafer material set (clean, used, contaminated) | P0 | No | Purpose: core readability  
* Defect decal/overlay library (particle, scratch, bridge, open, misalignment) | P0 | No | Purpose: training targets  
* Severity variants per defect class | P0 | Yes | Purpose: progressive difficulty  
* Wafer map overlay texture set (optional training view) | P1 | Yes | Purpose: pattern learning  
* Rework state transitions (before/after visuals) | P1 | Yes | Purpose: feedback on action outcome  
* Edge-case synthetic defects for QA | P1 | Yes | Purpose: test coverage

**D) Character/Animation**

* Player hand/controller interaction rigs | P0 | Yes | Purpose: desktop+VR manipulation  
* Tool use animations (stamp, wipe, panel press) | P0 | Yes | Purpose: action clarity  
* UI prop micro-animations (paper print, light blink) | P1 | Yes | Purpose: responsiveness  
* NPC supervisor avatar/voice source | P2 | Yes | Purpose: optional narrative flavor

**E) VFX, SFX, Music, Voice**

* Interaction SFX pack (click, stamp, tray, alert) | P0 | Yes | Purpose: state confirmation  
* Defect detection audio cues by severity | P1 | Yes | Purpose: training reinforcement  
* Rework process sounds (spray, purge, cycle complete) | P1 | Yes | Purpose: procedural feedback  
* Ambient cleanroom loop | P0 | Yes | Purpose: immersion baseline  
* Adaptive tension music layers | P1 | Yes | Purpose: pacing  
* Instructor/debrief voice lines | P2 | Yes | Purpose: coaching accessibility

**F) UX Text And Localization**

* Defect glossary entries (plain-language definitions) | P0 | No | Purpose: educational clarity  
* Rulebook daily bulletins | P0 | No | Purpose: progression mechanics  
* Debrief templates and coaching copy | P0 | No | Purpose: learning loop closure  
* Error/fine reason strings | P0 | No | Purpose: transparency  
* Localization key file (en baseline) | P1 | Yes | Purpose: expansion readiness

**G) Technical Assets (Code/Data/Materials)**

* Rule configuration data tables | P0 | No | Purpose: scalable day authoring  
* Defect generation profiles \+ seeded scenarios | P0 | No | Purpose: deterministic training runs  
* Scoring/economy config tables | P0 | No | Purpose: balancing  
* Analytics event schema | P0 | No | Purpose: assessment reporting  
* Material/shader presets for wafer readability | P0 | Yes | Purpose: consistent visibility  
* Prefab library for interactive stations | P1 | Yes | Purpose: iteration speed  
* Accessibility profiles (contrast/audio/text size) | P1 | Yes | Purpose: inclusive training

**H) QA Fixtures And Telemetry**

* Golden scenario set (known outcomes) | P0 | No | Purpose: regression validation  
* Automated scoring test cases | P0 | No | Purpose: logic reliability  
* Input parity test scripts (desktop vs VR) | P1 | Yes | Purpose: control consistency  
* Performance benchmark scenes | P1 | Yes | Purpose: runtime stability  
* Instructor report export template | P2 | Yes | Purpose: external training workflows

## Source References Used

* How Semiconductor Yields Vastly Improved (Asianometry)  
* Samsung Semiconductor Manufacturing Process Overview  
* 300mm Wafer Fab Virtual Tour (Texas Instruments)  
* Mastering Semiconductor Technology: Fundamentals of Photolithography (Brewer Science)  
* Semiconductors 101: Chips, Wafers, and How They Are Made (Singapore EDB)  
* FabStart Taiwan Semiconductor Fab Walkthrough  
* Introduction to Semiconductor Processing (SEMI)  
* Steps and Technologies of the 45nm Semiconductor Process Node \- Table 1.pdf  
* Technical Audit and Inspection Framework: The 45nm Process Node.pdf

