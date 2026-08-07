import type { CanvasArtboardPreset } from '../canvasWorkspace.ts';

export type CanvasWorkspaceFitMode = 'all' | 'active' | 'custom';

export type CanvasArtboardFrame = CanvasArtboardPreset & {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  active: boolean;
};

export type CanvasArtboardLayout = {
  scale: number;
  frames: CanvasArtboardFrame[];
};

const PADDING = 28;
const GAP = 36;
const LABEL_HEIGHT = 24;

export function normalizeCanvasWorkspaceScale(value: number): number {
  return Number.isFinite(value) ? Math.max(0.03, Math.min(8, value)) : 1;
}

function gridMetrics(artboards: readonly CanvasArtboardPreset[], scale: number) {
  const columns = Math.max(1, Math.min(3, artboards.length));
  const rows = Math.ceil(artboards.length / columns);
  const columnWidths = Array.from({ length: columns }, () => 0);
  const rowHeights = Array.from({ length: rows }, () => 0);
  artboards.forEach((artboard, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    columnWidths[column] = Math.max(columnWidths[column], artboard.width * scale);
    rowHeights[row] = Math.max(rowHeights[row], artboard.height * scale + LABEL_HEIGHT);
  });
  const width = columnWidths.reduce((sum, value) => sum + value, 0)
    + GAP * Math.max(0, columns - 1);
  const height = rowHeights.reduce((sum, value) => sum + value, 0)
    + GAP * Math.max(0, rows - 1);
  return { columns, columnWidths, rowHeights, width, height };
}

function fitAllScale(
  viewportWidth: number,
  viewportHeight: number,
  artboards: readonly CanvasArtboardPreset[],
): number {
  const columns = Math.max(1, Math.min(3, artboards.length));
  const rows = Math.ceil(artboards.length / columns);
  const rawColumnWidths = Array.from({ length: columns }, () => 0);
  const rawRowHeights = Array.from({ length: rows }, () => 0);
  artboards.forEach((artboard, index) => {
    rawColumnWidths[index % columns] = Math.max(
      rawColumnWidths[index % columns],
      artboard.width,
    );
    rawRowHeights[Math.floor(index / columns)] = Math.max(
      rawRowHeights[Math.floor(index / columns)],
      artboard.height,
    );
  });
  const availableWidth = Math.max(1, viewportWidth - PADDING * 2 - GAP * (columns - 1));
  const availableHeight = Math.max(
    1,
    viewportHeight - PADDING * 2 - GAP * (rows - 1) - LABEL_HEIGHT * rows,
  );
  return normalizeCanvasWorkspaceScale(Math.min(
    availableWidth / Math.max(1, rawColumnWidths.reduce((sum, value) => sum + value, 0)),
    availableHeight / Math.max(1, rawRowHeights.reduce((sum, value) => sum + value, 0)),
  ));
}

function activeScale(
  viewportWidth: number,
  viewportHeight: number,
  active: CanvasArtboardPreset,
): number {
  return normalizeCanvasWorkspaceScale(Math.min(
    Math.max(1, viewportWidth - PADDING * 2) / active.width,
    Math.max(1, viewportHeight - PADDING * 2 - LABEL_HEIGHT) / active.height,
  ));
}

export function layoutCanvasArtboards(options: {
  viewportWidth: number;
  viewportHeight: number;
  artboards: readonly CanvasArtboardPreset[];
  activeKey: string;
  fitMode: CanvasWorkspaceFitMode;
  customScale: number;
  pan: [number, number];
}): CanvasArtboardLayout {
  const artboards = options.artboards.slice(0, 6);
  if (artboards.length === 0) return { scale: 1, frames: [] };
  const active = artboards.find((artboard) => artboard.key === options.activeKey)
    ?? artboards[0];
  const scale = options.fitMode === 'all'
    ? fitAllScale(options.viewportWidth, options.viewportHeight, artboards)
    : options.fitMode === 'active'
      ? activeScale(options.viewportWidth, options.viewportHeight, active)
      : normalizeCanvasWorkspaceScale(options.customScale);
  const metrics = gridMetrics(artboards, scale);
  const columnOffsets: number[] = [];
  const rowOffsets: number[] = [];
  let cursor = 0;
  for (const width of metrics.columnWidths) {
    columnOffsets.push(cursor);
    cursor += width + GAP;
  }
  cursor = 0;
  for (const height of metrics.rowHeights) {
    rowOffsets.push(cursor);
    cursor += height + GAP;
  }
  const localFrames = artboards.map((artboard, index) => {
    const column = index % metrics.columns;
    const row = Math.floor(index / metrics.columns);
    const w = artboard.width * scale;
    const h = artboard.height * scale;
    return {
      ...artboard,
      x: columnOffsets[column] + (metrics.columnWidths[column] - w) * 0.5,
      y: rowOffsets[row] + LABEL_HEIGHT,
      w,
      h,
      scale,
      active: artboard.key === active.key,
    };
  });
  const localActive = localFrames.find((frame) => frame.active) ?? localFrames[0];
  const centerX = options.fitMode === 'all'
    ? metrics.width * 0.5
    : localActive.x + localActive.w * 0.5;
  const centerY = options.fitMode === 'all'
    ? metrics.height * 0.5
    : localActive.y + localActive.h * 0.5;
  const pan = options.fitMode === 'custom' ? options.pan : [0, 0];
  const offsetX = options.viewportWidth * 0.5 - centerX + pan[0];
  const offsetY = options.viewportHeight * 0.5 - centerY + pan[1];
  return {
    scale,
    frames: localFrames.map((frame) => ({
      ...frame,
      x: frame.x + offsetX,
      y: frame.y + offsetY,
    })),
  };
}

export function artboardFrameAt(
  frames: readonly CanvasArtboardFrame[],
  x: number,
  y: number,
): CanvasArtboardFrame | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (
      x >= frame.x
      && x <= frame.x + frame.w
      && y >= frame.y - LABEL_HEIGHT
      && y <= frame.y + frame.h
    ) return frame;
  }
  return null;
}

export function artboardFrameVisible(
  frame: CanvasArtboardFrame,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return frame.x + frame.w >= 0
    && frame.y + frame.h >= 0
    && frame.x <= viewportWidth
    && frame.y <= viewportHeight;
}
