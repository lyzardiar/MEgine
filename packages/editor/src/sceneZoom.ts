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
  return Math.max(0.5, Math.min(200, distance * current / target));
}
