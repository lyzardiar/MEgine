export type WorldDrawOrderItem = {
  depth: number;
  hierarchyOrder: number;
  sortingOrder: number | null;
  editorGizmo: boolean;
};

/** 3D first, then native-style world 2D order, then Scene-only editor gizmos. */
export function compareWorldDrawOrder(a: WorldDrawOrderItem, b: WorldDrawOrderItem): number {
  const rank = (item: WorldDrawOrderItem) => item.editorGizmo ? 2 : item.sortingOrder == null ? 0 : 1;
  const rankDelta = rank(a) - rank(b);
  if (rankDelta) return rankDelta;
  if (a.sortingOrder != null && b.sortingOrder != null) {
    const sortingDelta = a.sortingOrder - b.sortingOrder;
    if (sortingDelta) return sortingDelta;
  }
  const depthDelta = b.depth - a.depth;
  if (Math.abs(depthDelta) > 1e-7) return depthDelta;
  return a.hierarchyOrder - b.hierarchyOrder;
}

export function entity2DSortingOrder(components: Record<string, unknown>): number | null {
  for (const type of ['Line2D', 'AnimatedSprite2D', 'SpriteRenderer']) {
    const component = components[type] as Record<string, unknown> | undefined;
    if (!component) continue;
    const value = Number(component.sorting_order ?? component.sortingOrder ?? 0);
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  return null;
}
