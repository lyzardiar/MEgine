export type ImageRect = { x: number; y: number; w: number; h: number };

/** Unity-style Preserve Aspect fit, centered inside the authored RectTransform. */
export function fitImageAspectRect(
  rect: ImageRect,
  sourceSize: readonly [number, number],
): ImageRect {
  const sourceWidth = Number(sourceSize[0]);
  const sourceHeight = Number(sourceSize[1]);
  if (
    !Number.isFinite(rect.w)
    || !Number.isFinite(rect.h)
    || rect.w <= 0
    || rect.h <= 0
    || !Number.isFinite(sourceWidth)
    || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0
    || sourceHeight <= 0
  ) {
    return { ...rect };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const rectAspect = rect.w / rect.h;
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(rectAspect) || sourceAspect <= 0 || rectAspect <= 0) {
    return { ...rect };
  }
  if (sourceAspect > rectAspect) {
    const height = rect.w / sourceAspect;
    return { x: rect.x, y: rect.y + (rect.h - height) * 0.5, w: rect.w, h: height };
  }
  const width = rect.h * sourceAspect;
  return { x: rect.x + (rect.w - width) * 0.5, y: rect.y, w: width, h: rect.h };
}
