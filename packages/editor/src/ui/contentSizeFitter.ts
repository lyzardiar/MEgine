import type { Rect } from './rectLayout';

export type ContentFitMode = 'Unconstrained' | 'MinSize' | 'PreferredSize';

export type LayoutMetrics = {
  direction: string;
  padding: [number, number, number, number];
  spacing: [number, number];
  cellSize: [number, number];
  constraintCount: number;
};

export type ContentSize = {
  minWidth: number;
  minHeight: number;
  preferredWidth: number;
  preferredHeight: number;
};

export function measureLayoutContent(
  layout: LayoutMetrics,
  childCount: number,
  scale = 1,
): ContentSize {
  const count = Math.max(0, Math.trunc(childCount));
  const left = Math.max(0, layout.padding[0] * scale);
  const top = Math.max(0, layout.padding[1] * scale);
  const right = Math.max(0, layout.padding[2] * scale);
  const bottom = Math.max(0, layout.padding[3] * scale);
  const cellWidth = Math.max(0, layout.cellSize[0] * scale);
  const cellHeight = Math.max(0, layout.cellSize[1] * scale);
  const spacingX = Math.max(0, layout.spacing[0] * scale);
  const spacingY = Math.max(0, layout.spacing[1] * scale);
  const minWidth = left + right;
  const minHeight = top + bottom;

  if (count === 0) {
    return { minWidth, minHeight, preferredWidth: minWidth, preferredHeight: minHeight };
  }
  if (layout.direction === 'Horizontal') {
    return {
      minWidth,
      minHeight,
      preferredWidth: minWidth + cellWidth * count + spacingX * Math.max(0, count - 1),
      preferredHeight: minHeight + cellHeight,
    };
  }
  if (layout.direction === 'Grid') {
    const columns = Math.max(1, Math.min(count, Math.trunc(layout.constraintCount) || 1));
    const rows = Math.ceil(count / columns);
    return {
      minWidth,
      minHeight,
      preferredWidth: minWidth + cellWidth * columns + spacingX * Math.max(0, columns - 1),
      preferredHeight: minHeight + cellHeight * rows + spacingY * Math.max(0, rows - 1),
    };
  }
  return {
    minWidth,
    minHeight,
    preferredWidth: minWidth + cellWidth,
    preferredHeight: minHeight + cellHeight * count + spacingY * Math.max(0, count - 1),
  };
}

export function applyContentSize(
  rect: Rect,
  pivot: [number, number],
  horizontalFit: string,
  verticalFit: string,
  content: ContentSize,
): Rect {
  const width = horizontalFit === 'PreferredSize'
    ? content.preferredWidth
    : horizontalFit === 'MinSize'
      ? content.minWidth
      : rect.w;
  const height = verticalFit === 'PreferredSize'
    ? content.preferredHeight
    : verticalFit === 'MinSize'
      ? content.minHeight
      : rect.h;
  return {
    x: rect.x + (rect.w - width) * pivot[0],
    y: rect.y + (rect.h - height) * pivot[1],
    w: Math.max(0, width),
    h: Math.max(0, height),
  };
}
