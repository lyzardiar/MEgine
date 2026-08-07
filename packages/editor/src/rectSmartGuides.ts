export type GuideRect = { x: number; y: number; w: number; h: number };

export type RectSmartGuide = {
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
  kind?: 'gap';
  distance?: number;
};

export type RectSmartSnap = {
  offset: { x: number; y: number };
  guides: RectSmartGuide[];
};

type Match = { adjustment: number; position: number; rect: GuideRect };
type GapMatch = { adjustment: number; guide: RectSmartGuide };

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

function overlap(
  left: GuideRect,
  right: GuideRect,
  axis: 'x' | 'y',
): boolean {
  return axis === 'x'
    ? Math.min(left.y + left.h, right.y + right.h) > Math.max(left.y, right.y)
    : Math.min(left.x + left.w, right.x + right.w) > Math.max(left.x, right.x);
}

function bestGapMatch(
  moving: GuideRect,
  candidates: GuideRect[],
  axis: 'x' | 'y',
  threshold: number,
  screenScale: number,
): GapMatch | null {
  let best: GapMatch | null = null;
  const start = (rect: GuideRect) => axis === 'x' ? rect.x : rect.y;
  const size = (rect: GuideRect) => axis === 'x' ? rect.w : rect.h;
  const end = (rect: GuideRect) => start(rect) + size(rect);
  const crossCenter = (rect: GuideRect) => axis === 'x'
    ? rect.y + rect.h * 0.5
    : rect.x + rect.w * 0.5;
  const accept = (targetStart: number, gapFrom: number, gapTo: number, cross: number) => {
    const adjustment = targetStart - start(moving);
    if (Math.abs(adjustment) > threshold) return;
    const distance = Math.max(0, gapTo - gapFrom);
    const guide: RectSmartGuide = axis === 'x'
      ? {
          kind: 'gap', axis, position: cross, from: gapFrom, to: gapTo,
          distance: Math.round(distance / screenScale),
        }
      : {
          kind: 'gap', axis, position: cross, from: gapFrom, to: gapTo,
          distance: Math.round(distance / screenScale),
        };
    if (!best || Math.abs(adjustment) < Math.abs(best.adjustment)) {
      best = { adjustment, guide };
    }
  };

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      let left = candidates[leftIndex];
      let right = candidates[rightIndex];
      if (start(right) < start(left)) [left, right] = [right, left];
      if (!overlap(left, right, axis) || end(left) > start(right)) continue;
      const existingGap = start(right) - end(left);
      if (existingGap <= 0) continue;
      const cross = (crossCenter(left) + crossCenter(right)) * 0.5;

      accept(start(left) - existingGap - size(moving), start(left) - existingGap, start(left), cross);
      accept(end(right) + existingGap, end(right), end(right) + existingGap, cross);

      const available = start(right) - end(left) - size(moving);
      if (available >= 0) {
        const equalGap = available * 0.5;
        const targetStart = end(left) + equalGap;
        accept(targetStart, end(left), targetStart, cross);
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
  threshold = 8,
  screenScale = 1,
): RectSmartSnap {
  const moved: GuideRect = {
    ...startRect,
    x: startRect.x + desiredOffset.x,
    y: startRect.y + desiredOffset.y,
  };
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : 8;
  const safeScale = Number.isFinite(screenScale) && screenScale > 0 ? screenScale : 1;
  const xAlignment = bestMatch(moved, candidates, 'x', safeThreshold);
  const yAlignment = bestMatch(moved, candidates, 'y', safeThreshold);
  const xGap = bestGapMatch(moved, candidates, 'x', safeThreshold, safeScale);
  const yGap = bestGapMatch(moved, candidates, 'y', safeThreshold, safeScale);
  const xMatch = xGap && (!xAlignment || Math.abs(xGap.adjustment) < Math.abs(xAlignment.adjustment))
    ? xGap
    : xAlignment;
  const yMatch = yGap && (!yAlignment || Math.abs(yGap.adjustment) < Math.abs(yAlignment.adjustment))
    ? yGap
    : yAlignment;
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
  if (xMatch && 'guide' in xMatch) {
    guides.push(xMatch.guide);
  } else if (xMatch) {
    guides.push({
      axis: 'x',
      position: xMatch.position,
      from: Math.min(snappedRect.y, xMatch.rect.y),
      to: Math.max(snappedRect.y + snappedRect.h, xMatch.rect.y + xMatch.rect.h),
    });
  }
  if (yMatch && 'guide' in yMatch) {
    guides.push(yMatch.guide);
  } else if (yMatch) {
    guides.push({
      axis: 'y',
      position: yMatch.position,
      from: Math.min(snappedRect.x, yMatch.rect.x),
      to: Math.max(snappedRect.x + snappedRect.w, yMatch.rect.x + yMatch.rect.w),
    });
  }
  return { offset, guides };
}
