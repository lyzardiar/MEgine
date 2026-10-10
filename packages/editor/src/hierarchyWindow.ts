// Author: MiYu. Fixed-height hierarchy rows keep DOM work proportional to the viewport.
export const HIERARCHY_ROW_HEIGHT = 24;
export function hierarchyWindow(count: number, scrollTop: number, height: number, pinnedIndex = -1, overscan = 8) {
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, count * HIERARCHY_ROW_HEIGHT - height)));
  const start = Math.max(0, Math.floor(top / HIERARCHY_ROW_HEIGHT) - overscan);
  const end = Math.min(count, Math.ceil((top + height) / HIERARCHY_ROW_HEIGHT) + overscan);
  const indices = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
  if (pinnedIndex >= 0 && pinnedIndex < count && (pinnedIndex < start || pinnedIndex >= end)) indices.push(pinnedIndex);
  return { top, indices };
}
export function hierarchyScrollTo(index: number, scrollTop: number, height: number) {
  const top = index * HIERARCHY_ROW_HEIGHT, bottom = top + HIERARCHY_ROW_HEIGHT;
  return top < scrollTop ? top : bottom > scrollTop + height ? Math.max(0, bottom - height) : scrollTop;
}
