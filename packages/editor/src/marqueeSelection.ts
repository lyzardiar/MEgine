export type MarqueeRect = { x: number; y: number; w: number; h: number };

export type MarqueeItem = {
  entity: number;
  role: 'canvas' | 'graphic';
  rect: MarqueeRect;
  rotation?: number;
  pivot?: [number, number];
  pivotScreen?: { x: number; y: number };
};

export type MarqueeSelectionMode = 'replace' | 'add' | 'toggle';

export function normalizeMarquee(x1: number, y1: number, x2: number, y2: number): MarqueeRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

function itemBounds(item: MarqueeItem): MarqueeRect {
  const rotation = Number(item.rotation) || 0;
  if (Math.abs(rotation) < 1e-6) return item.rect;
  const pivot = item.pivot ?? [0.5, 0.5];
  const origin = item.pivotScreen ?? {
    x: item.rect.x + item.rect.w * pivot[0],
    y: item.rect.y + item.rect.h * pivot[1],
  };
  const radians = rotation * Math.PI / 180;
  const xAxis = { x: Math.cos(radians), y: -Math.sin(radians) };
  const yAxis = { x: -Math.sin(radians), y: -Math.cos(radians) };
  const left = -item.rect.w * pivot[0];
  const right = item.rect.w * (1 - pivot[0]);
  const top = item.rect.h * pivot[1];
  const bottom = -item.rect.h * (1 - pivot[1]);
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ].map(([x, y]) => ({
    x: origin.x + x * xAxis.x + y * yAxis.x,
    y: origin.y + x * xAxis.y + y * yAxis.y,
  }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return normalizeMarquee(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

function intersects(a: MarqueeRect, b: MarqueeRect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function marqueeHitIds(items: MarqueeItem[], marquee: MarqueeRect): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const item of items) {
    if (item.role !== 'graphic' || seen.has(item.entity)) continue;
    if (!intersects(marquee, itemBounds(item))) continue;
    seen.add(item.entity);
    result.push(item.entity);
  }
  return result;
}

export function combineMarqueeSelection(
  current: number[],
  hits: number[],
  mode: MarqueeSelectionMode,
): number[] {
  const uniqueHits = [...new Set(hits)];
  if (mode === 'replace') return uniqueHits;
  const result = [...new Set(current)];
  if (mode === 'add') {
    for (const id of uniqueHits) if (!result.includes(id)) result.push(id);
    return result;
  }
  for (const id of uniqueHits) {
    const index = result.indexOf(id);
    if (index >= 0) result.splice(index, 1);
    else result.push(id);
  }
  return result;
}
