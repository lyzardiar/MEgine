export interface SequencerVerticalWindow {
  visibleStart: number;
  visibleEnd: number;
  renderStart: number;
  renderEnd: number;
  firstBlock: number;
  lastBlockExclusive: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function sequencerVerticalWindow(
  blockHeights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  headerHeight = 32,
  overscanScreens = 0.75,
): SequencerVerticalWindow {
  const heights = blockHeights.map((height) => Math.max(0, finiteOr(height, 0)));
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + height);
  const totalHeight = offsets[offsets.length - 1];
  const safeHeaderHeight = Math.max(0, finiteOr(headerHeight, 0));
  const safeViewportHeight = Math.max(1, finiteOr(viewportHeight, 1));
  const contentViewportHeight = Math.max(1, safeViewportHeight - safeHeaderHeight);
  const maximumScroll = Math.max(0, safeHeaderHeight + totalHeight - safeViewportHeight);
  const safeScrollTop = Math.max(0, Math.min(maximumScroll, finiteOr(scrollTop, 0)));
  const visibleStart = Math.max(0, safeScrollTop - safeHeaderHeight);
  const visibleEnd = Math.min(
    totalHeight,
    Math.max(visibleStart, safeScrollTop + safeViewportHeight - safeHeaderHeight),
  );
  const overscan = contentViewportHeight
    * Math.max(0, Math.min(3, finiteOr(overscanScreens, 0.75)));
  const renderStart = Math.max(0, visibleStart - overscan);
  const renderEnd = Math.min(totalHeight, visibleEnd + overscan);

  let firstBlock = 0;
  while (firstBlock < heights.length && offsets[firstBlock + 1] <= renderStart) {
    firstBlock += 1;
  }
  let lastBlockExclusive = firstBlock;
  while (
    lastBlockExclusive < heights.length
    && offsets[lastBlockExclusive] < renderEnd
  ) {
    lastBlockExclusive += 1;
  }
  if (totalHeight > 0 && lastBlockExclusive === firstBlock && firstBlock < heights.length) {
    lastBlockExclusive = firstBlock + 1;
  }

  const paddingTop = offsets[firstBlock] ?? totalHeight;
  const renderedHeight = (offsets[lastBlockExclusive] ?? totalHeight) - paddingTop;
  return {
    visibleStart,
    visibleEnd,
    renderStart,
    renderEnd,
    firstBlock,
    lastBlockExclusive,
    paddingTop,
    paddingBottom: Math.max(0, totalHeight - paddingTop - renderedHeight),
    totalHeight,
  };
}
