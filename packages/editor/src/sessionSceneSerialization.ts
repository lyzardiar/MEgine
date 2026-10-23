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
