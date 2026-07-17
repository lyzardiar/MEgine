export type WorldDrawOrderItem = {
  depth: number;
  hierarchyOrder: number;
  sortingOrder: number | null;
  sortingLayerOrder: number | null;
  editorGizmo: boolean;
};

/** 3D first, then native-style world 2D order, then Scene-only editor gizmos. */
export function compareWorldDrawOrder(a: WorldDrawOrderItem, b: WorldDrawOrderItem): number {
  const rank = (item: WorldDrawOrderItem) => item.editorGizmo ? 2 : item.sortingOrder == null ? 0 : 1;
  const rankDelta = rank(a) - rank(b);
  if (rankDelta) return rankDelta;
  if (a.sortingOrder != null && b.sortingOrder != null) {
    const layerDelta = (a.sortingLayerOrder ?? 0) - (b.sortingLayerOrder ?? 0);
    if (layerDelta) return layerDelta;
    const sortingDelta = a.sortingOrder - b.sortingOrder;
    if (sortingDelta) return sortingDelta;
  }
  const depthDelta = b.depth - a.depth;
  if (Math.abs(depthDelta) > 1e-7) return depthDelta;
  return a.hierarchyOrder - b.hierarchyOrder;
}

export function entity2DSortingOrder(components: Record<string, unknown>): number | null {
  return entity2DSortingSettings(components)?.order ?? null;
}

export function component2DSortingSettings(component: Record<string, unknown>): {
  layer: string;
  order: number;
} {
  const value = Number(component.sorting_order ?? component.sortingOrder ?? 0);
  const layer = String(component.sorting_layer ?? component.sortingLayer ?? 'default').trim();
  return {
    layer: layer || 'default',
    order: Number.isFinite(value) ? Math.trunc(value) : 0,
  };
}

export function entity2DSortingSettings(components: Record<string, unknown>): {
  layer: string;
  order: number;
} | null {
  for (const type of ['Line2D', 'AnimatedSprite2D', 'SpriteRenderer', 'ParticleEmitter2D', 'SpineSkeleton']) {
    const component = components[type] as Record<string, unknown> | undefined;
    if (!component) continue;
    return component2DSortingSettings(component);
  }
  return null;
}
