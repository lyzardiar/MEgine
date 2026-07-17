import type { TransformData } from '@mengine/behaviour';
import type { Vec3 } from './math3d';
import {
  add,
  dot,
  quatAxisAngle,
  quatMul,
  quatNormalize,
  quatRotateVec,
  scale as vecScale,
  sub,
} from './math3d.ts';
import type { ToolPivotMode } from './editorTool';
import { selectedHierarchyRoots } from './hierarchySelection.ts';

export type TransformSelectionEntity = {
  entity: number;
  parent?: number | null;
  components: Record<string, unknown>;
};

function transformOf(entity: TransformSelectionEntity | undefined): TransformData | null {
  const value = entity?.components.Transform as TransformData | undefined;
  if (!value || !Array.isArray(value.position) || value.position.length < 3) return null;
  if (!value.position.every(Number.isFinite)) return null;
  return value;
}

/** Selected hierarchy roots that can participate in a Transform gesture. */
export function selectedTransformRoots(
  entities: TransformSelectionEntity[],
  selectedIds: readonly number[],
  primary: number,
): number[] {
  const ids = selectedIds.includes(primary) ? [...selectedIds] : [primary];
  const roots = selectedHierarchyRoots(entities, ids);
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  return roots.filter((id) => transformOf(byId.get(id)) != null);
}

/**
 * Pivot uses the active object's origin. Center uses the bounds center of all
 * selected Transform roots, matching Unity's multi-selection handle position.
 */
export function transformHandleOrigin(
  entities: TransformSelectionEntity[],
  selectedIds: readonly number[],
  primary: number,
  mode: ToolPivotMode,
): Vec3 | null {
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  const primaryTransform = transformOf(byId.get(primary));
  if (!primaryTransform) return null;
  if (mode === 'pivot') return [...primaryTransform.position] as Vec3;

  const roots = selectedTransformRoots(entities, selectedIds, primary);
  const positions = roots
    .map((id) => transformOf(byId.get(id))?.position)
    .filter((position): position is Vec3 => position != null);
  if (!positions.length) return [...primaryTransform.position] as Vec3;

  const min: Vec3 = [...positions[0]];
  const max: Vec3 = [...positions[0]];
  for (const position of positions.slice(1)) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], position[axis]);
      max[axis] = Math.max(max[axis], position[axis]);
    }
  }
  return [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ];
}

export function rotateTransformAround(
  transform: TransformData,
  pivot: Vec3,
  axis: Vec3,
  degrees: number,
): TransformData {
  const delta = quatAxisAngle(axis, degrees);
  return {
    ...transform,
    position: add(
      pivot,
      quatRotateVec(delta, sub(transform.position, pivot)),
    ) as TransformData['position'],
    rotation: quatNormalize(
      quatMul(delta, transform.rotation),
    ) as TransformData['rotation'],
  };
}

export function scaleTransformAlong(
  transform: TransformData,
  pivot: Vec3,
  component: 0 | 1 | 2,
  axisWorld: Vec3,
  factor: number,
): TransformData {
  const relative = sub(transform.position, pivot);
  const along = dot(relative, axisWorld);
  const scale = [...transform.scale] as TransformData['scale'];
  scale[component] = Math.max(0.01, scale[component] * factor);
  return {
    ...transform,
    position: add(
      transform.position,
      vecScale(axisWorld, along * (factor - 1)),
    ) as TransformData['position'],
    scale,
  };
}
