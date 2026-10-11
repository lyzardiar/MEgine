// Author: MiYu. Resolve Play activation once per paint without repeated whole-scene searches.
type Entity = { entity: number; parent?: number | null; active?: boolean };
export function createHierarchyActiveLookup(entities: readonly Entity[]) {
  const byId = new Map<number, Entity>(), active = new Map<number, boolean>();
  for (const entity of entities) if (!byId.has(entity.entity)) byId.set(entity.entity, entity);
  return (id: number): boolean => {
    const cached = active.get(id);
    if (cached !== undefined) return cached;
    const first = byId.get(id);
    if (!first || first.active === false) return false;
    const parent = first.parent;
    if (parent == null) { active.set(id, true); return true; }
    const path: number[] = [id], visiting = new Set<number>();
    visiting.add(id);
    let current: number | null | undefined = parent, result = true;
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
  if (!playing || !fallback || !isGame && hiddenIds?.length) return fallback ?? (() => true);
  let active: ReturnType<typeof createHierarchyActiveLookup> | undefined;
  return (id: number) => (active ??= createHierarchyActiveLookup(entities))(id);
}
