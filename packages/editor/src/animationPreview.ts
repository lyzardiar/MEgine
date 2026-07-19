import { quatSlerp, type Quat } from './math3d.ts';

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

export type AnimationPreviewLayer = {
  root: number;
  samples: readonly AnimationPreviewSample[];
};

function previewSampleKey(sample: AnimationPreviewSample): string {
  return JSON.stringify([sample.target, sample.component, sample.property]);
}

function blendPreviewValue(
  source: AnimationPreviewSample['value'],
  destination: AnimationPreviewSample['value'],
  amount: number,
  component: string,
  property: string,
): AnimationPreviewSample['value'] {
  const weight = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
  if (typeof source === 'number' && typeof destination === 'number') {
    return source + (destination - source) * weight;
  }
  if (Array.isArray(source) && Array.isArray(destination) && source.length === destination.length) {
    if (source.length === 4 && component === 'Transform' && property === 'rotation') {
      return quatSlerp(source as Quat, destination as Quat, weight);
    }
    return source.map((value, index) => value + (destination[index] - value) * weight);
  }
  return structuredClone(weight < 0.5 ? source : destination);
}

/** Blend two sampled clips by binding, matching Runtime transition semantics. */
export function blendAnimationPreviewSamples(
  source: readonly AnimationPreviewSample[],
  destination: readonly AnimationPreviewSample[],
  amount: number,
): AnimationPreviewSample[] {
  const destinationKeys = new Set(destination.map(previewSampleKey));
  const sourceByKey = new Map(source.map((sample) => [previewSampleKey(sample), sample.value]));
  const output = source
    .filter((sample) => !destinationKeys.has(previewSampleKey(sample)))
    .map((sample) => structuredClone(sample));
  for (const sample of destination) {
    const previous = sourceByKey.get(previewSampleKey(sample));
    output.push(previous === undefined
      ? structuredClone(sample)
      : {
          ...sample,
          value: blendPreviewValue(
            previous,
            sample.value,
            amount,
            sample.component,
            sample.property,
          ),
        });
  }
  return output;
}

function arrayIndex(segment: string): number | null {
  if (/^\d+$/.test(segment)) return Number(segment);
  const aliases: Record<string, number> = {
    x: 0,
    r: 0,
    y: 1,
    g: 1,
    z: 2,
    b: 2,
    w: 3,
    a: 3,
  };
  return aliases[segment] ?? null;
}

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
    const indexKey = Array.isArray(cursor) ? arrayIndex(segment) : null;
    if (Array.isArray(cursor) && indexKey == null) return;
    const key: string | number = indexKey ?? segment;
    const next = cursor[key as keyof typeof cursor];
    if (next == null || typeof next !== 'object') return;
    cursor = next as Record<string, unknown> | unknown[];
  }
  const last = segments[segments.length - 1];
  const indexKey = Array.isArray(cursor) ? arrayIndex(last) : null;
  if (Array.isArray(cursor) && indexKey == null) return;
  const key: string | number = indexKey ?? last;
  cursor[key as keyof typeof cursor] = structuredClone(value) as never;
}

/** Return a preview snapshot without mutating or dirtying authoring entities. */
export function applyAnimationPreviews<T extends AnimationPreviewEntity>(
  source: readonly T[],
  layers: readonly AnimationPreviewLayer[],
): T[] {
  const entities = structuredClone(source) as T[];
  for (const layer of layers) {
    for (const sample of layer.samples) {
      const target = resolveAnimationTarget(entities, layer.root, sample.target);
      const entity = target == null
        ? null
        : entities.find((candidate) => candidate.entity === target);
      const component = entity?.components[sample.component];
      if (component == null || typeof component !== 'object' || Array.isArray(component)) continue;
      applyPreviewProperty(component as Record<string, unknown>, sample.property, sample.value);
    }
  }
  return entities;
}

/** Return a preview snapshot without mutating or dirtying authoring entities. */
export function applyAnimationPreview<T extends AnimationPreviewEntity>(
  source: readonly T[],
  root: number,
  samples: readonly AnimationPreviewSample[],
): T[] {
  return applyAnimationPreviews(source, [{ root, samples }]);
}
