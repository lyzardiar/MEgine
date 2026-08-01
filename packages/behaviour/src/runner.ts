import type { Behaviour } from './Behaviour.js';
import type { BehaviourContext, BehaviourEntry } from './types.js';
import { componentTypeName, type ComponentType } from './components.js';
import { getBehaviour, isBehaviourType, listBehaviours } from './registry.js';

export type BehaviourInstance = {
  entity: number;
  type: string;
  instance: Behaviour;
  enabled: boolean;
  entityState: EntityLike;
};

export type EntityLike = {
  entity: number;
  parent?: number | null;
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

  const hasComponent = (entity: EntityLike, type: string) => (
    Object.prototype.hasOwnProperty.call(entity.components, type)
  );

  const activeInHierarchy = (entities: EntityLike[]) => {
    const byId = new Map(entities.map((entity) => [entity.entity, entity]));
    const result = new Map<number, boolean>();
    const visiting = new Set<number>();
    const resolve = (entity: EntityLike): boolean => {
      const cached = result.get(entity.entity);
      if (cached !== undefined) return cached;
      if (entity.active === false || visiting.has(entity.entity)) {
        result.set(entity.entity, false);
        return false;
      }
      visiting.add(entity.entity);
      const parent = entity.parent == null ? undefined : byId.get(entity.parent);
      const active = parent ? resolve(parent) : true;
      visiting.delete(entity.entity);
      result.set(entity.entity, active);
      return active;
    };
    for (const entity of entities) resolve(entity);
    return result;
  };

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

  const enable = (inst: BehaviourInstance, entity: EntityLike, entry: BehaviourEntry) => {
    pullFromBlob(inst, entity, entry);
    inst.entityState = entity;
    inst.enabled = true;
    inst.instance.onEnable(makeCtx(entity, 0, () => {}));
    if (hasComponent(entity, inst.type)) syncBlob(inst, entity, entry);
  };

  const disable = (
    inst: BehaviourInstance,
    entity: EntityLike,
    entry: BehaviourEntry,
    preserveComponent: boolean,
  ) => {
    if (!inst.enabled) return;
    if (hasComponent(entity, inst.type)) pullFromBlob(inst, entity, entry);
    try {
      inst.instance.onDisable(makeCtx(entity, 0, () => {}));
    } finally {
      inst.enabled = false;
      if (preserveComponent && hasComponent(entity, inst.type)) {
        syncBlob(inst, entity, entry);
      } else if (!preserveComponent) {
        delete entity.components[inst.type];
      }
    }
  };

  const createInstance = (
    entity: EntityLike,
    type: string,
    data: unknown,
    entry: BehaviourEntry,
    active: boolean,
  ) => {
    const instance = new entry.ctor();
    if (data && typeof data === 'object') {
      Object.assign(instance, structuredClone(data));
    }
    const mounted: BehaviourInstance = {
      entity: entity.entity,
      type,
      instance,
      enabled: false,
      entityState: entity,
    };
    instances.push(mounted);
    if (active) enable(mounted, entity, entry);
  };

  return {
    mount(entities: EntityLike[]) {
      this.unmount();
      const activeStates = activeInHierarchy(entities);
      for (const e of entities) {
        for (const [type, data] of Object.entries(e.components)) {
          const entry = getBehaviour(type);
          if (!entry) continue;
          createInstance(e, type, data, entry, activeStates.get(e.entity) === true);
        }
      }
    },

    tick(entities: EntityLike[], dt: number) {
      const byId = new Map(entities.map((e) => [e.entity, e]));
      const activeStates = activeInHierarchy(entities);
      const liveKeys = new Set<string>();
      const keyOf = (entity: number, type: string) => `${entity}\u0000${type}`;
      for (const entity of entities) {
        for (const type of Object.keys(entity.components)) {
          if (getBehaviour(type)) liveKeys.add(keyOf(entity.entity, type));
        }
      }

      const retained: BehaviourInstance[] = [];
      for (const inst of instances) {
        const entry = getBehaviour(inst.type);
        if (!entry) continue;
        const entity = byId.get(inst.entity);
        if (!entity || !liveKeys.has(keyOf(inst.entity, inst.type))) {
          disable(inst, entity ?? inst.entityState, entry, false);
          continue;
        }
        inst.entityState = entity;
        if (activeStates.get(entity.entity) !== true) {
          disable(inst, entity, entry, true);
        } else if (!inst.enabled) {
          enable(inst, entity, entry);
        }
        retained.push(inst);
      }
      instances = retained;

      const mountedKeys = new Set(instances.map((inst) => keyOf(inst.entity, inst.type)));
      for (const entity of entities) {
        for (const [type, data] of Object.entries(entity.components)) {
          const key = keyOf(entity.entity, type);
          if (mountedKeys.has(key)) continue;
          const entry = getBehaviour(type);
          if (!entry) continue;
          createInstance(
            entity,
            type,
            data,
            entry,
            activeStates.get(entity.entity) === true,
          );
          mountedKeys.add(key);
        }
      }

      for (const inst of instances) {
        if (!inst.enabled) continue;
        const entity = byId.get(inst.entity);
        const entry = getBehaviour(inst.type);
        if (!entity || !entry || !hasComponent(entity, inst.type)) continue;
        pullFromBlob(inst, entity, entry);
        inst.instance.onUpdate(makeCtx(entity, dt, () => {}));
        if (hasComponent(entity, inst.type)) syncBlob(inst, entity, entry);
      }
    },

    unmount() {
      for (const inst of instances) {
        const entry = getBehaviour(inst.type);
        if (!entry) continue;
        disable(inst, inst.entityState, entry, true);
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
      if (!inst || !entry || !e || !hasComponent(e, type)) return null;
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
