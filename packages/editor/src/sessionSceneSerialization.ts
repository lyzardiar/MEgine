// Author: MiYu. Reuse immutable runtime entity JSON in compact cross-window scene messages.
import { isRetainedPlayRecord, isRetainedPlayWorld, retainedPlayWorldChanges, type RetainedPlayWorld } from './playWorldSync.ts';
import type { EntityRec } from './entityRecord.ts';
import { CURRENT_SCENE_VERSION } from './sceneMigration.ts';

type SessionDocument = { world: { entities: readonly EntityRec[]; [key: string]: unknown }; [key: string]: unknown };
export type SessionSceneDocument = SessionDocument;
const parsedDocuments = new WeakSet<object>();
const parse = JSON.parse;
export const isSessionSceneDocument = (value: unknown): value is SessionSceneDocument => value !== null && typeof value === 'object' && parsedDocuments.has(value);
export const canReuseSessionSceneParsing = () => ordinarySerialization() && JSON.parse === parse && Object.freeze === freeze && Object.isFrozen === isFrozen && nativeParsing;
const values = Object.values, freeze = Object.freeze, isFrozen = Object.isFrozen;
const nativeParsing = [parse, values, freeze, isFrozen].every(fn => Function.prototype.toString.call(fn).includes('[native code]'));

// Each input tree comes from JSON.parse; previously frozen entity trees are already owned.
function freezeSessionJson<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !isFrozen(value)) {
    for (const child of values(value)) freezeSessionJson(child);
    freeze(value);
  }
  return value;
}
const stringify = JSON.stringify, descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const nativeSerialization = [stringify, descriptor, prototype].every(fn => Function.prototype.toString.call(fn).includes('[native code]'));
const ordinarySerialization = () => nativeSerialization && JSON.stringify === stringify && Object.getOwnPropertyDescriptor === descriptor && Object.getPrototypeOf === prototype && prototype(Array.prototype) === Object.prototype && !descriptor(Object.prototype, 'toJSON') && !descriptor(Array.prototype, 'toJSON');

export function createSessionSceneSerializer() {
  let records = new WeakMap<EntityRec, string>();
  return (document: SessionDocument): string => {
    if (!ordinarySerialization()) { records = new WeakMap(); return JSON.stringify(document); }
    const fragments = document.world.entities.map(entity => {
      if (!isRetainedPlayRecord(entity)) return JSON.stringify(entity);
      let fragment = records.get(entity);
      if (fragment === undefined) { fragment = JSON.stringify(entity); records.set(entity, fragment); }
      return fragment;
    });
    const { entities, ...world } = document.world, { world: omittedWorld, ...scene } = document;
    const sceneJson = JSON.stringify(scene), worldJson = JSON.stringify(world);
    return `{${sceneJson.length > 2 ? sceneJson.slice(1, -1) + ',' : ''}"world":{${worldJson.length > 2 ? worldJson.slice(1, -1) + ',' : ''}"entities":[${fragments.join(',')}]}}`;
  };
}

export type SessionSceneDelta = { base: string | null; header: string; length: number; changed: [number, string][] };
export type SessionSceneMessage = { sceneJson: string; sceneDelta?: never } | { sceneJson?: never; sceneDelta: SessionSceneDelta };

function sceneFromFragments(header: string, entities: readonly string[]): string {
  // The header is a scene document with an empty world.entities array at its end.
  return header.slice(0, -3) + entities.join(',') + ']}}';
}

function copySessionEntities(source: EntityRec[], length = source.length): EntityRec[] {
  const result = new Array<EntityRec>(length);
  for (let index = 0, count = Math.min(length, source.length); index < count; index++) result[index] = source[index];
  return result;
}

/** MiYu: publish only changed entity JSON; each delta names its exact predecessor. */
export function createSessionScenePublisher() {
  const serialize = createSessionSceneSerializer();
  let records = new WeakMap<EntityRec, string>(), previous: string[] = [], previousWorld: WeakRef<RetainedPlayWorld> | undefined, state: string | null = null, scope: string | null = null;
  const reset = () => { previous = []; previousWorld = undefined; state = null; scope = null; records = new WeakMap(); };
  return { reset, publish(document: SessionDocument, stateId: string, scopeId: string, allowDelta: boolean, owned?: RetainedPlayWorld): SessionSceneMessage {
    if (!ordinarySerialization()) { reset(); return { sceneJson: serialize(document) }; }
    const world = owned && isRetainedPlayWorld(owned) && owned.entities === document.world.entities ? owned : undefined;
    const base = allowDelta && scope === scopeId ? state : null;
    const priorWorld = previousWorld?.deref();
    const patch = base !== null && world && priorWorld && world.entities.length === previous.length ? world.entities === priorWorld.entities ? [] : retainedPlayWorldChanges(priorWorld, world) : undefined;
    const indices = patch && patch.length <= previous.length / 2 ? patch : undefined;
    const fragment = (entity: EntityRec) => {
      let json = isRetainedPlayRecord(entity) ? records.get(entity) : undefined;
      if (json === undefined) { json = JSON.stringify(entity); if (isRetainedPlayRecord(entity)) records.set(entity, json); }
      return json;
    };
    const fragments = indices ? indices.length ? previous.slice() : previous : document.world.entities.map(fragment);
    const changed: [number, string][] = [];
    if (indices) {
      for (const index of indices) { const json = fragment(document.world.entities[index]); fragments[index] = json; if (json !== previous[index]) changed.push([index, json]); }
      if (changed.length > 1) changed.sort((a, b) => a[0] - b[0]);
    } else for (let index = 0; index < fragments.length; index++) if (base === null || fragments[index] !== previous[index]) changed.push([index, fragments[index]]);
    const header = serialize({ ...document, world: { ...document.world, entities: [] } });
    previous = fragments; previousWorld = world ? new WeakRef(world) : undefined; state = stateId; scope = scopeId;
    return { sceneDelta: { base, header, length: fragments.length, changed } };
  } };
}

/** MiYu: keep one transport baseline, independent of editable store objects. Missing bases request a checkpoint. */
export function createSessionSceneReceiver() {
  type Fragment = { json: string; entity?: EntityRec };
  let state: string | null = null, previous: Fragment[] = [], previousEntities: EntityRec[] | undefined, resyncPending = false;
  const reset = () => { state = null; previous = []; previousEntities = undefined; resyncPending = false; };
  const receive = (message: { sceneJson?: string; sceneDelta?: SessionSceneDelta }, stateId: string, structured: boolean): string | SessionSceneDocument | undefined => {
    if (message.sceneJson !== undefined) { reset(); return message.sceneJson; }
    const delta = message.sceneDelta;
    if (!delta) throw new Error('Missing scene delta');
    if (delta.base !== null && delta.base !== state) return undefined;
    if (!Number.isSafeInteger(delta.length) || delta.length < 0 || !delta.header.endsWith('"entities":[]}}')) throw new Error('Invalid scene delta header');
    let next = delta.base === null ? [] : delta.length === previous.length ? previous : previous.slice(0, delta.length);
    const put = (index: number, fragment: Fragment) => { if (next === previous) next = previous.slice(); next[index] = fragment; };
    const indices = new Set<number>();
    for (const [index, json] of delta.changed) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= delta.length || indices.has(index) || typeof json !== 'string') throw new Error('Invalid scene delta entity');
      indices.add(index); const fragment = previous[index]?.json === json ? previous[index] : { json };
      if (next[index] !== fragment) put(index, fragment);
    }
    // Accepted prefixes are complete; checkpoints and newly grown slots still require every position.
    for (let index = delta.base === null ? 0 : Math.min(previous.length, delta.length); index < delta.length; index++) if (next[index] === undefined) throw new Error('Incomplete scene delta');
    let result: string | SessionSceneDocument;
    let parsedEntities: EntityRec[] | undefined;
    const header = structured && canReuseSessionSceneParsing() ? parse(delta.header) as SessionDocument : undefined;
    if (header?.version === CURRENT_SCENE_VERSION) {
      const inherited = delta.base !== null && previousEntities != null;
      parsedEntities = inherited ? delta.length === previousEntities!.length ? previousEntities! : copySessionEntities(previousEntities!, delta.length) : new Array(delta.length);
      const read = (index: number) => {
        let fragment = next[index];
        if (fragment.entity === undefined) { fragment = { json: fragment.json, entity: freezeSessionJson(parse(fragment.json) as EntityRec) }; put(index, fragment); }
        if (parsedEntities === previousEntities && parsedEntities![index] !== fragment.entity) parsedEntities = copySessionEntities(parsedEntities!);
        if (parsedEntities !== previousEntities) parsedEntities![index] = fragment.entity!;
      };
      if (inherited) { for (const index of indices) read(index); }
      else for (let index = 0; index < next.length; index++) read(index);
      header.world.entities = freeze(parsedEntities) as EntityRec[];
      result = freezeSessionJson(header); parsedDocuments.add(result);
    } else result = sceneFromFragments(delta.header, next.map(fragment => fragment.json));
    previous = next; previousEntities = parsedEntities; state = stateId; resyncPending = false;
    return result;
  };
  return {
    reset,
    requestCheckpoint() { if (resyncPending) return false; resyncPending = true; return true; },
    read(message: { sceneJson?: string; sceneDelta?: SessionSceneDelta }, stateId: string) { return receive(message, stateId, false) as string | undefined; },
    readDocument(message: { sceneJson?: string; sceneDelta?: SessionSceneDelta }, stateId: string) { return receive(message, stateId, true); },
  };
}
