/**
 * Diegetic panel toolkit.
 *
 * Built on Babylon's `AdvancedDynamicTexture`, which is a retained-mode
 * Canvas2D widget system that renders into a texture you apply to a mesh. That
 * is the reason Babylon was chosen over three.js for this port: the GDD makes
 * diegetic UI a pillar, and `Assets/Scripts/UI/UITheme.cs` (421 lines, 327
 * non-comment) is pure uGUI widget-factory construction — panel, button, slider,
 * progress bar, text — which maps almost line-for-line onto this API.
 *
 * Three rules keep these panels affordable at 90 fps in a headset:
 *
 *  1. STATIC TEXT IS DRAWN ONCE. `drawText` and `drawStatic*` paint into the
 *     canvas and call `markDirty` a single time. Only live values (temperatures,
 *     traces, timers) use the per-frame `_render` callback.
 *  2. NO PER-PIXEL LOOPS. The Unity `InstrumentPanel` rewrote a 360x150 texture
 *     with `SetPixel` every frame — ~54,000 calls plus an `Apply()` — and
 *     `ReworkCmpCalibration` did 460x180 = 82,800 per slider frame, about
 *     5 M pixel writes/second while dragging. Here everything is Canvas2D path
 *     and fill calls, which the compositor handles natively.
 *  3. ONE DIRTY FLAG PER PANEL. `renderLoop` sets it; the ADT flushes once.
 */

// NOTE: in Babylon 9 AdvancedDynamicTexture is NOT in @babylonjs/core — it ships
// in the separate @babylonjs/gui package, at gui/2D/. Verified by grepping core,
// where the class appears only as a reference from XR/features/WebXRLayers.
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { ICanvasRenderingContext } from '@babylonjs/core/Engines/ICanvas.js';

/**
 * Babylon 9's `ICanvasRenderingContext` is an abstract interface over the 2D
 * context, not the DOM's `CanvasRenderingContext2D`. It declares the drawing
 * surface but omits four standard members that every browser context does
 * implement: `textAlign`, `textBaseline`, `arcTo` and `lineCap`.
 *
 * Widening with them is safe — the runtime object is a real CanvasRenderingContext2D
 * — and it avoids hand-rolling path construction and text alignment to work
 * around an incomplete interface declaration.
 */
export type PanelContext2D = ICanvasRenderingContext & {
  textAlign: string;
  textBaseline: string;
  lineCap: string;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
};
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';


// ---------------------------------------------------------------------------
// Palette — a skeuomorphic instrument look, matching the Unity UITheme intent
// ---------------------------------------------------------------------------

export const PALETTE = {
  panel: '#12161c',
  panelEdge: '#2c3542',
  panelEdgeLit: '#4a5a6e',
  faceplate: '#1a2028',
  text: '#d7e2ee',
  textDim: '#7d8b9c',
  accent: '#5ec8d8',
  good: '#5fd68a',
  warn: '#e8b552',
  bad: '#e8574a',
  trace: '#7cf2b0',
  grid: '#243040',
  glass: '#0d1116',
} as const;

export const MONO = "'DejaVu Sans Mono', 'Menlo', 'Consolas', monospace";
export const SANS = "'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif";

export type PanelScale = 'sm' | 'md' | 'lg';

// ---------------------------------------------------------------------------
// Low-level drawing helpers
// ---------------------------------------------------------------------------

export interface PanelCtx {
  ctx: PanelContext2D;
  w: number;
  h: number;
}

const px = (v: number) => `${Math.round(v)}px`;

export function clear(c: PanelCtx, fill = PALETTE.glass): void {
  c.ctx.fillStyle = fill;
  c.ctx.fillRect(0, 0, c.w, c.h);
}

/** Beveled instrument faceplate. Static: safe to call inside a render loop. */
export function plate(c: PanelCtx, r = 6): void {
  const g = c.ctx.createLinearGradient(0, 0, 0, c.h);
  g.addColorStop(0, PALETTE.faceplate);
  g.addColorStop(1, PALETTE.panel);
  roundRect(c.ctx, 0.5, 0.5, c.w - 1, c.h - 1, r);
  c.ctx.fillStyle = g;
  c.ctx.fill();
  c.ctx.strokeStyle = PALETTE.panelEdge;
  c.ctx.lineWidth = 1;
  c.ctx.stroke();
}

export function roundRect(ctx: PanelContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function label(
  c: PanelCtx,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; color?: string; align?: 'left' | 'center' | 'right'; font?: string; weight?: string } = {},
): void {
  const { size = 13, color = PALETTE.textDim, align = 'left', font = SANS, weight = '500' } = opts;
  c.ctx.font = `${weight} ${px(size)} ${font}`;
  c.ctx.fillStyle = color;
  c.ctx.textAlign = align;
  c.ctx.textBaseline = 'middle';
  c.ctx.fillText(text, x, y);
}

export function value(
  c: PanelCtx,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; color?: string; align?: 'left' | 'center' | 'right' } = {},
): void {
  label(c, text, x, y, { size: 15, color: PALETTE.text, font: MONO, align: opts.align ?? 'right', weight: '600', ...opts });
}

export function hline(c: PanelCtx, y: number, color = PALETTE.panelEdge): void {
  c.ctx.strokeStyle = color;
  c.ctx.lineWidth = 1;
  c.ctx.beginPath();
  c.ctx.moveTo(0, Math.round(y) + 0.5);
  c.ctx.lineTo(c.w, Math.round(y) + 0.5);
  c.ctx.stroke();
}

/**
 * Horizontal meter with an optional pass band.
 *
 * `band` is [lo, hi] in the meter's own units; when the target sits mid-scale
 * the band is centred on it, which is how the RCA dwell track is drawn.
 */
export function meter(
  c: PanelCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  fraction: number,
  opts: { band?: [number, number]; color?: string; bg?: string } = {},
): void {
  const f = Math.max(0, Math.min(1, fraction));
  roundRect(c.ctx, x, y, w, h, h / 2);
  c.ctx.fillStyle = opts.bg ?? PALETTE.panel;
  c.ctx.fill();

  if (opts.band) {
    const [lo, hi] = opts.band;
    roundRect(c.ctx, x + lo * w, y, Math.max(2, (hi - lo) * w), h, h / 2);
    c.ctx.fillStyle = 'rgba(94, 200, 216, 0.22)';
    c.ctx.fill();
    c.ctx.strokeStyle = PALETTE.accent;
    c.ctx.lineWidth = 1;
    c.ctx.stroke();
  }

  if (f > 0.001) {
    roundRect(c.ctx, x, y, Math.max(h, f * w), h, h / 2);
    c.ctx.fillStyle = opts.color ?? PALETTE.accent;
    c.ctx.fill();
  }
}

/** Vertical tank with a liquid column — the RCA baths. */
export function column(
  c: PanelCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  fraction: number,
  liquid: string,
): void {
  const f = Math.max(0, Math.min(1, fraction));
  roundRect(c.ctx, x, y, w, h, 4);
  c.ctx.fillStyle = PALETTE.panel;
  c.ctx.fill();
  c.ctx.strokeStyle = PALETTE.panelEdge;
  c.ctx.lineWidth = 1;
  c.ctx.stroke();

  const lh = (h - 4) * f;
  if (lh > 0) {
    c.ctx.save();
    roundRect(c.ctx, x + 2, y + 2, w - 4, h - 4, 3);
    c.ctx.clip();
    const g = c.ctx.createLinearGradient(0, y + h - lh, 0, y + h);
    g.addColorStop(0, liquid);
    g.addColorStop(1, `${liquid}bb`);
    c.ctx.fillStyle = g;
    c.ctx.fillRect(x + 2, y + h - 2 - lh, w - 4, lh);
    c.ctx.restore();
  }
}

/** CRT-ish scanline overlay. Static grid work stays cheap. */
export function graticule(c: PanelCtx, cols: number, rows: number, step = 40): void {
  c.ctx.strokeStyle = PALETTE.grid;
  c.ctx.lineWidth = 1;
  c.ctx.beginPath();
  for (let x = 0; x <= cols; x++) {
    const gx = Math.round((x * c.w) / cols) + 0.5;
    c.ctx.moveTo(gx, 0);
    c.ctx.lineTo(gx, c.h);
  }
  for (let y = 0; y <= rows; y++) {
    const gy = Math.round((y * c.h) / rows) + 0.5;
    c.ctx.moveTo(0, gy);
    c.ctx.lineTo(c.w, gy);
  }
  c.ctx.stroke();
}

/** Map a value into panel pixels on a vertical axis. */
export const toY = (c: PanelCtx, v: number, lo: number, hi: number, pad = 6): number => {
  const t = (v - lo) / (hi - lo || 1);
  return c.h - pad - Math.max(0, Math.min(1, t)) * (c.h - pad * 2);
};

/** Map a value into panel pixels on a horizontal axis. */
export const toX = (c: PanelCtx, v: number, lo: number, hi: number, pad = 6): number => {
  const t = (v - lo) / (hi - lo || 1);
  return pad + Math.max(0, Math.min(1, t)) * (c.w - pad * 2);
};

/**
 * Polyline trace, drawn as a single Path2D.
 *
 * This replaces the Unity scopes' per-pixel `SetPixel` loops. One path, one
 * stroke, and the browser's rasteriser does the rest.
 */
export function trace(
  c: PanelCtx,
  points: readonly number[],
  color: string,
  width = 2,
  dash?: number[],
): void {
  if (points.length < 2) return;
  c.ctx.save();
  c.ctx.strokeStyle = color;
  c.ctx.lineWidth = width;
  c.ctx.lineJoin = 'round';
  c.ctx.lineCap = 'round';
  if (dash) c.ctx.setLineDash(dash);
  c.ctx.beginPath();
  c.ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) c.ctx.lineTo(points[i]!, points[i + 1]!);
  c.ctx.stroke();
  c.ctx.restore();
}

/** Vertical playhead / cursor line. */
export function vline(c: PanelCtx, x: number, color: string, width = 1, dash?: number[]): void {
  c.ctx.save();
  c.ctx.strokeStyle = color;
  c.ctx.lineWidth = width;
  if (dash) c.ctx.setLineDash(dash);
  c.ctx.beginPath();
  c.ctx.moveTo(Math.round(x) + 0.5, 0);
  c.ctx.lineTo(Math.round(x) + 0.5, c.h);
  c.ctx.stroke();
  c.ctx.restore();
}

// ---------------------------------------------------------------------------
// Panel — an AdvancedDynamicTexture with a live render loop
// ---------------------------------------------------------------------------

export interface PanelOptions {
  width: number;
  height: number;
  /** Scale the backing store for crisper text in a headset. */
  scale?: number;
}

export class Panel {
  readonly texture: AdvancedDynamicTexture;
  readonly ctx: PanelContext2D;
  /** Logical size. All layout code works in these units. */
  readonly w: number;
  readonly h: number;
  /** Backing-store multiplier: texture is w*scale x h*scale. */
  private readonly scale: number;
  private dirty = true;

  constructor(name: string, opts: PanelOptions) {
    this.w = opts.width;
    this.h = opts.height;
    this.scale = opts.scale ?? 1;

    // Allocate the texture at the FULL backing resolution and scale the drawing
    // context instead of calling DynamicTexture.scaleTo(). scaleTo resizes the
    // canvas but leaves the GL texture at its original size, so the mesh's UVs
    // sample only the original sub-rectangle — the panel rendered into roughly
    // 1/scale of the mesh and looked offset to one side.
    this.texture = new AdvancedDynamicTexture(name, {
      width: Math.round(this.w * this.scale),
      height: Math.round(this.h * this.scale),
    });
    this.ctx = this.texture.getContext() as PanelContext2D;
  }

  /** Mark for redraw. Called by renderers; `paint` should be idempotent. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Repaint if dirty. Call once per frame, not per widget. */
  flush(paint: (c: PanelCtx) => void): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.texture.getSize().width, this.texture.getSize().height);
    // Draw in logical units; the context handles the resolution multiplier.
    this.ctx.scale(this.scale, this.scale);
    // No vertical flip here. Verified empirically with a two-colour probe:
    // canvas row 0 maps to the TOP of the mesh, i.e. the upload is not
    // inverted, so layout code can use ordinary screen coordinates directly.
    paint({ ctx: this.ctx, w: this.w, h: this.h });
    this.ctx.restore();
    this.texture.update();
  }

/** Force a repaint next flush regardless of the dirty flag. */
  markDirty(): Texture {
    this.dirty = true;
    return this.texture;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export { PALETTE as C };