export type SceneGridLine = {
  position: number;
  major: boolean;
};

export type SceneGrid = {
  spacing: number;
  logicalSpacing: number;
  vertical: SceneGridLine[];
  horizontal: SceneGridLine[];
};

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Keeps the grid readable while preserving the snap lattice. When zoomed out we
 * hide intermediate snap lines instead of moving the visible lines off-grid.
 */
export function adaptiveSceneGridSpacing(
  logicalStep: number,
  screenScale: number,
  minimumScreenSpacing = 8,
): { logicalSpacing: number; screenSpacing: number; skippedSteps: number } {
  const step = finitePositive(logicalStep, 10);
  const scale = finitePositive(screenScale, 1);
  const minimum = finitePositive(minimumScreenSpacing, 8);
  let skippedSteps = 1;
  let screenSpacing = step * scale;
  while (screenSpacing < minimum && skippedSteps < 4096) {
    skippedSteps *= 2;
    screenSpacing *= 2;
  }
  return {
    logicalSpacing: step * skippedSteps,
    screenSpacing,
    skippedSteps,
  };
}

export function buildSceneGridAxis(
  start: number,
  length: number,
  spacing: number,
  majorEvery = 5,
  maxLines = 2048,
): SceneGridLine[] {
  if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) return [];
  const safeSpacing = finitePositive(spacing, 8);
  const safeMajorEvery = Math.max(1, Math.floor(finitePositive(majorEvery, 5)));
  const count = Math.min(maxLines, Math.floor(length / safeSpacing) + 1);
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    position: start + index * safeSpacing,
    major: index % safeMajorEvery === 0,
  }));
}

export function buildSceneGrid(
  rect: { x: number; y: number; w: number; h: number },
  logicalStep: number,
  screenScale: number,
): SceneGrid {
  const adaptive = adaptiveSceneGridSpacing(logicalStep, screenScale);
  return {
    spacing: adaptive.screenSpacing,
    logicalSpacing: adaptive.logicalSpacing,
    vertical: buildSceneGridAxis(rect.x, rect.w, adaptive.screenSpacing),
    horizontal: buildSceneGridAxis(rect.y, rect.h, adaptive.screenSpacing),
  };
}
