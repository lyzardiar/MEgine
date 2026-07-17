export type AnimationPreviewSample = {
  target: string;
  component: string;
  property: string;
  value: boolean | number | number[] | string;
};

export type AnimationPreviewEntity = {
  entity: number;
  name?: string | null;
  parent?: number | null;
  components: Record<string, unknown>;
};

export function resolveAnimationTarget(
  source: readonly AnimationPreviewEntity[],
  root: number,
  target: string,
): number | null {
  const normalized = target.trim();
  if (!normalized || normalized === '.') return root;
  if (/^\d+$/.test(normalized)) {
    const id = Number(normalized);
    return source.some((entity) => entity.entity === id) ? id : null;
  }
  let current = root;
  const segments = normalized.replace(/^\.\//, '').split('/').filter(Boolean);
  for (const segment of segments) {
    const child = source.find(
      (entity) => (entity.parent ?? null) === current && entity.name === segment,
    );
    if (!child) return null;
    current = child.entity;
  }
  return current;
}

function applyPreviewProperty(
  component: Record<string, unknown>,
  property: string,
  value: AnimationPreviewSample['value'],
): void {
  const segments = property.split('.').map((segment) => segment.trim()).filter(Boolean);
  const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
  if (!segments.length || segments.some((segment) => unsafe.has(segment))) return;
  let cursor: Record<string, unknown> | unknown[] = component;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const key: string | number = Array.isArray(cursor) && /^\d+$/.test(segment)
      ? Number(segment)
      : segment;
    const next = cursor[key as keyof typeof cursor];
    if (next == null || typeof next !== 'object') return;
    cursor = next as Record<string, unknown> | unknown[];
  }
  const last = segments[segments.length - 1];
  const key: string | number = Array.isArray(cursor) && /^\d+$/.test(last)
    ? Number(last)
    : last;
  cursor[key as keyof typeof cursor] = structuredClone(value) as never;
}

/** Return a preview snapshot without mutating or dirtying authoring entities. */
export function applyAnimationPreview<T extends AnimationPreviewEntity>(
  source: readonly T[],
  root: number,
  samples: readonly AnimationPreviewSample[],
): T[] {
  const entities = structuredClone(source) as T[];
  for (const sample of samples) {
    const target = resolveAnimationTarget(entities, root, sample.target);
    const entity = target == null
      ? null
      : entities.find((candidate) => candidate.entity === target);
    const component = entity?.components[sample.component];
    if (component == null || typeof component !== 'object' || Array.isArray(component)) continue;
    applyPreviewProperty(component as Record<string, unknown>, sample.property, sample.value);
  }
  return entities;
}
