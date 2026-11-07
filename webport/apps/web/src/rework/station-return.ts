import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { COLORS, lamp, laminate, matte, matteNoise, metal, quartz, rubber, screenGlow } from '../bootstrap/materials.js';
import { applyLabel } from '../bay/labels.js';

/**
 * Shared world slot for rework benches — inside the cleanroom volume
 * (back wall ≈ z=-1.65). Prior pass parked RCA at z=-2.2 → camera in the grey void.
 */
export const REWORK_SLOT = new Vector3(0, 0, 0.12);

/** Shared deck furniture so every rework station reads as fab hardware, not a prop slab. */
export function buildCabinet(
  scene: Scene,
  parent: TransformNode,
  prefix: string,
  opts: { width: number; depth: number; deckY?: number; title: string; subtitle: string },
): { deck: AbstractMesh; fasciaTex: DynamicTexture } {
  const deckY = opts.deckY ?? 0.95;
  // Thinner deck slab — edge bevels carry the silhouette, not a 70 mm brick.
  const deck = CreateBox(`${prefix}Deck`, { width: opts.width, height: 0.04, depth: opts.depth }, scene);
  deck.parent = parent;
  deck.position.y = deckY;
  // Cool epoxy laminate — wet-bench deck, not wood plank.
  deck.material = laminate(scene, `${prefix}DeckMat`, new Color3(0.48, 0.47, 0.45), {
    variance: 28,
    speck: 0.16,
    size: 256,
    polish: 0.3,
    blotch: 0.8,
    emissive: 0.015,
    uScale: 3.6,
    vScale: 2.0,
  });
  deck.isPickable = false;
  // Soft contact pool under the cabinet footprint — grounds the wet bench on the floor.
  const floorContact = CreateBox(`${prefix}FloorContact`, {
    width: opts.width - 0.04,
    height: 0.012,
    depth: opts.depth - 0.06,
  }, scene);
  floorContact.parent = parent;
  floorContact.position.set(0, 0.006, 0);
  floorContact.material = matte(scene, `${prefix}FloorContactMat`, new Color3(0.04, 0.035, 0.03), 0);
  floorContact.isPickable = false;

  // Underside undercut + perimeter chamfer — denser edge without chunk.
  const undercut = CreateBox(`${prefix}DeckUndercut`, {
    width: opts.width - 0.04,
    height: 0.014,
    depth: opts.depth - 0.04,
  }, scene);
  undercut.parent = parent;
  undercut.position.set(0, deckY - 0.024, 0);
  undercut.material = matte(scene, `${prefix}DeckUndercutMat`, new Color3(0.38, 0.36, 0.32), 0.02);
  undercut.isPickable = false;
  const chamferMat = metal(scene, `${prefix}DeckChamferMat`, COLORS.wallTrim, 0.14);
  for (const [ci, w, d, x, z] of [
    [0, opts.width + 0.01, 0.01, 0, -(opts.depth / 2 + 0.002)],
    [1, opts.width + 0.01, 0.01, 0, opts.depth / 2 + 0.002],
    [2, 0.01, opts.depth + 0.01, -(opts.width / 2 + 0.002), 0],
    [3, 0.01, opts.depth + 0.01, opts.width / 2 + 0.002, 0],
  ] as const) {
    const chamfer = CreateBox(`${prefix}DeckChamfer${ci}`, { width: w, height: 0.012, depth: d }, scene);
    chamfer.parent = parent;
    chamfer.position.set(x, deckY + 0.018, z);
    chamfer.material = chamferMat;
    chamfer.isPickable = false;
  }

  // Thin spill lips (front −Z toward operator, back +Z) + secondary bevel rail.
  const lipMat = metal(scene, `${prefix}LipMat`, COLORS.wallTrim, 0.12);
  for (const [i, z] of [
    [0, -(opts.depth / 2 - 0.006)],
    [1, opts.depth / 2 - 0.006],
  ] as const) {
    const lip = CreateBox(`${prefix}Lip${i}`, { width: opts.width + 0.01, height: 0.02, depth: 0.01 }, scene);
    lip.parent = parent;
    lip.position.set(0, deckY + 0.028, z);
    lip.material = lipMat;
    lip.isPickable = false;
    const lipBevel = CreateBox(`${prefix}LipBevel${i}`, {
      width: opts.width - 0.04,
      height: 0.008,
      depth: 0.006,
    }, scene);
    lipBevel.parent = parent;
    lipBevel.position.set(0, deckY + 0.04, z + (i === 0 ? -0.006 : 0.006));
    lipBevel.material = lipMat;
    lipBevel.isPickable = false;
  }
  // Side spill rails
  for (const [si, x] of [
    [0, -(opts.width / 2 - 0.006)],
    [1, opts.width / 2 - 0.006],
  ] as const) {
    const sideLip = CreateBox(`${prefix}SideLip${si}`, {
      width: 0.01,
      height: 0.02,
      depth: opts.depth - 0.02,
    }, scene);
    sideLip.parent = parent;
    sideLip.position.set(x, deckY + 0.028, 0);
    sideLip.material = lipMat;
    sideLip.isPickable = false;
  }

  // Heavy under-cabinet mass — wet-bench skirt, not furniture carcass.
  const cabinet = CreateBox(`${prefix}Cab`, { width: opts.width - 0.04, height: 0.78, depth: opts.depth - 0.08 }, scene);
  cabinet.parent = parent;
  cabinet.position.set(0, deckY - 0.45, 0.01);
  cabinet.material = matteNoise(scene, `${prefix}CabMat`, COLORS.bench.scale(0.82), {
    variance: 14,
    speck: 0.08,
    size: 128,
    tileHint: 'fine',
    blotch: 0.5,
    emissive: 0.028,
    uScale: 2.2,
    vScale: 1.6,
  });
  cabinet.isPickable = false;

  // Solid under-cabinet face + louvers — chemical wet-bench skirt, not dual furniture doors.
  const skirtFaceMat = matteNoise(scene, `${prefix}SkirtFaceMat`, COLORS.bench.scale(0.68), {
    variance: 12,
    speck: 0.07,
    size: 128,
    tileHint: 'fine',
    blotch: 0.45,
    emissive: 0.022,
    uScale: 2.0,
    vScale: 1.4,
  });
  const latchMat = metal(scene, `${prefix}AccessLatchMat`, COLORS.wallTrim, 0.32);
  const skirtFace = CreateBox(`${prefix}SkirtFace`, {
    width: opts.width - 0.14,
    height: 0.56,
    depth: 0.04,
  }, scene);
  skirtFace.parent = parent;
  skirtFace.position.set(0, deckY - 0.44, -(opts.depth / 2 - 0.04));
  skirtFace.material = skirtFaceMat;
  skirtFace.isPickable = false;
  // Recessed utility bay — one industrial pocket, not paired cabinet doors.
  const utilBay = CreateBox(`${prefix}UtilBay`, {
    width: opts.width - 0.36,
    height: 0.28,
    depth: 0.02,
  }, scene);
  utilBay.parent = parent;
  utilBay.position.set(0, deckY - 0.36, -(opts.depth / 2 - 0.022));
  utilBay.material = matte(scene, `${prefix}UtilBayMat`, new Color3(0.18, 0.2, 0.22), 0.02);
  utilBay.isPickable = false;
  for (let vi = 0; vi < 6; vi++) {
    const louver = CreateBox(`${prefix}AccessLouver${vi}`, {
      width: opts.width - 0.48,
      height: 0.014,
      depth: 0.01,
    }, scene);
    louver.parent = parent;
    louver.position.set(0, deckY - 0.28 - vi * 0.032, -(opts.depth / 2 - 0.014));
    louver.material = latchMat;
    louver.isPickable = false;
  }
  // Single cam latch — industrial cue without dresser pulls or door pairs.
  const latchCam = CreateCylinder(`${prefix}AccessLatchCam`, {
    diameter: 0.032,
    height: 0.018,
    tessellation: 10,
  }, scene);
  latchCam.parent = parent;
  latchCam.rotation.x = Math.PI / 2;
  latchCam.position.set(opts.width * 0.28, deckY - 0.52, -(opts.depth / 2 - 0.012));
  latchCam.material = latchMat;
  latchCam.isPickable = false;

  // Deep toe kick + recessed plinth — under-cabinet mass from orbit.
  const kick = CreateBox(`${prefix}ToeKick`, {
    width: opts.width - 0.06,
    height: 0.11,
    depth: 0.06,
  }, scene);
  kick.parent = parent;
  kick.position.set(0, 0.055, -(opts.depth / 2 - 0.06));
  kick.material = matte(scene, `${prefix}KickMat`, new Color3(0.12, 0.13, 0.14), 0.02);
  kick.isPickable = false;
  const plinth = CreateBox(`${prefix}Plinth`, {
    width: opts.width - 0.02,
    height: 0.04,
    depth: opts.depth - 0.1,
  }, scene);
  plinth.parent = parent;
  plinth.position.set(0, 0.02, 0.01);
  plinth.material = matte(scene, `${prefix}PlinthMat`, new Color3(0.1, 0.1, 0.11), 0);
  plinth.isPickable = false;

  // Nameplate on the operator face (−Z)
  const fascia = CreateBox(`${prefix}Fascia`, { width: opts.width - 0.12, height: 0.11, depth: 0.02 }, scene);
  fascia.parent = parent;
  fascia.position.set(0, deckY - 0.12, -(opts.depth / 2 - 0.02));
  const fasciaTex = applyLabel(fascia, scene, {
    width: 640,
    height: 96,
    fill: '#101820',
    ink: '#9fe0c8',
    align: 'center',
    font: 'bold 26px monospace',
    lines: [opts.title, opts.subtitle],
    lineHeight: 34,
  });
  fascia.isPickable = false;

  const legMat = metal(scene, `${prefix}LegMat`, COLORS.bench.scale(0.75), 0.22);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const leg = CreateBox(`${prefix}Leg${sx}${sz}`, { width: 0.042, height: 0.88, depth: 0.042 }, scene);
      leg.parent = parent;
      leg.position.set(sx * (opts.width / 2 - 0.1), 0.44, sz * (opts.depth / 2 - 0.12));
      leg.material = legMat;
      leg.isPickable = false;
      // Corner fillet strips on legs — cheap bevel read.
      for (const [fi, ox, oz] of [
        [0, sx * 0.022, 0],
        [1, 0, sz * 0.022],
      ] as const) {
        const fillet = CreateBox(`${prefix}LegFillet${sx}${sz}_${fi}`, {
          width: fi ? 0.042 : 0.01,
          height: 0.86,
          depth: fi ? 0.01 : 0.042,
        }, scene);
        fillet.parent = parent;
        fillet.position.set(
          sx * (opts.width / 2 - 0.1) + ox * 0.35,
          0.44,
          sz * (opts.depth / 2 - 0.12) + oz * 0.35,
        );
        fillet.material = legMat;
        fillet.isPickable = false;
      }
    }
  }

  return { deck, fasciaTex };
}

/** Instrument bezel + emissive screen on a short stalk (faces the operator at −Z). */
export function buildReadout(
  scene: Scene,
  parent: TransformNode,
  prefix: string,
  opts: {
    width: number;
    height: number;
    x: number;
    y: number;
    z: number;
    texW: number;
    texH: number;
    glow: Color3;
    lines: readonly string[];
    /** Pitch toward operator (positive tips top toward −Z). */
    tilt?: number;
  },
): { screen: AbstractMesh; tex: DynamicTexture } {
  const mount = new TransformNode(`${prefix}ReadoutMount`, scene);
  mount.parent = parent;
  mount.position.set(opts.x, opts.y, opts.z);
  mount.rotation.x = opts.tilt ?? 0.42;

  const bezel = CreateBox(`${prefix}Bezel`, {
    width: opts.width + 0.04,
    height: opts.height + 0.04,
    depth: 0.035,
  }, scene);
  bezel.parent = mount;
  bezel.material = metal(scene, `${prefix}BezelMat`, COLORS.housing, 0.25);
  bezel.isPickable = false;

  const screen = CreateBox(`${prefix}Screen`, { width: opts.width, height: opts.height, depth: 0.012 }, scene);
  screen.parent = mount;
  // Face toward operator (−Z): screen sits on the −Z face of the bezel.
  screen.position.z = -0.022;
  const tex = applyLabel(screen, scene, {
    width: opts.texW,
    height: opts.texH,
    fill: '#050a10',
    ink: '#8fe0c0',
    font: 'bold 22px monospace',
    lines: [...opts.lines],
    lineHeight: 30,
  });
  const glow = screenGlow(scene, `${prefix}Glow`, opts.glow);
  glow.diffuseTexture = tex;
  glow.emissiveTexture = tex;
  glow.emissiveColor = new Color3(0.55, 0.65, 0.58);
  screen.material = glow;
  screen.isPickable = false;

  const stalk = CreateCylinder(`${prefix}Stalk`, { diameter: 0.035, height: 0.28, tessellation: 12 }, scene);
  stalk.parent = parent;
  stalk.position.set(opts.x, opts.y - opts.height / 2 - 0.12, opts.z);
  stalk.material = metal(scene, `${prefix}StalkMat`, COLORS.wallTrim, 0.4);
  stalk.isPickable = false;

  return { screen, tex };
}

/** Chemistry placard glued to a tank face. */
export function chemistryTag(
  scene: Scene,
  parent: TransformNode,
  name: string,
  x: number,
  y: number,
  z: number,
  lines: readonly string[],
): void {
  const tag = CreateBox(name, { width: 0.22, height: 0.09, depth: 0.008 }, scene);
  tag.parent = parent;
  tag.position.set(x, y, z);
  applyLabel(tag, scene, {
    width: 320,
    height: 128,
    fill: '#1a2830',
    ink: '#dfffee',
    align: 'center',
    font: 'bold 20px monospace',
    lines: [...lines],
    lineHeight: 36,
  });
  tag.isPickable = false;
}

export interface PaddleOpts {
  name: string;
  label: string;
  x: number;
  y: number;
  z: number;
  interact: string;
  bath?: 'sc1' | 'sc2';
  accent?: Color3;
  fill?: string;
  ink?: string;
  width?: number;
}

/** Raised process paddle with embossed label — denser than a flat labeled box. */
export function processPaddle(scene: Scene, parent: TransformNode, opts: PaddleOpts): AbstractMesh {
  const w = opts.width ?? 0.15;
  const body = CreateBox(opts.name, { width: w, height: 0.045, depth: 0.07 }, scene);
  body.parent = parent;
  body.position.set(opts.x, opts.y, opts.z);
  body.material = matte(scene, `${opts.name}_mat`, opts.accent ?? COLORS.accent, 0.28);
  body.isPickable = true;
  body.metadata = { interact: opts.interact, bath: opts.bath };

  const face = CreateBox(`${opts.name}_face`, { width: w - 0.02, height: 0.012, depth: 0.055 }, scene);
  face.parent = body;
  face.position.y = 0.028;
  applyLabel(face, scene, {
    width: 160,
    height: 64,
    fill: opts.fill ?? '#143028',
    ink: opts.ink ?? '#dfffee',
    align: 'center',
    font: 'bold 16px monospace',
    lines: [opts.label],
    lineHeight: 22,
  });
  face.isPickable = false;
  face.metadata = { interact: opts.interact, bath: opts.bath };

  return body;
}

/**
 * Distinct RETURN paddle + armed lamp.
 * Only lights when the sim finishes so the exit cue is unmistakable.
 */
export function returnControl(
  scene: Scene,
  parent: TransformNode,
  opts: { name: string; interact: string; x: number; y: number; z: number },
): { paddle: AbstractMesh; lamp: AbstractMesh; setArmed: (armed: boolean) => void } {
  const paddle = processPaddle(scene, parent, {
    name: opts.name,
    label: 'RETURN',
    x: opts.x,
    y: opts.y,
    z: opts.z,
    interact: opts.interact,
    accent: COLORS.warn,
    fill: '#302010',
    ink: '#ffe8c0',
    width: 0.17,
  });

  const led = CreateBox(`${opts.name}_lamp`, { width: 0.04, height: 0.04, depth: 0.04 }, scene);
  led.parent = parent;
  led.position.set(opts.x, opts.y + 0.07, opts.z);
  led.material = lamp(scene, `${opts.name}_lampMat`, COLORS.bench, 0.1);
  led.isPickable = false;

  const setArmed = (armed: boolean) => {
    const mat = led.material as ReturnType<typeof lamp>;
    mat.diffuseColor = armed ? COLORS.accent : COLORS.bench;
    mat.emissiveColor = (armed ? COLORS.accent : COLORS.bench).scale(armed ? 0.95 : 0.08);
    const bodyMat = paddle.material as ReturnType<typeof matte>;
    bodyMat.emissiveColor = (armed ? COLORS.warn : COLORS.warn.scale(0.35)).scale(armed ? 0.45 : 0.08);
  };
  setArmed(false);
  return { paddle, lamp: led, setArmed };
}

/**
 * Wet-bench exhaust canopy — dual-pane sash, side cheeks w/ windows, light bar,
 * dual duct takeoffs. Box/mesh language (not capsule sausage). Back (+Z) of deck.
 *
 * Keep canopy low + shallow so rework upper-third reads as FFU waffle, not hood metal.
 */
export function buildHood(scene: Scene, parent: TransformNode, prefix: string, width: number, z = 0.22): void {
  const shellMat = matteNoise(scene, `${prefix}HoodShellMat`, new Color3(0.48, 0.5, 0.53), {
    variance: 12,
    speck: 0.06,
    size: 128,
    tileHint: 'fine',
    blotch: 0.4,
    emissive: 0.02,
    uScale: 2.2,
    vScale: 1.5,
  });
  shellMat.roughness = 0.94;
  shellMat.environmentIntensity = 0.05;
  shellMat.specularIntensity = 0.1;
  shellMat.directIntensity = 0.68;
  const trimMat = metal(scene, `${prefix}HoodTrimMat`, COLORS.wallTrim, 0.08);
  const ductMat = matte(scene, `${prefix}HoodDuctMat`, new Color3(0.34, 0.36, 0.39), 0.015);
  ductMat.roughness = 0.93;
  ductMat.environmentIntensity = 0.04;
  ductMat.specularIntensity = 0.07;
  const baffleMat = matte(scene, `${prefix}HoodBaffleMat`, new Color3(0.66, 0.71, 0.78), 0.05);
  const glassMat = quartz(scene, `${prefix}HoodGlassMat`, new Color3(0.55, 0.72, 0.78));
  // Upper sash strip under FFUs — more open so ceiling waffle stays readable.
  glassMat.alpha = 0.22;
  const gasketMat = rubber(scene, `${prefix}HoodGasketMat`, new Color3(0.18, 0.2, 0.22));

  const halfW = width / 2;
  // Dropped canopy — deep recessed wet-bench hood under FFU band (not a furniture brow/shelf).
  // Leaves y≳1.5–2.2 clear for the FFU waffle (HEPA dark-band ≥0.6).
  const canopyY = 1.34;
  // Deep recessed canopy — enough overhang for wet-bench read without burying bath color.
  const canopyD = 0.7;
  const cheekH = 0.7;
  // Pull canopy forward (−Z) so orbit reads a deep cavity, not a shallow rear shelf.
  const canopyZ = z - 0.08;

  // Upper plenum + lower canopy — heavy two-body housing with real depth.
  const plenum = CreateBox(`${prefix}HoodPlenum`, {
    width: width + 0.08,
    height: 0.18,
    depth: canopyD - 0.02,
  }, scene);
  plenum.parent = parent;
  plenum.position.set(0, canopyY + 0.1, canopyZ + 0.08);
  plenum.material = shellMat;
  plenum.isPickable = false;

  const canopy = CreateBox(`${prefix}HoodCanopy`, {
    width: width + 0.14,
    height: 0.18,
    depth: canopyD,
  }, scene);
  canopy.parent = parent;
  canopy.position.set(0, canopyY - 0.02, canopyZ + 0.02);
  canopy.material = shellMat;
  canopy.isPickable = false;

  // Thick side plenums flush INBOARD of canopy edge — no outboard furniture ledge.
  for (const sx of [-1, 1] as const) {
    const sidePlenum = CreateBox(`${prefix}HoodSidePlenum${sx}`, {
      width: 0.16,
      height: cheekH + 0.1,
      depth: canopyD,
    }, scene);
    sidePlenum.parent = parent;
    sidePlenum.position.set(sx * (halfW - 0.04), canopyY - cheekH / 2 + 0.05, canopyZ + 0.02);
    sidePlenum.material = shellMat;
    sidePlenum.isPickable = false;
    // Cap flush with canopy soffit — never wider than canopy cheek.
    const sideCap = CreateBox(`${prefix}HoodSideCap${sx}`, {
      width: 0.16,
      height: 0.05,
      depth: canopyD + 0.02,
    }, scene);
    sideCap.parent = parent;
    sideCap.position.set(sx * (halfW - 0.04), canopyY + 0.03, canopyZ + 0.02);
    sideCap.material = shellMat;
    sideCap.isPickable = false;
  }

  // Service columns — vertical mass from deck cheek to canopy (orbit silhouette).
  const colMat = metal(scene, `${prefix}HoodColMat`, new Color3(0.42, 0.44, 0.48), 0.16);
  for (const sx of [-1, 1] as const) {
    const col = CreateBox(`${prefix}HoodServiceCol${sx}`, {
      width: 0.12,
      height: 0.62,
      depth: 0.16,
    }, scene);
    col.parent = parent;
    col.position.set(sx * (halfW - 0.02), canopyY - 0.42, canopyZ + 0.1);
    col.material = colMat;
    col.isPickable = false;
    const colCap = CreateBox(`${prefix}HoodServiceCap${sx}`, {
      width: 0.14,
      height: 0.05,
      depth: 0.18,
    }, scene);
    colCap.parent = parent;
    colCap.position.set(sx * (halfW - 0.02), canopyY - 0.08, canopyZ + 0.08);
    colCap.material = shellMat;
    colCap.isPickable = false;
    const colFoot = CreateBox(`${prefix}HoodServiceFoot${sx}`, {
      width: 0.14,
      height: 0.05,
      depth: 0.18,
    }, scene);
    colFoot.parent = parent;
    colFoot.position.set(sx * (halfW - 0.02), canopyY - 0.72, canopyZ + 0.08);
    colFoot.material = colMat;
    colFoot.isPickable = false;
  }

  // Airfoil front brow — 5 stacked bevels read as a chamfered exhaust lip.
  for (const [i, oy, oz, dh, dd, dw] of [
    [0, -0.08, -canopyD / 2 + 0.018, 0.022, 0.04, width],
    [1, -0.095, -canopyD / 2 + 0.004, 0.016, 0.032, width - 0.04],
    [2, -0.108, -canopyD / 2 - 0.01, 0.012, 0.024, width - 0.08],
    [3, -0.118, -canopyD / 2 - 0.02, 0.009, 0.018, width - 0.14],
    [4, -0.126, -canopyD / 2 - 0.028, 0.007, 0.012, width - 0.2],
  ] as const) {
    const brow = CreateBox(`${prefix}HoodBrow${i}`, { width: dw, height: dh, depth: dd }, scene);
    brow.parent = parent;
    brow.position.set(0, canopyY + oy, canopyZ + oz);
    brow.material = shellMat;
    brow.isPickable = false;
  }

  // Compact ID fascia — keep metal out of the upper-third FFU band.
  const fascia = CreateBox(`${prefix}HoodFascia`, {
    width: width - 0.22,
    height: 0.055,
    depth: 0.018,
  }, scene);
  fascia.parent = parent;
  fascia.position.set(0, canopyY - 0.055, canopyZ - canopyD / 2 - 0.012);
  fascia.rotation.x = -0.4;
  fascia.material = shellMat;
  fascia.isPickable = false;
  applyLabel(fascia, scene, {
    width: 420,
    height: 72,
    fill: '#1a2228',
    ink: '#8fd0b0',
    align: 'center',
    font: 'bold 22px monospace',
    lines: ['LAMINAR EXHAUST', 'FACE VELOCITY OK'],
    lineHeight: 28,
  });

  // Front lip intake grille — denser slots under the brow (stays mid-frame).
  for (let gi = 0; gi < 13; gi++) {
    const slot = CreateBox(`${prefix}HoodIntake${gi}`, {
      width: 0.038,
      height: 0.008,
      depth: 0.016,
    }, scene);
    slot.parent = parent;
    slot.position.set(-width * 0.38 + gi * (width * 0.063), canopyY - 0.145, canopyZ - canopyD / 2 - 0.008);
    slot.material = trimMat;
    slot.isPickable = false;
  }

  // Perforated skirt under brow — densifies exhaust lip without climbing into FFU.
  const skirt = CreateBox(`${prefix}HoodSkirt`, {
    width: width - 0.14,
    height: 0.028,
    depth: 0.012,
  }, scene);
  skirt.parent = parent;
  skirt.position.set(0, canopyY - 0.165, canopyZ - canopyD / 2 + 0.01);
  skirt.material = baffleMat;
  skirt.isPickable = false;
  // Skirt perforations — thin vertical slots.
  for (let pi = 0; pi < 11; pi++) {
    const perf = CreateBox(`${prefix}HoodSkirtPerf${pi}`, {
      width: 0.01,
      height: 0.018,
      depth: 0.006,
    }, scene);
    perf.parent = parent;
    perf.position.set(-width * 0.34 + pi * (width * 0.068), canopyY - 0.165, canopyZ - canopyD / 2 + 0.004);
    perf.material = trimMat;
    perf.isPickable = false;
  }

  // Side cheeks with glazed window panes + gasket rails (short — don't climb into FFU band).
  for (const sx of [-1, 1] as const) {
    const cheek = CreateBox(`${prefix}HoodCheek${sx}`, {
      width: 0.055,
      height: cheekH,
      depth: canopyD,
    }, scene);
    cheek.parent = parent;
    cheek.position.set(sx * (halfW - 0.02), canopyY - cheekH / 2 + 0.02, canopyZ + 0.04);
    cheek.material = shellMat;
    cheek.isPickable = false;

    // Cheek front edge bevel
    const cheekBevel = CreateBox(`${prefix}HoodCheekBevel${sx}`, {
      width: 0.01,
      height: cheekH - 0.04,
      depth: 0.01,
    }, scene);
    cheekBevel.parent = parent;
    cheekBevel.position.set(sx * (halfW - 0.002), canopyY - cheekH / 2 + 0.02, canopyZ - canopyD / 2 + 0.02);
    cheekBevel.material = shellMat;
    cheekBevel.isPickable = false;

    const pane = CreateBox(`${prefix}HoodCheekPane${sx}`, {
      width: 0.012,
      height: cheekH - 0.12,
      depth: canopyD - 0.1,
    }, scene);
    pane.parent = parent;
    pane.position.set(sx * (halfW - 0.04), canopyY - cheekH / 2 + 0.04, canopyZ + 0.03);
    pane.material = glassMat;
    pane.isPickable = false;

    const gasket = CreateBox(`${prefix}HoodCheekGasket${sx}`, {
      width: 0.008,
      height: cheekH - 0.1,
      depth: 0.012,
    }, scene);
    gasket.parent = parent;
    gasket.position.set(sx * (halfW - 0.032), canopyY - cheekH / 2 + 0.035, canopyZ - canopyD / 2 + 0.028);
    gasket.material = gasketMat;
    gasket.isPickable = false;

    // Front return cheek + slotted baffle.
    const cheekFront = CreateBox(`${prefix}HoodCheekFront${sx}`, {
      width: 0.03,
      height: cheekH - 0.1,
      depth: 0.08,
    }, scene);
    cheekFront.parent = parent;
    cheekFront.position.set(sx * (halfW - 0.024), canopyY - cheekH / 2 + 0.05, canopyZ - canopyD / 2 + 0.03);
    cheekFront.material = shellMat;
    cheekFront.isPickable = false;

    for (let si = 0; si < 5; si++) {
      const slot = CreateBox(`${prefix}HoodSlot${sx}_${si}`, {
        width: 0.01,
        height: 0.022,
        depth: 0.055,
      }, scene);
      slot.parent = parent;
      slot.position.set(sx * (halfW - 0.04), canopyY - 0.02 - si * 0.055, canopyZ - canopyD / 2 + 0.028);
      slot.material = trimMat;
      slot.isPickable = false;
    }

    // Squared posts + foot pads into the deck — inset so they never read as a side shelf ledge.
    const post = CreateBox(`${prefix}HoodPost${sx}`, {
      width: 0.028,
      height: 0.4,
      depth: 0.028,
    }, scene);
    post.parent = parent;
    post.position.set(sx * (halfW - 0.08), 1.02, canopyZ + 0.02);
    post.material = trimMat;
    post.isPickable = false;
    const foot = CreateBox(`${prefix}HoodFoot${sx}`, { width: 0.05, height: 0.014, depth: 0.05 }, scene);
    foot.parent = parent;
    foot.position.set(sx * (halfW - 0.08), 0.84, canopyZ + 0.02);
    foot.material = gasketMat;
    foot.isPickable = false;
  }

  // Rear back panel + utility chase strip.
  const back = CreateBox(`${prefix}HoodBack`, {
    width: width - 0.1,
    height: cheekH - 0.06,
    depth: 0.04,
  }, scene);
  back.parent = parent;
  back.position.set(0, canopyY - cheekH / 2 + 0.06, canopyZ + canopyD / 2 - 0.01);
  back.material = shellMat;
  back.isPickable = false;

  const chase = CreateBox(`${prefix}HoodChase`, {
    width: width - 0.2,
    height: 0.08,
    depth: 0.06,
  }, scene);
  chase.parent = parent;
  chase.position.set(0, canopyY - 0.02, canopyZ + canopyD / 2 + 0.02);
  chase.material = ductMat;
  chase.isPickable = false;

  // Short dual takeoffs — stop under the FFU skirts so ducts don't own the upper third.
  for (const [di, dx] of [
    [0, -0.2],
    [1, 0.24],
  ] as const) {
    const transition = CreateBox(`${prefix}HoodTransition${di}`, {
      width: 0.16,
      height: 0.05,
      depth: 0.14,
    }, scene);
    transition.parent = parent;
    transition.position.set(dx, canopyY + 0.12, canopyZ + 0.05);
    transition.material = ductMat;
    transition.isPickable = false;

    const flange = CreateCylinder(`${prefix}HoodFlange${di}`, {
      diameter: 0.12,
      height: 0.02,
      tessellation: 14,
    }, scene);
    flange.parent = parent;
    flange.position.set(dx, canopyY + 0.15, canopyZ + 0.05);
    flange.material = trimMat;
    flange.isPickable = false;

    const riser = CreateCylinder(`${prefix}HoodRiser${di}`, {
      diameter: 0.09,
      height: 0.18,
      tessellation: 14,
    }, scene);
    riser.parent = parent;
    riser.position.set(dx, canopyY + 0.25, canopyZ + 0.05);
    riser.material = ductMat;
    riser.isPickable = false;

    const elbow = CreateBox(`${prefix}HoodElbow${di}`, { width: 0.1, height: 0.08, depth: 0.1 }, scene);
    elbow.parent = parent;
    elbow.position.set(dx, canopyY + 0.36, canopyZ + 0.05);
    elbow.material = ductMat;
    elbow.isPickable = false;
  }

  const header = CreateBox(`${prefix}HoodHeader`, {
    width: width * 0.55,
    height: 0.07,
    depth: 0.1,
  }, scene);
  header.parent = parent;
  header.position.set(0.02, canopyY + 0.38, canopyZ + 0.05);
  header.material = ductMat;
  header.isPickable = false;

  // Thin hangers only — no fat duct mass climbing into the FFU FOV.
  for (const hx of [-0.28, 0.06, 0.32] as const) {
    const strap = CreateBox(`${prefix}HoodStrap${hx}`, { width: 0.016, height: 0.28, depth: 0.016 }, scene);
    strap.parent = parent;
    strap.position.set(hx, canopyY + 0.56, canopyZ + 0.05);
    strap.material = trimMat;
    strap.isPickable = false;
  }
  const beacon = CreateCylinder(`${prefix}HoodBeacon`, { diameter: 0.04, height: 0.03, tessellation: 10 }, scene);
  beacon.parent = parent;
  beacon.position.set(-0.1, canopyY + 0.44, canopyZ + 0.05);
  beacon.material = lamp(scene, `${prefix}HoodBeaconMat`, new Color3(0.35, 0.95, 0.55), 0.9);
  beacon.isPickable = false;

  // Raised sash (open face) — only upper glass under the brow so orbit sees into bath cavity.
  const sashTilt = -0.18;
  const sashZ = canopyZ - canopyD / 2 + 0.02;
  const pane = CreateBox(`${prefix}HoodSashPane0`, {
    width: width - 0.22,
    height: 0.16,
    depth: 0.01,
  }, scene);
  pane.parent = parent;
  pane.position.set(0, canopyY - 0.14, sashZ);
  pane.rotation.x = sashTilt;
  pane.material = glassMat;
  pane.isPickable = false;

  const rail = CreateBox(`${prefix}HoodSashRail0`, {
    width: width - 0.14,
    height: 0.014,
    depth: 0.018,
  }, scene);
  rail.parent = parent;
  rail.position.set(0, canopyY - 0.22, sashZ - 0.02);
  rail.rotation.x = sashTilt;
  rail.material = trimMat;
  rail.isPickable = false;

  for (const sx of [-1, 1] as const) {
    const stile = CreateBox(`${prefix}HoodSashStile${sx}`, {
      width: 0.02,
      height: 0.28,
      depth: 0.02,
    }, scene);
    stile.parent = parent;
    stile.position.set(sx * (halfW - 0.14), canopyY - 0.2, sashZ);
    stile.rotation.x = sashTilt;
    stile.material = trimMat;
    stile.isPickable = false;
  }

  const handle = CreateBox(`${prefix}HoodHandle`, {
    width: width * 0.34,
    height: 0.012,
    depth: 0.014,
  }, scene);
  handle.parent = parent;
  handle.position.set(0, canopyY - 0.24, sashZ - 0.04);
  handle.material = trimMat;
  handle.isPickable = false;
  for (const hx of [-width * 0.14, width * 0.14] as const) {
    const hPost = CreateBox(`${prefix}HoodHandlePost${hx}`, {
      width: 0.01,
      height: 0.01,
      depth: 0.022,
    }, scene);
    hPost.parent = parent;
    hPost.position.set(hx, canopyY - 0.24, sashZ - 0.03);
    hPost.material = trimMat;
    hPost.isPickable = false;
  }

  // Counterweight housings INBOARD of cheek face — never a protruding side shelf/ledge.
  for (const sx of [-1, 1] as const) {
    const cw = CreateBox(`${prefix}HoodCounterweight${sx}`, {
      width: 0.05,
      height: 0.14,
      depth: 0.05,
    }, scene);
    cw.parent = parent;
    cw.position.set(sx * (halfW - 0.08), canopyY - 0.28, canopyZ + 0.04);
    cw.material = ductMat;
    cw.isPickable = false;
  }

  // Under-canopy HEPA / baffle pack with angled vanes + center divider.
  const filter = CreateBox(`${prefix}HoodFilter`, {
    width: width - 0.16,
    height: 0.028,
    depth: canopyD - 0.06,
  }, scene);
  filter.parent = parent;
  filter.position.set(0, canopyY - 0.12, canopyZ + 0.03);
  filter.material = baffleMat;
  filter.isPickable = false;
  const divider = CreateBox(`${prefix}HoodFilterDiv`, {
    width: 0.018,
    height: 0.04,
    depth: canopyD - 0.1,
  }, scene);
  divider.parent = parent;
  divider.position.set(0, canopyY - 0.14, canopyZ + 0.03);
  divider.material = trimMat;
  divider.isPickable = false;
  for (let bi = 0; bi < 11; bi++) {
    const blade = CreateBox(`${prefix}HoodBlade${bi}`, {
      width: width - 0.24,
      height: 0.007,
      depth: 0.012,
    }, scene);
    blade.parent = parent;
    blade.position.set(0, canopyY - 0.14, canopyZ - 0.1 + bi * 0.022);
    blade.rotation.x = 0.35;
    blade.material = trimMat;
    blade.isPickable = false;
  }

  // Dense under-canopy FFU waffle (stays below HEPA orbit band).
  const ffuCellMat = matte(scene, `${prefix}HoodFfuCellMat`, new Color3(0.58, 0.62, 0.68), 0.04);
  ffuCellMat.roughness = 0.9;
  ffuCellMat.specularIntensity = 0.1;
  for (let fx = 0; fx < 7; fx++) {
    for (let fz = 0; fz < 3; fz++) {
      const cell = CreateBox(`${prefix}HoodFfuCell_${fx}_${fz}`, {
        width: 0.11,
        height: 0.016,
        depth: 0.05,
      }, scene);
      cell.parent = parent;
      cell.position.set(
        -width * 0.36 + fx * (width * 0.12),
        canopyY - 0.105,
        canopyZ - 0.02 + fz * 0.055,
      );
      cell.material = ffuCellMat;
      cell.isPickable = false;
    }
  }

  // DI / N2 gooseneck spray fixtures + rear spray bar — wet-bench canopy language.
  const fixtureMat = metal(scene, `${prefix}HoodFixtureMat`, new Color3(0.62, 0.66, 0.7), 0.22);
  const hoseMat = rubber(scene, `${prefix}HoodHoseMat`, new Color3(0.14, 0.16, 0.18));
  for (const [fi, fx] of [
    [0, -0.28],
    [1, -0.05],
    [2, 0.2],
  ] as const) {
    const drop = CreateCylinder(`${prefix}HoodSprayDrop${fi}`, {
      diameter: 0.018,
      height: 0.16,
      tessellation: 10,
    }, scene);
    drop.parent = parent;
    drop.position.set(fx * (width / 1.15), canopyY - 0.2, canopyZ + 0.02);
    drop.material = fixtureMat;
    drop.isPickable = false;

    const elbow = CreateTorus(`${prefix}HoodSprayElbow${fi}`, {
      diameter: 0.04,
      thickness: 0.012,
      tessellation: 12,
    }, scene);
    elbow.parent = parent;
    elbow.position.set(fx * (width / 1.15), canopyY - 0.28, canopyZ - 0.01);
    elbow.rotation.x = Math.PI / 2;
    elbow.material = fixtureMat;
    elbow.isPickable = false;

    const nozzle = CreateCylinder(`${prefix}HoodSprayNoz${fi}`, {
      diameterTop: 0.012,
      diameterBottom: 0.02,
      height: 0.03,
      tessellation: 10,
    }, scene);
    nozzle.parent = parent;
    nozzle.position.set(fx * (width / 1.15), canopyY - 0.3, canopyZ - 0.04);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.material = fixtureMat;
    nozzle.isPickable = false;

    const hose = CreateCylinder(`${prefix}HoodSprayHose${fi}`, {
      diameter: 0.01,
      height: 0.12,
      tessellation: 8,
    }, scene);
    hose.parent = parent;
    hose.position.set(fx * (width / 1.15) + 0.03, canopyY - 0.18, canopyZ + 0.05);
    hose.rotation.z = 0.5;
    hose.material = hoseMat;
    hose.isPickable = false;
  }

  const sprayBar = CreateCylinder(`${prefix}HoodSprayBar`, {
    diameter: 0.022,
    height: width * 0.55,
    tessellation: 12,
  }, scene);
  sprayBar.parent = parent;
  sprayBar.rotation.z = Math.PI / 2;
  sprayBar.position.set(0, canopyY - 0.22, canopyZ + 0.06);
  sprayBar.material = fixtureMat;
  sprayBar.isPickable = false;
  for (let ni = 0; ni < 5; ni++) {
    const tip = CreateCylinder(`${prefix}HoodSprayTip${ni}`, {
      diameter: 0.012,
      height: 0.028,
      tessellation: 8,
    }, scene);
    tip.parent = parent;
    tip.position.set(-width * 0.22 + ni * (width * 0.11), canopyY - 0.24, canopyZ + 0.04);
    tip.material = fixtureMat;
    tip.isPickable = false;
  }

  // Task light bar — thinner recessed housing + dual diffuser tubes + end caps.
  const lightHousing = CreateBox(`${prefix}HoodLightHouse`, {
    width: width - 0.28,
    height: 0.022,
    depth: 0.04,
  }, scene);
  lightHousing.parent = parent;
  lightHousing.position.set(0, canopyY - 0.1, canopyZ - canopyD / 2 + 0.04);
  lightHousing.material = shellMat;
  lightHousing.isPickable = false;

  for (const [li, lx] of [
    [0, -0.1],
    [1, 0.1],
  ] as const) {
    const tube = CreateCapsule(`${prefix}HoodLightTube${li}`, {
      radius: 0.01,
      height: width * 0.26,
      tessellation: 8,
      orientation: Vector3.Right(),
    }, scene);
    tube.parent = parent;
    tube.position.set(lx * (width / 1.1), canopyY - 0.12, canopyZ - canopyD / 2 + 0.04);
    tube.material = lamp(scene, `${prefix}HoodLightMat${li}`, new Color3(1, 0.94, 0.82), 0.95);
    tube.isPickable = false;
  }

  for (const sx of [-1, 1] as const) {
    const cap = CreateBox(`${prefix}HoodLightCap${sx}`, { width: 0.025, height: 0.04, depth: 0.05 }, scene);
    cap.parent = parent;
    cap.position.set(sx * ((width - 0.28) / 2 - 0.01), canopyY - 0.1, canopyZ - canopyD / 2 + 0.04);
    cap.material = trimMat;
    cap.isPickable = false;
  }

  // Face-velocity sensor + manometer on the −X cheek (hardware read, stays mid-frame).
  const sensor = CreateBox(`${prefix}HoodSensor`, { width: 0.06, height: 0.08, depth: 0.035 }, scene);
  sensor.parent = parent;
  sensor.position.set(-(halfW - 0.08), canopyY - 0.22, canopyZ - canopyD / 2 + 0.02);
  sensor.material = metal(scene, `${prefix}HoodSensorMat`, COLORS.housing, 0.22);
  sensor.isPickable = false;
  const sensorFace = CreateBox(`${prefix}HoodSensorFace`, { width: 0.05, height: 0.04, depth: 0.01 }, scene);
  sensorFace.parent = parent;
  sensorFace.position.set(-(halfW - 0.08), canopyY - 0.2, canopyZ - canopyD / 2 - 0.005);
  applyLabel(sensorFace, scene, {
    width: 128,
    height: 96,
    fill: '#0a1810',
    ink: '#7fe0a8',
    align: 'center',
    font: 'bold 28px monospace',
    lines: ['0.45', 'm/s'],
    lineHeight: 34,
  });
  sensorFace.isPickable = false;

  const gauge = CreateCylinder(`${prefix}HoodGauge`, { diameter: 0.055, height: 0.02, tessellation: 14 }, scene);
  gauge.parent = parent;
  gauge.position.set(halfW - 0.1, canopyY - 0.2, canopyZ - canopyD / 2 + 0.02);
  gauge.rotation.x = Math.PI / 2;
  gauge.material = metal(scene, `${prefix}HoodGaugeMat`, new Color3(0.7, 0.72, 0.74), 0.35);
  gauge.isPickable = false;
  const needle = CreateBox(`${prefix}HoodNeedle`, { width: 0.004, height: 0.02, depth: 0.002 }, scene);
  needle.parent = parent;
  needle.position.set(halfW - 0.1, canopyY - 0.195, canopyZ - canopyD / 2 + 0.005);
  needle.rotation.z = 0.4;
  needle.material = lamp(scene, `${prefix}HoodNeedleMat`, COLORS.fault, 0.6);
  needle.isPickable = false;

  // Lateral exhaust takeoffs flush inside cheek mass — no protruding furniture ledge.
  for (const sx of [-1, 1] as const) {
    const lateral = CreateBox(`${prefix}HoodLateral${sx}`, {
      width: 0.06,
      height: 0.06,
      depth: 0.12,
    }, scene);
    lateral.parent = parent;
    lateral.position.set(sx * (halfW - 0.06), canopyY - 0.02, canopyZ + 0.1);
    lateral.material = ductMat;
    lateral.isPickable = false;
  }
}

/**
 * Pipes, valves, junction boxes, cable tray, carboy — densifies every wet/CMP
 * station as fab utility without large grey slabs.
 */
export function buildServiceBundle(
  scene: Scene,
  parent: TransformNode,
  prefix: string,
  opts: { width: number; depth: number; accent?: Color3 },
): void {
  const zBack = opts.depth / 2 - 0.04;
  const pipeMat = metal(scene, `${prefix}PipeMat`, new Color3(0.68, 0.52, 0.28), 0.28);
  const ssMat = metal(scene, `${prefix}SsPipeMat`, new Color3(0.58, 0.62, 0.66), 0.22);
  const accent = opts.accent ?? COLORS.accent;

  // Vertical supply drops + elbows + valve wheels into a rear manifold
  for (const [i, x] of [-0.32, -0.1, 0.12, 0.34].entries()) {
    const px = x * (opts.width / 1.15);
    const drop = CreateCylinder(`${prefix}PipeDrop${i}`, {
      diameter: i % 2 ? 0.024 : 0.032,
      height: 0.62,
      tessellation: 10,
    }, scene);
    drop.parent = parent;
    drop.position.set(px, 1.58, zBack);
    drop.material = i % 2 ? ssMat : pipeMat;
    drop.isPickable = false;

    const elbow = CreateTorus(`${prefix}PipeElbow${i}`, { diameter: 0.055, thickness: 0.016, tessellation: 12 }, scene);
    elbow.parent = parent;
    elbow.position.set(px, 1.28, zBack - 0.025);
    elbow.rotation.x = Math.PI / 2;
    elbow.material = i % 2 ? ssMat : pipeMat;
    elbow.isPickable = false;

    const valve = CreateTorus(`${prefix}Valve${i}`, { diameter: 0.05, thickness: 0.01, tessellation: 10 }, scene);
    valve.parent = parent;
    valve.position.set(px, 1.48, zBack - 0.02);
    valve.rotation.z = Math.PI / 2;
    valve.material = metal(scene, `${prefix}ValveMat${i}`, COLORS.housing, 0.22);
    valve.isPickable = false;

    const flange = CreateCylinder(`${prefix}PipeFlange${i}`, { diameter: 0.06, height: 0.018, tessellation: 10 }, scene);
    flange.parent = parent;
    flange.position.set(px, 1.36, zBack);
    flange.material = metal(scene, `${prefix}PipeFlangeMat`, COLORS.wallTrim, 0.2);
    flange.isPickable = false;
  }

  const manifold = CreateCylinder(`${prefix}Manifold`, { diameter: 0.04, height: opts.width * 0.62, tessellation: 12 }, scene);
  manifold.parent = parent;
  manifold.rotation.z = Math.PI / 2;
  manifold.position.set(0, 1.28, zBack - 0.025);
  manifold.material = pipeMat;
  manifold.isPickable = false;

  // Tiny utility junction boxes tucked on the rear cheek (not mid-frame grey slabs).
  for (const [i, ox] of [0.22, 0.4].entries()) {
    const box = CreateBox(`${prefix}Jbox${i}`, { width: 0.09, height: 0.08, depth: 0.05 }, scene);
    box.parent = parent;
    box.position.set(opts.width / 2 - ox, 1.52, zBack + 0.01);
    box.material = metal(scene, `${prefix}JboxMat${i}`, COLORS.housing.scale(i ? 1.05 : 0.95), 0.16);
    box.isPickable = false;
    const led = CreateBox(`${prefix}JboxLed${i}`, { width: 0.02, height: 0.02, depth: 0.015 }, scene);
    led.parent = parent;
    led.position.set(opts.width / 2 - ox, 1.55, zBack + 0.04);
    led.material = lamp(scene, `${prefix}JboxLedMat${i}`, i ? COLORS.warn : COLORS.accent, 0.7);
    led.isPickable = false;
  }

  const utilTag = CreateBox(`${prefix}UtilTag`, { width: 0.2, height: 0.07, depth: 0.01 }, scene);
  utilTag.parent = parent;
  utilTag.position.set(opts.width / 2 - 0.3, 1.38, zBack + 0.03);
  applyLabel(utilTag, scene, {
    width: 256,
    height: 96,
    fill: '#182028',
    ink: '#8fd0b0',
    align: 'center',
    font: 'bold 20px monospace',
    lines: ['UTILITIES', 'N2 · DI · VAC'],
    lineHeight: 32,
  });
  utilTag.isPickable = false;

  // Flexible rubber jumpers into the deck
  for (const [i, x] of [-0.22, 0.18].entries()) {
    const hose = CreateCylinder(`${prefix}FlexHose${i}`, { diameter: 0.018, height: 0.28, tessellation: 8 }, scene);
    hose.parent = parent;
    hose.position.set(x, 1.14, zBack - 0.12);
    hose.rotation.x = 0.55;
    hose.material = rubber(scene, `${prefix}FlexHoseMat${i}`, new Color3(0.12, 0.14, 0.16));
    hose.isPickable = false;
  }

  // Overhead cable tray (perforated look via thin rails, not a solid grey slab)
  const trayRail = metal(scene, `${prefix}TrayMat`, new Color3(0.45, 0.48, 0.5), 0.18);
  for (const [i, oz] of [-0.04, 0.04].entries()) {
    const rail = CreateBox(`${prefix}TrayRail${i}`, { width: opts.width * 0.72, height: 0.018, depth: 0.022 }, scene);
    rail.parent = parent;
    rail.position.set(0, 1.74, zBack - 0.05 + oz);
    rail.material = trayRail;
    rail.isPickable = false;
  }
  for (const [i, x] of [-0.35, -0.12, 0.12, 0.35].entries()) {
    const rung = CreateBox(`${prefix}TrayRung${i}`, { width: 0.018, height: 0.014, depth: 0.1 }, scene);
    rung.parent = parent;
    rung.position.set(x * (opts.width / 1.3), 1.74, zBack - 0.05);
    rung.material = trayRail;
    rung.isPickable = false;
  }

  for (const [i, x] of [-0.2, 0, 0.2].entries()) {
    const cable = CreateCylinder(`${prefix}Cable${i}`, { diameter: 0.011, height: 0.38, tessellation: 6 }, scene);
    cable.parent = parent;
    cable.position.set(x, 1.55, zBack - 0.05);
    cable.material = rubber(
      scene,
      `${prefix}CableMat${i}`,
      i === 1 ? accent.scale(0.55) : new Color3(0.18, 0.2, 0.22),
    );
    cable.isPickable = false;
  }

  // Floor density — carboys + PPE locker fill the empty corners beside the cabinet.
  for (const [i, side] of [-1, 1].entries()) {
    const cx = side * (opts.width / 2 - 0.1);
    const cz = -(opts.depth / 2) + 0.16;
    const carboy = CreateCylinder(`${prefix}Carboy${i}`, {
      diameter: i ? 0.14 : 0.16,
      height: i ? 0.24 : 0.28,
      tessellation: 14,
    }, scene);
    carboy.parent = parent;
    carboy.position.set(cx, i ? 0.18 : 0.2, cz);
    const carboyMat = matte(
      scene,
      `${prefix}CarboyMat${i}`,
      (i ? COLORS.warn : accent).scale(0.55).add(new Color3(0.12, 0.12, 0.12)),
      0.05,
    );
    carboyMat.alpha = 0.88;
    carboyMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    carboyMat.roughness = 0.42;
    carboyMat.environmentIntensity = 0.22;
    carboy.material = carboyMat;
    carboy.isPickable = false;

    const cap = CreateCylinder(`${prefix}CarboyCap${i}`, { diameter: 0.06, height: 0.035, tessellation: 10 }, scene);
    cap.parent = parent;
    cap.position.set(cx, i ? 0.32 : 0.36, cz);
    cap.material = metal(scene, `${prefix}CarboyCapMat${i}`, COLORS.wallTrim, 0.22);
    cap.isPickable = false;
  }

  // Rear splash / utility backsplash — taller wet-bench mass behind tanks (keeps under HEPA).
  const splash = CreateBox(`${prefix}Splash`, {
    width: opts.width - 0.12,
    height: 0.58,
    depth: 0.045,
  }, scene);
  splash.parent = parent;
  splash.position.set(0, 1.28, zBack - 0.01);
  splash.material = matteNoise(scene, `${prefix}SplashMat`, new Color3(0.4, 0.42, 0.45), {
    variance: 16,
    speck: 0.08,
    size: 128,
    tileHint: 'fine',
    blotch: 0.5,
    emissive: 0.025,
    uScale: 2.6,
    vScale: 1.8,
  });
  splash.isPickable = false;
  const splashRail = CreateBox(`${prefix}SplashRail`, {
    width: opts.width - 0.16,
    height: 0.028,
    depth: 0.05,
  }, scene);
  splashRail.parent = parent;
  splashRail.position.set(0, 0.995, zBack - 0.04);
  splashRail.material = metal(scene, `${prefix}SplashRailMat`, COLORS.wallTrim, 0.22);
  splashRail.isPickable = false;
  // Mid service pylons — densify bath↔hood silhouette from orbit.
  for (const [pi, px] of [
    [0, -0.38],
    [1, 0.38],
  ] as const) {
    const pylon = CreateBox(`${prefix}ServicePylon${pi}`, {
      width: 0.07,
      height: 0.36,
      depth: 0.08,
    }, scene);
    pylon.parent = parent;
    pylon.position.set(px * (opts.width / 1.15), 1.18, zBack - 0.06);
    pylon.material = metal(scene, `${prefix}ServicePylonMat${pi}`, new Color3(0.45, 0.48, 0.52), 0.18);
    pylon.isPickable = false;
  }

  // Mid-deck drip trench + DI gooseneck — wet-bench language in the operator FOV.
  const trench = CreateBox(`${prefix}DripTrench`, {
    width: opts.width - 0.28,
    height: 0.012,
    depth: 0.06,
  }, scene);
  trench.parent = parent;
  trench.position.set(0, 0.975, -(opts.depth / 2) + 0.14);
  trench.material = matte(scene, `${prefix}DripTrenchMat`, new Color3(0.18, 0.2, 0.22), 0.02);
  trench.isPickable = false;

  const gooseBase = CreateCylinder(`${prefix}DiGooseBase`, {
    diameter: 0.045,
    height: 0.03,
    tessellation: 12,
  }, scene);
  gooseBase.parent = parent;
  gooseBase.position.set(-(opts.width / 2) + 0.22, 0.99, -(opts.depth / 2) + 0.22);
  gooseBase.material = ssMat;
  gooseBase.isPickable = false;
  const gooseStem = CreateCylinder(`${prefix}DiGooseStem`, {
    diameter: 0.018,
    height: 0.22,
    tessellation: 10,
  }, scene);
  gooseStem.parent = parent;
  gooseStem.position.set(-(opts.width / 2) + 0.22, 1.1, -(opts.depth / 2) + 0.22);
  gooseStem.material = ssMat;
  gooseStem.isPickable = false;
  const gooseNeck = CreateTorus(`${prefix}DiGooseNeck`, {
    diameter: 0.08,
    thickness: 0.016,
    tessellation: 14,
  }, scene);
  gooseNeck.parent = parent;
  gooseNeck.position.set(-(opts.width / 2) + 0.22, 1.2, -(opts.depth / 2) + 0.18);
  gooseNeck.rotation.x = Math.PI / 2;
  gooseNeck.material = ssMat;
  gooseNeck.isPickable = false;
  const gooseTip = CreateCylinder(`${prefix}DiGooseTip`, {
    diameterTop: 0.01,
    diameterBottom: 0.018,
    height: 0.05,
    tessellation: 10,
  }, scene);
  gooseTip.parent = parent;
  gooseTip.position.set(-(opts.width / 2) + 0.22, 1.16, -(opts.depth / 2) + 0.12);
  gooseTip.rotation.x = Math.PI / 2.4;
  gooseTip.material = ssMat;
  gooseTip.isPickable = false;

  // Extra carboy / rinse bottle on the +X cheek for denser floor read.
  const rinse = CreateCylinder(`${prefix}RinseBottle`, {
    diameter: 0.09,
    height: 0.18,
    tessellation: 12,
  }, scene);
  rinse.parent = parent;
  rinse.position.set(opts.width / 2 - 0.28, 0.16, -(opts.depth / 2) + 0.18);
  const rinseMat = matte(scene, `${prefix}RinseMat`, new Color3(0.55, 0.72, 0.58), 0.06);
  rinseMat.alpha = 0.9;
  rinseMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  rinse.material = rinseMat;
  rinse.isPickable = false;
  const rinseCap = CreateCylinder(`${prefix}RinseCap`, { diameter: 0.04, height: 0.03, tessellation: 10 }, scene);
  rinseCap.parent = parent;
  rinseCap.position.set(opts.width / 2 - 0.28, 0.27, -(opts.depth / 2) + 0.18);
  rinseCap.material = metal(scene, `${prefix}RinseCapMat`, COLORS.wallTrim, 0.2);
  rinseCap.isPickable = false;
}
