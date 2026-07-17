export type ScreenAxis = { dx: number; dy: number };

function safeScale(value: number): number {
  return Number.isFinite(value) && Math.abs(value) > 1e-6 ? Math.abs(value) : 1;
}

/** Center-handle motion is expressed in the unrotated parent RectTransform space. */
export function screenRectTranslation(
  screenDx: number,
  screenDy: number,
  screenPixelsPerUnit: number,
): { dx: number; dy: number } {
  const scale = safeScale(screenPixelsPerUnit);
  return {
    dx: (Number.isFinite(screenDx) ? screenDx : 0) / scale,
    dy: (Number.isFinite(screenDy) ? screenDy : 0) / scale,
  };
}

/** Pointer motion projected onto a displayed local axis, in component units. */
export function rectAxisTranslationAmount(
  screenDx: number,
  screenDy: number,
  axis: ScreenAxis,
  screenPixelsPerUnit: number,
): number {
  const scale = safeScale(screenPixelsPerUnit);
  const dx = Number.isFinite(screenDx) ? screenDx : 0;
  const dy = Number.isFinite(screenDy) ? screenDy : 0;
  const axisX = Number.isFinite(axis.dx) ? axis.dx : 0;
  const axisY = Number.isFinite(axis.dy) ? axis.dy : 0;
  return ((dx * axisX) + (dy * axisY)) / scale;
}

/** Converts a local-axis amount back to the parent-space position delta. */
export function rectTranslationAlongAxis(
  amount: number,
  axis: ScreenAxis,
): { dx: number; dy: number } {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return {
    dx: (Number.isFinite(axis.dx) ? axis.dx : 0) * safeAmount,
    dy: (Number.isFinite(axis.dy) ? axis.dy : 0) * safeAmount,
  };
}
