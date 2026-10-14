// Author: MiYu. Scene camera dolly and view-relative navigation preserve usable movement near the orbit pivot.
import { add, lookBasis, norm, orbitEye, scale, type Vec3 } from './math3d.ts';
import { clampSceneCameraDistance, MIN_SCENE_CAMERA_DISTANCE } from './sceneZoom.ts';
export type OrbitCamera = { yaw: number; pitch: number; distance: number; pivot: Vec3 };
export const sceneNavigationKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export function dollySceneCamera(camera: OrbitCamera, delta: number, navigationScale: number): OrbitCamera {
  if (!Number.isFinite(delta) || delta === 0) return camera;
  const amount = Math.min(1000, Math.abs(delta));
  const step = Math.max(camera.distance * (Math.exp(amount * 0.001) - 1), Math.max(1, navigationScale) * 0.02 * amount / 100);
  const desired = camera.distance + Math.sign(delta) * step;
  const distance = clampSceneCameraDistance(desired);
  const forward = lookBasis(orbitEye(camera.pivot, camera.yaw, camera.pitch, camera.distance), camera.pivot).forward;
  const pivot = desired < MIN_SCENE_CAMERA_DISTANCE ? add(camera.pivot, scale(forward, MIN_SCENE_CAMERA_DISTANCE - desired)) : camera.pivot;
  return { ...camera, distance, pivot };
}

export function flySceneCamera(camera: OrbitCamera, keys: ReadonlySet<string>, seconds: number, navigationScale: number, fast = false): OrbitCamera {
  const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const z = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  if ((!x && !z) || !Number.isFinite(seconds) || seconds <= 0) return camera;
  const basis = lookBasis(orbitEye(camera.pivot, camera.yaw, camera.pitch, camera.distance), camera.pivot);
  const direction = norm(add(scale(basis.right, x), scale(basis.forward, z)));
  const speed = Math.max(1, navigationScale * 0.75, camera.distance * 0.5) * (fast ? 3 : 1);
  return { ...camera, pivot: add(camera.pivot, scale(direction, speed * Math.min(seconds, 0.05))) };
}
