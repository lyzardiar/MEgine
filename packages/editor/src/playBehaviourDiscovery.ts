// Author: MiYu. Reuse negative script discovery only for factory-owned immutable Play worlds.
import { getBehaviour, getBehaviourRegistrationToken } from '@mengine/behaviour';
import { isRetainedPlayRecord, isRetainedPlayWorld, retainedPlayWorldChanges, type RetainedPlayWorld } from './playWorldSync';

const keys = Object.keys, descriptor = Object.getOwnPropertyDescriptor, iterator = Array.prototype[Symbol.iterator];
const nativeEnumeration = [keys, iterator].every(fn => Function.prototype.toString.call(fn).includes('[native code]'));

export function createPlayBehaviourDiscovery(expose?: () => void) {
  const records = new WeakMap<object, { token: object; absent: boolean }>();
  let previous: WeakRef<RetainedPlayWorld> | undefined, previousToken: object | undefined, previousAbsent = false;
  const absentFromRecord = (entity: RetainedPlayWorld['entities'][number], token: object) => {
    if (!isRetainedPlayRecord(entity)) return false;
    const cached = records.get(entity);
    if (cached?.token === token) return cached.absent;
    let absent = true;
    for (const type of keys(entity.components)) if (getBehaviour(type) !== undefined) { absent = false; break; }
    records.set(entity, { token, absent });
    return absent;
  };
  return {
    /** False means discovery must use the complete mutable world and normal lifecycle. */
    hasNoBehaviours(world: RetainedPlayWorld | undefined): boolean {
      if (!world || !isRetainedPlayWorld(world)) return false;
      if (!nativeEnumeration || descriptor(Object, 'keys')?.value !== keys || descriptor(Array.prototype, Symbol.iterator)?.value !== iterator) { expose?.(); return false; }
      const token = getBehaviourRegistrationToken(), last = previous?.deref();
      const changes = last ? retainedPlayWorldChanges(last, world) : undefined;
      if (changes && changes.length > world.entities.length / 2) {
        // Dense updates use the existing scan; do not populate a record cache on every replacement.
        previous = new WeakRef(world); previousToken = token; previousAbsent = false;
        return false;
      }
      let absent: boolean;
      if (previousToken === token && previousAbsent && last?.entities === world.entities) absent = true;
      else {
        const sparse = previousToken === token && previousAbsent ? changes : undefined;
        absent = true;
        if (sparse) {
          for (const index of sparse) if (!absentFromRecord(world.entities[index], token)) { absent = false; break; }
        } else for (const entity of world.entities) if (!absentFromRecord(entity, token)) { absent = false; break; }
      }
      previous = new WeakRef(world); previousToken = token; previousAbsent = absent;
      return absent;
    },
  };
}
