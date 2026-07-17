/** Screen pixels produced by one RectTransform component unit in Scene view. */
export function rectComponentSceneScale(
  scenePixelScale: number,
  canvasScale: number,
): number {
  const projection = Number.isFinite(scenePixelScale) && scenePixelScale > 0
    ? scenePixelScale
    : 1;
  const canvas = Number.isFinite(canvasScale) && canvasScale > 0 ? canvasScale : 1;
  return projection * canvas;
}
