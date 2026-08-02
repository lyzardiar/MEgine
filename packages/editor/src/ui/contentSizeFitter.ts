import type { Rect } from './rectLayout';

export type ContentFitMode = 'Unconstrained' | 'MinSize' | 'PreferredSize';

export type LayoutMetrics = {
  direction: string;
  padding: [number, number, number, number];
  spacing: [number, number];
  cellSize: [number, number];
  childAlignment?: string;
  childControlWidth?: boolean;
  childControlHeight?: boolean;
  childForceExpandWidth?: boolean;
  childForceExpandHeight?: boolean;
  useChildScaleWidth?: boolean;
  useChildScaleHeight?: boolean;
  reverseArrangement?: boolean;
  startCorner?: string;
  startAxis?: string;
  constraint?: string;
  constraintCount: number;
};

export type LayoutChildMetrics = {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  preferredWidth?: number;
  preferredHeight?: number;
  flexibleWidth?: number;
  flexibleHeight?: number;
  scaleWidth?: number;
  scaleHeight?: number;
};

export type ContentSize = {
  minWidth: number;
  minHeight: number;
  preferredWidth: number;
  preferredHeight: number;
  flexibleWidth: number;
  flexibleHeight: number;
};

function combinedFlexible(
  layout: LayoutMetrics,
  sizes: Array<{ flexible: number }>,
  axis: 0 | 1,
  mainAxis: boolean,
): number {
  const control = axis === 0
    ? layout.childControlWidth !== false
    : layout.childControlHeight !== false;
  if (!control || sizes.length === 0) return 0;
  const forceExpand = axis === 0
    ? layout.childForceExpandWidth !== false
    : layout.childForceExpandHeight !== false;
  const flexible = sizes.map((size) => (
    forceExpand ? Math.max(1, size.flexible) : size.flexible
  ));
  return mainAxis
    ? flexible.reduce((sum, value) => sum + value, 0)
    : Math.max(0, ...flexible);
}

export function measureLayoutContent(
  layout: LayoutMetrics,
  childInput: number | LayoutChildMetrics[],
  scale = 1,
): ContentSize {
  const children = typeof childInput === 'number'
    ? Array.from({ length: Math.max(0, Math.trunc(childInput)) }, () => ({
        width: layout.cellSize[0],
        height: layout.cellSize[1],
      }))
    : childInput;
  const count = children.length;
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
    return {
      minWidth,
      minHeight,
      preferredWidth: minWidth,
      preferredHeight: minHeight,
      flexibleWidth: 0,
      flexibleHeight: 0,
    };
  }
  if (layout.direction === 'Horizontal') {
    const widths = children.map((child) => childAxisSizes(layout, child, 0, scale));
    const heights = children.map((child) => childAxisSizes(layout, child, 1, scale));
    return {
      minWidth: minWidth + widths.reduce((sum, size) => sum + size.min, 0)
        + spacingX * Math.max(0, count - 1),
      minHeight: minHeight + Math.max(0, ...heights.map((size) => size.min)),
      preferredWidth: minWidth + widths.reduce((sum, size) => sum + size.preferred, 0)
        + spacingX * Math.max(0, count - 1),
      preferredHeight: minHeight + Math.max(0, ...heights.map((size) => size.preferred)),
      flexibleWidth: combinedFlexible(layout, widths, 0, true),
      flexibleHeight: combinedFlexible(layout, heights, 1, false),
    };
  }
  if (layout.direction === 'Grid') {
    const { columns, rows } = preferredGridDimensions(layout, count);
    return {
      minWidth,
      minHeight,
      preferredWidth: minWidth + cellWidth * columns + spacingX * Math.max(0, columns - 1),
      preferredHeight: minHeight + cellHeight * rows + spacingY * Math.max(0, rows - 1),
      flexibleWidth: 0,
      flexibleHeight: 0,
    };
  }
  const widths = children.map((child) => childAxisSizes(layout, child, 0, scale));
  const heights = children.map((child) => childAxisSizes(layout, child, 1, scale));
  return {
    minWidth: minWidth + Math.max(0, ...widths.map((size) => size.min)),
    minHeight: minHeight + heights.reduce((sum, size) => sum + size.min, 0)
      + spacingY * Math.max(0, count - 1),
    preferredWidth: minWidth + Math.max(0, ...widths.map((size) => size.preferred)),
    preferredHeight: minHeight + heights.reduce((sum, size) => sum + size.preferred, 0)
      + spacingY * Math.max(0, count - 1),
    flexibleWidth: combinedFlexible(layout, widths, 0, false),
    flexibleHeight: combinedFlexible(layout, heights, 1, true),
  };
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 ? value! : Math.max(0, fallback);
}

function childAxisSizes(
  layout: LayoutMetrics,
  child: LayoutChildMetrics,
  axis: 0 | 1,
  scale: number,
): { min: number; preferred: number; flexible: number } {
  const control = axis === 0
    ? layout.childControlWidth !== false
    : layout.childControlHeight !== false;
  const useScale = axis === 0 ? layout.useChildScaleWidth === true : layout.useChildScaleHeight === true;
  const authored = axis === 0 ? child.width : child.height;
  const fallback = control ? layout.cellSize[axis] : authored;
  const rawMin = axis === 0 ? child.minWidth : child.minHeight;
  const rawPreferred = axis === 0 ? child.preferredWidth : child.preferredHeight;
  const rawFlexible = axis === 0 ? child.flexibleWidth : child.flexibleHeight;
  const childScale = useScale
    ? finiteNonNegative(axis === 0 ? child.scaleWidth : child.scaleHeight, 1)
    : 1;
  const min = control ? finiteNonNegative(rawMin, 0) : finiteNonNegative(authored, 0);
  const preferred = control
    ? Math.max(min, finiteNonNegative(rawPreferred, fallback))
    : min;
  return {
    min: min * scale * childScale,
    preferred: preferred * scale * childScale,
    flexible: control ? finiteNonNegative(rawFlexible, 0) : 0,
  };
}

function alignmentFactors(alignment: string | undefined): [number, number] {
  const value = String(alignment ?? 'UpperLeft');
  const x = value.endsWith('Center') ? 0.5 : value.endsWith('Right') ? 1 : 0;
  const y = value.startsWith('Middle') ? 0.5 : value.startsWith('Lower') ? 1 : 0;
  return [x, y];
}

function preferredGridDimensions(layout: LayoutMetrics, count: number): { columns: number; rows: number } {
  const constraintCount = Math.max(1, Math.trunc(layout.constraintCount) || 1);
  if (layout.constraint === 'FixedRowCount') {
    const rows = Math.min(count, constraintCount);
    return { columns: Math.ceil(count / rows), rows };
  }
  if (layout.constraint === 'Flexible') {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    return { columns, rows: Math.ceil(count / columns) };
  }
  const columns = Math.min(count, constraintCount);
  return { columns, rows: Math.ceil(count / columns) };
}

function axisSizes(
  available: number,
  spacing: number,
  sizes: Array<{ min: number; preferred: number; flexible: number }>,
  forceExpand: boolean,
): number[] {
  if (sizes.length === 0) return [];
  const usable = Math.max(0, available - spacing * Math.max(0, sizes.length - 1));
  const totalMin = sizes.reduce((sum, size) => sum + size.min, 0);
  const totalPreferred = sizes.reduce((sum, size) => sum + size.preferred, 0);
  if (usable <= totalMin || totalPreferred <= totalMin) {
    const factor = totalMin > 0 ? Math.min(1, usable / totalMin) : 0;
    return sizes.map((size) => size.min * factor);
  }
  if (usable < totalPreferred) {
    const t = (usable - totalMin) / (totalPreferred - totalMin);
    return sizes.map((size) => size.min + (size.preferred - size.min) * t);
  }
  const flexible = sizes.map((size) => forceExpand ? Math.max(1, size.flexible) : size.flexible);
  const totalFlexible = flexible.reduce((sum, value) => sum + value, 0);
  const surplus = usable - totalPreferred;
  return sizes.map((size, index) => (
    size.preferred + (totalFlexible > 0 ? surplus * flexible[index] / totalFlexible : 0)
  ));
}

function gridDimensions(
  content: Rect,
  layout: LayoutMetrics,
  count: number,
  cellWidth: number,
  cellHeight: number,
  spacingX: number,
  spacingY: number,
): { columns: number; rows: number } {
  const constraintCount = Math.max(1, Math.trunc(layout.constraintCount) || 1);
  if (layout.constraint === 'FixedRowCount') {
    const rows = Math.min(count, constraintCount);
    return { columns: Math.ceil(count / rows), rows };
  }
  if (layout.constraint !== 'Flexible') {
    const columns = Math.min(count, constraintCount);
    return { columns, rows: Math.ceil(count / columns) };
  }
  if (layout.startAxis === 'Vertical') {
    const step = cellHeight + spacingY;
    const rows = Math.max(1, Math.min(count, step > 0 ? Math.floor((content.h + spacingY) / step) : 1));
    return { columns: Math.ceil(count / rows), rows };
  }
  const step = cellWidth + spacingX;
  const columns = Math.max(1, Math.min(count, step > 0 ? Math.floor((content.w + spacingX) / step) : 1));
  return { columns, rows: Math.ceil(count / columns) };
}

export function layoutGroupChildRects(
  parent: Rect,
  layout: LayoutMetrics,
  children: LayoutChildMetrics[],
  scale = 1,
): Rect[] {
  if (children.length === 0) return [];
  const left = layout.padding[0] * scale;
  const top = layout.padding[1] * scale;
  const right = layout.padding[2] * scale;
  const bottom = layout.padding[3] * scale;
  const content: Rect = {
    x: parent.x + left,
    y: parent.y + top,
    w: Math.max(0, parent.w - left - right),
    h: Math.max(0, parent.h - top - bottom),
  };
  const spacingX = layout.spacing[0] * scale;
  const spacingY = layout.spacing[1] * scale;
  const [alignX, alignY] = alignmentFactors(layout.childAlignment);

  if (layout.direction === 'Grid') {
    const cellWidth = Math.max(0, layout.cellSize[0] * scale);
    const cellHeight = Math.max(0, layout.cellSize[1] * scale);
    const { columns, rows } = gridDimensions(
      content,
      layout,
      children.length,
      cellWidth,
      cellHeight,
      spacingX,
      spacingY,
    );
    const gridWidth = cellWidth * columns + spacingX * Math.max(0, columns - 1);
    const gridHeight = cellHeight * rows + spacingY * Math.max(0, rows - 1);
    const originX = content.x + (content.w - gridWidth) * alignX;
    const originY = content.y + (content.h - gridHeight) * alignY;
    const horizontal = layout.startAxis !== 'Vertical';
    const rightToLeft = String(layout.startCorner ?? 'UpperLeft').endsWith('Right');
    const bottomToTop = String(layout.startCorner ?? 'UpperLeft').startsWith('Lower');
    return children.map((_, index) => {
      let column = horizontal ? index % columns : Math.floor(index / rows);
      let row = horizontal ? Math.floor(index / columns) : index % rows;
      if (rightToLeft) column = columns - 1 - column;
      if (bottomToTop) row = rows - 1 - row;
      return {
        x: originX + column * (cellWidth + spacingX),
        y: originY + row * (cellHeight + spacingY),
        w: cellWidth,
        h: cellHeight,
      };
    });
  }

  const horizontal = layout.direction === 'Horizontal';
  const mainAxis: 0 | 1 = horizontal ? 0 : 1;
  const crossAxis: 0 | 1 = horizontal ? 1 : 0;
  const mainSpacing = horizontal ? spacingX : spacingY;
  const mainAvailable = horizontal ? content.w : content.h;
  const mainMetrics = children.map((child) => childAxisSizes(layout, child, mainAxis, scale));
  const controlMain = horizontal
    ? layout.childControlWidth !== false
    : layout.childControlHeight !== false;
  const expandMain = controlMain && (horizontal
    ? layout.childForceExpandWidth !== false
    : layout.childForceExpandHeight !== false);
  const mainSizes = axisSizes(mainAvailable, mainSpacing, mainMetrics, expandMain);
  const usedMain = mainSizes.reduce((sum, value) => sum + value, 0)
    + mainSpacing * Math.max(0, children.length - 1);
  const mainAlignment = horizontal ? alignX : alignY;
  let cursor = (horizontal ? content.x : content.y) + (mainAvailable - usedMain) * mainAlignment;
  const result = Array<Rect>(children.length);
  const order = children.map((_, index) => index);
  if (layout.reverseArrangement) order.reverse();
  for (const childIndex of order) {
    const child = children[childIndex];
    const mainSize = mainSizes[childIndex];
    const crossMetric = childAxisSizes(layout, child, crossAxis, scale);
    const controlCross = horizontal
      ? layout.childControlHeight !== false
      : layout.childControlWidth !== false;
    const expandCross = controlCross && (horizontal
      ? layout.childForceExpandHeight !== false
      : layout.childForceExpandWidth !== false);
    const crossAvailable = horizontal ? content.h : content.w;
    const crossSize = expandCross ? crossAvailable : Math.min(crossAvailable, crossMetric.preferred);
    const crossAlignment = horizontal ? alignY : alignX;
    const crossStart = (horizontal ? content.y : content.x)
      + (crossAvailable - crossSize) * crossAlignment;
    result[childIndex] = horizontal
      ? { x: cursor, y: crossStart, w: mainSize, h: crossSize }
      : { x: crossStart, y: cursor, w: crossSize, h: mainSize };
    cursor += mainSize + mainSpacing;
  }
  return result;
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
    y: rect.y + (rect.h - height) * (1 - pivot[1]),
    w: Math.max(0, width),
    h: Math.max(0, height),
  };
}
