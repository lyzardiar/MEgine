export type RectResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type RectResizePlan = {
  sizeDelta: [number, number];
  positionDelta: [number, number];
  visualSizeDelta: [number, number];
};

export type RectResizeOptions = {
  preserveAspect?: boolean;
  aroundPivot?: boolean;
  currentVisualSize?: [number, number];
};

export function planRectResize(
  handle: RectResizeHandle,
  pivot: [number, number],
  localScale: [number, number],
  rotationDegrees: number,
  localDx: number,
  localDy: number,
  options: RectResizeOptions = {},
): RectResizePlan {
  const px = Number.isFinite(pivot[0]) ? pivot[0] : 0.5;
  const py = Number.isFinite(pivot[1]) ? pivot[1] : 0.5;
  const sx = Math.abs(localScale[0]) > 1e-6 ? Math.abs(localScale[0]) : 1;
  const sy = Math.abs(localScale[1]) > 1e-6 ? Math.abs(localScale[1]) : 1;
  const dx = Number.isFinite(localDx) ? localDx : 0;
  const dy = Number.isFinite(localDy) ? localDy : 0;

  let width = 0;
  let height = 0;
  let aroundPivotX = false;
  let aroundPivotY = false;
  if (handle.includes('e')) {
    aroundPivotX = options.aroundPivot === true && 1 - px > 1e-6;
    width = aroundPivotX ? dx / (1 - px) : dx;
  }
  if (handle.includes('w')) {
    aroundPivotX = options.aroundPivot === true && px > 1e-6;
    width = aroundPivotX ? -dx / px : -dx;
  }
  if (handle.includes('s')) {
    aroundPivotY = options.aroundPivot === true && 1 - py > 1e-6;
    height = aroundPivotY ? dy / (1 - py) : dy;
  }
  if (handle.includes('n')) {
    aroundPivotY = options.aroundPivot === true && py > 1e-6;
    height = aroundPivotY ? -dy / py : -dy;
  }

  const currentWidth = Math.max(1, Math.abs(options.currentVisualSize?.[0] ?? 0));
  const currentHeight = Math.max(1, Math.abs(options.currentVisualSize?.[1] ?? 0));
  const corner = (handle.includes('e') || handle.includes('w'))
    && (handle.includes('n') || handle.includes('s'));
  if (options.preserveAspect && corner && options.currentVisualSize) {
    const widthRatio = width / currentWidth;
    const heightRatio = height / currentHeight;
    const minimumRatio = Math.max(1 / currentWidth - 1, 1 / currentHeight - 1);
    const ratio = Math.max(
      minimumRatio,
      Math.abs(widthRatio) >= Math.abs(heightRatio) ? widthRatio : heightRatio,
    );
    width = currentWidth * ratio;
    height = currentHeight * ratio;
  } else if (options.currentVisualSize) {
    width = Math.max(1 - currentWidth, width);
    height = Math.max(1 - currentHeight, height);
  }
  if (Math.abs(width) < 1e-12) width = 0;
  if (Math.abs(height) < 1e-12) height = 0;

  let localPositionX = 0;
  let localPositionY = 0;
  if (handle.includes('e') && !aroundPivotX) localPositionX = width * px;
  if (handle.includes('w') && !aroundPivotX) localPositionX = -width * (1 - px);
  if (handle.includes('s') && !aroundPivotY) localPositionY = height * py;
  if (handle.includes('n') && !aroundPivotY) localPositionY = -height * (1 - py);

  const radians = ((Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const parentX = localPositionX * cos + localPositionY * sin;
  const parentY = -localPositionX * sin + localPositionY * cos;
  return {
    sizeDelta: [width / sx, height / sy],
    visualSizeDelta: [width, height],
    positionDelta: [
      Math.abs(parentX) < 1e-12 ? 0 : parentX,
      Math.abs(parentY) < 1e-12 ? 0 : parentY,
    ],
  };
}
