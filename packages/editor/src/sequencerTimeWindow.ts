export interface SequencerTimeWindow {
  visibleStart: number;
  visibleEnd: number;
  renderStart: number;
  renderEnd: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function sequencerTimeWindow(
  duration: number,
  laneWidth: number,
  scrollLeft: number,
  visibleLaneWidth: number,
  overscanScreens = 0.5,
): SequencerTimeWindow {
  const safeDuration = Math.max(0, finiteOr(duration, 0));
  if (safeDuration === 0) {
    return { visibleStart: 0, visibleEnd: 0, renderStart: 0, renderEnd: 0 };
  }
  const safeLaneWidth = Math.max(1, finiteOr(laneWidth, 1));
  const safeVisibleWidth = Math.max(1, Math.min(safeLaneWidth, finiteOr(visibleLaneWidth, safeLaneWidth)));
  const maximumScroll = Math.max(0, safeLaneWidth - safeVisibleWidth);
  const safeScroll = Math.max(0, Math.min(maximumScroll, finiteOr(scrollLeft, 0)));
  const visibleStart = safeDuration * safeScroll / safeLaneWidth;
  const visibleEnd = safeDuration * Math.min(safeLaneWidth, safeScroll + safeVisibleWidth) / safeLaneWidth;
  const visibleSpan = Math.max(0, visibleEnd - visibleStart);
  const overscan = visibleSpan * Math.max(0, Math.min(2, finiteOr(overscanScreens, 0.5)));
  return {
    visibleStart,
    visibleEnd,
    renderStart: Math.max(0, visibleStart - overscan),
    renderEnd: Math.min(safeDuration, visibleEnd + overscan),
  };
}

export function sequencerPointInTimeWindow(
  time: number,
  window: Pick<SequencerTimeWindow, 'renderStart' | 'renderEnd'>,
): boolean {
  return Number.isFinite(time)
    && time >= window.renderStart
    && time <= window.renderEnd;
}

export function sequencerSpanIntersectsTimeWindow(
  start: number,
  duration: number,
  window: Pick<SequencerTimeWindow, 'renderStart' | 'renderEnd'>,
): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 0) return false;
  return start <= window.renderEnd && start + duration >= window.renderStart;
}

export interface SequencerWindowedItem<T> {
  item: T;
  sourceIndex: number;
}

export interface SequencerSampledItems<T> {
  items: readonly T[];
  total: number;
  truncated: boolean;
}

export function sequencerSampleItems<T>(
  items: readonly T[],
  maximum: number,
): SequencerSampledItems<T> {
  const limit = Number.isFinite(maximum) ? Math.max(0, Math.floor(maximum)) : 0;
  if (items.length <= limit) return { items, total: items.length, truncated: false };
  if (limit === 0) return { items: [], total: items.length, truncated: items.length > 0 };
  if (limit === 1) return { items: [items[0]], total: items.length, truncated: true };
  const sampled: T[] = [];
  for (let slot = 0; slot < limit; slot += 1) {
    const index = Math.round(slot * (items.length - 1) / (limit - 1));
    sampled.push(items[index]);
  }
  return { items: sampled, total: items.length, truncated: true };
}

export function sequencerWindowedPoints<T>(
  items: readonly T[],
  timeOf: (item: T) => number,
  window: Pick<SequencerTimeWindow, 'renderStart' | 'renderEnd'>,
): SequencerWindowedItem<T>[] {
  const output: SequencerWindowedItem<T>[] = [];
  items.forEach((item, sourceIndex) => {
    if (sequencerPointInTimeWindow(timeOf(item), window)) output.push({ item, sourceIndex });
  });
  return output;
}

export function sequencerWindowedSpans<T>(
  items: readonly T[],
  spanOf: (item: T) => { start: number; duration: number },
  window: Pick<SequencerTimeWindow, 'renderStart' | 'renderEnd'>,
): SequencerWindowedItem<T>[] {
  const output: SequencerWindowedItem<T>[] = [];
  items.forEach((item, sourceIndex) => {
    const span = spanOf(item);
    if (sequencerSpanIntersectsTimeWindow(span.start, span.duration, window)) {
      output.push({ item, sourceIndex });
    }
  });
  return output;
}
