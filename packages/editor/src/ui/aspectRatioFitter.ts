import type { Rect } from './rectLayout';

export type AspectMode =
  | 'None'
  | 'WidthControlsHeight'
  | 'HeightControlsWidth'
  | 'FitInParent'
  | 'EnvelopeParent';

export function applyAspectRatio(
  rect: Rect,
  parent: Rect,
  pivot: [number, number],
  mode: string,
  aspectRatio: number,
): Rect {
  const ratio = Number(aspectRatio);
  if (mode === 'None' || !Number.isFinite(ratio) || ratio <= 0) return { ...rect };
  const px = rect.x + rect.w * pivot[0];
  const py = rect.y + rect.h * pivot[1];
  if (mode === 'WidthControlsHeight') {
    const h = rect.w / ratio;
    return { x: rect.x, y: py - h * pivot[1], w: rect.w, h };
  }
  if (mode === 'HeightControlsWidth') {
    const w = rect.h * ratio;
    return { x: px - w * pivot[0], y: rect.y, w, h: rect.h };
  }
  if (mode !== 'FitInParent' && mode !== 'EnvelopeParent') return { ...rect };
  if (parent.w <= 0 || parent.h <= 0) return { ...rect };

  const parentRatio = parent.w / parent.h;
  const fitWidth = mode === 'FitInParent'
    ? parentRatio <= ratio
    : parentRatio >= ratio;
  const w = fitWidth ? parent.w : parent.h * ratio;
  const h = fitWidth ? parent.w / ratio : parent.h;
  return {
    x: parent.x + (parent.w - w) * pivot[0],
    y: parent.y + (parent.h - h) * pivot[1],
    w,
    h,
  };
}
