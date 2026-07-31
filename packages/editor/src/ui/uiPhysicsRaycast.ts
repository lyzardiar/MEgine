import {
  add,
  dot,
  norm,
  quatRotateVec,
  scale,
  screenPointRay,
  sub,
  type Camera,
  type Quat,
  type Vec3,
  type WorldRay,
} from '../math3d';
import { buildWorldTransforms } from '../worldTransform';
import type { Rect } from './rectLayout';

export type UiBlockingObjects = 'None' | 'TwoD' | 'ThreeD' | 'All';

export type UiRaycastPlane = {
  point: Vec3;
  normal: Vec3;
};

export type UiPhysicsRaycastSettings = {
  blockingObjects?: UiBlockingObjects;
  blockingMask?: number;
  raycastPlane?: UiRaycastPlane;
  raycastCamera?: Camera;
};

type EntityLike = {
  entity: number;
  parent?: number | null;
  active?: boolean;
  components: Record<string, unknown>;
};

type TransformLike = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};

const EPSILON = 1e-6;

export function parseUiBlockingObjects(value: unknown): UiBlockingObjects {
  switch (String(value ?? '').trim().toLowerCase()) {
    case '2d':
    case 'twod': return 'TwoD';
    case '3d':
    case 'threed': return 'ThreeD';
    case 'all': return 'All';
    default: return 'None';
  }
}

export function uiGraphicPhysicallyBlocked(
  settings: UiPhysicsRaycastSettings,
  x: number,
  y: number,
  entities: readonly EntityLike[],
  viewport: Rect,
  transforms?: ReturnType<typeof buildWorldTransforms>,
): boolean {
  if (
    settings.blockingObjects == null
    || settings.blockingObjects === 'None'
    || !settings.raycastPlane
    || !settings.raycastCamera
  ) return false;
  const ray = screenPointRay(x, y, settings.raycastCamera, viewport);
  const graphicDistance = rayPlaneDistance(ray, settings.raycastPlane);
  if (graphicDistance == null) return false;
  return raycastBlockingColliders(
    entities,
    ray,
    graphicDistance,
    settings.blockingObjects,
    settings.blockingMask ?? -1,
    transforms,
  ) != null;
}

export function raycastBlockingColliders(
  entities: readonly EntityLike[],
  ray: WorldRay,
  maxDistance: number,
  blocking: UiBlockingObjects,
  layerMask: number,
  resolvedTransforms = buildWorldTransforms(entities),
): { entity: number; distance: number } | null {
  if (blocking === 'None' || !Number.isFinite(maxDistance) || maxDistance < 0) return null;
  let closest: { entity: number; distance: number } | null = null;
  for (const entity of entities) {
    const resolved = resolvedTransforms.get(entity.entity);
    if (!resolved?.active || !resolved.hasTransform || !layerInMask(entity, layerMask)) continue;
    const transform = resolved.transform as TransformLike;
    const consider = (distance: number | null) => {
      if (distance == null || distance < 0 || distance > maxDistance) return;
      if (!closest || distance < closest.distance) closest = { entity: entity.entity, distance };
    };
    if (blocking === 'ThreeD' || blocking === 'All') {
      const box = record(entity.components.BoxCollider3D);
      if (box) consider(rayBox3d(ray, transform, box));
      const sphere = record(entity.components.SphereCollider3D);
      if (sphere) consider(raySphere3d(ray, transform, sphere));
    }
    if (blocking === 'TwoD' || blocking === 'All') {
      const box = record(entity.components.BoxCollider2D);
      if (box) consider(rayBox2d(ray, transform, box));
      const circle = record(entity.components.CircleCollider2D);
      if (circle) consider(rayCircle2d(ray, transform, circle));
    }
  }
  return closest;
}

function layerInMask(entity: EntityLike, mask: number): boolean {
  const layer = Math.trunc(number(record(entity.components.Layer)?.value, 0));
  return layer >= 0 && layer < 32 && ((Math.trunc(mask) | 0) & (1 << layer)) !== 0;
}

function rayBox3d(ray: WorldRay, transform: TransformLike, collider: Record<string, unknown>): number | null {
  const center = vec3(collider.center, [0, 0, 0]);
  const size = vec3(collider.size, [1, 1, 1]);
  const origin = sub(worldToLocalPoint(transform, ray.origin), center);
  const direction = worldToLocalVector(transform, ray.dir);
  return rayAabb(origin, direction, [
    Math.abs(size[0]) * 0.5,
    Math.abs(size[1]) * 0.5,
    Math.abs(size[2]) * 0.5,
  ]);
}

function raySphere3d(ray: WorldRay, transform: TransformLike, collider: Record<string, unknown>): number | null {
  const center = localToWorldPoint(transform, vec3(collider.center, [0, 0, 0]));
  const radius = Math.abs(number(collider.radius, 0.5)) * maximumScale(transform.scale);
  return raySphere(ray, center, radius);
}

function rayBox2d(ray: WorldRay, transform: TransformLike, collider: Record<string, unknown>): number | null {
  const origin = worldToLocalPoint(transform, ray.origin);
  const direction = worldToLocalVector(transform, ray.dir);
  if (Math.abs(direction[2]) <= EPSILON) return null;
  const distance = -origin[2] / direction[2];
  if (!Number.isFinite(distance) || distance < 0) return null;
  const point = add(origin, scale(direction, distance));
  const offset = vec2(collider.offset, [0, 0]);
  const size = vec2(collider.size, [1, 1]);
  return Math.abs(point[0] - offset[0]) <= Math.abs(size[0]) * 0.5
    && Math.abs(point[1] - offset[1]) <= Math.abs(size[1]) * 0.5
    ? distance
    : null;
}

function rayCircle2d(ray: WorldRay, transform: TransformLike, collider: Record<string, unknown>): number | null {
  const plane = {
    point: transform.position,
    normal: quatRotateVec(transform.rotation, [0, 0, 1]),
  };
  const distance = rayPlaneDistance(ray, plane);
  if (distance == null) return null;
  const offset = vec2(collider.offset, [0, 0]);
  const center = localToWorldPoint(transform, [offset[0], offset[1], 0]);
  const radius = Math.abs(number(collider.radius, 0.5))
    * Math.max(Math.abs(transform.scale[0]), Math.abs(transform.scale[1]));
  const delta = sub(add(ray.origin, scale(ray.dir, distance)), center);
  return dot(delta, delta) <= radius * radius ? distance : null;
}

function rayPlaneDistance(ray: WorldRay, plane: UiRaycastPlane): number | null {
  const normal = norm(plane.normal);
  const denominator = dot(normal, ray.dir);
  if (Math.abs(denominator) <= EPSILON) return null;
  const distance = dot(normal, sub(plane.point, ray.origin)) / denominator;
  return Number.isFinite(distance) && distance >= 0 ? distance : null;
}

function rayAabb(origin: Vec3, direction: Vec3, half: Vec3): number | null {
  let minimum = 0;
  let maximum = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis++) {
    const extent = Math.max(0.0005, half[axis]);
    if (Math.abs(direction[axis]) <= EPSILON) {
      if (origin[axis] < -extent || origin[axis] > extent) return null;
      continue;
    }
    const first = (-extent - origin[axis]) / direction[axis];
    const second = (extent - origin[axis]) / direction[axis];
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (maximum < minimum) return null;
  }
  return maximum >= 0 ? Math.max(0, minimum) : null;
}

function raySphere(ray: WorldRay, center: Vec3, radiusValue: number): number | null {
  const radius = Math.max(0.0005, radiusValue);
  const offset = sub(ray.origin, center);
  const projection = dot(offset, ray.dir);
  const discriminant = projection * projection - (dot(offset, offset) - radius * radius);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -projection - root;
  const far = -projection + root;
  return near >= 0 ? near : far >= 0 ? 0 : null;
}

function worldToLocalPoint(transform: TransformLike, point: Vec3): Vec3 {
  return divideScale(inverseRotate(transform.rotation, sub(point, transform.position)), transform.scale);
}

function worldToLocalVector(transform: TransformLike, vector: Vec3): Vec3 {
  return divideScale(inverseRotate(transform.rotation, vector), transform.scale);
}

function localToWorldPoint(transform: TransformLike, point: Vec3): Vec3 {
  return add(transform.position, quatRotateVec(transform.rotation, [
    point[0] * transform.scale[0],
    point[1] * transform.scale[1],
    point[2] * transform.scale[2],
  ]));
}

function inverseRotate(rotation: Quat, vector: Vec3): Vec3 {
  return quatRotateVec([-rotation[0], -rotation[1], -rotation[2], rotation[3]], vector);
}

function divideScale(value: Vec3, scaling: Vec3): Vec3 {
  return [
    value[0] / nonzero(scaling[0]),
    value[1] / nonzero(scaling[1]),
    value[2] / nonzero(scaling[2]),
  ];
}

function nonzero(value: number): number {
  return Math.abs(value) > EPSILON ? value : value < 0 ? -EPSILON : EPSILON;
}

function maximumScale(value: Vec3): number {
  return Math.max(Math.abs(value[0]), Math.abs(value[1]), Math.abs(value[2]));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function number(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function vec2(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  return [number(value[0], fallback[0]), number(value[1], fallback[1])];
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value)) return fallback;
  return [
    number(value[0], fallback[0]),
    number(value[1], fallback[1]),
    number(value[2], fallback[2]),
  ];
}
