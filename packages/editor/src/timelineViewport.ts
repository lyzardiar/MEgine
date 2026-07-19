export function revealTimelineTimeScroll(
  scrollLeft: number,
  clientWidth: number,
  contentWidth: number,
  time: number,
  duration: number,
  requestedMargin = 32,
): number {
  const width = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
  const content = Number.isFinite(contentWidth) ? Math.max(width, contentWidth) : width;
  const maximum = Math.max(0, content - width);
  const current = Number.isFinite(scrollLeft) ? Math.max(0, Math.min(maximum, scrollLeft)) : 0;
  if (!(width > 0) || !(duration > 0) || !Number.isFinite(time)) return current;
  const margin = Math.max(0, Math.min(width * 0.45, Number.isFinite(requestedMargin) ? requestedMargin : 32));
  const playhead = Math.max(0, Math.min(1, time / duration)) * content;
  if (playhead < current + margin) return Math.max(0, playhead - margin);
  if (playhead > current + width - margin) return Math.min(maximum, playhead - width + margin);
  return current;
}

export type TimelineEdgeAutoScrollResult = {
  scrollLeft: number;
  active: boolean;
};

export function timelinePointerTime(
  pointerClientX: number,
  contentLeft: number,
  contentWidth: number,
  duration: number,
): number {
  if (
    !Number.isFinite(pointerClientX)
    || !Number.isFinite(contentLeft)
    || !Number.isFinite(contentWidth)
    || !(contentWidth > 0)
    || !Number.isFinite(duration)
    || !(duration > 0)
  ) return 0;
  const ratio = Math.max(0, Math.min(1, (pointerClientX - contentLeft) / contentWidth));
  return ratio * duration;
}

export function advanceTimelineEdgeAutoScroll(
  scrollLeft: number,
  clientWidth: number,
  contentWidth: number,
  pointerClientX: number,
  viewportLeft: number,
  elapsedMs: number,
  requestedEdge = 48,
  requestedMaximumSpeed = 960,
): TimelineEdgeAutoScrollResult {
  const width = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
  const content = Number.isFinite(contentWidth) ? Math.max(width, contentWidth) : width;
  const maximum = Math.max(0, content - width);
  const current = Number.isFinite(scrollLeft) ? Math.max(0, Math.min(maximum, scrollLeft)) : 0;
  if (!(width > 0) || !(maximum > 0) || !Number.isFinite(pointerClientX) || !Number.isFinite(viewportLeft)) {
    return { scrollLeft: current, active: false };
  }

  const edge = Math.max(1, Math.min(
    width * 0.45,
    Number.isFinite(requestedEdge) ? Math.max(1, requestedEdge) : 48,
  ));
  const pointer = pointerClientX - viewportLeft;
  const strength = pointer < edge
    ? -Math.min(1, (edge - pointer) / edge)
    : pointer > width - edge
      ? Math.min(1, (pointer - (width - edge)) / edge)
      : 0;
  if (strength === 0) return { scrollLeft: current, active: false };

  const speed = Number.isFinite(requestedMaximumSpeed)
    ? Math.max(0, requestedMaximumSpeed)
    : 960;
  if (!(speed > 0)) return { scrollLeft: current, active: false };
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, Math.min(50, elapsedMs)) : 0;
  const next = Math.max(0, Math.min(maximum, current + strength * speed * elapsed / 1_000));
  const canContinue = strength < 0 ? next > 0 : next < maximum;
  return { scrollLeft: next, active: canContinue };
}
