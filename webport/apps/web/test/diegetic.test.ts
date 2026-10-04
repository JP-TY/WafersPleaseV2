/**
 * Diegetic layer tests.
 *
 * The claim this file exists to defend: the UI is made of OBJECTS in the world,
 * not pictures of objects. That is a testable claim, and it was false until now —
 * every element was an emissive quad, which is why a glowing "printed form" read
 * as a television no matter how much paper texture was painted on it.
 *
 * These run headless against a NullEngine, so the whole scene graph is built and
 * asserted with no GPU.
 */

import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import '@babylonjs/core/Culling/ray.js';

import { paper, cardboard, housing, anodised, screenGlass, Knob, ToggleSwitch, pushButton, telltales, screws, vents, nameplate, cable } from '../src/scene/physical.js';
import { TravelerView } from '../src/inspection/traveler-view.js';
import { ProgressionBoard } from '../src/inspection/progression-view.js';
import { BriefingView, DebriefView } from '../src/inspection/boards.js';
import { buildBay, BENCH_Y, LAYOUT } from '../src/inspection/bay.js';
import { steel } from '../src/scene/lighting.js';
import { BENCH_Y as BENCH_Y_UI } from '../src/ui/bench.js';

function scene() {
  const engine = new NullEngine();
  return new Scene(engine);
}

describe('paper is lit, not emissive', () => {
  /**
   * The load-bearing assertion of this whole change. A printed form that emits
   * its own light is a monitor showing a picture of a form, and no amount of
   * paper texture fixes that — which is exactly what the UI looked like before.
   */
  it('a paper material has no emissive contribution', () => {
    const s = scene();
    const m = paper(s, 'p', { getContext: () => null } as never);
    expect(m).toBeInstanceOf(PBRMaterial);
    expect(m.unlit).toBeFalsy();
    const e = (m as unknown as { emissiveColor: Color3 }).emissiveColor;
    // Either no emissive colour at all, or black.
    expect(e === undefined || (e.r === 0 && e.g === 0 && e.b === 0)).toBe(true);
  });

  it('paper is a dielectric with a broad specular, not a mirror', () => {
    const s = scene();
    const m = paper(s, 'p', { getContext: () => null } as never);
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeGreaterThan(0.6);
  });

  it('cardboard backing is rougher and darker than the sheet', () => {
    const s = scene();
    const board = cardboard(s, 'c');
    expect(board.roughness).toBeGreaterThan(0.9);
    expect(board.albedoColor.r).toBeLessThan(0.4);
  });
});

describe('the traveler is a physical sheet, not a screen', () => {
  it('mounts a plane whose material is paper, not an emissive panel', () => {
    const s = scene();
    const t = new TravelerView(s);
    const sheet = s.getMeshByName('traveler-sheet');
    expect(sheet).toBeTruthy();
    const mat = sheet!.material as PBRMaterial;
    expect(mat).toBeInstanceOf(PBRMaterial);
    expect(mat.unlit).toBeFalsy();
    expect(mat.metallic).toBe(0);
  });

  it('has a clipboard clip and greyboard backing', () => {
    const s = scene();
    new TravelerView(s);
    // The clip and the backing are what make it a clipboard rather than a
    // framed picture; their absence was the tell.
    expect(s.getMeshByName('traveler-clip')).toBeTruthy();
    expect(s.getMeshByName('traveler-clip-lever')).toBeTruthy();
    expect(s.getMeshByName('traveler-back')).toBeTruthy();
  });

  it('the sheet faces up and toward the operator', () => {
    const s = scene();
    new TravelerView(s);
    const tilt = s.getTransformNodeByName('traveler-tilt');
    expect(tilt).toBeTruthy();
    // Babylon rotates about +X so +Y swings toward +Z; a POSITIVE angle is what
    // tips the top edge toward the operator. Negative aimed the paper at the wall.
    expect(tilt!.rotation.x).toBeGreaterThan(0);
  });
});

describe('wall boards are printed notices, not televisions', () => {
  it('the briefing sheet is paper behind an aluminium frame and glass', () => {
    const s = scene();
    const b = new BriefingView(s);
    const sheet = s.getMeshByName('briefing-sheet');
    expect(sheet).toBeTruthy();
    expect((sheet!.material as PBRMaterial).unlit).toBeFalsy();
    expect(s.getMeshByName('briefing-frame-0')).toBeTruthy();
    expect(s.getMeshByName('briefing-glass')).toBeTruthy();
    expect(b.mesh).toBeTruthy();
  });

  it('the debrief and the record use the same physical construction', () => {
    const s = scene();
    new DebriefView(s);
    new ProgressionBoard(s);
    expect(s.getMeshByName('debrief-sheet')).toBeTruthy();
    expect(s.getMeshByName('debrief-glass')).toBeTruthy();
    expect(s.getMeshByName('progression-sheet')).toBeTruthy();
    expect(s.getMeshByName('progression-glass')).toBeTruthy();
  });

  it('boards start hidden, so none of them is a wall-mounted TV at load', () => {
    const s = scene();
    expect(new BriefingView(s).isVisible).toBe(false);
    expect(new DebriefView(s).mesh.parent?.isEnabled()).toBe(false);
  });
});

describe('physical controls are objects with state', () => {
  it('a knob rotates to represent its value', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    const k = new Knob(s, root, 'k', Vector3.Zero());
    k.setValue(0);
    const low = k.mesh.rotation.y;
    k.setValue(1);
    const high = k.mesh.rotation.y;
    // The pointer has to actually move, or the control is decoration.
    expect(low).not.toBe(high);
  });

  it('a knob clamps out-of-range input rather than spinning', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    const k = new Knob(s, root, 'k', Vector3.Zero());
    // Below-range and above-range must pin to the two endpoints, not spin.
    k.setValue(-5);
    const below = k.mesh.rotation.y;
    k.setValue(0);
    const atMin = k.mesh.rotation.y;
    k.setValue(1);
    const atMax = k.mesh.rotation.y;
    k.setValue(5);
    const above = k.mesh.rotation.y;
    expect(below).toBe(atMin);
    expect(above).toBe(atMax);
    expect(atMin).not.toBe(atMax);
  });

  it('a toggle throws between two positions and reports its state', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    const t = new ToggleSwitch(s, root, 't', Vector3.Zero());
    expect(t.value).toBe(false);
    t.set(true);
    expect(t.value).toBe(true);
    expect(t.mesh.rotation.x).not.toBe(0.5);
  });

  it('a pushbutton travels when pressed', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    const b = pushButton(s, root, 'b', Vector3.Zero());
    const up = b.mesh.position.y;
    b.setPressed(true);
    expect(b.mesh.position.y).toBeLessThan(up);
  });

  it('a telltale is dark until it is switched on', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    const t = telltales(s, root, 'tl', Vector3.Zero(), [{ label: 'RUN', colour: '#5fd68a' }]);
    const lamp = s.getMeshByName('tl-lamp-0')!;
    const before = (lamp.material as unknown as { emissiveColor: Color3 }).emissiveColor.clone();
    t.set(0, true);
    const after = (lamp.material as unknown as { emissiveColor: Color3 }).emissiveColor.clone();
    expect(after.g).toBeGreaterThan(before.g * 5);
  });

  it('an out-of-range telltale index is ignored, not a crash', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    const t = telltales(s, root, 'tl', Vector3.Zero(), [{ label: 'RUN', colour: '#5fd68a' }]);
    expect(() => t.set(7, true)).not.toThrow();
  });
});

describe('manufactured detail', () => {
  it('screws place the requested count around a bezel', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    screws(s, root, 'sc', 0.4, 0.2, 0.01, 4);
    expect(s.getMeshByName('sc-0')).toBeTruthy();
    expect(s.getMeshByName('sc-3')).toBeTruthy();
    expect(s.getMeshByName('sc-4')).toBeFalsy();
  });

  it('vents create the requested number of slots', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    vents(s, root, 'v', 5, 0.02, { width: 0.01, height: 0.01, depth: 0.002 }, Vector3.Zero());
    expect(s.getMeshByName('v-4')).toBeTruthy();
    expect(s.getMeshByName('v-5')).toBeFalsy();
  });

  it('a nameplate carries its text into a texture', () => {
    const s = scene();
    const root = new TransformNode('r', s);
    nameplate(s, root, 'np', 'ELLIPSOMETRY', 0.2, Vector3.Zero());
    expect(s.getMeshByName('np')).toBeTruthy();
  });

  it('a cable is built from segments that hang below its endpoints', () => {
    const s = scene();
    const y = 0.4;
    const mesh = cable(s, new Vector3(0, y, 0), new Vector3(0.4, y, 0), 0.08, 'cb');
    expect(mesh).toBeTruthy();
    // A cable that never dips is a stick. The lowest segment must sit below the
    // straight line between the two ends.
    const mids = s.meshes.filter((m) => m.name.startsWith('cb-'));
    expect(mids.length).toBeGreaterThan(4);
    const lowest = Math.min(...mids.map((m) => m.getAbsolutePosition().y));
    expect(lowest).toBeLessThan(y - 0.01);
  });
});

describe('material intent is consistent', () => {
  it('steel is metal, housing is not', () => {
    const s = scene();
    expect(steel(s, 'a').metallic).toBeGreaterThan(0.7);
    expect(anodised(s, 'b').metallic).toBeGreaterThan(0.7);
    expect(housing(s, 'c').metallic).toBe(0);
  });

  it('screen glass is transparent and shiny', () => {
    const s = scene();
    const g = screenGlass(s, 'g');
    expect(g.alpha).toBeLessThan(1);
    expect(g.roughness).toBeLessThan(0.15);
  });
});

describe('the bay places everything at one working height', () => {
  /**
   * The bug this guards against: hand-built bench geometry laid out around local
   * y = 0 while the room's working surface is at y = 1.42, which buried a whole
   * station in the floor with no error anywhere.
   */
  it('BENCH_Y is a single shared constant', () => {
    expect(BENCH_Y).toBe(BENCH_Y_UI);
    expect(BENCH_Y).toBeGreaterThan(1);
  });

  it('the bay bench top sits at the working height', () => {
    const s = scene();
    buildBay(s);
    const top = s.getMeshByName('bay-bench-top')!;
    const halfHeight = top.getBoundingInfo().boundingBox.extendSize.y;
    expect(top.position.y + halfHeight).toBeCloseTo(BENCH_Y, 1);
  });

  it('the layout keeps the stations apart so nothing interpenetrates', () => {
    // Traveler, wafer and stamps must be distinct in X, or the clipboard sits
    // inside the wafer chuck.
    expect(Math.abs(LAYOUT.traveler.x)).toBeGreaterThan(0.4);
    expect(Math.abs(LAYOUT.stamps.x)).toBeGreaterThan(0.4);
    expect(Math.sign(LAYOUT.traveler.x)).not.toBe(Math.sign(LAYOUT.stamps.x));
    // The instrument rack must sit behind the wafer, not through it.
    expect(LAYOUT.cluster.z).toBeGreaterThan(LAYOUT.wafer.z);
  });

  it('the boards hang on the back wall, past the bench', () => {
    expect(LAYOUT.board.z).toBeGreaterThan(LAYOUT.cluster.z);
    expect(LAYOUT.board.y).toBeGreaterThan(BENCH_Y);
  });
});