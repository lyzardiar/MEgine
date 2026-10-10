// Author: MiYu. Compare live Play data with an owned JSON baseline, including direct reference edits.
import type { WorldSnapshotView } from '@mengine/api';

const retainedRecords = new WeakSet<object>();
/** Only JSON-owned frozen records created here can share serialization results. */
export function isRetainedPlayRecord(value: object): boolean { return retainedRecords.has(value); }

function equalJson(value: unknown, baseline: unknown): boolean {
  if (value === baseline) return true;
  if (value === null || baseline === null || typeof value !== 'object' || typeof baseline !== 'object') return false;
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return false;
  if (Array.isArray(value)) {
    if (!Array.isArray(baseline) || value.length !== baseline.length) return false;
    for (let i = 0; i < value.length; i++) {
      const child = value[i], savedChild = baseline[i];
      if (child !== savedChild && !equalJson(child, savedChild)) return false;
    }
    return true;
  }
  if (Array.isArray(baseline) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const object = value as Record<string, unknown>, saved = baseline as Record<string, unknown>, keys = Object.keys(object), savedKeys = Object.keys(saved);
  if (keys.length !== savedKeys.length) return false;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== savedKeys[i]) return false;
    const child = object[keys[i]], savedChild = saved[keys[i]];
    if (child !== savedChild && !equalJson(child, savedChild)) return false;
  }
  return true;
}

function plainJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value) || typeof (value as { toJSON?: unknown }).toJSON === 'function') return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  ancestors.add(value);
  const values = Array.isArray(value) ? Array.from(value) : Object.values(value as Record<string, unknown>);
  const result = values.every(child => plainJson(child, ancestors));
  ancestors.delete(value);
  return result;
}

// MiYu: retained records can be shared by presentation and native revisions without allowing writes.
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
    retainedRecords.add(value);
  }
  return value;
}

export function createPlayWorldSync() {
  type Entities = WorldSnapshotView['entities'] | null;
  type Color = WorldSnapshotView['clearColor'];
  let baseline: [Entities, Color] | null = null;
  let serialized: string | undefined;
  const fullCapture = (entities: Entities, color: Color) => {
    serialized = JSON.stringify([entities, color]);
    baseline = JSON.parse(serialized) as [Entities, Color];
    if (Array.isArray(baseline[0])) for (const entity of baseline[0]) freezeJson(entity);
  };
  return {
    reset() { baseline = null; serialized = undefined; },
    /** Retain immutable JSON records across later captures; only the pointer list is copied. */
    viewportSnapshot() { return baseline?.[0] ? { entities: baseline[0].slice(), clearColor: baseline[1].slice() as Color } : undefined; },
    /** Presentation preserves structured data, so it cannot use the serialization fallback in matches(). */
    presentationSnapshot(entities: Entities, color: Color) {
      return baseline && equalJson(entities, baseline[0]) && equalJson(color, baseline[1]) ? this.viewportSnapshot() : undefined;
    },
    matches(entities: Entities, color: Color) {
      if (!baseline) return false;
      if (equalJson(entities, baseline[0]) && equalJson(color, baseline[1])) return true;
      serialized ??= JSON.stringify(baseline);
      return JSON.stringify([entities, color]) === serialized;
    },
    capture(entities: Entities, color: Color) {
      if (!baseline || !entities || !Array.isArray(baseline[0]) || entities.length !== baseline[0].length || typeof (entities as { toJSON?: unknown }).toJSON === 'function') { fullCapture(entities, color); return; }
      const changed: number[] = [];
      for (let i = 0; i < entities.length; i++) if (!equalJson(entities[i], baseline[0][i])) changed.push(i);
      const colorChanged = !equalJson(color, baseline[1]);
      if (changed.some(i => !plainJson(entities[i])) || colorChanged && !plainJson(color)) { fullCapture(entities, color); return; }
      for (const i of changed) baseline[0][i] = freezeJson(JSON.parse(JSON.stringify(entities[i])));
      if (colorChanged) baseline[1] = JSON.parse(JSON.stringify(color));
      if (changed.length || colorChanged) serialized = undefined;
    },
  };
}
