import type { MenuItemEntry } from './editorWindow/registry.ts';

export function filterHierarchyCreateItems(
  entries: readonly MenuItemEntry[],
  search: string,
  prioritizeUi: boolean,
): MenuItemEntry[] {
  const tokens = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      const haystack = entry.segments.slice(1).join(' ').toLocaleLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((left, right) => {
      if (prioritizeUi) {
        const leftUi = left.segments[1] === 'UI' ? 0 : 1;
        const rightUi = right.segments[1] === 'UI' ? 0 : 1;
        if (leftUi !== rightUi) return leftUi - rightUi;
      }
      return left.priority - right.priority || left.path.localeCompare(right.path);
    });
}
