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

type ResolveState = { visiting: true } | { visiting: false; value: ResolvedWorldTransform };

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
): Map<number, ResolvedWorldTransform> {
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  const states = new Map<number, ResolveState>();

  const resolve = (id: number): ResolvedWorldTransform => {
    const existing = states.get(id);
    if (existing?.visiting) return INVALID;
    if (existing && !existing.visiting) return existing.value;
    const entity = byId.get(id);
    if (!entity) return INVALID;
    states.set(id, { visiting: true });
    const parentId = entity.parent ?? null;
    const parent = parentId == null
      ? { active: true, hasTransform: false, transform: IDENTITY }
      : resolve(parentId);
    const local = normalizeTransform(entity.components.Transform);
    const value: ResolvedWorldTransform = {
      active: parent.active && entity.active !== false,
      hasTransform: local != null,
      transform: local ? compose(parent.transform, local) : parent.transform,
    };
    states.set(id, { visiting: false, value });
    return value;
  };

  for (const entity of entities) resolve(entity.entity);
  return new Map(
    [...states.entries()].flatMap(([id, state]) => state.visiting ? [] : [[id, state.value]]),
  );
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
