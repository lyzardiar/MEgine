export type RectSelectionEntity = {
  entity: number;
  parent?: number | null;
  components: Record<string, unknown>;
};

/**
 * Returns the selected RectTransform roots in hierarchy order. Descendants of
 * another selected RectTransform are omitted so a parent/child multi-selection
 * moves once in screen space instead of applying the same delta twice.
 */
export function selectedRectRoots(
  entities: RectSelectionEntity[],
  selectedIds: number[],
): number[] {
  const selected = new Set(
    selectedIds.filter((id) => entities.some(
      (entity) => entity.entity === id && entity.components.RectTransform != null,
    )),
  );
  if (!selected.size) return [];
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  return entities
    .filter((entity) => selected.has(entity.entity))
    .filter((entity) => {
      const visited = new Set<number>();
      let parent = entity.parent ?? null;
      while (parent != null && !visited.has(parent)) {
        if (selected.has(parent)) return false;
        visited.add(parent);
        parent = byId.get(parent)?.parent ?? null;
      }
      return true;
    })
    .map((entity) => entity.entity);
}
