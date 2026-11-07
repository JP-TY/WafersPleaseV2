/**
 * Game configuration types and schemas.
 *
 * Replaces the Unity ScriptableObject config layer. Two things change for the
 * better and one thing is lost:
 *
 *  - Enums are string unions instead of ordinals. Unity serialized
 *    `defectClass: 1` positionally, so reordering the C# enum silently
 *    reinterpreted every asset. Here the value is checked against the name.
 *  - Cross-asset references are ids, not Unity GUIDs, so config is readable
 *    and survives GUID churn.
 *  - LOST: `ScenarioSO` existed in Unity but no `Scenario_*.asset` was ever
 *    created, so there is no scenario data to port. Day-level `seed` lives in
 *    the deterministic sim (packages/sim) instead, which is where it belongs.
 *
 * Pure TypeScript: no Babylon, no DOM. Safe to import from packages/sim's
 * test suite and from Node tooling alike.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums — string unions, mirroring Assets/Scripts/Core/Enums.cs
// ---------------------------------------------------------------------------

export const DEFECT_CLASSES = ['Parametric', 'Catastrophic'] as const;
export const DEFECT_TYPES = [
  'BowingWarping', 'STIVoid', 'InterfaceRoughness',
  'SilicideBridging', 'TungstenPlugVoid', 'SubstrateContamination',
] as const;
export const DETECTION_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Hidden'] as const;
export const ACTION_PATHS = ['Accept', 'Reject', 'Rework'] as const;
export const TOOL_TYPES = [
  'StylusProfilometer', 'SpectroscopicEllipsometry',
  'XRayRefractometry', 'ElectronMicroscope', 'FourPointProbe',
] as const;
export const REWORK_TYPES = ['RCAClean', 'SilicideWetEtch', 'CMPCalibration'] as const;
export const STAMP_TYPES = ['Accept', 'Reject', 'Rework'] as const;
export const WAFER_STATUSES = ['Created', 'Arrived', 'Inspecting', 'Routed'] as const;
export const SHIFT_PHASES = [
  'Briefing', 'Inspection', 'Break', 'Review', 'EndOfDay', 'Debrief', 'Complete',
] as const;

export type DefectClass = (typeof DEFECT_CLASSES)[number];
export type DefectType = (typeof DEFECT_TYPES)[number];
export type DetectionDifficulty = (typeof DETECTION_DIFFICULTIES)[number];
export type ActionPath = (typeof ACTION_PATHS)[number];
export type ToolType = (typeof TOOL_TYPES)[number];
export type ReworkType = (typeof REWORK_TYPES)[number];
export type StampType = (typeof STAMP_TYPES)[number];
export type WaferStatus = (typeof WAFER_STATUSES)[number];
export type ShiftPhase = (typeof SHIFT_PHASES)[number];

/** A config id, e.g. `sti-void`. Kept branded-free; just a non-empty string. */
export const ConfigId = z.string().min(1);
export type ConfigId = z.infer<typeof ConfigId>;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** DefectProfileSO */
export const DefectProfile = z.object({
  id: ConfigId,
  displayName: z.string().min(1),
  defectClass: z.enum(DEFECT_CLASSES),
  defectType: z.enum(DEFECT_TYPES),
  detectionDifficulty: z.enum(DETECTION_DIFFICULTIES),
  requiredTool: z.enum(TOOL_TYPES),
  defaultAction: z.enum(ACTION_PATHS),
  /**
   * DEPRECATED — do not drive logic from this field.
   *
   * In the Unity source, `DefectProfileSO.reworkAction` defaults to `Rework`
   * for every defect, including ones the GDD §7 matrix marks Reject. It is a
   * stale field-initializer default, not authored intent. The authoritative
   * correct-action per defect is the matching `RuleEntry.correctAction`, which
   * the converted rule matrices verify against the GDD. `defaultAction` agrees
   * with the rule matrix everywhere; `reworkAction` does not, and must not be
   * used. Kept only for provenance.
   */
  reworkAction: z.enum(ACTION_PATHS),
  /** 0..1. Unity allowed any float; clamped here so scoring can trust it. */
  severity: z.number().min(0).max(1),
  toleranceThreshold: z.number().min(0).max(1).default(0.15),
  diagnosticIndicators: z.array(z.string()).default([]),
  glossaryEntry: z.string().default(''),
  remediationReferences: z.array(z.string()).default([]),
});
export type DefectProfile = z.infer<typeof DefectProfile>;

/** ToolConfigSO. `accuracy` was [Range(0,1)] in Unity. */
export const ToolConfig = z.object({
  id: ConfigId,
  toolType: z.enum(TOOL_TYPES),
  accuracy: z.number().min(0).max(1),
  maxZoom: z.number().positive(),
  description: z.string().default(''),
  measurementUnit: z.string().default(''),
});
export type ToolConfig = z.infer<typeof ToolConfig>;

/**
 * How strongly the game scaffolds this day.
 *
 * GDD §12: scaffolded context prompts "fade away by Day 3." The Unity source
 * authored `showContextPrompts: 1` on all three days — a flat boolean that
 * never fades, contradicting the GDD. This field encodes the intended ramp:
 * Day 1 always prompts, Day 2 prompts only on first encounter of each defect
 * class, Day 3 prompts are off. The raw Unity boolean is kept below for
 * provenance and flagged by the validator when it disagrees with this ramp.
 */
export const CALLOUT_MODES = ['Always', 'FirstOccurrencePerDefectClass', 'Disabled'] as const;
export type CalloutMode = (typeof CALLOUT_MODES)[number];

/** DayConfigSO. `allowedDefects` and `availableTools` were asset refs / ordinals. */
export const DayConfig = z.object({
  id: ConfigId,
  dayNumber: z.number().int().positive(),
  briefingText: z.string().default(''),
  timeLimitMinutes: z.number().positive(),
  wafersPerDay: z.number().int().positive(),
  salaryTarget: z.number(),
  competencyTarget: z.number(),
  allowedDefects: z.array(ConfigId).min(1),
  availableTools: z.array(z.enum(TOOL_TYPES)).min(1),
  defectDensity: z.number().min(0).max(1),
  /**
   * Raw Unity value, kept for provenance only. GDD §12 requires the prompts to
   * fade by Day 3, so derive behaviour from `calloutMode`, not this boolean.
   */
  showContextPrompts: z.boolean().default(true),
  /** The GDD-faithful scaffolding ramp for this day. */
  calloutMode: z.enum(CALLOUT_MODES).default('Always'),
});
export type DayConfig = z.infer<typeof DayConfig>;

/** RuleEntry — a `[Serializable] struct` nested inside RuleMatrixSO. */
export const RuleEntry = z.object({
  defect: ConfigId,
  correctAction: z.enum(ACTION_PATHS),
  ruleText: z.string().default(''),
  toleranceThreshold: z.number().min(0).max(1).default(0.15),
});
export type RuleEntry = z.infer<typeof RuleEntry>;

/** RuleMatrixSO */
export const RuleMatrix = z.object({
  id: ConfigId,
  rules: z.array(RuleEntry).default([]),
});
export type RuleMatrix = z.infer<typeof RuleMatrix>;

/**
 * One step of a rework recipe.
 *
 * The Unity `ReworkConfigSO` had only a flat `string[] stepDescriptions`, which
 * meant the *procedure* lived nowhere: the player was told a step was called
 * "SC-1" with no temperature, no chemistry, and no dwell. The actual physics
 * lived hardcoded in the minigame code, so the data asset and the simulation
 * could disagree with no way to detect it.
 *
 * These fields are the recipe, and `sim` reads them. `null` on the temperature
 * window means the step is not temperature-controlled (a megasonic rinse runs at
 * ambient), which is a real distinction the flat description list could not
 * express.
 */
export const ReworkStepConfig = z.object({
  /** Stable key the simulation matches on, e.g. `SC1`, `QDR1`, `WASH`. */
  key: z.string().min(1),
  /** Player-facing step name. */
  label: z.string().min(1),
  /** What the step is, or why it exists. */
  purpose: z.string().default(''),
  /** Bath chemistry / medium. */
  chemistry: z.string().default(''),
  /** What this step is responsible for removing. */
  removes: z.string().default(''),
  /** Temperature window, or null when the step runs at ambient. */
  targetC: z
    .object({ min: z.number(), nominal: z.number(), max: z.number() })
    .nullable()
    .default(null),
  /** Dwell window in game seconds. */
  dwellSeconds: z.object({ min: z.number().nonnegative(), nominal: z.number().nonnegative(), max: z.number().nonnegative() }),
  /** The same dwell stated in real process minutes, for player-facing material. */
  realDwellMinutes: z.object({ min: z.number().nonnegative(), nominal: z.number().nonnegative(), max: z.number().nonnegative() }),
});
export type ReworkStepConfig = z.infer<typeof ReworkStepConfig>;

/**
 * ReworkConfigSO.
 *
 * `instructionsText`, `idealTimingSeconds`, `toleranceWindowSeconds`,
 * `failurePenalty` and `stepDescriptions` are the Unity fields and were all left
 * unauthored on two of the three assets — `idealTimingSeconds` was 0 and
 * `stepDescriptions` was empty for both RCA and the silicide etch, so the
 * converter emitted placeholders and the minigames hardcoded their own values.
 * `steps` now carries the recipe the simulation actually runs.
 */
export const ReworkConfig = z.object({
  id: ConfigId,
  type: z.enum(REWORK_TYPES),
  instructionsText: z.string().default(''),
  /** Total nominal duration of the whole procedure, game seconds. */
  idealTimingSeconds: z.number().nonnegative().default(0),
  /** How far off the nominal a player may be before it counts as a miss. */
  toleranceWindowSeconds: z.number().nonnegative().default(0),
  /** Competency penalty applied when the rework is botched. */
  failurePenalty: z.number().nonnegative().default(0),
  stepDescriptions: z.array(z.string()).default([]),
  steps: z.array(ReworkStepConfig).default([]),
  /** The GDD §8 bench this rework is played at, for the HUD and the tablet. */
  bench: z
    .object({
      /** GDD §8 letter. */
      key: z.string().min(1),
      title: z.string().min(1),
      /** One-line description of the instrument being operated. */
      instrument: z.string().default(''),
    })
    .default({ key: 'unknown', title: 'Unassigned', instrument: '' }),
});
export type ReworkConfig = z.infer<typeof ReworkConfig>;

/** ScoringConfigSO */
export const ScoringConfig = z.object({
  id: ConfigId,
  baseSalaryPerWafer: z.number(),
  correctBonusMultiplier: z.number().nonnegative(),
  incorrectPenaltyMultiplier: z.number().nonnegative(),
  correctCompetencyGain: z.number(),
  incorrectCompetencyPenalty: z.number().nonnegative(),
  salaryGradeThresholds: z.array(z.number()).default([]),
  competencyGradeThresholds: z.array(z.number()).default([]),
});
export type ScoringConfig = z.infer<typeof ScoringConfig>;

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export const ConfigBundle = z.object({
  defects: z.array(DefectProfile),
  tools: z.array(ToolConfig),
  days: z.array(DayConfig),
  ruleMatrices: z.array(RuleMatrix),
  rework: z.array(ReworkConfig),
  scoring: ScoringConfig.nullable(),
});
export type ConfigBundle = z.infer<typeof ConfigBundle>;

export interface ValidationIssue {
  severity: 'error' | 'warning';
  source: string;
  message: string;
}

/**
 * Cross-field validation that a per-asset schema cannot express: ids must be
 * unique, references must resolve, and the three days must form a coherent
 * progression. Unity's `RuleMatrixSO.FindMatchingRule` silently returned
 * `default` for an unmatched defect, so a dangling reference there degraded
 * into wrong-feeling gameplay rather than an error — worth catching here.
 */
export function validateBundle(bundle: ConfigBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (source: string, message: string) => issues.push({ severity: 'error', source, message });
  const warn = (source: string, message: string) => issues.push({ severity: 'warning', source, message });

  const dupes = <T extends { id: string }>(items: T[], label: string) => {
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) err(label, `duplicate id "${it.id}"`);
      seen.add(it.id);
    }
  };
  dupes(bundle.defects, 'defects');
  dupes(bundle.tools, 'tools');
  dupes(bundle.days, 'days');
  dupes(bundle.ruleMatrices, 'ruleMatrices');
  dupes(bundle.rework, 'rework');

  const defectIds = new Set(bundle.defects.map((d) => d.id));
  const toolTypes = new Set(bundle.tools.map((t) => t.toolType));

  for (const day of bundle.days) {
    for (const d of day.allowedDefects) {
      if (!defectIds.has(d)) err(day.id, `allowedDefects references unknown defect "${d}"`);
    }
    for (const t of day.availableTools) {
      if (!toolTypes.has(t)) err(day.id, `availableTools has "${t}" with no ToolConfig`);
    }
    // A defect the day allows must be inspectable with a tool the day grants,
    // or the wafer becomes unresolvable.
    for (const d of day.allowedDefects) {
      const profile = bundle.defects.find((x) => x.id === d);
      if (profile && !day.availableTools.includes(profile.requiredTool)) {
        err(day.id, `allows defect "${d}" needing ${profile.requiredTool}, which the day does not grant`);
      }
    }
  }

  for (const m of bundle.ruleMatrices) {
    if (m.rules.length === 0) warn(m.id, 'no rules');
    for (const r of m.rules) {
      if (!defectIds.has(r.defect)) err(m.id, `rule references unknown defect "${r.defect}"`);
    }
  }

  /**
   * Rework authoring.
   *
   * Two of the three Unity assets shipped empty — `idealTimingSeconds` 0,
   * `stepDescriptions` empty, and `rework-silicide-wet-etch` additionally typed
   * `RCAClean`, so it routed to the wrong bench. All three now carry a full
   * recipe in `steps`, and these checks exist so those gaps cannot silently
   * return: an unauthored rework is not a cosmetic problem, it is a defect the
   * player is asked to fix using instructions that were never written.
   */
  const reworkTypes = new Set(bundle.rework.map((r) => r.type));
  for (const t of REWORK_TYPES) {
    if (!reworkTypes.has(t)) err('rework', `no ReworkConfig for type "${t}"`);
  }
  for (const r of bundle.rework) {
    if (!r.instructionsText) err(r.id, 'instructionsText is empty — the player has no procedure to follow');
    if (r.idealTimingSeconds === 0) err(r.id, 'idealTimingSeconds is 0 — no nominal duration for the procedure');
    if (r.toleranceWindowSeconds === 0) err(r.id, 'toleranceWindowSeconds is 0 — every run would count as a miss');
    if (r.failurePenalty === 0) err(r.id, 'failurePenalty is 0 — botching this rework costs the player nothing');
    if (r.stepDescriptions.length === 0) err(r.id, 'stepDescriptions is empty');
    if (r.steps.length === 0) err(r.id, 'steps is empty — the simulation has no recipe to run');
    if (r.bench.key === 'unknown') err(r.id, 'bench.key is "unknown" — rework has no GDD §8 bench assigned');

    // Step keys must be unique: the simulation matches on them.
    const keys = new Set<string>();
    for (const s of r.steps) {
      if (keys.has(s.key)) err(r.id, `duplicate step key "${s.key}"`);
      keys.add(s.key);
      if (s.dwellSeconds.nominal < s.dwellSeconds.min || s.dwellSeconds.nominal > s.dwellSeconds.max) {
        err(r.id, `step "${s.key}" nominal dwell ${s.dwellSeconds.nominal} outside [${s.dwellSeconds.min}, ${s.dwellSeconds.max}]`);
      }
      if (s.targetC) {
        if (s.targetC.nominal < s.targetC.min || s.targetC.nominal > s.targetC.max) {
          err(r.id, `step "${s.key}" nominal temperature outside its window`);
        }
        if (s.targetC.min >= s.targetC.max) err(r.id, `step "${s.key}" temperature window is empty`);
      }
    }

    // The declared step count and the flat description list must agree, or the
    // UI would show a different number of steps than the simulation runs.
    if (r.steps.length > 0 && r.stepDescriptions.length !== r.steps.length) {
      err(r.id, `stepDescriptions has ${r.stepDescriptions.length} entries but steps has ${r.steps.length}`);
    }

    // Ideal timing should be the sum of the nominal dwells, within tolerance.
    // This is what caught the zero-timings: the asset and the minigame were
    // describing different procedures.
    const dwellSum = r.steps.reduce((a, s) => a + s.dwellSeconds.nominal, 0);
    if (r.steps.length > 0 && r.idealTimingSeconds > 0) {
      const drift = Math.abs(dwellSum - r.idealTimingSeconds);
      if (drift > Math.max(4, r.idealTimingSeconds * 0.3)) {
        warn(r.id, `idealTimingSeconds ${r.idealTimingSeconds} vs nominal dwell sum ${dwellSum}s`);
      }
    }
  }

  if (bundle.scoring === null) {
    err('scoring', 'missing ScoringConfig');
  } else {
    for (const key of ['salaryGradeThresholds', 'competencyGradeThresholds'] as const) {
      const arr = bundle.scoring[key];
      for (let i = 1; i < arr.length; i++) {
        const cur = arr[i]!;
        const prev = arr[i - 1]!;
        if (cur <= prev) {
          err('scoring', `${key} must be strictly ascending (${arr.join(', ')})`);
          break;
        }
      }
    }
  }

  const dayNumbers = bundle.days.map((d) => d.dayNumber).sort((a, b) => a - b);
  dayNumbers.forEach((n, i) => {
    if (n !== i + 1) warn('days', `day numbering is not contiguous from 1: [${dayNumbers.join(', ')}]`);
  });

  return issues;
}