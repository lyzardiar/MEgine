import type {
  Camera2DData,
  Camera3DData,
  TransformData,
} from '@mengine/behaviour';
import {
  add,
  quatNormalize,
  quatSlerp,
  type Camera,
  type Quat,
  type Vec3,
} from './math3d.ts';
import { transformBasis } from './editorGizmos.ts';
import { buildWorldTransforms, resolvedTransform } from './worldTransform.ts';
import type { TimelineCameraPreview } from './timelineScenePreview.ts';

export type GameCameraKind = '2d' | '3d';
export type CameraClearFlags = 'scene' | 'skybox' | 'solid_color';

export type ResolvedGameCamera = Camera & {
  entity: number;
  kind: GameCameraKind;
  rotation: Quat;
  near: number;
  far: number;
  clearFlags: CameraClearFlags;
  backgroundColor: [number, number, number, number];
};

type CameraEntity = {
  entity: number;
  parent?: number | null;
  active?: boolean;
  components: Record<string, unknown>;
};

function finiteOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function transformCamera(
  entity: CameraEntity,
  transform: TransformData,
  kind: GameCameraKind,
  projection: Camera['projection'],
  orthographicSize: number,
  fovYDeg: number,
  near: number,
  far: number,
  clearFlags: unknown,
  backgroundColor: unknown,
): ResolvedGameCamera {
  const eye = transform.position as Vec3;
  const rotation = quatNormalize(transform.rotation as Quat);
  const { forward, up } = transformBasis(rotation);
  return {
    entity: entity.entity,
    kind,
    eye,
    target: add(eye, forward),
    up,
    rotation,
    fovYDeg: Math.max(1, Math.min(179, fovYDeg)),
    projection,
    orthographicSize,
    near,
    far,
    clearFlags: normalizeCameraClearFlags(clearFlags),
    backgroundColor: normalizeCameraBackgroundColor(backgroundColor),
  };
}

function cameraForEntity(
  entities: readonly CameraEntity[],
  world: ReturnType<typeof buildWorldTransforms>,
  id: number,
): ResolvedGameCamera | null {
  const entity = entities.find((candidate) => candidate.entity === id);
  const transform = entity ? resolvedTransform(world, id) : null;
  if (!entity || !transform) return null;
  const camera2D = entity.components.Camera2D as Camera2DData | undefined;
  const camera3D = entity.components.Camera3D as Camera3DData | undefined;
  if (Boolean(camera2D) === Boolean(camera3D)) return null;
  if (camera2D) {
    return transformCamera(
      entity,
      transform,
      '2d',
      'orthographic',
      Math.max(0.001, finiteOr(camera2D.size, 5)),
      60,
      0.01,
      1000,
      camera2D.clear_flags,
      camera2D.background_color,
    );
  }
  const projection = camera3D!.projection?.toLowerCase() === 'orthographic'
    ? 'orthographic'
    : 'perspective';
  const near = Math.max(0.001, finiteOr(camera3D!.near, 0.1));
  const far = Math.max(near + 0.001, finiteOr(camera3D!.far, 1000));
  return transformCamera(
    entity,
    transform,
    '3d',
    projection,
    Math.max(0.001, finiteOr(camera3D!.orthographic_size, 5)),
    finiteOr(camera3D!.fov_y_degrees, 60),
    near,
    far,
    camera3D!.clear_flags,
    camera3D!.background_color,
  );
}

function primaryGameCameraFromWorld(
  entities: readonly CameraEntity[],
  world: ReturnType<typeof buildWorldTransforms>,
  isActive?: (id: number) => boolean,
): ResolvedGameCamera | null {
  for (const kind of ['Camera2D', 'Camera3D'] as const) {
    for (const entity of entities) {
      if (!world.get(entity.entity)?.active || (isActive && !isActive(entity.entity))) continue;
      const camera = entity.components[kind] as { primary?: boolean } | undefined;
      if (!camera?.primary) continue;
      const resolved = cameraForEntity(entities, world, entity.entity);
      if (resolved) return resolved;
    }
  }
  return null;
}

function defaultTimelineCamera(): ResolvedGameCamera {
  const halfAngle = -0.35877067 * 0.5;
  const rotation = quatNormalize([Math.sin(halfAngle), 0, 0, Math.cos(halfAngle)]);
  const eye: Vec3 = [0, 1.5, 4];
  const { forward, up } = transformBasis(rotation);
  return {
    entity: -1,
    kind: '3d',
    eye,
    target: add(eye, forward),
    up,
    rotation,
    fovYDeg: 60,
    projection: 'perspective',
    orthographicSize: 5,
    near: 0.1,
    far: 100,
    clearFlags: 'scene',
    backgroundColor: [0.1, 0.1, 0.14, 1],
  };
}

function blendGameCameras(
  source: ResolvedGameCamera,
  target: ResolvedGameCamera,
  amount: number,
): ResolvedGameCamera {
  const weight = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
  if (source.projection !== target.projection) return weight < 0.5 ? source : target;
  const rotation = quatSlerp(source.rotation, target.rotation, weight);
  const eye: Vec3 = source.eye.map((value, index) => (
    value + (target.eye[index] - value) * weight
  )) as Vec3;
  const { forward, up } = transformBasis(rotation);
  return {
    entity: weight < 0.5 ? source.entity : target.entity,
    kind: weight < 0.5 ? source.kind : target.kind,
    eye,
    target: add(eye, forward),
    up,
    rotation,
    fovYDeg: source.fovYDeg + (target.fovYDeg - source.fovYDeg) * weight,
    projection: target.projection,
    orthographicSize: (source.orthographicSize ?? 5)
      + ((target.orthographicSize ?? 5) - (source.orthographicSize ?? 5)) * weight,
    near: source.near + (target.near - source.near) * weight,
    far: source.far + (target.far - source.far) * weight,
    clearFlags: weight < 0.5 ? source.clearFlags : target.clearFlags,
    backgroundColor: source.backgroundColor.map((value, index) => (
      value + (target.backgroundColor[index] - value) * weight
    )) as [number, number, number, number],
  };
}

export function normalizeCameraClearFlags(value: unknown): CameraClearFlags {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'skybox') return 'skybox';
  if (normalized === 'solid_color' || normalized === 'solidcolor' || normalized === 'solid') {
    return 'solid_color';
  }
  return 'scene';
}

export function normalizeCameraBackgroundColor(
  value: unknown,
): [number, number, number, number] {
  const fallback: [number, number, number, number] = [0.1, 0.1, 0.14, 1];
  if (!Array.isArray(value)) return fallback;
  return fallback.map((channel, index) => {
    const number = Number(value[index]);
    if (!Number.isFinite(number)) return channel;
    return Math.max(0, Math.min(1, number));
  }) as [number, number, number, number];
}

/** Resolve the camera used by Game view. A primary 2D camera intentionally wins over 3D. */
export function primaryGameCamera(
  entities: readonly CameraEntity[],
  isActive?: (id: number) => boolean,
): ResolvedGameCamera | null {
  const world = buildWorldTransforms(entities);
  return primaryGameCameraFromWorld(entities, world, isActive);
}

/** Resolve a virtual Timeline shot without mutating authored Camera components. */
export function timelineGameCamera(
  entities: readonly CameraEntity[],
  preview: TimelineCameraPreview | null | undefined,
  isActive?: (id: number) => boolean,
): ResolvedGameCamera | null {
  const world = buildWorldTransforms(entities);
  const primary = primaryGameCameraFromWorld(entities, world, isActive);
  if (!preview) return primary;
  const target = cameraForEntity(entities, world, preview.target);
  if (!target) return primary;
  const source = preview.source == null
    ? primary ?? defaultTimelineCamera()
    : cameraForEntity(entities, world, preview.source);
  if (!source) return primary;
  return blendGameCameras(source, target, preview.weight);
}
