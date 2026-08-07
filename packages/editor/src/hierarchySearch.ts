import type { EntityRec, TreeNode } from './store';

type SearchToken = {
  field: 'text' | 'type' | 'tag' | 'layer';
  value: string;
};

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

export function hierarchySearchTokens(query: string): SearchToken[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const match = /^(t|type|tag|layer):(.*)$/i.exec(raw);
      if (!match) return { field: 'text' as const, value: normalize(raw) };
      const field = match[1].toLowerCase() === 't' ? 'type' : match[1].toLowerCase();
      return { field: field as SearchToken['field'], value: normalize(match[2]) };
    })
    .filter((token) => token.value.length > 0);
}

/** Compact fuzzy match: substring first, then ordered-character match. */
export function fuzzyHierarchyMatch(value: string, query: string): boolean {
  const haystack = normalize(value);
  const needle = normalize(query);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return false;
}

export function hierarchyEntityMatches(entity: EntityRec, query: string): boolean {
  const tokens = hierarchySearchTokens(query);
  if (!tokens.length) return true;
  const name = entity.name ?? `Entity ${entity.entity}`;
  const componentTypes = Object.keys(entity.components).filter((type) => !type.startsWith('__'));
  const typeText = componentTypes.join(' ');
  const tagText = entity.tag || 'Untagged';
  const layerText = String(entity.layer);
  const allText = `${name} ${typeText} ${tagText} ${layerText}`;
  return tokens.every((token) => {
    if (token.field === 'type') return fuzzyHierarchyMatch(typeText, token.value);
    if (token.field === 'tag') return fuzzyHierarchyMatch(tagText, token.value);
    if (token.field === 'layer') return fuzzyHierarchyMatch(layerText, token.value);
    return fuzzyHierarchyMatch(allText, token.value);
  });
}

/** Returns matching rows plus their ancestor path, independent of collapsed state. */
export function filterHierarchyTree(entities: EntityRec[], query: string): TreeNode[] {
  if (!query.trim()) return [];
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  const included = new Set<number>();
  for (const entity of entities) {
    if (!hierarchyEntityMatches(entity, query)) continue;
    let current: EntityRec | undefined = entity;
    const guard = new Set<number>();
    while (current && !guard.has(current.entity)) {
      guard.add(current.entity);
      included.add(current.entity);
      current = current.parent == null ? undefined : byId.get(current.parent);
    }
  }

  const children = new Map<number | null, EntityRec[]>();
  for (const entity of entities) {
    if (!included.has(entity.entity)) continue;
    const parent = entity.parent != null && included.has(entity.parent) ? entity.parent : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(entity);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.siblingIndex - right.siblingIndex || left.entity - right.entity);
  }

  const result: TreeNode[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const entity of children.get(parent) ?? []) {
      const hasChildren = (children.get(entity.entity)?.length ?? 0) > 0;
      result.push({ entity, depth, hasChildren, expanded: hasChildren });
      if (hasChildren) walk(entity.entity, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}
