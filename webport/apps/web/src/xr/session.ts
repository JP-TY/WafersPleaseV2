/**
 * Minimal WebXR immersive-vr path (GDD §4 optional).
 * Desktop remains primary; XR hides HUD and uses near-field picks.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { WebXRState } from '@babylonjs/core/XR/webXRTypes.js';
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';

export interface XrSessionHandle {
  readonly supported: boolean;
  readonly inXr: boolean;
  dispose(): void;
}

export interface XrInstallOptions {
  readonly scene: Scene;
  readonly floorMeshes?: AbstractMesh[];
  readonly onEnter?: () => void;
  readonly onExit?: () => void;
  readonly hudEl?: HTMLElement | null;
}

export async function installXrSession(opts: XrInstallOptions): Promise<XrSessionHandle> {
  const { scene } = opts;
  let inXr = false;
  let experience: WebXRDefaultExperience | null = null;

  try {
    experience = await scene.createDefaultXRExperienceAsync({
      disableDefaultUI: false,
      floorMeshes: opts.floorMeshes,
      optionalFeatures: true,
    });
  } catch {
    return {
      supported: false,
      get inXr() {
        return false;
      },
      dispose() {},
    };
  }

  const base = experience.baseExperience;
  if (!base) {
    return {
      supported: false,
      get inXr() {
        return false;
      },
      dispose() {},
    };
  }

  // Prefer WebGL2 / immersive-vr; teleport locomotion if available.
  try {
    await base.featuresManager.enableFeature(
      // string feature name keeps deep-import surface small
      'xr-controller-teleportation' as never,
      'latest' as never,
      { floorMeshes: opts.floorMeshes } as never,
    );
  } catch {
    /* teleport optional */
  }

  base.onStateChangedObservable.add((state) => {
    inXr = state === WebXRState.IN_XR;
    if (opts.hudEl) opts.hudEl.style.display = inXr ? 'none' : '';
    if (inXr) opts.onEnter?.();
    else opts.onExit?.();
  });

  return {
    supported: true,
    get inXr() {
      return inXr;
    },
    dispose() {
      void experience?.dispose();
    },
  };
}
