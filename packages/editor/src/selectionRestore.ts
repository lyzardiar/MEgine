export function restoreSceneSelection(
  entityIds: number[],
  selectedIds: unknown,
  primarySelected: unknown,
): number[] {
  const available = new Set(entityIds);
  const seen = new Set<number>();
  const restored = (Array.isArray(selectedIds) ? selectedIds : [])
    .filter((id): id is number => typeof id === 'number' && available.has(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const primary = typeof primarySelected === 'number' && available.has(primarySelected)
    ? primarySelected
    : null;
  if (restored.length) {
    if (primary != null) return [...restored.filter((id) => id !== primary), primary];
    return restored;
  }
  if (primary != null) return [primary];
  return entityIds.length ? [entityIds[0]] : [];
}
