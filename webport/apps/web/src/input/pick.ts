import { Ray } from '@babylonjs/core/Culling/ray.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import '@babylonjs/core/Culling/ray.js';

/** Pick the first mesh under CSS pixel coords. Uses a real Ray (§4.5). */
export function pickAt(scene: Scene, x: number, y: number): AbstractMesh | null {
  const hit = scene.pick(x, y);
  return hit?.hit && hit.pickedMesh ? hit.pickedMesh : null;
}

/**
 * Occlusion / reachability test: cast from camera through a world point.
 * Callers must refresh world matrices before reading bounds (§4.6).
 */
export function pickThrough(
  scene: Scene,
  camera: Camera,
  worldPoint: Vector3,
  predicate?: (mesh: AbstractMesh) => boolean,
): AbstractMesh | null {
  const origin = camera.globalPosition.clone();
  const dir = worldPoint.subtract(origin).normalize();
  const ray = new Ray(origin, dir, 20);
  const hit = scene.pickWithRay(ray, predicate);
  return hit?.hit && hit.pickedMesh ? hit.pickedMesh : null;
}

/** World-space centre of a mesh after forcing matrix update. */
export function worldCenter(mesh: AbstractMesh): Vector3 {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo(true, true);
  return mesh.getBoundingInfo().boundingBox.centerWorld.clone();
}
