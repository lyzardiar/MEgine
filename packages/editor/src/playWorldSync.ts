// Author: MiYu. Compare live Play data with an owned JSON baseline, including direct reference edits.
import type { WorldSnapshotView } from '@mengine/api';
import { normalizeEntity, type EntityRec } from './entityRecord.ts';

const retainedRecords = new WeakSet<object>();
const retainedWorlds = new WeakSet<object>();
export type RetainedPlayWorld = Omit<WorldSnapshotView, 'entities'> & { entities: EntityRec[] };
export function isRetainedPlayWorld(value: object): value is RetainedPlayWorld { return retainedWorlds.has(value); }
/** Only explicitly retained JSON roots can share record serialization results. */
export function isRetainedPlayRecord(value: object): boolean { return retainedRecords.has(value); }

function copyOwnedJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (isArray(value)) {
    const result: unknown[] = [];
    for (let i = 0; i < value.length; i++) result[i] = copyOwnedJson(value[i]);
    return result as T;
  }
  const result = { ...value } as Record<string, unknown>;
  for (const key of keys(result)) {
    const child = result[key];
    if (child !== null && typeof child === 'object') result[key] = copyOwnedJson(child);
  }
  return result as T;
}

/** Copy a certified record root; editable copies keep their own nested data and special keys. */
export function cloneRetainedPlayRecord<T extends object>(value: T): T {
  if (!retainedRecords.has(value)) throw new Error('Editable Play copies require an owned JSON record');
  return copyOwnedJson(value);
}

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

// MiYu: private JSON copies have no accessors; exposed records still execute the original comparison.
type PrivatePlayCopies = { owns(entities: unknown): boolean; unchanged(entity: object, baseline: object): boolean; comparisonIndices?(entities: unknown, retained: unknown): readonly number[] | undefined; expose(): void };
const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf, keys = Object.keys, isArray = Array.isArray;
const nativeComparison = [descriptor, prototype, keys, isArray].every(fn => Function.prototype.toString.call(fn).includes('[native code]'));
function ordinaryComparison(): boolean {
  return nativeComparison && descriptor(Object, 'keys')?.value === keys && descriptor(Object, 'getPrototypeOf')?.value === prototype && descriptor(Array, 'isArray')?.value === isArray && !descriptor(Object.prototype, 'toJSON') && !descriptor(Array.prototype, 'toJSON') && prototype(Array.prototype) === Object.prototype;
}
function equalEntities(value: unknown, baseline: unknown, copies?: PrivatePlayCopies, retained?: unknown): boolean {
  if (!copies?.owns(value)) return equalJson(value, baseline);
  if (!ordinaryComparison()) { copies.expose(); return equalJson(value, baseline); }
  if (!Array.isArray(value) || !Array.isArray(baseline)) return equalJson(value, baseline);
  if (value.length !== baseline.length) return false;
  let indices = retained ? copies.comparisonIndices?.(value, retained) : undefined, nextIndex = 0;
  let privateComparison = true;
  for (let i = indices ? indices[nextIndex++] ?? value.length : 0; i < value.length; i = indices ? indices[nextIndex++] ?? value.length : i + 1) {
    const child = value[i], saved = baseline[i];
    if (child === saved || privateComparison && copies.unchanged(child, saved)) continue;
    if (!equalJson(child, saved)) return false;
    // An exposed getter or Proxy can change global serialization behaviour during comparison.
    if (privateComparison && !ordinaryComparison()) { copies.expose(); privateComparison = false; indices = undefined; }
    if (indices && copies.comparisonIndices?.(value, retained) !== indices) indices = undefined;
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

// MiYu: callers supply fresh JSON.parse trees. Nested values stay frozen; only published roots certify record ownership.
function freezeJsonTree(value: object): void {
  if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const child = value[i];
      if (child !== null && typeof child === 'object') freezeJsonTree(child);
    }
  } else for (const key of keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') freezeJsonTree(child);
  }
  Object.freeze(value);
}
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    freezeJsonTree(value);
    retainedRecords.add(value);
  }
  return value;
}

/** Own one normalized JSON record; certified immutable roots keep their identity. */
export function retainPlayRecord(entity: WorldSnapshotView['entities'][number]): EntityRec {
  return isRetainedPlayRecord(entity) ? entity as EntityRec : freezeJson(JSON.parse(JSON.stringify(normalizeEntity(entity))) as EntityRec);
}

/** Own native JSON data once; unchanged immutable records and colors retain their identity. */
export function retainPlayWorld(world: WorldSnapshotView, previous?: RetainedPlayWorld): RetainedPlayWorld {
  const entities = world.entities.map(retainPlayRecord);
  const color = JSON.parse(JSON.stringify(world.clearColor)) as WorldSnapshotView['clearColor'];
  const clearColor = previous && equalJson(color, previous.clearColor) ? previous.clearColor : freezeJson(color);
  const { entities: inputEntities, clearColor: inputColor, ...metadata } = world;
  const owned = Object.freeze({ ...freezeJson(JSON.parse(JSON.stringify(metadata))), entities: Object.freeze(entities) as EntityRec[], clearColor }) as RetainedPlayWorld;
  retainedWorlds.add(owned);
  return owned;
}

const retainedWorldIndices = new WeakMap<RetainedPlayWorld, Map<number, number>>();
const retainedWorldChanges = new WeakMap<RetainedPlayWorld, { previousEntities: EntityRec[]; indices: readonly number[] }>();

/** Certified adjacent deltas retain an entity array, without retaining a chain of earlier worlds. */
export function retainedPlayWorldChanges(previous: RetainedPlayWorld, next: RetainedPlayWorld): readonly number[] | undefined {
  const changes = retainedWorldChanges.get(next);
  return retainedWorlds.has(previous) && changes?.previousEntities === previous.entities ? changes.indices : undefined;
}

/** Merge an unchanged-order native delta; private frozen worlds keep their validated entity indices. */
export function retainPlayWorldPatch(previous: RetainedPlayWorld, patch: WorldSnapshotView): RetainedPlayWorld {
  if (!retainedWorlds.has(previous)) throw new Error('Play patch requires an owned world');
  let indices = retainedWorldIndices.get(previous);
  if (!indices) {
    indices = new Map();
    for (let i = 0; i < previous.entities.length; i++) {
      const id = previous.entities[i].entity;
      if (indices.has(id)) throw new Error('Invalid Play snapshot entity order');
      indices.set(id, i);
    }
    retainedWorldIndices.set(previous, indices);
  }
  const positions = patch.entities.map(entity => {
    const index = indices.get(entity.entity);
    if (index === undefined) throw new Error('Invalid Play snapshot entity order');
    return index;
  });
  const changed = retainPlayWorld(patch, previous), entities = positions.length ? previous.entities.slice() : previous.entities;
  for (let i = 0; i < positions.length; i++) entities[positions[i]] = changed.entities[i];
  const owned = Object.freeze({ ...changed, entities: Object.freeze(entities) as EntityRec[] });
  retainedWorlds.add(owned);
  retainedWorldIndices.set(owned, indices);
  retainedWorldChanges.set(owned, { previousEntities: previous.entities, indices: Object.freeze([...new Set(positions)]) });
  return owned;
}

export function createPlayWorldSync(copies?: PrivatePlayCopies) {
  type Entities = WorldSnapshotView['entities'] | null;
  type Color = WorldSnapshotView['clearColor'];
  let baseline: [Entities, Color] | null = null;
  let serialized: string | undefined;
  let retainedEntities: Entities = null;
  let sharedBaseline = false;
  const fullCapture = (entities: Entities, color: Color) => {
    retainedEntities = null;
    sharedBaseline = false;
    serialized = JSON.stringify([entities, color]);
    baseline = JSON.parse(serialized) as [Entities, Color];
    if (Array.isArray(baseline[0])) for (const entity of baseline[0]) freezeJson(entity);
  };
  return {
    reset() { baseline = null; serialized = undefined; retainedEntities = null; sharedBaseline = false; },
    /** Only a factory-owned immutable world can bypass comparison with editable data. */
    captureRetained(world: RetainedPlayWorld) {
      if (!retainedWorlds.has(world)) throw new Error('Play baseline must be an owned world');
      baseline = [world.entities, world.clearColor];
      sharedBaseline = true;
      retainedEntities = world.entities;
      serialized = undefined;
    },
    /** Retain immutable JSON records across later captures; only the pointer list is copied. */
    viewportSnapshot() { return baseline?.[0] ? { entities: baseline[0].slice(), clearColor: baseline[1].slice() as Color } : undefined; },
    /** Verify structured presentation data without copying the immutable pointer list. */
    presentationMatches(entities: Entities, color: Color) { return baseline != null && equalEntities(entities, baseline[0], copies, retainedEntities) && equalJson(color, baseline[1]); },
    /** Presentation preserves structured data, so it cannot use the serialization fallback in matches(). */
    presentationSnapshot(entities: Entities, color: Color) {
      return this.presentationMatches(entities, color) ? this.viewportSnapshot() : undefined;
    },
    /** Only the exact captured immutable world may carry sparse native changes into a publication. */
    retainedPresentation(world: RetainedPlayWorld | undefined, entities: Entities, color: Color) {
      return world && retainedWorlds.has(world) && baseline?.[0] === world.entities && baseline[1] === world.clearColor && this.presentationMatches(entities, color) ? world : undefined;
    },
    matches(entities: Entities, color: Color) {
      if (!baseline) return false;
      if (equalEntities(entities, baseline[0], copies, retainedEntities) && equalJson(color, baseline[1])) return true;
      serialized ??= JSON.stringify(baseline);
      return JSON.stringify([entities, color]) === serialized;
    },
    capture(entities: Entities, color: Color) {
      retainedEntities = null;
      if (!baseline || !entities || !Array.isArray(baseline[0]) || entities.length !== baseline[0].length || typeof (entities as { toJSON?: unknown }).toJSON === 'function') { fullCapture(entities, color); return; }
      const changed: number[] = [];
      for (let i = 0; i < entities.length; i++) if (!equalJson(entities[i], baseline[0][i])) changed.push(i);
      const colorChanged = !equalJson(color, baseline[1]);
      if (changed.some(i => !plainJson(entities[i])) || colorChanged && !plainJson(color)) { fullCapture(entities, color); return; }
      // MiYu: retained arrays are immutable; ordinary captures copy their index only when a record changes.
      if (changed.length && sharedBaseline) { baseline[0] = baseline[0].slice(); sharedBaseline = false; }
      for (const i of changed) baseline[0][i] = freezeJson(JSON.parse(JSON.stringify(entities[i])));
      if (colorChanged) baseline[1] = JSON.parse(JSON.stringify(color));
      if (changed.length || colorChanged) serialized = undefined;
    },
  };
}
