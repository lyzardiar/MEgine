// Author: MiYu. Reuse immutable runtime entity JSON in compact cross-window scene messages.
import { isRetainedPlayRecord } from './playWorldSync.ts';
import type { EntityRec } from './entityRecord.ts';

type SessionDocument = { world: { entities: readonly EntityRec[]; [key: string]: unknown }; [key: string]: unknown };
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

/** MiYu: publish only changed entity JSON; each delta names its exact predecessor. */
export function createSessionScenePublisher() {
  const serialize = createSessionSceneSerializer();
  let records = new WeakMap<EntityRec, string>(), previous: string[] = [], state: string | null = null, scope: string | null = null;
  const reset = () => { previous = []; state = null; scope = null; records = new WeakMap(); };
  return { reset, publish(document: SessionDocument, stateId: string, scopeId: string, allowDelta: boolean): SessionSceneMessage {
    if (!ordinarySerialization()) { reset(); return { sceneJson: serialize(document) }; }
    const fragments = document.world.entities.map(entity => {
      let json = isRetainedPlayRecord(entity) ? records.get(entity) : undefined;
      if (json === undefined) { json = JSON.stringify(entity); if (isRetainedPlayRecord(entity)) records.set(entity, json); }
      return json;
    });
    const base = allowDelta && scope === scopeId ? state : null;
    const changed: [number, string][] = [];
    for (let index = 0; index < fragments.length; index++) if (base === null || fragments[index] !== previous[index]) changed.push([index, fragments[index]]);
    const header = serialize({ ...document, world: { ...document.world, entities: [] } });
    previous = fragments; state = stateId; scope = scopeId;
    return { sceneDelta: { base, header, length: fragments.length, changed } };
  } };
}

/** MiYu: keep one transport baseline, independent of editable store objects. Missing bases request a checkpoint. */
export function createSessionSceneReceiver() {
  let state: string | null = null, previous: string[] = [], resyncPending = false;
  const reset = () => { state = null; previous = []; resyncPending = false; };
  return { reset, requestCheckpoint() { if (resyncPending) return false; resyncPending = true; return true; }, read(message: { sceneJson?: string; sceneDelta?: SessionSceneDelta }, stateId: string): string | undefined {
    if (message.sceneJson !== undefined) { reset(); return message.sceneJson; }
    const delta = message.sceneDelta;
    if (!delta) throw new Error('Missing scene delta');
    if (delta.base !== null && delta.base !== state) return undefined;
    if (!Number.isSafeInteger(delta.length) || delta.length < 0 || !delta.header.endsWith('"entities":[]}}')) throw new Error('Invalid scene delta header');
    const next = delta.base === null ? [] : previous.slice(0, delta.length);
    const indices = new Set<number>();
    for (const [index, json] of delta.changed) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= delta.length || indices.has(index) || typeof json !== 'string') throw new Error('Invalid scene delta entity');
      indices.add(index); next[index] = json;
    }
    for (let index = 0; index < delta.length; index++) if (next[index] === undefined) throw new Error('Incomplete scene delta');
    const json = sceneFromFragments(delta.header, next);
    previous = next; state = stateId; resyncPending = false;
    return json;
  } };
}
