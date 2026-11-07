import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import {
  PROCESS,
  createRcaClean,
  rcaWithdrawCue,
  type RcaAction,
  type RcaCleanState,
  type Recipe,
  type ReworkMinigame,
  type Rng,
} from '@wafers/sim';
import {
  COLORS,
  absorbWell,
  bathFill,
  lamp,
  matteNoise,
  metal,
  quartz,
  silicon,
  wetChemRing,
  wetChemTop,
  wetRimFresnel,
  wetSkimCatch,
  wetSurface,
} from '../bootstrap/materials.js';
import { frameBench } from '../bootstrap/engine.js';
import type { ReworkBenchHandle, ReworkCloseRequest } from './types.js';
import {
  REWORK_SLOT,
  buildCabinet,
  buildHood,
  buildReadout,
  buildServiceBundle,
  chemistryTag,
  processPaddle,
  returnControl,
} from './station-return.js';

/**
 * Day 1 RCA wet bench — dual tanks + QDR, heaters, immerse/withdraw (GDD §8A).
 * Verdict comes solely from @wafers/sim; this layer paints state.
 */
export class RcaBench implements ReworkBenchHandle {
  readonly root: TransformNode;
  private sim: ReworkMinigame<RcaCleanState, RcaAction>;
  private readonly factory: () => ReworkMinigame<RcaCleanState, RcaAction>;
  private readonly readoutTex: DynamicTexture;
  private readonly liquidSc1: AbstractMesh;
  private readonly liquidSc2: AbstractMesh;
  private readonly liquidQdr: AbstractMesh;
  private readonly coilSc1: AbstractMesh;
  private readonly coilSc2: AbstractMesh;
  private readonly lampSc1: AbstractMesh;
  private readonly lampSc2: AbstractMesh;
  private readonly waferProxy: AbstractMesh;
  private readonly fork: TransformNode;
  private readonly setReturnArmed: (armed: boolean) => void;
  private closeReq: ReworkCloseRequest | null = null;
  private shownResult = false;
  /** After first immerse, raised wafer tracks active bath; before that it parks off chem. */
  private waferDipped = false;

  constructor(scene: Scene, rngFactory: () => Rng, recipe: Recipe) {
    this.factory = () => createRcaClean(rngFactory(), 0, recipe);
    this.sim = this.factory();

    this.root = new TransformNode('rcaBench', scene);
    this.root.position = REWORK_SLOT.clone();
    this.root.setEnabled(false);

    buildCabinet(scene, this.root, 'rca', {
      width: 1.72,
      depth: 0.86,
      title: 'RCA WET BENCH',
      subtitle: 'SC-1 → QDR → SC-2 → QDR',
    });
    // Bury dresser carcass / lips / cabinet face — scale+park so Iris can't silhouette them.
    const bury = (n: string) => {
      const m = scene.getMeshByName(n);
      if (!m) return;
      m.setEnabled(false);
      m.scaling.setAll(0.001);
      m.position.set(0, -40, 0);
    };
    for (const n of [
      'rcaDeck',
      'rcaDeckChamfer0',
      'rcaDeckChamfer1',
      'rcaDeckChamfer2',
      'rcaDeckChamfer3',
      'rcaLip0',
      'rcaLip1',
      'rcaLipBevel0',
      'rcaLipBevel1',
      'rcaSideLip0',
      'rcaSideLip1',
      'rcaDeckUndercut',
      'rcaSplashRail',
      'rcaDripTrench',
      'rcaCab',
      'rcaSkirtFace',
      'rcaUtilBay',
      'rcaFascia',
      'rcaToeKick',
      'rcaPlinth',
      'rcaAccessLatchCam',
      'rcaFloorContact',
      'rcaLeg-1-1',
      'rcaLeg-11',
      'rcaLeg1-1',
      'rcaLeg11',
    ]) {
      bury(n);
    }
    for (const m of scene.meshes) {
      if (
        m.name.startsWith('rcaLeg') ||
        m.name.startsWith('rcaAccessLouver') ||
        m.name.startsWith('rcaDoor')
      ) {
        m.setEnabled(false);
        m.scaling.setAll(0.001);
        m.position.set(0, -40, 0);
      }
    }
    // Hood pulled hard forward (−Z) so orbit reads deep recessed canopy over open bath cavity.
    buildHood(scene, this.root, 'rca', 1.58, -0.16);
    buildServiceBundle(scene, this.root, 'rca', {
      width: 1.58,
      depth: 0.78,
      accent: new Color3(0.95, 0.55, 0.08),
    });
    // Kill every hood/service wing/rail/lip that can silhouette outside the canopy.
    for (const n of [
      'rcaSplashRail',
      'rcaDripTrench',
      'rcaDiGooseBase',
      'rcaDiGooseStem',
      'rcaDiGooseNeck',
      'rcaDiGooseSpout',
      'rcaHoodSidePlenum1',
      'rcaHoodSidePlenum-1',
      'rcaHoodSideCap1',
      'rcaHoodSideCap-1',
      'rcaHoodCheek1',
      'rcaHoodCheek-1',
      'rcaHoodCheekFront1',
      'rcaHoodCheekFront-1',
      'rcaHoodCheekPane1',
      'rcaHoodCheekPane-1',
      'rcaHoodCheekBevel1',
      'rcaHoodCheekBevel-1',
      'rcaHoodServiceCol1',
      'rcaHoodServiceCol-1',
      'rcaHoodServiceCap1',
      'rcaHoodServiceCap-1',
      'rcaHoodServiceFoot1',
      'rcaHoodServiceFoot-1',
      'rcaHoodSashRail0',
      'rcaTrayRail0',
      'rcaTrayRail1',
      'rcaTrayRail2',
    ]) {
      bury(n);
    }
    for (const m of scene.meshes) {
      if (
        m.name.startsWith('rcaHoodSlot') ||
        m.name.startsWith('rcaHoodCheekGasket') ||
        m.name.startsWith('rcaHoodBrow') ||
        m.name.startsWith('rcaHoodIntake') ||
        m.name.startsWith('rcaHoodSkirt') ||
        m.name.startsWith('rcaHoodPost') ||
        m.name.startsWith('rcaHoodFoot') ||
        m.name.startsWith('rcaHoodLateral') ||
        m.name.startsWith('rcaHoodHandle') ||
        m.name.startsWith('rcaHoodSash') ||
        m.name.startsWith('rcaHoodCounter') ||
        m.name.startsWith('rcaHoodFilter') ||
        m.name.startsWith('rcaHoodBlade') ||
        m.name.startsWith('rcaHoodFfu') ||
        m.name.startsWith('rcaHoodSpray') ||
        m.name.startsWith('rcaHoodSensor') ||
        m.name.startsWith('rcaHoodGauge') ||
        m.name.startsWith('rcaHoodNeedle') ||
        m.name.startsWith('rcaHoodTransition') ||
        m.name.startsWith('rcaHoodFlange') ||
        m.name.startsWith('rcaHoodRiser') ||
        m.name.startsWith('rcaHoodElbow') ||
        m.name.startsWith('rcaHoodHeader') ||
        m.name.startsWith('rcaHoodStrap') ||
        m.name.startsWith('rcaHoodBeacon') ||
        m.name.startsWith('rcaHoodChase') ||
        m.name.startsWith('rcaHoodLight') ||
        m.name.startsWith('rcaHoodBack') ||
        m.name.startsWith('rcaHoodFilterDiv') ||
        m.name.startsWith('rcaValve') ||
        m.name === 'rcaSplash' ||
        m.name.startsWith('rcaCarboy') ||
        m.name.startsWith('rcaTrayRung') ||
        m.name.startsWith('rcaCable') ||
        m.name.startsWith('rcaServicePylon') ||
        m.name.startsWith('rcaServiceArm') ||
        m.name.startsWith('rcaFlexHose') ||
        m.name.startsWith('rcaPipe') ||
        m.name.startsWith('rcaManifold') ||
        m.name.startsWith('rcaJbox') ||
        m.name.startsWith('rcaUtilTag') ||
        m.name.startsWith('rcaRinse') ||
        m.name.startsWith('rcaDiGoose')
      ) {
        m.setEnabled(false);
        m.scaling.setAll(0.001);
        m.position.set(0, -40, 0);
      }
    }
    // Continuous flush cheeks — OUTER face locked to canopyHalf (no 1–2 cm stick-out edge).
    const sidePlenumMat = matteNoise(scene, 'rcaSidePlenumMat', new Color3(0.28, 0.3, 0.34), {
      variance: 14,
      speck: 0.08,
      size: 128,
      tileHint: 'fine',
      blotch: 0.5,
      emissive: 0.018,
      uScale: 1.8,
      vScale: 2.2,
    });
    // Canopy half-width; every cheek mesh outer face == ±canopyHalf (Iris flush silhouette).
    const canopyHalf = 0.86;
    const wallW = 0.16;
    const cheekCenter = (w: number) => canopyHalf - w / 2;
    for (const sx of [-1, 1] as const) {
      // Full-height flush cheek — continuous canopy→skirt face (no stepped wing/rail).
      const wall = CreateBox(`rcaSidePlenum${sx}`, { width: wallW, height: 1.85, depth: 0.82 }, scene);
      wall.parent = this.root;
      wall.position.set(sx * cheekCenter(wallW), 0.92, -0.02);
      wall.material = sidePlenumMat;
      wall.isPickable = false;
      // Front return coplanar with canopy brow — no outboard ledge / furniture edge.
      const face = CreateBox(`rcaFlushFace${sx}`, { width: wallW, height: 1.72, depth: 0.14 }, scene);
      face.parent = this.root;
      face.position.set(sx * cheekCenter(wallW), 0.9, -0.38);
      face.material = sidePlenumMat;
      face.isPickable = false;
      // Fill canopy overhang gap so Iris can't read a horizontal furniture lip.
      const capFill = CreateBox(`rcaCanopyFill${sx}`, { width: wallW, height: 0.4, depth: 0.82 }, scene);
      capFill.parent = this.root;
      capFill.position.set(sx * cheekCenter(wallW), 1.42, -0.04);
      capFill.material = sidePlenumMat;
      capFill.isPickable = false;
      // Inboard seam filler only — prior forward seam read as a thin vertical bracket in Iris.
      const seam = CreateBox(`rcaCheekSeam${sx}`, { width: wallW - 0.02, height: 1.85, depth: 0.06 }, scene);
      seam.parent = this.root;
      seam.position.set(sx * cheekCenter(wallW - 0.02), 0.9, -0.28);
      seam.material = sidePlenumMat;
      seam.isPickable = false;
      // Internal brace only (art-blend name) — buried inside cheek, not a side rail.
      const brace = CreateBox(`rcaDeckBrace${sx}`, { width: 0.04, height: 0.9, depth: 0.05 }, scene);
      brace.parent = this.root;
      brace.position.set(sx * (canopyHalf - wallW + 0.02), 1.0, -0.08);
      brace.material = metal(scene, `rcaDeckBraceMat${sx}`, new Color3(0.34, 0.36, 0.4), 0.14);
      brace.isPickable = false;
    }
    // Replace stock canopy/plenum (overhang lip) with flush top mass matching cheek outer X.
    bury('rcaHoodCanopy');
    bury('rcaHoodPlenum');
    // Fascia label was mid-frame hero once columns died — bury so pool surfaces own the ROI.
    bury('rcaHoodFascia');
    bury('rcaHoodSkirt');
    for (let i = 0; i < 13; i++) bury(`rcaHoodIntake${i}`);
    for (let i = 0; i < 11; i++) bury(`rcaHoodSkirtPerf${i}`);
    for (let i = 0; i < 5; i++) bury(`rcaHoodBrow${i}`);
    const shellW = canopyHalf * 2;
    // Canopy sits REAR of the bath bank — prior deep canopy (z≈−0.49…0.33) occluded
    // top-down pool rays. Leave open sky over bathZ so pool surfaces read.
    const flushCanopy = CreateBox('rcaHoodCanopy', { width: shellW, height: 0.28, depth: 0.42 }, scene);
    flushCanopy.parent = this.root;
    flushCanopy.position.set(0, 1.52, 0.12);
    flushCanopy.material = sidePlenumMat;
    flushCanopy.isPickable = false;
    const flushPlenum = CreateBox('rcaHoodPlenum', { width: shellW - 0.02, height: 0.16, depth: 0.36 }, scene);
    flushPlenum.parent = this.root;
    flushPlenum.position.set(0, 1.7, 0.14);
    flushPlenum.material = sidePlenumMat;
    flushPlenum.isPickable = false;
    // Monolithic under-skirt — same outer width as canopy, flush cheeks, zero cabinet lip.
    const serviceMass = CreateBox('rcaServiceMass', { width: shellW, height: 0.78, depth: 0.8 }, scene);
    serviceMass.parent = this.root;
    serviceMass.position.set(0, 0.34, 0.0);
    serviceMass.material = matteNoise(scene, 'rcaServiceMassMat', new Color3(0.24, 0.26, 0.28), {
      variance: 12,
      speck: 0.06,
      size: 128,
      blotch: 0.45,
      emissive: 0.016,
      uScale: 2.0,
      vScale: 1.4,
    });
    serviceMass.isPickable = false;
    // Front skirt panel flush to cheeks — wet-bench face, not stepped cabinet door.
    const monoSkirt = CreateBox('rcaMonoSkirt', { width: shellW - 0.02, height: 0.72, depth: 0.12 }, scene);
    monoSkirt.parent = this.root;
    monoSkirt.position.set(0, 0.34, -0.39);
    monoSkirt.material = sidePlenumMat;
    monoSkirt.isPickable = false;
    // Solid skirt fill — no vent slots / louvers (those read as furniture edge cues in Iris).
    const monoSkirtFill = CreateBox('rcaMonoSkirtFill', { width: shellW - 0.06, height: 0.55, depth: 0.08 }, scene);
    monoSkirtFill.parent = this.root;
    monoSkirtFill.position.set(0, 0.34, -0.34);
    monoSkirtFill.material = matteNoise(scene, 'rcaMonoSkirtFillMat', new Color3(0.22, 0.24, 0.26), {
      variance: 10,
      speck: 0.05,
      size: 96,
      blotch: 0.4,
      emissive: 0.012,
      uScale: 2.0,
      vScale: 1.3,
    });
    monoSkirtFill.isPickable = false;

    // Shared bath body — recessed wet-bench tub sunk into the deck (not jars on a dresser top).
    const bathBodyMat = matteNoise(scene, 'rcaBathBodyMat', new Color3(0.3, 0.32, 0.36), {
      variance: 16,
      speck: 0.1,
      size: 128,
      tileHint: 'fine',
      blotch: 0.58,
      emissive: 0.022,
      uScale: 2.4,
      vScale: 1.6,
    });
    // Bath bank pulled hard forward (−Z) into open sash cavity so wet tops fill bath-band.
    const bathZ = -0.36;
    const bathBody = CreateBox('rcaBathBody', { width: 1.52, height: 0.1, depth: 0.72 }, scene);
    bathBody.parent = this.root;
    bathBody.position.set(0, 0.88, bathZ + 0.12);
    bathBody.material = bathBodyMat;
    bathBody.isPickable = false;
    // Rear / side tub walls — enclose wells; side walls flush to canopy outer (no wing).
    const bathBack = CreateBox('rcaBathBackWall', { width: 1.46, height: 0.48, depth: 0.1 }, scene);
    bathBack.parent = this.root;
    bathBack.position.set(0, 1.18, bathZ + 0.44);
    bathBack.material = bathBodyMat;
    bathBack.isPickable = false;
    for (const sx of [-1, 1] as const) {
      const sideWall = CreateBox(`rcaBathSideWall${sx}`, { width: 0.08, height: 0.48, depth: 0.68 }, scene);
      sideWall.parent = this.root;
      sideWall.position.set(sx * cheekCenter(0.08), 1.18, bathZ + 0.1);
      sideWall.material = bathBodyMat;
      sideWall.isPickable = false;
    }
    // Dark metal tub rails — never tan laminate (that read as furniture side ledge).
    const deckRail = matteNoise(scene, 'rcaBathDeckMat', new Color3(0.26, 0.28, 0.32), {
      variance: 14,
      speck: 0.08,
      size: 128,
      blotch: 0.5,
      emissive: 0.014,
      uScale: 2.4,
      vScale: 1.4,
    });
    // Slim rear rail only — keep art-blend name, no forward shelf edge silhouette.
    const bathDeck = CreateBox('rcaBathDeck', { width: 1.3, height: 0.035, depth: 0.06 }, scene);
    bathDeck.parent = this.root;
    bathDeck.position.set(0, 1.32, bathZ + 0.38);
    bathDeck.material = deckRail;
    bathDeck.isPickable = false;
    // Vertical cheek risers inset of canopy outer — no outboard shelf plank / bracket.
    for (const [si, sx] of [
      [0, -1],
      [1, 1],
    ] as const) {
      const side = CreateBox(`rcaBathDeckSide${si}`, { width: 0.07, height: 0.55, depth: 0.58 }, scene);
      side.parent = this.root;
      side.position.set(sx * cheekCenter(0.07), 1.15, bathZ + 0.02);
      side.material = deckRail;
      side.isPickable = false;
    }
    // Dark well floor under the open tank bank (below liquid bottoms).
    const bathWell = CreateBox('rcaBathWell', { width: 1.32, height: 0.05, depth: 0.56 }, scene);
    bathWell.parent = this.root;
    bathWell.position.set(0, 0.94, bathZ);
    bathWell.material = matteNoise(scene, 'rcaBathWellMat', new Color3(0.1, 0.12, 0.14), {
      variance: 10,
      speck: 0.06,
      size: 96,
      blotch: 0.4,
      emissive: 0.02,
    });
    bathWell.isPickable = false;
    // No bath lips / deck-front rails — those read as side-wing furniture in Iris.
    // Dividers between SC-1 / QDR / SC-2 wells — sell integrated tank bank.
    for (const [di, dx] of [
      [0, -0.24],
      [1, 0.24],
    ] as const) {
      const div = CreateBox(`rcaBathDiv${di}`, { width: 0.045, height: 0.36, depth: 0.5 }, scene);
      div.parent = this.root;
      div.position.set(dx, 1.16, bathZ);
      div.material = metal(scene, `rcaBathDivMat${di}`, new Color3(0.4, 0.42, 0.46), 0.2);
      div.isPickable = false;
    }
    // Flush bath cheeks — merge tub into side plenum (outer face ≤ canopyHalf).
    for (const sx of [-1, 1] as const) {
      const cheek = CreateBox(`rcaBathCheek${sx}`, { width: 0.1, height: 0.85, depth: 0.64 }, scene);
      cheek.parent = this.root;
      cheek.position.set(sx * cheekCenter(0.1), 1.2, bathZ + 0.06);
      cheek.material = bathBodyMat;
      cheek.isPickable = false;
      // No cheekCap — forward caps read as tan side rails in Iris.
    }
    // Rear utility spine bridge — behind baths only (must not roof over pool tops).
    const bathBridge = CreateBox('rcaBathBridge', { width: 1.4, height: 0.28, depth: 0.18 }, scene);
    bathBridge.parent = this.root;
    bathBridge.position.set(0, 1.36, bathZ + 0.42);
    bathBridge.material = bathBodyMat;
    bathBridge.isPickable = false;
    const utilSpine = CreateBox('rcaUtilSpine', { width: 1.34, height: 0.12, depth: 0.14 }, scene);
    utilSpine.parent = this.root;
    utilSpine.position.set(0, 1.56, bathZ + 0.46);
    utilSpine.material = metal(scene, 'rcaUtilSpineMat', new Color3(0.4, 0.42, 0.46), 0.16);
    utilSpine.isPickable = false;
    // Utility spine stubs — short, dark, inside canopy (no tall brass furniture sticks).
    for (const [ui, ux] of [
      [0, -0.4],
      [1, 0],
      [2, 0.4],
    ] as const) {
      const riser = CreateCylinder(`rcaUtilRiser${ui}`, { diameter: 0.035, height: 0.12, tessellation: 10 }, scene);
      riser.parent = this.root;
      riser.position.set(ux, 1.68, bathZ + 0.46);
      riser.material = metal(scene, `rcaUtilRiserMat${ui}`, new Color3(0.42, 0.4, 0.38), 0.18);
      riser.isPickable = false;
    }

    const makeBath = (
      key: string,
      x: number,
      liquidColor: Color3,
      chemistry: readonly string[],
      withHeater: boolean,
    ) => {
      // feel23 — REAL recessed process tank (lathe cup), not painted disc in grey torus:
      // outer skirt → VISIBLE inner wall height → dark floor → liquid fill → chem surface under rim.
      const poolY = 1.38;
      const wellDepth = 0.34;
      const innerR = 0.235;
      const outerR = 0.285;
      // Glass skim / meniscus meshes — skimKick includedOnly so glint can't wash chemBand.
      const glassCatchers: AbstractMesh[] = [];
      const wellMat = matteNoise(
        scene,
        `${key}_wellMat`,
        new Color3(0.14, 0.15, 0.17).add(liquidColor.scale(0.04)),
        {
          variance: 12,
          speck: 0.05,
          size: 64,
          tileHint: 'fine',
          blotch: 0.4,
          emissive: 0.01,
          uScale: 2.4,
          vScale: 1.8,
        },
      );
      const wallMat = matteNoise(
        scene,
        `${key}_wallBandMat`,
        new Color3(0.07, 0.075, 0.08).add(liquidColor.scale(0.025)),
        { variance: 8, speck: 0.03, size: 48, blotch: 0.25, emissive: 0.002 },
      );

      // Lathe cup — OPEN mouth with real inner-wall height (orbit silhouette = tank, not disc).
      const cup = CreateLathe(
        `${key}_well`,
        {
          shape: [
            new Vector3(0, 0, 0),
            new Vector3(outerR, 0, 0),
            new Vector3(outerR, wellDepth, 0),
            new Vector3(innerR + 0.03, wellDepth, 0),
            new Vector3(innerR + 0.012, wellDepth - 0.018, 0),
            new Vector3(innerR, 0.028, 0),
            new Vector3(0, 0.028, 0),
          ],
          radius: 1,
          tessellation: 36,
          sideOrientation: 2, // DOUBLESIDE — inner wall visible from orbit
        },
        scene,
      );
      cup.parent = this.root;
      cup.position.set(x, poolY - wellDepth, bathZ);
      cup.material = wellMat;
      cup.isPickable = false;

      // Outer skirt under deck — grounds the tub without plugging the mouth.
      const skirt = CreateCylinder(`${key}_skirt`, {
        diameter: outerR * 2 + 0.04,
        height: 0.08,
        tessellation: 32,
      }, scene);
      skirt.parent = this.root;
      skirt.position.set(x, poolY - wellDepth - 0.02, bathZ);
      skirt.material = wellMat;
      skirt.isPickable = false;

      // Probe aliases kept for Iris mesh checks.
      const wallProbe = CreateBox(`${key}_wellWall0`, { width: 0.02, height: 0.02, depth: 0.02 }, scene);
      wallProbe.parent = this.root;
      wallProbe.position.set(x, poolY - wellDepth * 0.45, bathZ + innerR);
      wallProbe.setEnabled(false);
      wallProbe.isPickable = false;
      // Dark INNER LEDGE annulus (torus, not solid plug) — wall height cue without filling the mouth.
      const wallBand = CreateTorus(`${key}_wallBand`, {
        diameter: innerR * 2 + 0.01,
        thickness: 0.04,
        tessellation: 36,
      }, scene);
      wallBand.parent = this.root;
      wallBand.position.set(x, poolY - 0.055, bathZ);
      wallBand.material = wallMat;
      wallBand.isPickable = false;
      const wallBandDeep = CreateTorus(`${key}_wallBand2`, {
        diameter: innerR * 2 - 0.04,
        thickness: 0.032,
        tessellation: 32,
      }, scene);
      wallBandDeep.parent = this.root;
      wallBandDeep.position.set(x, poolY - 0.095, bathZ);
      wallBandDeep.material = wallMat;
      wallBandDeep.isPickable = false;

      // Unlit dark floor — depth cue under translucent liquid (feel25 darkDelta lever).
      const absorbMat = absorbWell(scene, `${key}_absorbMat`);
      const absorb = CreateCylinder(`${key}_absorb`, {
        diameter: innerR * 2 - 0.02,
        height: 0.05,
        tessellation: 28,
      }, scene);
      absorb.parent = this.root;
      absorb.position.set(x, poolY - wellDepth + 0.05, bathZ);
      absorb.material = absorbMat;
      absorb.isPickable = false;
      // Near-surface absorb plug — QDR (center column) gets a wider dark plug for darkDelta.
      const centerBath = Math.abs(x) < 0.05;
      // feel33/34 — QDR absorb wide for darkDelta; sides untouched (chemBand lives on SC1/SC2).
      const absorbTop = CreateCylinder(`${key}_absorbTop`, {
        diameter: innerR * (centerBath ? 1.92 : 1.05),
        height: 0.032,
        tessellation: 28,
      }, scene);
      absorbTop.parent = this.root;
      absorbTop.position.set(x, poolY - 0.05, bathZ);
      absorbTop.material = absorbMat;
      absorbTop.isPickable = false;
      const liner = CreateCylinder(`${key}_liner`, {
        diameter: innerR * 2 - 0.04,
        height: 0.016,
        tessellation: 28,
      }, scene);
      liner.parent = this.root;
      liner.position.set(x, poolY - wellDepth + 0.06, bathZ);
      liner.material = matteNoise(
        scene,
        `${key}_linerMat`,
        new Color3(0.005, 0.006, 0.007),
        { variance: 4, speck: 0.01, size: 32, blotch: 0.15, emissive: 0.0 },
      );
      liner.isPickable = false;

      // Thin raised metal/quartz rim ONLY — never fat tori that read as painted discs.
      const collar = CreateTorus(`${key}_collar`, {
        diameter: outerR * 2 - 0.02,
        thickness: 0.022,
        tessellation: 36,
      }, scene);
      collar.parent = this.root;
      collar.position.set(x, poolY + 0.01, bathZ);
      collar.material = metal(scene, `${key}_collarMat`, new Color3(0.46, 0.48, 0.52), 0.55);
      collar.isPickable = false;
      const deckPlate = CreateTorus(`${key}_deckPlate`, {
        diameter: outerR * 2 + 0.02,
        thickness: 0.024,
        tessellation: 36,
      }, scene);
      deckPlate.parent = this.root;
      deckPlate.position.set(x, poolY + 0.001, bathZ);
      deckPlate.material = metal(scene, `${key}_deckPlateMat`, new Color3(0.3, 0.32, 0.36), 0.3);
      deckPlate.isPickable = false;
      const wall = CreateTorus(`${key}_quartz`, {
        diameter: outerR * 2 - 0.04,
        thickness: 0.012,
        tessellation: 32,
      }, scene);
      wall.parent = this.root;
      wall.position.set(x, poolY + 0.016, bathZ);
      wall.material = quartz(scene, `${key}_quartzMat`);
      wall.isPickable = false;
      const rim = CreateTorus(`${key}_rim`, {
        diameter: outerR * 2 - 0.03,
        thickness: 0.014,
        tessellation: 32,
      }, scene);
      rim.parent = this.root;
      rim.position.set(x, poolY + 0.012, bathZ);
      rim.material = metal(scene, `${key}_rimMat`, new Color3(0.4, 0.42, 0.46), 0.55);
      rim.isPickable = false;

      // feel26 — dielectric wet skim over dark absorb + chem annulus; neonHot≈0.
      const liquidH = 0.16;
      const liquidTop = poolY - 0.05;
      const liquid = CreateCylinder(`${key}_liquid`, {
        diameter: innerR * 2 - 0.03,
        height: liquidH,
        tessellation: 36,
      }, scene);
      liquid.parent = this.root;
      liquid.position.set(x, liquidTop - liquidH * 0.5, bathZ);
      // Translucent body over absorb — open core (never chalky solid discs).
      const fillMat = bathFill(scene, `${key}_fill`, liquidColor);
      liquid.material = fillMat;
      liquid.isPickable = false;

      // Chem free-surface — QDR hole wide (darkDelta); SC1/SC2 fuller (chemBand sides).
      const chemDisc = CreateCylinder(`${key}_chemDisc`, {
        diameter: innerR * 2 - 0.012,
        height: 0.012,
        tessellation: 40,
      }, scene);
      chemDisc.parent = this.root;
      chemDisc.position.set(x, liquidTop + 0.003, bathZ);
      // feel34/40 — keep QDR darkDelta win; chemBand 0.15–0.30 via SIDE mass (ease feel39 0.32).
      // Midbay lot depth untouched. neonHot≈0.
      const chemHole = centerBath ? 0.54 : 0.02;
      const chemDiscMat = wetChemTop(scene, `${key}_chemDiscMat`, liquidColor, 0.88, chemHole);
      chemDisc.material = chemDiscMat;
      chemDisc.isPickable = false;

      // Outer chem annulus — QDR thin far rim; sides feel40 ease toward 0.15–0.30 (neonHot≈0).
      const chemRing = CreateTorus(`${key}_chemRing`, {
        diameter: innerR * (centerBath ? 1.88 : 1.68),
        thickness: centerBath ? 0.1 : 0.18,
        tessellation: 40,
      }, scene);
      chemRing.parent = this.root;
      chemRing.position.set(x, liquidTop + 0.008, bathZ);
      chemRing.scaling.y = centerBath ? 0.28 : 0.48;
      chemRing.material = wetChemRing(scene, `${key}_chemRingMat`, liquidColor, 0.88);
      chemRing.isPickable = false;
      if (!centerBath) {
        const chemRing2 = CreateTorus(`${key}_chemRing2`, {
          diameter: innerR * 1.14,
          thickness: 0.18,
          tessellation: 36,
        }, scene);
        chemRing2.parent = this.root;
        chemRing2.position.set(x, liquidTop + 0.007, bathZ);
        chemRing2.scaling.y = 0.46;
        chemRing2.material = wetChemRing(scene, `${key}_chemRing2Mat`, liquidColor, 0.88);
        chemRing2.isPickable = false;
        // Extra outer chem mass — chemBand floor without touching QDR center.
        const chemRing3 = CreateTorus(`${key}_chemRing3`, {
          diameter: innerR * 1.98,
          thickness: 0.16,
          tessellation: 36,
        }, scene);
        chemRing3.parent = this.root;
        chemRing3.position.set(x, liquidTop + 0.006, bathZ);
        chemRing3.scaling.y = 0.42;
        chemRing3.material = wetChemRing(scene, `${key}_chemRing3Mat`, liquidColor, 0.88);
        chemRing3.isPickable = false;
        // Side outer rim disc — tighter hole so colored annulus owns ROI (not chalk skim).
        const chemRim = CreateCylinder(`${key}_chemRim`, {
          diameter: innerR * 2.08,
          height: 0.014,
          tessellation: 40,
        }, scene);
        chemRim.parent = this.root;
        chemRim.position.set(x, liquidTop + 0.004, bathZ);
        chemRim.material = wetChemTop(scene, `${key}_chemRimMat`, liquidColor, 0.88, 0.36);
        chemRim.isPickable = false;
      }

      // feel34 — QDR skim small (darkDelta); side skim shrinks so chem annulus isn't chalk-washed.
      const poolSurf = CreateCylinder(`${key}_poolSurf`, {
        diameter: innerR * (centerBath ? 1.55 : 1.55) - 0.006,
        height: 0.0025,
        tessellation: 40,
      }, scene);
      poolSurf.parent = this.root;
      poolSurf.position.set(x, liquidTop + 0.015, bathZ);
      // Tip toward −Z orbit cam so grazing Fresnel reads from frameBench β.
      poolSurf.rotation.x = 0.12;
      const surfMat = wetSurface(scene, `${key}_poolSurfMat`, liquidColor);
      if (centerBath) {
        // Keep QDR darkDelta — thinner glass, no wash over absorb plug.
        surfMat.alpha = 0.06;
        surfMat.clearCoat.intensity = 0.42;
        surfMat.directIntensity = 1.0;
      } else {
        // Rim glint only — leave chem annulus uncovered for chemBand ≥0.15.
        surfMat.alpha = 0.1;
        surfMat.clearCoat.intensity = 0.55;
        surfMat.directIntensity = 1.15;
      }
      poolSurf.material = surfMat;
      poolSurf.isPickable = false;
      glassCatchers.push(poolSurf);

      // Side-bath glass crescent — opacity mask; rcaSkimKick paints the wet glint.
      let skimCatch: AbstractMesh | null = null;
      if (!centerBath) {
        skimCatch = CreateCylinder(`${key}_skimStreak`, {
          diameter: innerR * 1.78,
          height: 0.0016,
          tessellation: 36,
        }, scene);
        skimCatch.parent = this.root;
        skimCatch.position.set(x, liquidTop + 0.02, bathZ - 0.04);
        skimCatch.rotation.x = 0.2;
        skimCatch.material = wetSkimCatch(scene, `${key}_skimCatchMat`);
        skimCatch.isPickable = false;
        glassCatchers.push(skimCatch);
      }

      const glowRim = CreateTorus(`${key}_glowRim`, {
        diameter: innerR * 2 - 0.03,
        thickness: 0.016,
        tessellation: 36,
      }, scene);
      glowRim.parent = this.root;
      glowRim.position.set(x, liquidTop + 0.012, bathZ);
      const rimMat = wetRimFresnel(scene, `${key}_glowRimMat`, liquidColor);
      glowRim.material = rimMat;
      glowRim.isPickable = false;
      if (!centerBath) glassCatchers.push(glowRim);

      chemistryTag(scene, this.root, `${key}_tag`, x, 1.05, bathZ + 0.28, chemistry);

      const weir = CreateTorus(`${key}_weir`, {
        diameter: innerR * 1.4,
        thickness: 0.01,
        tessellation: 24,
      }, scene);
      weir.parent = this.root;
      weir.position.set(x, poolY - wellDepth + 0.08, bathZ);
      weir.material = metal(scene, `${key}_weirMat`, COLORS.wallTrim, 0.35);
      weir.isPickable = false;

      const spray = CreateBox(`${key}_spray`, { width: 0.24, height: 0.012, depth: 0.012 }, scene);
      spray.parent = this.root;
      spray.position.set(x, poolY + 0.08, bathZ + 0.16);
      spray.material = metal(scene, `${key}_sprayMat`, new Color3(0.4, 0.42, 0.46), 0.22);
      spray.isPickable = false;
      const baffle = CreateBox(`${key}_baffle`, { width: 0.32, height: 0.1, depth: 0.02 }, scene);
      baffle.parent = this.root;
      baffle.position.set(x, poolY + 0.0, bathZ + 0.2);
      baffle.material = metal(scene, `${key}_baffleMat`, COLORS.housing, 0.18);
      baffle.isPickable = false;

      let coil: AbstractMesh | null = null;
      let status: AbstractMesh | null = null;
      if (withHeater) {
        coil = CreateTorus(`${key}_coil`, { diameter: 0.28, thickness: 0.012, tessellation: 24 }, scene);
        coil.parent = this.root;
        coil.position.set(x, poolY - wellDepth + 0.06, bathZ);
        coil.material = lamp(scene, `${key}_coilMat`, COLORS.warn.scale(0.4), 0.15);
        coil.isPickable = false;

        status = CreateBox(`${key}_lamp`, { width: 0.03, height: 0.03, depth: 0.03 }, scene);
        status.parent = this.root;
        status.position.set(x, poolY + 0.06, bathZ + 0.18);
        status.material = lamp(scene, `${key}_statusMat`, COLORS.bench, 0.12);
        status.isPickable = false;

        const heaterBox = CreateBox(`${key}_heaterBox`, { width: 0.06, height: 0.04, depth: 0.05 }, scene);
        heaterBox.parent = this.root;
        heaterBox.position.set(x + 0.2, poolY - wellDepth + 0.08, bathZ + 0.22);
        heaterBox.material = metal(scene, `${key}_heaterBoxMat`, COLORS.housing, 0.2);
        heaterBox.isPickable = false;
      }
      return { liquid, coil, status, glassCatchers };
    };

    // feel28 — lathe wells + rim glass skim (chemBand ≥0.15, wet glint, neonHot≈0).
    const sc1 = makeBath('sc1', -0.42, new Color3(1.0, 0.72, 0.08), ['SC-1 APM', PROCESS.rca.sc1.chemistry], true);
    const qdr = makeBath('qdr', 0, new Color3(0.12, 0.95, 1.0), ['QDR', PROCESS.rca.qdr.chemistry], false);
    const sc2 = makeBath('sc2', 0.42, new Color3(1.0, 0.42, 0.06), ['SC-2 HPM', PROCESS.rca.sc2.chemistry], true);
    this.liquidSc1 = sc1.liquid;
    this.liquidQdr = qdr.liquid;
    this.liquidSc2 = sc2.liquid;
    this.coilSc1 = sc1.coil!;
    this.coilSc2 = sc2.coil!;
    this.lampSc1 = sc1.status!;
    this.lampSc2 = sc2.status!;

    // Soft fill kicks — form only; wet glint is skimKick → glassCatchers exclusively.
    const poolKick = new SpotLight(
      'rcaPoolKick',
      new Vector3(0.55, 2.12, bathZ - 0.82),
      new Vector3(-0.42, -0.58, 0.68),
      Math.PI / 2.6,
      12,
      scene,
    );
    poolKick.parent = this.root;
    poolKick.intensity = 0.95;
    poolKick.diffuse = new Color3(0.9, 0.94, 1);
    poolKick.specular = new Color3(0.55, 0.6, 0.7);
    poolKick.range = 3.0;
    const rimKick = new SpotLight(
      'rcaRimKick',
      new Vector3(-0.7, 1.85, bathZ - 0.4),
      new Vector3(0.82, -0.38, 0.42),
      Math.PI / 2.7,
      12,
      scene,
    );
    rimKick.parent = this.root;
    rimKick.intensity = 0.85;
    rimKick.diffuse = new Color3(0.88, 0.92, 1);
    rimKick.specular = new Color3(0.5, 0.55, 0.65);
    rimKick.range = 2.8;
    // feel28 — ONE orbit-visible wet glint: hard grazing Spot on rim glass only.
    const skimKick = new SpotLight(
      'rcaSkimKick',
      new Vector3(0.05, 1.74, bathZ - 1.08),
      new Vector3(0.02, -0.2, 0.94),
      Math.PI / 5.2,
      32,
      scene,
    );
    skimKick.parent = this.root;
    skimKick.intensity = 4.8;
    skimKick.diffuse = new Color3(0.7, 0.8, 1);
    skimKick.specular = new Color3(1, 1, 1);
    skimKick.range = 2.0;
    const glassOnly = [...sc1.glassCatchers, ...sc2.glassCatchers, ...qdr.glassCatchers];
    skimKick.includedOnlyMeshes = glassOnly;

    // Fork carriage — wafer rides between baths
    this.fork = new TransformNode('rcaFork', scene);
    this.fork.parent = this.root;
    const column = CreateCylinder('rcaForkCol', { diameter: 0.028, height: 0.42, tessellation: 12 }, scene);
    column.parent = this.root;
    column.position.set(0.72, 1.2, bathZ + 0.28);
    column.material = metal(scene, 'rcaForkColMat', COLORS.wallTrim, 0.45);
    column.isPickable = false;

    // Short dark carriage stub — full-width bright arm read as a furniture rail in Iris.
    const arm = CreateBox('rcaForkArm', { width: 0.35, height: 0.014, depth: 0.02 }, scene);
    arm.parent = this.fork;
    arm.position.set(0.35, 1.34, bathZ + 0.22);
    arm.material = metal(scene, 'rcaForkArmMat', new Color3(0.32, 0.34, 0.38), 0.22);
    arm.isPickable = false;

    // Park on carriage (not hovering as chalk lid over SC1 chem) until immerse sinks it.
    this.waferProxy = CreateCylinder('rcaWafer', { diameter: 0.22, height: 0.004, tessellation: 40 }, scene);
    this.waferProxy.parent = this.fork;
    this.waferProxy.position.set(0.52, 1.34, bathZ + 0.12);
    this.waferProxy.material = silicon(scene, 'rcaWaferMat', COLORS.waferLit);
    this.waferProxy.isPickable = false;

    const { tex } = buildReadout(scene, this.root, 'rca', {
      width: 0.58,
      height: 0.3,
      x: 0,
      y: 1.48,
      z: 0.32,
      texW: 640,
      texH: 320,
      glow: new Color3(0.04, 0.1, 0.08),
      lines: ['RCA CLEAN', 'Heat SC-1 → immerse → withdraw'],
      tilt: 0.48,
    });
    this.readoutTex = tex;

    // Process paddles on the front of the deck (between tanks and lip) — not under the camera.
    const railY = 1.02;
    const railZ = -0.14;
    processPaddle(scene, this.root, {
      name: 'rcaHeatSc1',
      label: 'HEAT SC1',
      x: -0.55,
      y: railY,
      z: railZ,
      interact: 'rcaHeat',
      bath: 'sc1',
    });
    processPaddle(scene, this.root, {
      name: 'rcaHeatSc2',
      label: 'HEAT SC2',
      x: -0.32,
      y: railY,
      z: railZ,
      interact: 'rcaHeat',
      bath: 'sc2',
    });
    processPaddle(scene, this.root, {
      name: 'rcaImmerse',
      label: 'IMMERSE',
      x: -0.05,
      y: railY,
      z: railZ,
      interact: 'rcaImmerse',
    });
    processPaddle(scene, this.root, {
      name: 'rcaWithdraw',
      label: 'WITHDRAW',
      x: 0.2,
      y: railY,
      z: railZ,
      interact: 'rcaWithdraw',
    });
    const ret = returnControl(scene, this.root, {
      name: 'rcaReturn',
      interact: 'rcaReturn',
      x: 0.52,
      y: railY,
      z: railZ,
    });
    this.setReturnArmed = ret.setArmed;
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
    if (!visible) this.closeReq = null;
  }

  prepareFresh(): void {
    this.sim = this.factory();
    this.closeReq = null;
    this.shownResult = false;
    this.waferDipped = false;
    this.setReturnArmed(false);
  }

  frameCamera(camera: ArcRotateCamera): void {
    // Look into recessed wells: wet chem + inner wall silhouette (β>1.1 playability).
    frameBench(camera, this.root.getAbsolutePosition().add(new Vector3(0.0, 1.34, -0.36)), 0.92);
    camera.alpha = -Math.PI / 2 + 0.08;
    camera.beta = 1.12;
    camera.fov = 0.96;
    camera.getViewMatrix();
  }

  getCloseRequest(): ReworkCloseRequest | null {
    return this.closeReq;
  }

  /** Handle a pick on an RCA control mesh. */
  handlePick(mesh: AbstractMesh): void {
    if (!this.root.isEnabled()) return;
    const kind = mesh.metadata?.interact as string | undefined;
    if (!kind?.startsWith('rca')) return;
    if (kind === 'rcaReturn' && this.sim.state.finished) {
      this.closeReq = {
        success: !!this.sim.state.result?.success,
        immediate: true,
      };
      return;
    }
    if (this.sim.state.finished) return;
    try {
      if (kind === 'rcaHeat') {
        const bath = mesh.metadata?.bath as 'sc1' | 'sc2';
        const target = this.sim.state.step.targetC.nominal;
        this.sim.act({ type: 'setHeater', bath, setpointC: target });
      } else if (kind === 'rcaImmerse') {
        this.sim.act({ type: 'immerse' });
      } else if (kind === 'rcaWithdraw') {
        this.sim.act({ type: 'withdraw' });
      }
    } catch {
      // Illegal act (already immersed etc.) — ignore for feel.
    }
  }

  update(dt: number): void {
    if (!this.root.isEnabled()) return;
    this.sim.tick(dt);
    const s = this.sim.state;

    const cue = rcaWithdrawCue(s);
    const chem =
      s.active === 'sc1'
        ? PROCESS.rca.sc1.chemistry
        : s.active === 'sc2'
          ? PROCESS.rca.sc2.chemistry
          : PROCESS.rca.qdr.chemistry;
    this.paintReadout(s, cue, chem);

    // feel27 — park on carriage until first immerse (Iris chalk-lid suck over SC1).
    const bathZ = -0.36;
    if (s.immersed) this.waferDipped = true;
    if (s.immersed || this.waferDipped) {
      const x = s.active === 'sc2' ? 0.42 : s.active === 'qdr' ? 0 : -0.42;
      this.waferProxy.position.set(x, s.immersed ? 1.26 : 1.46, bathZ);
    } else {
      this.waferProxy.position.set(0.52, 1.34, bathZ + 0.12);
    }

    const hot1 = s.baths.sc1.temperatureC > 50;
    const hot2 = s.baths.sc2.temperatureC > 28;
    const sc1Mat = this.liquidSc1.material as ReturnType<typeof bathFill>;
    const sc2Mat = this.liquidSc2.material as ReturnType<typeof bathFill>;
    const qdrMat = this.liquidQdr.material as ReturnType<typeof bathFill>;
    // ChemBand punch — stay under neonHot (mx>220); dark centers via albedo map.
    // Rim emissive lives in emissiveTexture; keep Color3 white so map isn't tint-washed.
    sc1Mat.emissiveColor = new Color3(hot1 ? 1.05 : 1, hot1 ? 1.05 : 1, hot1 ? 1.05 : 1);
    sc2Mat.emissiveColor = new Color3(hot2 ? 1.05 : 1, hot2 ? 1.05 : 1, hot2 ? 1.05 : 1);
    qdrMat.emissiveColor = new Color3(1, 1, 1);

    const coil1 = this.coilSc1.material as ReturnType<typeof lamp>;
    const coil2 = this.coilSc2.material as ReturnType<typeof lamp>;
    coil1.emissiveColor = COLORS.warn.scale(hot1 ? 0.85 : 0.12);
    coil2.emissiveColor = COLORS.warn.scale(hot2 ? 0.85 : 0.12);
    const l1 = this.lampSc1.material as ReturnType<typeof lamp>;
    const l2 = this.lampSc2.material as ReturnType<typeof lamp>;
    l1.emissiveColor = (hot1 ? COLORS.warn : COLORS.bench).scale(hot1 ? 0.9 : 0.1);
    l2.emissiveColor = (hot2 ? COLORS.warn : COLORS.bench).scale(hot2 ? 0.9 : 0.1);

    if (s.finished) this.setReturnArmed(true);
  }

  private paintReadout(s: RcaCleanState, cue: string, chem: string): void {
    const ctx = this.readoutTex.getContext() as CanvasRenderingContext2D;
    const W = 640;
    const H = 320;
    const fail = !!(s.finished && s.result && !s.result.success);
    const ink = fail ? '#f0a060' : '#8fe0c0';

    ctx.fillStyle = '#050a10';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1a4038';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    ctx.fillStyle = ink;
    ctx.font = 'bold 22px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('RCA CLEAN — SUBSTRATE', 24, 18);
    ctx.font = 'bold 15px monospace';
    ctx.fillText(s.step.label.slice(0, 52), 24, 48);
    ctx.fillStyle = '#7aa0b0';
    ctx.fillText(chem.slice(0, 56), 24, 72);

    // Dual temp bars
    const drawBar = (label: string, temp: number, target: number, x: number, color: string) => {
      ctx.fillStyle = '#1a2830';
      ctx.fillRect(x, 110, 180, 18);
      const pct = Math.min(1, Math.max(0, temp / 90));
      ctx.fillStyle = color;
      ctx.fillRect(x, 110, 180 * pct, 18);
      ctx.fillStyle = ink;
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${label} ${temp.toFixed(0)}°C  tgt ${target}°C`, x, 92);
    };
    drawBar('SC1', s.baths.sc1.temperatureC, PROCESS.rca.sc1.target.nominal, 24, '#d8a521');
    drawBar('SC2', s.baths.sc2.temperatureC, PROCESS.rca.sc2.target.nominal, 240, '#c07040');

    ctx.fillStyle = ink;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(s.immersed ? `DWELL ${s.dwellSeconds.toFixed(1)}s  bath ${s.active.toUpperCase()}` : 'WAFER RAISED', 24, 150);
    ctx.fillText(`CUE: ${cue.toUpperCase()}`, 24, 176);

    // Step markers (rects — NullEngine canvas lacks arc())
    const steps = ['SC1', 'QDR', 'SC2', 'QDR'];
    const activeIdx = s.active === 'sc2' ? 2 : s.active === 'qdr' ? 1 : 0;
    for (let i = 0; i < steps.length; i++) {
      const sx = 24 + i * 70;
      ctx.fillStyle = i <= activeIdx ? ink : '#2a3840';
      ctx.fillRect(sx + 4, 212, 16, 16);
      ctx.font = 'bold 12px monospace';
      ctx.fillText(steps[i]!, sx, 236);
    }

    if (s.finished && s.result) {
      ctx.fillStyle = fail ? '#f0a060' : '#8fe0c0';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(s.result.success ? 'PASS — PRESS RETURN' : 'FAIL — PRESS RETURN', 24, 268);
      ctx.font = 'bold 13px monospace';
      ctx.fillText(s.result.detail.slice(0, 58), 24, 292);
      if (!this.shownResult) {
        this.shownResult = true;
        this.closeReq = { success: s.result.success };
      }
    }
    this.readoutTex.update();
  }
}
