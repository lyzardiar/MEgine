import type {
  Camera2DData,
  Camera3DData,
  TransformData,
} from '@mengine/behaviour';
import { add, type Camera, type Vec3 } from './math3d.ts';
import { transformBasis } from './editorGizmos.ts';
import { buildWorldTransforms, resolvedTransform } from './worldTransform.ts';

export type GameCameraKind = '2d' | '3d';

export type ResolvedGameCamera = Camera & {
  entity: number;
  kind: GameCameraKind;
};

type CameraEntity = {
  entity: number;
  parent?: number | null;
  active?: boolean;
  components: Record<string, unknown>;
};

function transformCamera(
  entity: CameraEntity,
  transform: TransformData,
  kind: GameCameraKind,
  projection: Camera['projection'],
  orthographicSize: number,
  fovYDeg: number,
): ResolvedGameCamera {
  const eye = transform.position as Vec3;
  const { forward } = transformBasis(transform.rotation);
  return {
    entity: entity.entity,
    kind,
    eye,
    target: add(eye, forward),
    fovYDeg,
    projection,
    orthographicSize,
  };
}

/** Resolve the camera used by Game view. A primary 2D camera intentionally wins over 3D. */
export function primaryGameCamera(
  entities: CameraEntity[],
  isActive?: (id: number) => boolean,
): ResolvedGameCamera | null {
  const world = buildWorldTransforms(entities);
  for (const entity of entities) {
    if (!world.get(entity.entity)?.active || (isActive && !isActive(entity.entity))) continue;
    const camera = entity.components.Camera2D as Camera2DData | undefined;
    const transform = resolvedTransform(world, entity.entity) ?? undefined;
    if (camera?.primary && transform) {
      return transformCamera(
        entity,
        transform,
        '2d',
        'orthographic',
        Math.max(0.001, Number(camera.size) || 5),
        60,
      );
    }
  }

  for (const entity of entities) {
    if (!world.get(entity.entity)?.active || (isActive && !isActive(entity.entity))) continue;
    const camera = entity.components.Camera3D as Camera3DData | undefined;
    const transform = resolvedTransform(world, entity.entity) ?? undefined;
    if (camera?.primary && transform) {
      const projection = camera.projection?.toLowerCase() === 'orthographic'
        ? 'orthographic'
        : 'perspective';
      return transformCamera(
        entity,
        transform,
        '3d',
        projection,
        Math.max(0.001, Number(camera.orthographic_size) || 5),
        Number(camera.fov_y_degrees) || 60,
      );
    }
  }

  return null;
}
