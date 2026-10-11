// Author: MiYu. Resolve inherited Scene visibility and picking within one immutable query batch.
export function createSceneInteractionQuery(entities: readonly { entity: number; parent?: number | null }[], hiddenIds: ReadonlySet<number>, unpickableIds: ReadonlySet<number>) {
  const hidden = new Set(hiddenIds), unpickable = new Set(unpickableIds);
  const unrestricted = () => true;
  if (!hidden.size && !unpickable.size) return { sceneVisible: unrestricted, scenePickable: unrestricted };
  const parents = new Map<number, number | null>();
  for (const entity of entities) if (!parents.has(entity.entity)) parents.set(entity.entity, entity.parent ?? null);
  const inherited = (restricted: ReadonlySet<number>) => {
    if (!restricted.size) return unrestricted;
    const resolved = new Map<number, boolean>();
    return (id: number) => {
      let current: number | null = id, allowed = true;
      const trail: number[] = [], visited = new Set<number>();
      while (current != null) {
        if (restricted.has(current)) { allowed = false; break; }
        const cached = resolved.get(current);
        if (cached !== undefined) { allowed = cached; break; }
        if (visited.has(current)) break;
        visited.add(current);
        trail.push(current);
        current = parents.get(current) ?? null;
      }
      for (const ancestor of trail) resolved.set(ancestor, allowed);
      return allowed;
    };
  };
  return { sceneVisible: inherited(hidden), scenePickable: inherited(unpickable) };
}
