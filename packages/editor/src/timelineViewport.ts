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
