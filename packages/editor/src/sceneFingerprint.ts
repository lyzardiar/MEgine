// Author: MiYu. Canonical authoring fingerprints with immutable remote entity reuse.
import { isRetainedPlayRecord } from './playWorldSync.ts';

function canonicalSceneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSceneValue);
  if (value == null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, canonicalSceneValue(source[key])]),
  );
}

/** Authoring data only: editor selection, camera, frame and view preferences stay out of Dirty state. */
export function sceneContentFingerprint(
  entities: unknown[],
  clearColor: readonly number[],
): string {
  return JSON.stringify(canonicalSceneValue({ entities, clearColor }));
}

const stringify = JSON.stringify, keys = Object.keys, entries = Object.fromEntries, map = Array.prototype.map;
const ordinaryFingerprint = () => JSON.stringify === stringify && Object.keys === keys && Object.fromEntries === entries && Array.prototype.map === map && Object.getPrototypeOf(Array.prototype) === Object.prototype && !('toJSON' in Object.prototype) && !('toJSON' in Array.prototype);

/** Mutable authoring inputs use the full comparison; only certified frozen records reuse fragments. */
export function createSceneFingerprint() {
  let records = new WeakMap<object, string>();
  return (entities: unknown[], clearColor: readonly number[]): string => {
    if (!ordinaryFingerprint()) { records = new WeakMap(); return sceneContentFingerprint(entities, clearColor); }
    if (!clearColor.every(Number.isFinite)) return sceneContentFingerprint(entities, clearColor);
    for (const entity of entities) if (entity === null || typeof entity !== 'object' || !isRetainedPlayRecord(entity)) return sceneContentFingerprint(entities, clearColor);
    const color = JSON.stringify(canonicalSceneValue(clearColor));
    const fragments = entities.map(entity => {
      const record = entity as object;
      let fragment = records.get(record);
      if (fragment === undefined) { fragment = JSON.stringify(canonicalSceneValue(record)); records.set(record, fragment); }
      return fragment;
    });
    return `{"clearColor":${color},"entities":[${fragments.join(',')}]}`;
  };
}
