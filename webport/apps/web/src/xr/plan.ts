/**
 * WebXR path — planned / minimal stub (GDD §4 optional, EXECUTION-BRIEF M6).
 *
 * Desktop must shine first. When enabled:
 *  - WebGL2 engine (already forced in bootstrap/engine.ts)
 *  - DefaultXRExperience with teleport in a WALK_AREA
 *  - Snap-turn + near-field pick using the same mesh metadata as desktop
 *  - Hide the thin HUD strip while in XR
 *
 * This module intentionally exports only a capability probe so Day 1 ships
 * without a half-broken VR mode.
 */

export interface XrPlan {
  readonly supported: boolean;
  readonly note: string;
}

export async function probeXr(): Promise<XrPlan> {
  if (typeof navigator === 'undefined' || !('xr' in navigator)) {
    return { supported: false, note: 'WebXR not available in this environment.' };
  }
  try {
    const xr = navigator.xr;
    if (!xr) return { supported: false, note: 'navigator.xr missing.' };
    const ok = await xr.isSessionSupported('immersive-vr');
    return {
      supported: ok,
      note: ok
        ? 'immersive-vr supported — DefaultXRExperience install available via installXrSession.'
        : 'immersive-vr not supported on this device.',
    };
  } catch {
    return { supported: false, note: 'WebXR probe failed.' };
  }
}
