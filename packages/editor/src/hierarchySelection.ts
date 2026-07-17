export type HierarchySelectionEntity = {
  entity: number;
  parent?: number | null;
};

/**
 * Returns selected hierarchy roots while excluding every selected entity that
 * is already contained by another selected ancestor's subtree.
 */
export function selectedHierarchyRoots(
  entities: HierarchySelectionEntity[],
  selectedIds: number[],
): number[] {
  const selected = new Set(selectedIds);
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  return selectedIds.filter((id) => {
    const entity = byId.get(id);
    if (!entity) return false;
    const visited = new Set<number>([id]);
    let parent = entity.parent ?? null;
    while (parent != null && !visited.has(parent)) {
      if (selected.has(parent)) return false;
      visited.add(parent);
      parent = byId.get(parent)?.parent ?? null;
    }
    return true;
  });
}
