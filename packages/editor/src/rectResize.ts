export type RectResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type RectResizePlan = {
  sizeDelta: [number, number];
  positionDelta: [number, number];
};

export function planRectResize(
  handle: RectResizeHandle,
  pivot: [number, number],
  localScale: [number, number],
  rotationDegrees: number,
  localDx: number,
  localDy: number,
): RectResizePlan {
  const px = Number.isFinite(pivot[0]) ? pivot[0] : 0.5;
  const py = Number.isFinite(pivot[1]) ? pivot[1] : 0.5;
  const sx = Math.abs(localScale[0]) > 1e-6 ? Math.abs(localScale[0]) : 1;
  const sy = Math.abs(localScale[1]) > 1e-6 ? Math.abs(localScale[1]) : 1;
  const dx = Number.isFinite(localDx) ? localDx : 0;
  const dy = Number.isFinite(localDy) ? localDy : 0;

  let width = 0;
  let height = 0;
  let localPositionX = 0;
  let localPositionY = 0;
  if (handle.includes('e')) {
    width += dx;
    localPositionX += dx * px;
  }
  if (handle.includes('w')) {
    width -= dx;
    localPositionX += dx * (1 - px);
  }
  if (handle.includes('s')) {
    height += dy;
    localPositionY += dy * py;
  }
  if (handle.includes('n')) {
    height -= dy;
    localPositionY += dy * (1 - py);
  }

  const radians = ((Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    sizeDelta: [width / sx, height / sy],
    positionDelta: [
      localPositionX * cos + localPositionY * sin,
      -localPositionX * sin + localPositionY * cos,
    ],
  };
}
