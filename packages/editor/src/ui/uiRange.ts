export type UiRangeDirection =
  | 'LeftToRight'
  | 'RightToLeft'
  | 'BottomToTop'
  | 'TopToBottom';

export function isVerticalRange(direction: UiRangeDirection): boolean {
  return direction === 'BottomToTop' || direction === 'TopToBottom';
}

export function isReverseRange(direction: UiRangeDirection): boolean {
  return direction === 'RightToLeft' || direction === 'BottomToTop';
}

export function scrollbarHandleRange(
  value: number,
  size: number,
  direction: UiRangeDirection,
): { start: number; size: number } {
  const safeValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const safeSize = Math.max(0, Math.min(1, Number.isFinite(size) ? size : 0.2));
  const displayValue = isReverseRange(direction) ? 1 - safeValue : safeValue;
  return { start: displayValue * (1 - safeSize), size: safeSize };
}

export function scrollbarValueFromPosition(
  position: number,
  size: number,
  numberOfSteps: number,
  direction: UiRangeDirection,
): number {
  const safePosition = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0));
  const safeSize = Math.max(0, Math.min(1, Number.isFinite(size) ? size : 0.2));
  let value = (safePosition - safeSize * 0.5) / Math.max(0.0001, 1 - safeSize);
  value = Math.max(0, Math.min(1, value));
  if (isReverseRange(direction)) value = 1 - value;
  const steps = Math.max(0, Math.trunc(Number.isFinite(numberOfSteps) ? numberOfSteps : 0));
  if (steps > 1) {
    const intervals = steps - 1;
    value = Math.round(value * intervals) / intervals;
  }
  return value;
}

export function normalizedRangePosition(
  point: { x: number; y: number },
  pivotPoint: { x: number; y: number },
  size: { w: number; h: number },
  pivot: [number, number],
  rotationDegrees: number,
  direction: UiRangeDirection,
): number {
  const radians = (rotationDegrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = point.x - pivotPoint.x;
  const dy = point.y - pivotPoint.y;
  const localX = dx * c - dy * s + size.w * pivot[0];
  const localY = dx * s + dy * c + size.h * pivot[1];
  return isVerticalRange(direction)
    ? localY / Math.max(1, size.h)
    : localX / Math.max(1, size.w);
}
