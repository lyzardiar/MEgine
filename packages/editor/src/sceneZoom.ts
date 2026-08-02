export const MIN_SCENE_CAMERA_DISTANCE = 0.5;
export const MAX_SCENE_CAMERA_DISTANCE = 1_000_000;

export function clampSceneCameraDistance(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_SCENE_CAMERA_DISTANCE, Math.min(MAX_SCENE_CAMERA_DISTANCE, value));
}

export function normalizeSceneZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.05, Math.min(16, value));
}

/** Perspective scale is inversely proportional to camera distance. */
export function distanceForSceneZoom(
  currentDistance: number,
  currentScale: number,
  targetScale: number,
): number {
  const distance = Number.isFinite(currentDistance) && currentDistance > 0
    ? currentDistance
    : 1;
  const current = normalizeSceneZoom(currentScale);
  const target = normalizeSceneZoom(targetScale);
  return clampSceneCameraDistance(distance * current / target);
}
