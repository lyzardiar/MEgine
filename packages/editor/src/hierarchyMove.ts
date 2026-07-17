export type HierarchyMoveItem = {
  id: number;
  parent: number | null;
  siblingIndex: number;
};

export type HierarchyMovePlan = {
  roots: number[];
  parent: number | null;
  destinationOrder: number[];
  oldParents: Array<number | null>;
};

/**
 * Build one atomic hierarchy move. `atIndex` is measured after the moving
 * roots have been removed from the destination sibling list.
 */
export function planHierarchyMove(
  items: HierarchyMoveItem[],
  ids: number[],
  parent: number | null,
  atIndex?: number,
): HierarchyMovePlan | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (parent != null && !byId.has(parent)) return null;

  const childrenOf = (parentId: number | null) => items
    .filter((item) => item.parent === parentId)
    .sort((a, b) => a.siblingIndex - b.siblingIndex || a.id - b.id);
  const moving = [...new Set(ids)].filter((id) => byId.has(id));
  const movingSet = new Set(moving);

  const hasMovingAncestor = (id: number) => {
    let current = byId.get(id)?.parent ?? null;
    const guard = new Set<number>();
    while (current != null && !guard.has(current)) {
      if (movingSet.has(current)) return true;
      guard.add(current);
      current = byId.get(current)?.parent ?? null;
    }
    return false;
  };
  const isDescendant = (ancestor: number, node: number) => {
    let current: number | null = node;
    const guard = new Set<number>();
    while (current != null && !guard.has(current)) {
      if (current === ancestor) return true;
      guard.add(current);
      current = byId.get(current)?.parent ?? null;
    }
    return false;
  };

  const hierarchyOrder: number[] = [];
  const visited = new Set<number>();
  const walk = (parentId: number | null) => {
    for (const child of childrenOf(parentId)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      hierarchyOrder.push(child.id);
      walk(child.id);
    }
  };
  walk(null);
  for (const item of items) {
    if (!visited.has(item.id)) hierarchyOrder.push(item.id);
  }
  const order = new Map(hierarchyOrder.map((id, index) => [id, index]));

  const roots = moving
    .filter((id) => !hasMovingAncestor(id))
    .filter((id) => parent == null || (id !== parent && !isDescendant(id, parent)))
    .sort((a, b) =>
      (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
  if (!roots.length) return null;

  const rootSet = new Set(roots);
  const destination = childrenOf(parent)
    .map((item) => item.id)
    .filter((id) => !rootSet.has(id));
  const insertionIndex = atIndex == null
    ? destination.length
    : Math.max(0, Math.min(Math.trunc(atIndex), destination.length));

  return {
    roots,
    parent,
    destinationOrder: [
      ...destination.slice(0, insertionIndex),
      ...roots,
      ...destination.slice(insertionIndex),
    ],
    oldParents: [...new Set(roots.map((id) => byId.get(id)?.parent ?? null))],
  };
}
