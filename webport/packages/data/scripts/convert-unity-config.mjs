/**
 * Unity ScriptableObject config -> JSON.
 *
 * Phase 2 of the Unity -> Babylon.js port. Converts the 24 `.asset` YAML files
 * in Assets/Config into grouped JSON under packages/data/config/.
 *
 * Two encodings have to be undone, both verified against the source:
 *
 *  1. ENUMS ARE ORDINALS. `defectClass: 1` means Catastrophic, not a name. The
 *     tables below are transcribed from Assets/Scripts/Core/Enums.cs in
 *     declaration order — Unity serializes enum values positionally, so
 *     reordering that C# file would silently change every asset.
 *
 *  2. OBJECT REFERENCES ARE GUIDs. `allowedDefects: [{fileID: 11400000, guid:
 *     5564d3...}]` resolves through the sibling `.asset.meta` files to an asset
 *     filename, which becomes a stable kebab-case id here. GUIDs never leave
 *     this script — the JSON references assets by name so it stays readable
 *     and survives Unity GUID churn.
 *
 * Output is grouped by kind (defects.json, tools.json, ...) rather than one
 * file per asset, because assets reference each other and grouping keeps the
 * referential integrity visible in a single place.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../../..');

const SRC_DIR = path.join(REPO_ROOT, 'Assets/Config');
const OUT_DIR = path.join(PKG_ROOT, 'config');

/**
 * Enum tables transcribed from Assets/Scripts/Core/Enums.cs, in declaration
 * order. Index === serialized ordinal.
 */
const ENUMS = {
  DefectClass: ['Parametric', 'Catastrophic'],
  DefectType: [
    'BowingWarping', 'STIVoid', 'InterfaceRoughness',
    'SilicideBridging', 'TungstenPlugVoid', 'SubstrateContamination',
  ],
  DetectionDifficulty: ['Easy', 'Medium', 'Hard', 'Hidden'],
  ActionPath: ['Accept', 'Reject', 'Rework'],
  ToolType: [
    'StylusProfilometer', 'SpectroscopicEllipsometry',
    'XRayRefractometry', 'ElectronMicroscope', 'FourPointProbe',
  ],
  ReworkType: ['RCAClean', 'SilicideWetEtch', 'CMPCalibration'],
  StampType: ['Accept', 'Reject', 'Rework'],
  WaferStatus: ['Created', 'Arrived', 'Inspecting', 'Routed'],
  ShiftPhase: ['Briefing', 'Inspection', 'Break', 'Review', 'EndOfDay', 'Debrief', 'Complete'],
};

/** Unity's own serialization fields, which carry no game data. */
const UNITY_FIELDS = new Set([
  'm_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance',
  'm_PrefabAsset', 'm_GameObject', 'm_Enabled', 'm_EditorHideFlags',
  'm_Script', 'm_Name', 'm_EditorClassIdentifier',
]);

/** Which enum each field of each ScriptableObject serializes as an ordinal. */
const ENUM_FIELDS = {
  DefectProfileSO: {
    defectClass: 'DefectClass',
    defectType: 'DefectType',
    detectionDifficulty: 'DetectionDifficulty',
    requiredTool: 'ToolType',
    defaultAction: 'ActionPath',
    reworkAction: 'ActionPath',
  },
  DayConfigSO: { availableTools: 'ToolType' },
  RuleMatrixSO: { rules: 'ActionPath@correctAction' },
  ReworkConfigSO: { type: 'ReworkType' },
  ToolConfigSO: { toolType: 'ToolType' },
};

/** Asset-name -> stable id. Explicit so ids never churn on a rename. */
const ID_OVERRIDES = {
  Day1_Training: 'day-1-training',
  Day2_Standard: 'day-2-standard',
  Day3_Certification: 'day-3-certification',
  RuleMatrix_Day1: 'rule-matrix-day-1',
  RuleMatrix_Day2: 'rule-matrix-day-2',
  RuleMatrix_Day3: 'rule-matrix-day-3',
  ScoringConfig: 'scoring',
};

const slug = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();

const idFor = (name) => ID_OVERRIDES[name] ?? slug(name);

/** Resolve ordinal -> enum name, recording anything out of range. */
function decodeEnum(value, enumName, where, problems) {
  const table = ENUMS[enumName];
  if (!table) throw new Error(`unknown enum ${enumName} at ${where}`);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    problems.push(`${where}: expected integer ordinal for ${enumName}, got ${JSON.stringify(value)}`);
    return value;
  }
  if (value < 0 || value >= table.length) {
    problems.push(`${where}: ordinal ${value} out of range for ${enumName} (0..${table.length - 1})`);
    return value;
  }
  return table[value];
}

/**
 * Parse one Unity .asset. Unity YAML carries `%YAML`/`%TAG` directives and a
 * custom document tag (`--- !u!114 &11400000`) that a stock YAML parser
 * rejects; both are stripped first.
 */
function parseAsset(text) {
  const body = text
    .split('\n')
    .filter((l) => !l.startsWith('%'))
    .join('\n')
    .replace(/^--- !u!\d+ &\d+\s*$/m, '---');
  const doc = parse(body);
  const root = doc?.MonoBehaviour;
  if (!root) throw new Error('no MonoBehaviour document');
  const data = {};
  for (const [k, v] of Object.entries(root)) {
    if (!UNITY_FIELDS.has(k)) data[k] = v;
  }
  return {
    name: root.m_Name,
    // `Assembly-CSharp::WafersPlease.Config.DefectProfileSO` — the `::`
    // separates the assembly, then the C# namespace is dot-separated, so the
    // class name is the last dot-segment.
    className: (root.m_EditorClassIdentifier ?? '').split('.').pop(),
    data,
  };
}

/** Read `{fileID, guid, type}` refs into a lookup of guid -> asset name. */
async function buildGuidMap() {
  const files = await readdir(SRC_DIR);
  const map = new Map();
  for (const f of files) {
    if (!f.endsWith('.asset.meta')) continue;
    const text = await readFile(path.join(SRC_DIR, f), 'utf8');
    const guid = /^guid:\s*([0-9a-f]+)/m.exec(text)?.[1];
    if (guid) map.set(guid, f.replace(/\.asset\.meta$/, ''));
  }
  return map;
}

/** Convert a `{fileID, guid, type}` object reference into an asset id. */
function resolveRef(ref, guidMap, where, problems) {
  if (ref == null) return null;
  if (typeof ref === 'number') return ref;
  const name = guidMap.get(ref.guid);
  if (!name) {
    problems.push(`${where}: dangling GUID ${ref.guid} (no matching .asset.meta)`);
    return null;
  }
  return idFor(name);
}

/**
 * Unity writes an unpopulated string as a bare key (`instructionsText: `),
 * which YAML reads as null. Normalize those to empty string / empty array so
 * the emitted JSON has no nulls. Genuinely unauthored content is then caught
 * by the warning pass and by zod defaults rather than exploding downstream.
 */
function normalizeNulls(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(normalizeNulls);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeNulls(v);
    return out;
  }
  return value;
}

/**
 * Unity serializes `bool` as the integers 1/0 in YAML. Coerce the known
 * boolean fields so the JSON carries real booleans.
 */
const BOOL_FIELDS = new Set([
  'showContextPrompts', // DayConfigSO
  'guaranteed',         // ScenarioSO.DefectSpawnEntry (no assets exist yet)
]);

function coerceBools(data) {
  for (const [k, v] of Object.entries(data)) {
    if (BOOL_FIELDS.has(k) && (v === 0 || v === 1)) {
      data[k] = v === 1;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      coerceBools(v);
    } else if (Array.isArray(v)) {
      for (const entry of v) if (entry && typeof entry === 'object') coerceBools(entry);
    }
  }
  return data;
}

function mapEnumFields(kind, data, where, problems) {
  const spec = ENUM_FIELDS[kind] ?? {};
  for (const [field, enumSpec] of Object.entries(spec)) {
    const raw = data[field];
    if (raw === undefined) continue;

    // Nested spec first: `rules: 'ActionPath@correctAction'` is an array of
    // structs, and would otherwise be caught by the flat-array branch below.
    if (enumSpec.includes('@')) {
      const [enumName, inner] = enumSpec.split('@');
      if (!Array.isArray(raw)) {
        problems.push(`${where}.${field}: expected an array of structs for ${enumSpec}`);
        continue;
      }
      data[field] = raw.map((entry, i) => {
        const o = { ...entry };
        if (o[inner] !== undefined) {
          o[inner] = decodeEnum(o[inner], enumName, `${where}.${field}[${i}].${inner}`, problems);
        }
        return o;
      });
      continue;
    }

    if (Array.isArray(raw)) {
      data[field] = raw.map((v, i) => decodeEnum(v, enumSpec, `${where}.${field}[${i}]`, problems));
      continue;
    }

    data[field] = decodeEnum(raw, enumSpec, `${where}.${field}`, problems);
  }
  return data;
}

async function main() {
  if (!existsSync(SRC_DIR)) throw new Error(`no Unity config at ${SRC_DIR}`);
  const guidMap = await buildGuidMap();
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.asset')).sort();
  const problems = [];
  const warnings = [];
  const buckets = {
    DefectProfileSO: [], ToolConfigSO: [], DayConfigSO: [],
    RuleMatrixSO: [], ReworkConfigSO: [], ScoringConfigSO: [],
  };
  const unhandled = [];

  for (const f of files) {
    const where = f.replace(/\.asset$/, '');
    let asset;
    try {
      asset = parseAsset(await readFile(path.join(SRC_DIR, f), 'utf8'));
    } catch (err) {
      problems.push(`${where}: parse failed — ${err.message}`);
      continue;
    }
    const { name, className } = asset;
    const data = coerceBools(normalizeNulls(asset.data));

    if (!buckets[className]) {
      // GameEventSO assets carry no data at all and ScenarioSO has no assets.
      unhandled.push(`${where} (${className})`);
      continue;
    }

    mapEnumFields(className, data, where, problems);

    // Resolve every object reference into an id.
    switch (className) {
      case 'DayConfigSO':
        if (Array.isArray(data.allowedDefects)) {
          data.allowedDefects = data.allowedDefects.map((r, i) =>
            resolveRef(r, guidMap, `${where}.allowedDefects[${i}]`, problems));
          data.allowedDefects = data.allowedDefects.filter(Boolean);
          // availableTools was already decoded to names above; keep as names.
        }
        break;
      case 'RuleMatrixSO':
        if (Array.isArray(data.rules)) {
          data.rules = data.rules.map((r, i) => ({
            ...r,
            defect: resolveRef(r.defect, guidMap, `${where}.rules[${i}].defect`, problems),
          })).filter((r) => r.defect);
        }
        break;
      default:
        break;
    }

    buckets[className].push({ id: idFor(name), ...data });
  }

  // ---- content-gap and consistency checks --------------------------------
  // These are authoring bugs found in the Unity source, surfaced rather than
  // silently normalised away.
  for (const d of buckets.DayConfigSO) {
    if (d.allowedDefects.length === 0) warnings.push(`${d.id}: allowedDefects is empty`);
  }
  for (const r of buckets.ReworkConfigSO) {
    if (!r.instructionsText) warnings.push(`${r.id}: instructionsText is empty (unauthored)`);
    if (!r.idealTimingSeconds) warnings.push(`${r.id}: idealTimingSeconds is 0 (unauthored)`);
    if (!Array.isArray(r.stepDescriptions) || r.stepDescriptions.length === 0) {
      warnings.push(`${r.id}: stepDescriptions is empty (unauthored)`);
    }
  }

  // Abort before any write so a failed conversion preserves the last usable bundle.
  if (problems.length) {
    console.error(`\n${problems.length} problem(s) — config not written:`);
    for (const p of problems) console.error(`  x ${p}`);
    if (warnings.length) {
      console.error(`\n${warnings.length} authoring warning(s):`);
      for (const w of warnings) console.error(`  ! ${w}`);
    }
    process.exit(1);
  }

  // ---- emit ---------------------------------------------------------------
  const out = {
    'defects.json': { defects: buckets.DefectProfileSO },
    'tools.json': { tools: buckets.ToolConfigSO },
    'days.json': { days: buckets.DayConfigSO },
    'rule-matrices.json': { ruleMatrices: buckets.RuleMatrixSO },
    'rework.json': { rework: buckets.ReworkConfigSO },
    'scoring.json': { scoring: buckets.ScoringConfigSO[0] ?? null },
  };

  for (const [file, body] of Object.entries(out)) {
    await writeFile(path.join(OUT_DIR, file), `${JSON.stringify(body, null, 2)}\n`);
  }

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        convertedBy: 'packages/data/scripts/convert-unity-config.mjs',
        source: 'Assets/Config',
        unityEnums: ENUMS,
        counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
        unhandledAssets: unhandled,
        problems,
        warnings,
      },
      null,
      2
    )}\n`
  );

  console.log(`converted ${files.length} Unity assets -> ${OUT_DIR}\n`);
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(20)} ${v.length}`);
  if (unhandled.length) {
    console.log('\nnot converted (no data / no schema):');
    for (const u of unhandled) console.log(`  ${u}`);
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} authoring warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});