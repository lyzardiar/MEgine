export type AnimationBindingEntity = {
  entity: number;
  name?: string | null;
  parent?: number | null;
  components: Record<string, unknown>;
};

export type AnimationPropertyBinding = {
  target: string;
  component: string;
  property: string;
  label: string;
};

export type AnimationPropertyBindingGroup = {
  key: string;
  label: string;
  bindings: AnimationPropertyBinding[];
};

export type AnimationPropertyBindingSearchResult = {
  bindings: AnimationPropertyBinding[];
  matchCount: number;
  truncated: boolean;
};

function animatablePaths(value: unknown, prefix = '', output: string[] = []): string[] {
  if (output.length >= 2048) return output;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    if (prefix) output.push(prefix);
    return output;
  }
  if (Array.isArray(value)) {
    if (prefix && value.length > 0 && value.every((part) => typeof part === 'number' && Number.isFinite(part))) {
      output.push(prefix);
    }
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    animatablePaths(child, prefix ? `${prefix}.${key}` : key, output);
    if (output.length >= 2048) break;
  }
  return output;
}

function descendantsWithPaths(
  entities: readonly AnimationBindingEntity[],
  root: AnimationBindingEntity,
): Array<{ entity: AnimationBindingEntity; target: string }> {
  const result = [{ entity: root, target: '.' }];
  const queue = [{ entity: root, target: '.' }];
  const visited = new Set([root.entity]);
  while (queue.length > 0 && result.length < 2048) {
    const current = queue.shift()!;
    const children = entities
      .filter((candidate) => (candidate.parent ?? null) === current.entity.entity)
      .sort((left, right) => left.entity - right.entity);
    for (const child of children) {
      if (visited.has(child.entity)) continue;
      visited.add(child.entity);
      const name = String(child.name ?? `Entity ${child.entity}`).trim() || `Entity ${child.entity}`;
      const target = current.target === '.' ? name : `${current.target}/${name}`;
      const item = { entity: child, target };
      result.push(item);
      queue.push(item);
    }
  }
  return result;
}

export function listAnimationPropertyBindings(
  entities: readonly AnimationBindingEntity[],
  rootEntity: number,
): AnimationPropertyBinding[] {
  const root = entities.find((entity) => entity.entity === rootEntity);
  if (!root) return [];
  const bindings: AnimationPropertyBinding[] = [];
  for (const { entity, target } of descendantsWithPaths(entities, root)) {
    for (const component of Object.keys(entity.components).sort()) {
      const data = entity.components[component];
      for (const property of animatablePaths(data)) {
        bindings.push({
          target,
          component,
          property,
          label: `${target === '.' ? root.name ?? 'Root' : target} / ${component}.${property}`,
        });
        if (bindings.length >= 4096) return bindings;
      }
    }
  }
  return bindings;
}

export function animationBindingKey(binding: Pick<AnimationPropertyBinding, 'target' | 'component' | 'property'>): string {
  return `${binding.target}\u0000${binding.component}\u0000${binding.property}`;
}

export function groupAnimationPropertyBindings(
  bindings: readonly AnimationPropertyBinding[],
): AnimationPropertyBindingGroup[] {
  const groups = new Map<string, AnimationPropertyBindingGroup>();
  for (const binding of bindings) {
    const key = `${binding.target}\u0000${binding.component}`;
    let group = groups.get(key);
    if (!group) {
      const propertySuffix = `.${binding.property}`;
      group = {
        key,
        label: binding.label.endsWith(propertySuffix)
          ? binding.label.slice(0, -propertySuffix.length)
          : `${binding.target} / ${binding.component}`,
        bindings: [],
      };
      groups.set(key, group);
    }
    group.bindings.push(binding);
  }
  return [...groups.values()];
}

export function searchAnimationPropertyBindings(
  bindings: readonly AnimationPropertyBinding[],
  query: string,
  limit = 240,
): AnimationPropertyBindingSearchResult {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 240;
  const results: AnimationPropertyBinding[] = [];
  let matchCount = 0;
  for (const binding of bindings) {
    const haystack = `${binding.label} ${binding.target} ${binding.component} ${binding.property}`
      .toLowerCase();
    if (tokens.some((token) => !haystack.includes(token))) continue;
    matchCount += 1;
    if (results.length < safeLimit) results.push(binding);
  }
  return {
    bindings: results,
    matchCount,
    truncated: matchCount > results.length,
  };
}

export function parseAnimationBindingKey(value: string): AnimationPropertyBinding | null {
  const [target, component, property] = value.split('\u0000', 3);
  if (!target || !component || !property) return null;
  return { target, component, property, label: `${target} / ${component}.${property}` };
}
