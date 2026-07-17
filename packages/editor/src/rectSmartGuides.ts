export type GuideRect = { x: number; y: number; w: number; h: number };

export type RectSmartGuide = {
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
};

export type RectSmartSnap = {
  offset: { x: number; y: number };
  guides: RectSmartGuide[];
};

type Match = { adjustment: number; position: number; rect: GuideRect };

function points(rect: GuideRect, axis: 'x' | 'y'): number[] {
  return axis === 'x'
    ? [rect.x, rect.x + rect.w / 2, rect.x + rect.w]
    : [rect.y, rect.y + rect.h / 2, rect.y + rect.h];
}

function bestMatch(
  moving: GuideRect,
  candidates: GuideRect[],
  axis: 'x' | 'y',
  threshold: number,
): Match | null {
  let best: Match | null = null;
  for (const candidate of candidates) {
    for (const source of points(moving, axis)) {
      for (const target of points(candidate, axis)) {
        const adjustment = target - source;
        if (Math.abs(adjustment) > threshold) continue;
        if (!best || Math.abs(adjustment) < Math.abs(best.adjustment)) {
          best = { adjustment, position: target, rect: candidate };
        }
      }
    }
  }
  return best;
}

export function rectBounds(rects: GuideRect[]): GuideRect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function snapRectToGuides(
  startRect: GuideRect,
  candidates: GuideRect[],
  desiredOffset: { x: number; y: number },
  threshold = 6,
): RectSmartSnap {
  const moved: GuideRect = {
    ...startRect,
    x: startRect.x + desiredOffset.x,
    y: startRect.y + desiredOffset.y,
  };
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 6;
  const xMatch = bestMatch(moved, candidates, 'x', safeThreshold);
  const yMatch = bestMatch(moved, candidates, 'y', safeThreshold);
  const offset = {
    x: desiredOffset.x + (xMatch?.adjustment ?? 0),
    y: desiredOffset.y + (yMatch?.adjustment ?? 0),
  };
  const snappedRect = {
    ...startRect,
    x: startRect.x + offset.x,
    y: startRect.y + offset.y,
  };
  const guides: RectSmartGuide[] = [];
  if (xMatch) {
    guides.push({
      axis: 'x',
      position: xMatch.position,
      from: Math.min(snappedRect.y, xMatch.rect.y),
      to: Math.max(snappedRect.y + snappedRect.h, xMatch.rect.y + xMatch.rect.h),
    });
  }
  if (yMatch) {
    guides.push({
      axis: 'y',
      position: yMatch.position,
      from: Math.min(snappedRect.x, yMatch.rect.x),
      to: Math.max(snappedRect.x + snappedRect.w, yMatch.rect.x + yMatch.rect.w),
    });
  }
  return { offset, guides };
}
