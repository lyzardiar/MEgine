// Author: MiYu

import type { Rect } from './rectLayout';

export type ContentFitMode = 'Unconstrained' | 'MinSize' | 'PreferredSize';

export type LayoutMetrics = {
  direction: string;
  padding: [number, number, number, number];
  spacing: [number, number];
  wrap?: boolean;
  counterSpacing?: number;
  mainAxisDistribution?: string;
  counterAxisDistribution?: string;
  counterAxisAlignment?: string;
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
  gridColumns?: number;
  gridRows?: number;
  gridFitWidth?: boolean;
  gridFitHeight?: boolean;
};

export type LayoutChildMetrics = {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  preferredWidth?: number;
  preferredHeight?: number;
  flexibleWidth?: number;
  flexibleHeight?: number;
  baseline?: number;
  horizontalAlign?: string;
  verticalAlign?: string;
  gridColumn?: number;
  gridRow?: number;
  gridColumnSpan?: number;
  gridRowSpan?: number;
  gridHorizontalAlign?: string;
  gridVerticalAlign?: string;
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
  available?: [number, number],
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
  const spacingX = layout.spacing[0] * scale;
  const spacingY = layout.spacing[1] * scale;
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
  if (layout.wrap && layout.direction !== 'Grid' && available) {
    const horizontal = layout.direction === 'Horizontal';
    const mainAxis: 0 | 1 = horizontal ? 0 : 1;
    const crossAxis: 0 | 1 = horizontal ? 1 : 0;
    const mainAvailable = Math.max(0, available[mainAxis] - (horizontal ? left + right : top + bottom));
    const mainSpacing = horizontal ? spacingX : spacingY;
    const counterSpacing = Number.isFinite(layout.counterSpacing) && layout.counterSpacing! >= 0
      ? layout.counterSpacing! * scale
      : horizontal ? spacingY : spacingX;
    const tracks: LayoutChildMetrics[][] = [[]];
    let used = 0;
    for (const child of children) {
      const preferred = childAxisSizes(layout, child, mainAxis, scale).preferred;
      const track = tracks[tracks.length - 1];
      const next = track.length === 0 ? preferred : used + mainSpacing + preferred;
      if (track.length > 0 && next > mainAvailable + 0.0001) {
        tracks.push([child]);
        used = preferred;
      } else {
        track.push(child);
        used = next;
      }
    }
    const trackMain = tracks.map((track) => track.reduce(
      (sum, child, index) => sum + childAxisSizes(layout, child, mainAxis, scale).preferred
        + (index === 0 ? 0 : mainSpacing),
      0,
    ));
    const trackCross = tracks.map((track) => Math.max(
      0,
      ...track.map((child) => childAxisSizes(layout, child, crossAxis, scale).preferred),
    ));
    const preferredMain = Math.max(0, ...trackMain);
    const preferredCross = trackCross.reduce((sum, value) => sum + value, 0)
      + counterSpacing * Math.max(0, tracks.length - 1);
    const minMain = Math.max(0, ...children.map((child) => childAxisSizes(layout, child, mainAxis, scale).min));
    const minCross = Math.max(0, ...children.map((child) => childAxisSizes(layout, child, crossAxis, scale).min));
    return horizontal
      ? {
          minWidth: minWidth + minMain,
          minHeight: minHeight + minCross,
          preferredWidth: minWidth + preferredMain,
          preferredHeight: minHeight + preferredCross,
          flexibleWidth: combinedFlexible(layout, children.map((child) => childAxisSizes(layout, child, 0, scale)), 0, true),
          flexibleHeight: combinedFlexible(layout, children.map((child) => childAxisSizes(layout, child, 1, scale)), 1, false),
        }
      : {
          minWidth: minWidth + minCross,
          minHeight: minHeight + minMain,
          preferredWidth: minWidth + preferredCross,
          preferredHeight: minHeight + preferredMain,
          flexibleWidth: combinedFlexible(layout, children.map((child) => childAxisSizes(layout, child, 0, scale)), 0, false),
          flexibleHeight: combinedFlexible(layout, children.map((child) => childAxisSizes(layout, child, 1, scale)), 1, true),
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
): { min: number; preferred: number; flexible: number; max: number } {
  const control = axis === 0
    ? layout.childControlWidth !== false
    : layout.childControlHeight !== false;
  const useScale = axis === 0 ? layout.useChildScaleWidth === true : layout.useChildScaleHeight === true;
  const authored = axis === 0 ? child.width : child.height;
  const fallback = control ? layout.cellSize[axis] : authored;
  const rawMin = axis === 0 ? child.minWidth : child.minHeight;
  const rawPreferred = axis === 0 ? child.preferredWidth : child.preferredHeight;
  const rawFlexible = axis === 0 ? child.flexibleWidth : child.flexibleHeight;
  const rawMax = axis === 0 ? child.maxWidth : child.maxHeight;
  const childScale = useScale
    ? finiteNonNegative(axis === 0 ? child.scaleWidth : child.scaleHeight, 1)
    : 1;
  const min = control ? finiteNonNegative(rawMin, 0) : finiteNonNegative(authored, 0);
  const scaledMin = min * scale * childScale;
  const max = control && Number.isFinite(rawMax) && rawMax! >= 0
    ? Math.max(scaledMin, rawMax! * scale * childScale)
    : Number.POSITIVE_INFINITY;
  const preferred = control
    ? Math.max(min, finiteNonNegative(rawPreferred, fallback))
    : min;
  return {
    min: scaledMin,
    preferred: Math.min(max, preferred * scale * childScale),
    flexible: control ? finiteNonNegative(rawFlexible, 0) : 0,
    max,
  };
}

function alignmentFactors(alignment: string | undefined): [number, number] {
  const value = String(alignment ?? 'UpperLeft');
  const x = value.endsWith('Center') ? 0.5 : value.endsWith('Right') ? 1 : 0;
  const y = value.startsWith('Middle') ? 0.5 : value.startsWith('Lower') ? 1 : 0;
  return [x, y];
}

function preferredGridDimensions(layout: LayoutMetrics, count: number): { columns: number; rows: number } {
  const authoredColumns = Math.max(0, Math.trunc(layout.gridColumns ?? 0));
  const authoredRows = Math.max(0, Math.trunc(layout.gridRows ?? 0));
  if (authoredColumns > 0 || authoredRows > 0) {
    const columns = authoredColumns || Math.max(1, Math.ceil(count / authoredRows));
    const rows = authoredRows || Math.max(1, Math.ceil(count / columns));
    return { columns, rows };
  }
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
  sizes: Array<{ min: number; preferred: number; flexible: number; max: number }>,
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
  const result = sizes.map((size) => size.preferred);
  let remaining = usable - totalPreferred;
  let active = sizes
    .map((size, index) => ({
      index,
      weight: forceExpand ? Math.max(1, size.flexible) : size.flexible,
    }))
    .filter((entry) => entry.weight > 0 && result[entry.index] < sizes[entry.index].max);
  while (remaining > 0.0001 && active.length > 0) {
    const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0);
    let consumed = 0;
    for (const entry of active) {
      const room = sizes[entry.index].max - result[entry.index];
      const addition = Math.min(room, remaining * entry.weight / totalWeight);
      result[entry.index] += addition;
      consumed += addition;
    }
    if (consumed <= 0.0001) break;
    remaining -= consumed;
    active = active.filter((entry) => result[entry.index] + 0.0001 < sizes[entry.index].max);
  }
  return result;
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
  const authoredColumns = Math.max(0, Math.trunc(layout.gridColumns ?? 0));
  const authoredRows = Math.max(0, Math.trunc(layout.gridRows ?? 0));
  if (authoredColumns > 0 || authoredRows > 0) {
    const columns = authoredColumns || Math.max(1, Math.ceil(count / authoredRows));
    const rows = authoredRows || Math.max(1, Math.ceil(count / columns));
    return { columns, rows };
  }
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
    let { columns, rows } = gridDimensions(
      content,
      layout,
      children.length,
      Math.max(0, layout.cellSize[0] * scale),
      Math.max(0, layout.cellSize[1] * scale),
      spacingX,
      spacingY,
    );
    children.forEach((child) => {
      if (Number.isFinite(child.gridColumn) && child.gridColumn! >= 0) {
        columns = Math.max(columns, Math.trunc(child.gridColumn!) + Math.max(1, Math.trunc(child.gridColumnSpan ?? 1)));
      }
      if (Number.isFinite(child.gridRow) && child.gridRow! >= 0) {
        rows = Math.max(rows, Math.trunc(child.gridRow!) + Math.max(1, Math.trunc(child.gridRowSpan ?? 1)));
      }
    });
    const cellWidth = layout.gridFitWidth
      ? Math.max(0, (content.w - spacingX * Math.max(0, columns - 1)) / columns)
      : Math.max(0, layout.cellSize[0] * scale);
    const cellHeight = layout.gridFitHeight
      ? Math.max(0, (content.h - spacingY * Math.max(0, rows - 1)) / rows)
      : Math.max(0, layout.cellSize[1] * scale);
    const gridWidth = cellWidth * columns + spacingX * Math.max(0, columns - 1);
    const gridHeight = cellHeight * rows + spacingY * Math.max(0, rows - 1);
    const originX = content.x + (content.w - gridWidth) * alignX;
    const originY = content.y + (content.h - gridHeight) * alignY;
    const horizontal = layout.startAxis !== 'Vertical';
    const rightToLeft = String(layout.startCorner ?? 'UpperLeft').endsWith('Right');
    const bottomToTop = String(layout.startCorner ?? 'UpperLeft').startsWith('Lower');
    return children.map((child, index) => {
      const explicitColumn = Number.isFinite(child.gridColumn) && child.gridColumn! >= 0;
      const explicitRow = Number.isFinite(child.gridRow) && child.gridRow! >= 0;
      let column = explicitColumn ? Math.trunc(child.gridColumn!) : horizontal ? index % columns : Math.floor(index / rows);
      let row = explicitRow ? Math.trunc(child.gridRow!) : horizontal ? Math.floor(index / columns) : index % rows;
      const columnSpan = Math.min(columns - column, Math.max(1, Math.trunc(child.gridColumnSpan ?? 1)));
      const rowSpan = Math.min(rows - row, Math.max(1, Math.trunc(child.gridRowSpan ?? 1)));
      if (!explicitColumn && rightToLeft) column = columns - column - columnSpan;
      if (!explicitRow && bottomToTop) row = rows - row - rowSpan;
      const area: Rect = {
        x: originX + column * (cellWidth + spacingX),
        y: originY + row * (cellHeight + spacingY),
        w: cellWidth * columnSpan + spacingX * Math.max(0, columnSpan - 1),
        h: cellHeight * rowSpan + spacingY * Math.max(0, rowSpan - 1),
      };
      const width = childAxisSizes(layout, child, 0, scale);
      const height = childAxisSizes(layout, child, 1, scale);
      const horizontalAlign = String(child.gridHorizontalAlign ?? 'Auto');
      const verticalAlign = String(child.gridVerticalAlign ?? 'Auto');
      const resolvedWidth = horizontalAlign === 'Stretch' || width.flexible > 0
        ? area.w
        : Math.min(area.w, width.preferred);
      const resolvedHeight = verticalAlign === 'Stretch' || height.flexible > 0
        ? area.h
        : Math.min(area.h, height.preferred);
      const childAlignX = horizontalAlign === 'Center'
        ? 0.5
        : horizontalAlign === 'Max' ? 1 : horizontalAlign === 'Auto' ? alignX : 0;
      const childAlignY = verticalAlign === 'Center'
        ? 0.5
        : verticalAlign === 'Max' ? 1 : verticalAlign === 'Auto' ? alignY : 0;
      return {
        x: area.x + (area.w - resolvedWidth) * childAlignX,
        y: area.y + (area.h - resolvedHeight) * childAlignY,
        w: resolvedWidth,
        h: resolvedHeight,
      };
    });
  }

  const horizontal = layout.direction === 'Horizontal';
  const mainAxis: 0 | 1 = horizontal ? 0 : 1;
  const crossAxis: 0 | 1 = horizontal ? 1 : 0;
  const mainSpacing = horizontal ? spacingX : spacingY;
  const mainAvailable = horizontal ? content.w : content.h;
  const controlMain = horizontal
    ? layout.childControlWidth !== false
    : layout.childControlHeight !== false;
  const expandMain = controlMain && (horizontal
    ? layout.childForceExpandWidth !== false
    : layout.childForceExpandHeight !== false);
  const mainAlignment = horizontal ? alignX : alignY;
  const result = Array<Rect>(children.length);
  const order = children.map((_, index) => index);
  if (layout.reverseArrangement) order.reverse();
  const mainMetric = (index: number) => childAxisSizes(layout, children[index], mainAxis, scale);
  const tracks: number[][] = [[]];
  let trackPreferred = 0;
  for (const childIndex of order) {
    const preferred = mainMetric(childIndex).preferred;
    const track = tracks[tracks.length - 1];
    const next = track.length === 0 ? preferred : trackPreferred + mainSpacing + preferred;
    if (layout.wrap && track.length > 0 && next > mainAvailable + 0.0001) {
      tracks.push([childIndex]);
      trackPreferred = preferred;
    } else {
      track.push(childIndex);
      trackPreferred = next;
    }
  }
  const crossAvailable = horizontal ? content.h : content.w;
  const crossMetric = (index: number) => childAxisSizes(layout, children[index], crossAxis, scale);
  const baselineAlignment = layout.counterAxisAlignment === 'Baseline' && horizontal;
  const trackCrossSizes = tracks.map((track) => {
    if (!layout.wrap) return crossAvailable;
    if (baselineAlignment) {
      const baselines = track.map((index) => Math.min(
        crossMetric(index).preferred,
        finiteNonNegative(children[index].baseline, crossMetric(index).preferred * 0.8) * scale,
      ));
      const ascent = Math.max(0, ...baselines);
      const descent = Math.max(0, ...track.map((index, item) => crossMetric(index).preferred - baselines[item]));
      return Math.min(crossAvailable, ascent + descent);
    }
    return Math.min(crossAvailable, Math.max(0, ...track.map((index) => crossMetric(index).preferred)));
  });
  const rawCounterSpacing = Number.isFinite(layout.counterSpacing) && layout.counterSpacing! >= 0
    ? layout.counterSpacing! * scale
    : horizontal ? spacingY : spacingX;
  let counterSpacing = rawCounterSpacing;
  let usedCross = trackCrossSizes.reduce((sum, value) => sum + value, 0)
    + counterSpacing * Math.max(0, tracks.length - 1);
  if (layout.counterAxisDistribution === 'SpaceBetween' && tracks.length > 1 && usedCross < crossAvailable) {
    counterSpacing += (crossAvailable - usedCross) / (tracks.length - 1);
    usedCross = crossAvailable;
  }
  let trackCursor = horizontal ? content.y : content.x;
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];
    const metrics = track.map(mainMetric);
    const mainSizes = axisSizes(mainAvailable, mainSpacing, metrics, expandMain);
    let effectiveSpacing = mainSpacing;
    let usedMain = mainSizes.reduce((sum, value) => sum + value, 0)
      + effectiveSpacing * Math.max(0, track.length - 1);
    if (layout.mainAxisDistribution === 'SpaceBetween' && track.length > 1 && usedMain < mainAvailable) {
      effectiveSpacing += (mainAvailable - usedMain) / (track.length - 1);
      usedMain = mainAvailable;
    }
    let cursor = (horizontal ? content.x : content.y)
      + (mainAvailable - usedMain) * mainAlignment;
    const trackCross = trackCrossSizes[trackIndex];
    const trackBaseline = baselineAlignment
      ? Math.max(0, ...track.map((index) => Math.min(
          crossMetric(index).preferred,
          finiteNonNegative(children[index].baseline, crossMetric(index).preferred * 0.8) * scale,
        )))
      : 0;
    for (let item = 0; item < track.length; item += 1) {
      const childIndex = track[item];
      const metric = crossMetric(childIndex);
      const controlCross = horizontal
        ? layout.childControlHeight !== false
        : layout.childControlWidth !== false;
      const forceExpandCross = horizontal
        ? layout.childForceExpandHeight !== false
        : layout.childForceExpandWidth !== false;
      const childAxisAlignment = String(horizontal
        ? children[childIndex].verticalAlign ?? 'Auto'
        : children[childIndex].horizontalAlign ?? 'Auto');
      const expandCross = controlCross
        && (childAxisAlignment === 'Stretch' || forceExpandCross || metric.flexible > 0);
      const size = expandCross
        ? Math.min(trackCross, metric.max)
        : Math.min(trackCross, metric.preferred);
      const defaultCrossAlignment = horizontal ? alignY : alignX;
      const crossAlignment = childAxisAlignment === 'Center'
        ? 0.5
        : childAxisAlignment === 'Max' ? 1 : childAxisAlignment === 'Min' ? 0 : defaultCrossAlignment;
      const baseline = Math.min(
        size,
        finiteNonNegative(children[childIndex].baseline, size * 0.8) * scale,
      );
      const crossStart = baselineAlignment && childAxisAlignment === 'Auto'
        ? trackCursor + trackBaseline - baseline
        : trackCursor + (trackCross - size) * crossAlignment;
      result[childIndex] = horizontal
        ? { x: cursor, y: crossStart, w: mainSizes[item], h: size }
        : { x: crossStart, y: cursor, w: size, h: mainSizes[item] };
      cursor += mainSizes[item] + effectiveSpacing;
    }
    trackCursor += trackCross + counterSpacing;
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
