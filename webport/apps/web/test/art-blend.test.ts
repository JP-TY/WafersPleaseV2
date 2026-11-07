import { describe, expect, it } from 'vitest';
import { CONTENT_MODELS } from '../src/content/props.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('GLB / procedural blend contract', () => {
  it('prop module registers loaders and dresses scenic props (not Room/Workbench slabs)', () => {
    const src = readFileSync(path.resolve(HERE, '../src/content/props.ts'), 'utf8');
    expect(src).toMatch(/registerBuiltInLoaders/);
    expect(src).toMatch(/MeshoptCompression/);
    expect(src).toMatch(/meshopt_decoder\.js/);
    expect(src).toMatch(/hideWhenProp/);
    expect(src).toMatch(/fitUniform/);
    expect(src).toMatch(/targetSize/);
    // Procedural shell owns volume / deck — Room + Workbench GLBs must not replace them.
    expect(src).toMatch(/Room:procedural-shell/);
    expect(src).toMatch(/Workbench:procedural-deck/);
    expect(src).toMatch(/Console/);
    expect(src).toMatch(/DataSlate/);
    // Primary authored roles — not tiny scenic stubs.
    expect(src).toMatch(/role: 'primary'/);
    expect(src).toMatch(/Inspection/);
    // Workbench must not be in the dress list (giant slab regression).
    const dressBlock = src.match(/const DRESS_MODELS[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
    expect(dressBlock).toMatch(/'Console'/);
    expect(dressBlock).toMatch(/'DataSlate'/);
    expect(dressBlock).toMatch(/'Foup'/);
    expect(dressBlock).toMatch(/'Inspection'/);
    expect(dressBlock).not.toMatch(/'Workbench'/);
    expect(dressBlock).not.toMatch(/'Room'/);
  });

  it('bay parks scenic props when the rework slot opens', () => {
    const bay = readFileSync(path.resolve(HERE, '../src/bay/bay.ts'), 'utf8');
    const session = readFileSync(path.resolve(HERE, '../src/session/shift-session.ts'), 'utf8');
    const mats = readFileSync(path.resolve(HERE, '../src/bootstrap/materials.ts'), 'utf8');
    expect(bay).toMatch(/parkScenicProps/);
    expect(session).toMatch(/parkScenicProps/);
    expect(session).toMatch(/Console/);
    // Authored GLBs replace FOUP shell + instrument chassis; picks stay procedural.
    expect(session).toMatch(/scenicShells\(\)/);
    expect(session).toMatch(/scenicChassis\(\)/);
    expect(bay).toMatch(/foupShell/);
    expect(bay).toMatch(/instrumentChassis/);
    expect(bay).toMatch(/matteNoise/);
    expect(bay).toMatch(/enableShellFog/);
    expect(mats).toMatch(/noiseAlbedo/);
    expect(mats).toMatch(/noiseRoughness/);
    expect(mats).toMatch(/contactAo/);
    expect(mats).toMatch(/enableShellFog/);
    expect(mats).toMatch(/installCleanroomGrade/);
    const engine = readFileSync(path.resolve(HERE, '../src/bootstrap/engine.ts'), 'utf8');
    expect(engine).toMatch(/FOGMODE_LINEAR/);
    expect(engine).toMatch(/fogStart/);
    // Hard-hide station — visibility ghosts were the grey deck occluder.
    expect(bay).toMatch(/station\.setEnabled\(visible\)/);
    expect(bay).not.toMatch(/visibility = 0\.2/);
    // Back wall stays up — framing is inside the shell, not through a void.
    expect(bay).toMatch(/back\.setEnabled\(true\)/);
  });

  it('lighting installs soft IBL + SSAO path without Room/Workbench slabs', () => {
    const lighting = readFileSync(path.resolve(HERE, '../src/bootstrap/lighting.ts'), 'utf8');
    expect(lighting).toMatch(/installSoftEnvironment/);
    expect(lighting).toMatch(/installCleanroomGrade/);
    expect(lighting).toMatch(/SSAO2RenderingPipeline/);
    expect(lighting).toMatch(/PointLight/);
    // Key must dominate fill — form contrast, not ambient white-wash.
    expect(lighting).toMatch(/key\.intensity\s*=\s*0\.[89]/);
    expect(lighting).toMatch(/fill\.intensity\s*=\s*0\.[234]/);
    // FOUP-local rim/fill — short-range so HEPA/walls stay dark.
    expect(lighting).toMatch(/foupRim/);
    expect(lighting).toMatch(/foupFill/);
    expect(lighting).toMatch(/FOUP_WORLD/);
    const mats = readFileSync(path.resolve(HERE, '../src/bootstrap/materials.ts'), 'utf8');
    expect(mats).toMatch(/baySoftEnv/);
    expect(mats).toMatch(/highlight/);
    const props = readFileSync(path.resolve(HERE, '../src/content/props.ts'), 'utf8');
    const dressBlock = props.match(/const DRESS_MODELS[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
    expect(dressBlock).not.toMatch(/'Workbench'/);
    expect(dressBlock).not.toMatch(/'Room'/);
  });

  it('materials keep distinct specular break: steel vs laminate vs quartz vs rubber', () => {
    const mats = readFileSync(path.resolve(HERE, '../src/bootstrap/materials.ts'), 'utf8');
    expect(mats).toMatch(/export function laminate\(/);
    expect(mats).toMatch(/export function metal\(/);
    expect(mats).toMatch(/export function quartz\(/);
    expect(mats).toMatch(/export function rubber\(/);
    // Roughness / metalness bands must not collapse into one plastic sheen.
    expect(mats).toMatch(/m\.metallic = 0\.48 \+ s \* 0\.4/);
    expect(mats).toMatch(/\/\/ Satin dielectric/);
    expect(mats).toMatch(/m\.roughness = 0\.06/);
    expect(mats).toMatch(/m\.roughness = 0\.97/);
    const bay = readFileSync(path.resolve(HERE, '../src/bay/bay.ts'), 'utf8');
    expect(bay).toMatch(/laminate\(scene,\s*'benchMat'/);
    const station = readFileSync(path.resolve(HERE, '../src/rework/station-return.ts'), 'utf8');
    expect(station).toMatch(/laminate\(scene,/);
  });

  it('mesh density: FOUP handle/latch silhouette + hood/deck bevels (not lighting knobs)', () => {
    const foup = readFileSync(path.resolve(HERE, '../src/bay/foup.ts'), 'utf8');
    expect(foup).toMatch(/foupHandlePost/);
    expect(foup).toMatch(/foupLatchCam/);
    expect(foup).toMatch(/foupBevel/);
    expect(foup).toMatch(/foupDoorFrame/);
    // Carry grip is a cylinder, not a fat box bar.
    expect(foup).toMatch(/CreateCylinder\('foupHandle'/);
    expect(foup).toMatch(/flashLoad/);
    const station = readFileSync(path.resolve(HERE, '../src/rework/station-return.ts'), 'utf8');
    expect(station).toMatch(/HoodBrow/);
    expect(station).toMatch(/LipBevel/);
    expect(station).toMatch(/DeckChamfer/);
    expect(station).toMatch(/HoodSkirtPerf/);
    expect(station).toMatch(/Splash/);
    expect(station).toMatch(/DiGooseStem/);
    expect(station).toMatch(/DripTrench/);
    expect(station).toMatch(/HoodServiceCol/);
    expect(station).toMatch(/ServicePylon/);
    // Canopy stays dropped under FFU band — thicker mass, not HEPA climb.
    expect(station).toMatch(/canopyY = 1\.34/);
    const rca = readFileSync(path.resolve(HERE, '../src/rework/rca-bench.ts'), 'utf8');
    expect(rca).toMatch(/rcaBathBody/);
    expect(rca).toMatch(/rcaBathCheek/);
    expect(rca).toMatch(/rcaBathBridge/);
    expect(rca).toMatch(/buildHood\(scene, this\.root, 'rca', 1\.58, -0\.16\)/);
    expect(rca).toMatch(/rcaSidePlenum/);
    expect(rca).toMatch(/rcaUtilSpine/);
    expect(rca).toMatch(/rcaServiceMass/);
    expect(rca).toMatch(/rcaDeck/);
    expect(rca).toMatch(/rcaDeckBrace/);
    expect(rca).toMatch(/_glowRim/);
    expect(rca).toMatch(/_well/);
    expect(rca).toMatch(/_poolSurf/);
    expect(rca).toMatch(/wetSkimCatch/);
    expect(rca).toMatch(/rcaSkimKick/);
    const mats = readFileSync(path.resolve(HERE, '../src/bootstrap/materials.ts'), 'utf8');
    expect(mats).toMatch(/export function wetSkimCatch\(/);
    expect(mats).toMatch(/wetSkimStreakMap/);
    expect(mats).toMatch(/contactBlobMat/);
    expect(mats).toMatch(/radialContact/);
    const baySrc = readFileSync(path.resolve(HERE, '../src/bay/bay.ts'), 'utf8');
    expect(baySrc).toMatch(/foupContactBlob/);
    expect(baySrc).toMatch(/esdLip/);
    expect(baySrc).toMatch(/inspectNicheBack/);
    expect(baySrc).toMatch(/inspectNicheHepa_/);
    expect(baySrc).toMatch(/benchUnderMass/);
    expect(baySrc).toMatch(/bayGapCassette_/);
    expect(baySrc).toMatch(/bayGapConsoleTier/);
    // feel30/31/39/40/41/42 — raised lot plates + free-standing SMIF; midband debris parked from Iris FOV.
    expect(baySrc).toMatch(/tagName\}Body/);
    expect(baySrc).toMatch(/tagName\}Step/);
    expect(baySrc).toMatch(/bayMidFabCasLotBevel/);
    expect(baySrc).toMatch(/bayMidFabEndCapL/);
    expect(baySrc).toMatch(/bayMidFabEndCapR/);
    expect(baySrc).toMatch(/bayMidFabEndCapLNose/);
    expect(baySrc).toMatch(/bayMidFabPocketDarkMat/);
    expect(baySrc).toMatch(/bayMidFabRailSteelMat/);
    expect(baySrc).toMatch(/bayMidFabCasShellBevel/);
    expect(baySrc).toMatch(/bayMidFabWallGap_/);
    expect(baySrc).toMatch(/bayMidFabCabPlinth_/);
    expect(baySrc).toMatch(/bayMidFabCabCrown_/);
    expect(baySrc).toMatch(/feel44/);
    expect(baySrc).toMatch(/parkMid/);
    expect(baySrc).toMatch(/bayConduitRun/);
    expect(baySrc).toMatch(/bayMidFabCabBlob_/);
    expect(baySrc).toMatch(/C-25/);
    const travelerSrc = readFileSync(path.resolve(HERE, '../src/bay/traveler.ts'), 'utf8');
    expect(travelerSrc).toMatch(/feel44/);
    expect(travelerSrc).toMatch(/scaling = new Vector3\(0\.82/);
    const stamps = readFileSync(path.resolve(HERE, '../src/bay/stamps.ts'), 'utf8');
    expect(stamps).toMatch(/stampBaseEdge/);
    expect(stamps).toMatch(/emissiveColor = STAMP_META\[action\]\.color\.scale\(2\.05\)/);
    expect(stamps).toMatch(/stampLit: true/);
    expect(stamps).toMatch(/setTimeout\(restore, 950\)/);
    const boards = readFileSync(path.resolve(HERE, '../src/bay/boards.ts'), 'utf8');
    expect(boards).toMatch(/flashBegin/);
    const traveler = readFileSync(path.resolve(HERE, '../src/bay/traveler.ts'), 'utf8');
    expect(traveler).toMatch(/travelerLipBevel/);
    const lighting = readFileSync(path.resolve(HERE, '../src/bootstrap/lighting.ts'), 'utf8');
    // No more lighting knob spam this pass — key/fill stay at the contrast band.
    expect(lighting).toMatch(/key\.intensity\s*=\s*0\.92/);
    expect(lighting).toMatch(/fill\.intensity\s*=\s*0\.38/);
  });

  it('content model count matches manifest budget props', () => {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(HERE, '../../../packages/content/public/models/manifest.json'),
        'utf8',
      ),
    ) as { props: { name: string }[] };
    const names = new Set(manifest.props.map((p) => p.name));
    for (const m of CONTENT_MODELS) expect(names.has(m)).toBe(true);
  });

  it('post-load GLB material normalize: color space, rough maps, screen emissive, no screen nuke', () => {
    const mats = readFileSync(path.resolve(HERE, '../src/content/prop-materials.ts'), 'utf8');
    const props = readFileSync(path.resolve(HERE, '../src/content/props.ts'), 'utf8');
    const session = readFileSync(path.resolve(HERE, '../src/session/shift-session.ts'), 'utf8');
    expect(mats).toMatch(/normalizeDressedPropMaterials/);
    expect(mats).toMatch(/gammaSpace = true/);
    expect(mats).toMatch(/gammaSpace = false/);
    expect(mats).toMatch(/noiseRoughness/);
    expect(mats).toMatch(/useRoughnessFromMetallicTextureGreen/);
    expect(mats).toMatch(/useMetallnessFromMetallicTextureBlue/);
    expect(mats).toMatch(/authoredOrm/);
    expect(mats).toMatch(/emissiveFromAlbedo/);
    expect(mats).toMatch(/isInteractableScreenMaterial/);
    expect(mats).toMatch(/isPickable/);
    // Per-prop profiles — FOUP ORM metal for latch/slots; Console CRT emissive.
    expect(mats).toMatch(/Foup:/);
    expect(mats).toMatch(/Console:/);
    expect(mats).toMatch(/name === 'Foup'/);
    expect(mats).toMatch(/chrome latch\/wafer edges/);
    expect(mats).toMatch(/useMetallnessFromMetallicTextureBlue = true/);
    expect(mats).toMatch(/emissiveIntensity: 1\.45/);
    expect(mats).toMatch(/ImageProcessingConfiguration/);
    expect(mats).toMatch(/contrast:/);
    expect(props).toMatch(/normalizeDressedPropMaterials/);
    expect(props).toMatch(/materials\.push\(normalizeDressedPropMaterials/);
    // Room/Workbench still excluded from dress.
    const dressBlock = props.match(/const DRESS_MODELS[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
    expect(dressBlock).not.toMatch(/'Workbench'/);
    expect(dressBlock).not.toMatch(/'Room'/);
    expect(session).toMatch(/__WP_PROP_MATS/);
  });
});
