import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';

/** How a finished rework bench asks the session to close and resolve. */
export interface ReworkCloseRequest {
  readonly success: boolean;
  readonly armCmpBrake?: boolean;
  readonly brakeWafers?: number;
  readonly immediate?: boolean;
}

/** Presentation handle for a rework minigame bench. */
export interface ReworkBenchHandle {
  setVisible(visible: boolean): void;
  update(dt: number): void;
  frameCamera?(camera: ArcRotateCamera): void;
  prepareFresh?(): void;
  getCloseRequest?(): ReworkCloseRequest | null;
}
