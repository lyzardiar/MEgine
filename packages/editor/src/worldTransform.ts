// Author: MiYu. Resolve hierarchy TRS and reuse immutable nodes only with the same resolved parent.
import type { TransformData } from '@mengine/behaviour';
import {
  add,
  quatMul,
  quatNormalize,
  quatRotateVec,
  type Quat,
  type Vec3,
} from './math3d.ts';

export type WorldTransformEntity = {
  entity: number;
  parent?: number | null;
  active?: boolean;
  components: Record<string, unknown>;
};

export type ResolvedWorldTransform = {
  active: boolean;
  hasTransform: boolean;
  transform: TransformData;
};

const IDENTITY: TransformData = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

const INVALID: ResolvedWorldTransform = {
  active: false,
  hasTransform: false,
  transform: IDENTITY,
};
const ROOT: ResolvedWorldTransform = { active: true, hasTransform: false, transform: IDENTITY };
type OwnedTransformCache = WeakMap<WorldTransformEntity, { parent: ResolvedWorldTransform; value: ResolvedWorldTransform }>;

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTransform(raw: unknown): TransformData | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<TransformData>;
  return {
    position: [
      finite(value.position?.[0], 0),
      finite(value.position?.[1], 0),
      finite(value.position?.[2], 0),
    ],
    rotation: quatNormalize([
      finite(value.rotation?.[0], 0),
      finite(value.rotation?.[1], 0),
      finite(value.rotation?.[2], 0),
      finite(value.rotation?.[3], 1),
    ]),
    scale: [
      finite(value.scale?.[0], 1),
      finite(value.scale?.[1], 1),
      finite(value.scale?.[2], 1),
    ],
  };
}

function compose(parent: TransformData, local: TransformData): TransformData {
  const scaledLocal: Vec3 = [
    local.position[0] * parent.scale[0],
    local.position[1] * parent.scale[1],
    local.position[2] * parent.scale[2],
  ];
  return {
    position: add(parent.position, quatRotateVec(parent.rotation as Quat, scaledLocal)),
    rotation: quatNormalize(quatMul(parent.rotation as Quat, local.rotation as Quat)),
    scale: [
      parent.scale[0] * local.scale[0],
      parent.scale[1] * local.scale[1],
      parent.scale[2] * local.scale[2],
    ],
  };
}

export function buildWorldTransforms(
  entities: readonly WorldTransformEntity[],
  roots?: Iterable<number>,
): Map<number, ResolvedWorldTransform> {
  return resolveWorldTransforms(entities, roots);
}

/** Only fixed owned frame records may enter this reader; mutable editing uses buildWorldTransforms. */
export function createOwnedWorldTransformReader() {
  const cache: OwnedTransformCache = new WeakMap();
  return (entities: readonly WorldTransformEntity[], roots?: Iterable<number>) => resolveWorldTransforms(entities, roots, cache);
}

function resolveWorldTransforms(entities: readonly WorldTransformEntity[], roots?: Iterable<number>, cache?: OwnedTransformCache): Map<number, ResolvedWorldTransform> {
  let byId: Map<number, WorldTransformEntity> | undefined;
  let sparseLookups = 0;
  const findEntity = (id: number) => {
    // Camera queries usually touch a shallow parent chain; cap scans before indexing deeper hierarchies.
    if (roots && !byId && sparseLookups++ < 4) {
      for (let index = entities.length - 1; index >= 0; index--) {
        const entity = entities[index];
        if (entity.entity === id || Number.isNaN(entity.entity) && Number.isNaN(id)) return entity;
      }
      return undefined;
    }
    if (!byId) {
      byId = new Map();
      for (const entity of entities) byId.set(entity.entity, entity);
    }
    return byId.get(id);
  };
  const resolved = new Map<number, ResolvedWorldTransform>();
  let requiresFullOrder = false;

  const resolve = (id: number, depth = 0): ResolvedWorldTransform => {
    const existing = resolved.get(id);
    if (existing === INVALID) { requiresFullOrder = true; return INVALID; }
    if (existing) return existing;
    if (roots && cache && depth >= 256) { requiresFullOrder = true; return INVALID; }
    const entity = findEntity(id);
    if (!entity) return INVALID;
    // Reserve traversal order and mark the active recursion path in the result itself.
    resolved.set(id, INVALID);
    const parentId = entity.parent ?? null;
    const parent = parentId == null
      ? cache ? ROOT : { active: true, hasTransform: false, transform: IDENTITY }
      : resolve(parentId, depth + 1);
    const previous = requiresFullOrder ? undefined : cache?.get(entity);
    if (previous?.parent === parent) { resolved.set(id, previous.value); return previous.value; }
    const local = normalizeTransform(entity.components.Transform);
    const value: ResolvedWorldTransform = {
      active: parent.active && entity.active !== false,
      hasTransform: local != null,
      transform: local ? compose(parent.transform, local) : parent.transform,
    };
    resolved.set(id, value);
    if (!requiresFullOrder) cache?.set(entity, { parent, value });
    return value;
  };

  if (roots) { for (const id of roots) resolve(id); }
  else { for (const entity of entities) resolve(entity.entity); }
  // Deep and cyclic hierarchies retain the full resolver's author order and bounded sparse recursion.
  if (roots && cache && requiresFullOrder) return resolveWorldTransforms(entities);
  return resolved;
}

export function resolvedTransform(
  nodes: ReadonlyMap<number, ResolvedWorldTransform>,
  entity: number,
): TransformData | null {
  const node = nodes.get(entity);
  return node?.hasTransform ? node.transform : null;
}

export function parentWorldTransform(
  entities: readonly WorldTransformEntity[],
  nodes: ReadonlyMap<number, ResolvedWorldTransform>,
  entity: number,
): TransformData | null {
  const parent = entities.find((candidate) => candidate.entity === entity)?.parent ?? null;
  if (parent == null) return IDENTITY;
  return nodes.get(parent)?.transform ?? null;
}

export function worldPointToLocal(parent: TransformData, point: Vec3): Vec3 {
  const inverse = quatNormalize([
    -parent.rotation[0],
    -parent.rotation[1],
    -parent.rotation[2],
    parent.rotation[3],
  ]);
  const delta = quatRotateVec(inverse, [
    point[0] - parent.position[0],
    point[1] - parent.position[1],
    point[2] - parent.position[2],
  ]);
  return [
    Math.abs(parent.scale[0]) > 1e-7 ? delta[0] / parent.scale[0] : 0,
    Math.abs(parent.scale[1]) > 1e-7 ? delta[1] / parent.scale[1] : 0,
    Math.abs(parent.scale[2]) > 1e-7 ? delta[2] / parent.scale[2] : 0,
  ];
}

export function worldDeltaToLocal(parent: TransformData, delta: Vec3): Vec3 {
  return worldPointToLocal(
    { ...parent, position: [0, 0, 0] },
    delta,
  );
}

export function worldAxisScaleDeltaToLocal(
  parent: TransformData,
  component: 0 | 1 | 2,
  worldAmount: number,
): number {
  const worldUnitsPerLocalUnit = Math.max(1e-7, Math.abs(parent.scale[component]));
  return worldAmount / worldUnitsPerLocalUnit;
}

export function worldRotationToLocal(parent: TransformData, rotation: Quat): Quat {
  const inverse: Quat = quatNormalize([
    -parent.rotation[0],
    -parent.rotation[1],
    -parent.rotation[2],
    parent.rotation[3],
  ]);
  return quatNormalize(quatMul(inverse, rotation));
}

export function worldTransformToLocal(
  parent: TransformData,
  world: TransformData,
): TransformData {
  return {
    position: worldPointToLocal(parent, world.position),
    rotation: worldRotationToLocal(parent, world.rotation as Quat),
    scale: [
      Math.abs(parent.scale[0]) > 1e-7 ? world.scale[0] / parent.scale[0] : world.scale[0],
      Math.abs(parent.scale[1]) > 1e-7 ? world.scale[1] / parent.scale[1] : world.scale[1],
      Math.abs(parent.scale[2]) > 1e-7 ? world.scale[2] / parent.scale[2] : world.scale[2],
    ],
  };
}
