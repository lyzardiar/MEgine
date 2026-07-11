import type { Behaviour } from './Behaviour.js';
import type { BehaviourContext, BehaviourEntry } from './types.js';
import { componentTypeName, type ComponentType } from './components.js';
import { getBehaviour, isBehaviourType, listBehaviours } from './registry.js';

export type BehaviourInstance = {
  entity: number;
  type: string;
  instance: Behaviour;
};

export type EntityLike = {
  entity: number;
  active?: boolean;
  components: Record<string, unknown>;
};

function makeCtx(
  entity: EntityLike,
  dt: number,
  writeBack: (type: string, value: Record<string, unknown>) => void,
): BehaviourContext {
  const resolve = (key: string | ComponentType) => componentTypeName(key);

  return {
    dt,
    entity: entity.entity,
    get: ((key: string | ComponentType) => {
      return entity.components[resolve(key)];
    }) as BehaviourContext['get'],
    set: ((key: string | ComponentType, value: Record<string, unknown>) => {
      const type = resolve(key);
      entity.components[type] = value;
      writeBack(type, value);
    }) as BehaviourContext['set'],
    patch: ((key: string | ComponentType, patch: Record<string, unknown>) => {
      const type = resolve(key);
      const prev = (entity.components[type] as Record<string, unknown>) ?? {};
      const next = { ...prev, ...patch };
      entity.components[type] = next;
      writeBack(type, next);
    }) as BehaviourContext['patch'],
  };
}

/**
 * Creates Behaviour instances from entity component blobs for Play mode.
 * Syncs serializable fields from instance → blob after each update so Inspector stays live.
 */
export function createBehaviourRunner() {
  let instances: BehaviourInstance[] = [];

  const syncBlob = (inst: BehaviourInstance, entity: EntityLike, entry: BehaviourEntry) => {
    const blob: Record<string, unknown> = {};
    const obj = inst.instance as Behaviour & Record<string, unknown>;
    for (const f of entry.fields) {
      if (!f.serialize) continue;
      const v = obj[f.key];
      blob[f.key] = Array.isArray(v) ? [...v] : v;
    }
    entity.components[inst.type] = blob;
  };

  /** Inspector / 外部改 blob 后，在 onUpdate 前拉回实例字段 */
  const pullFromBlob = (inst: BehaviourInstance, entity: EntityLike, entry: BehaviourEntry) => {
    const data = entity.components[inst.type];
    if (!data || typeof data !== 'object') return;
    const src = data as Record<string, unknown>;
    const obj = inst.instance as Behaviour & Record<string, unknown>;
    for (const f of entry.fields) {
      if (!f.serialize) continue;
      if (!(f.key in src)) continue;
      const v = src[f.key];
      obj[f.key] = Array.isArray(v) ? [...v] : v;
    }
  };

  return {
    mount(entities: EntityLike[]) {
      this.unmount();
      for (const e of entities) {
        for (const [type, data] of Object.entries(e.components)) {
          const entry = getBehaviour(type);
          if (!entry) continue;
          const instance = new entry.ctor();
          if (data && typeof data === 'object') {
            Object.assign(instance, structuredClone(data));
          }
          const ctx = makeCtx(e, 0, () => {});
          instance.onEnable(ctx);
          instances.push({ entity: e.entity, type, instance });
        }
      }
    },

    tick(entities: EntityLike[], dt: number) {
      const byId = new Map(entities.map((e) => [e.entity, e]));
      for (const inst of instances) {
        const e = byId.get(inst.entity);
        if (!e || e.active === false) continue;
        const entry = getBehaviour(inst.type);
        if (!entry) continue;
        pullFromBlob(inst, e, entry);
        const ctx = makeCtx(e, dt, () => {});
        inst.instance.onUpdate(ctx);
        syncBlob(inst, e, entry);
      }
    },

    unmount() {
      for (const inst of instances) {
        try {
          inst.instance.onDisable({
            dt: 0,
            entity: inst.entity,
            get: () => undefined,
            set: () => {},
            patch: () => {},
          });
        } catch {
          /* ignore */
        }
      }
      instances = [];
    },

    /**
     * Call a Behaviour method on the live Play instance.
     * Returns updated serialized blob, or null if no live instance.
     */
    invoke(
      entityId: number,
      type: string,
      methodKey: string,
      entities: EntityLike[],
    ): Record<string, unknown> | null {
      const inst = instances.find((i) => i.entity === entityId && i.type === type);
      const entry = getBehaviour(type);
      const e = entities.find((x) => x.entity === entityId);
      if (!inst || !entry || !e) return null;
      pullFromBlob(inst, e, entry);
      const fn = (inst.instance as unknown as Record<string, unknown>)[methodKey];
      if (typeof fn === 'function') {
        (fn as (this: Behaviour) => void).call(inst.instance);
      }
      syncBlob(inst, e, entry);
      return e.components[type] as Record<string, unknown>;
    },

    list: listBehaviours,
    isBehaviourType,
  };
}

export type BehaviourRunner = ReturnType<typeof createBehaviourRunner>;
