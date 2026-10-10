// Author: MiYu. Resolve Play activation once per paint without repeated whole-scene searches.
type Entity = { entity: number; parent?: number | null; active?: boolean };
export function createHierarchyActiveLookup(entities: readonly Entity[]) {
  const byId = new Map<number, Entity>(), active = new Map<number, boolean>();
  for (const entity of entities) if (!byId.has(entity.entity)) byId.set(entity.entity, entity);
  return (id: number): boolean => {
    const path: number[] = [], visiting = new Set<number>();
    let current: number | null | undefined = id, result = true;
    while (current != null) {
      if (active.has(current)) { result = active.get(current)!; break; }
      const entity = byId.get(current);
      if (!entity || entity.active === false) { result = false; break; }
      if (visiting.has(current)) break;
      visiting.add(current); path.push(current); current = entity.parent;
    }
    for (const node of path) active.set(node, result);
    return result;
  };
}
export function viewportActiveLookup(entities: readonly Entity[], playing: boolean, isGame: boolean, hiddenIds: readonly number[] | undefined, fallback?: (id: number) => boolean) {
  return playing && fallback && (isGame || !hiddenIds?.length) ? createHierarchyActiveLookup(entities) : fallback ?? (() => true);
}
