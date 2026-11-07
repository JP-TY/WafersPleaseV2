import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';

export interface LabelOptions {
  readonly width?: number;
  readonly height?: number;
  readonly font?: string;
  readonly fill?: string;
  readonly ink?: string;
  readonly align?: CanvasTextAlign;
  readonly lines?: readonly string[];
  readonly lineHeight?: number;
}

/** Paint multi-line text onto a mesh via DynamicTexture (diegetic print). */
export function applyLabel(mesh: AbstractMesh, scene: Scene, opts: LabelOptions): DynamicTexture {
  const w = opts.width ?? 512;
  const h = opts.height ?? 512;
  const tex = new DynamicTexture(`${mesh.name}_tex`, { width: w, height: h }, scene, false);
  tex.hasAlpha = true;
  paint(tex, opts);
  const mat = new StandardMaterial(`${mesh.name}_mat`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  // Stronger self-illumination so labels stay legible under cleanroom wash.
  mat.emissiveColor = new Color3(0.55, 0.55, 0.52);
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  mesh.material = mat;
  return tex;
}

function paint(tex: DynamicTexture, opts: LabelOptions): void {
  const size = tex.getSize();
  const w = size.width;
  const h = size.height;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = opts.fill ?? '#ebe4d4';
  ctx.fillRect(0, 0, w, h);
  // Hairline frame so boards don't melt into walls
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = opts.ink ?? '#1a1f28';
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'top';
  ctx.font = opts.font ?? 'bold 28px monospace';
  const lh = opts.lineHeight ?? 36;
  const x = opts.align === 'center' ? w / 2 : 24;
  let y = 22;
  for (const line of opts.lines ?? []) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  tex.update();
}

export function rewriteLabel(tex: DynamicTexture, opts: LabelOptions): void {
  paint(tex, opts);
}
