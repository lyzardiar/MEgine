// Author: MiYu. Conservative octree candidates for the browser world renderer; simulation stays independent.
import { dot, lookBasis, quatRotateVec, type Camera, type Vec3 } from './math3d.ts';
export type Bounds = { min: Vec3; max: Vec3 };
type Plane = { normal: Vec3; distance: number };
type Branch = { bounds: Bounds; entries: number[]; children: Branch[]; residentLimit: number };
export function pointBounds(points: readonly Vec3[]): Bounds | null {
  if (!points.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    if (!Number.isFinite(point[axis])) return null;
    min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
  }
  return { min, max };
}
export function transformBounds(bounds: Bounds, transform: { position: number[]; scale: number[]; rotation: number[] }): Bounds | null {
  const [x, y, z, w] = transform.rotation;
  const half = [0, 1, 2].map(axis => Math.abs((bounds.max[axis] * 0.5 - bounds.min[axis] * 0.5) * transform.scale[axis]));
  const center = quatRotateVec(transform.rotation as [number, number, number, number], [0, 1, 2].map(axis => (bounds.min[axis] * 0.5 + bounds.max[axis] * 0.5) * transform.scale[axis]) as Vec3);
  // The absolute rotation matrix maps local half extents to the same world AABB as all eight corners.
  const extent = [
    Math.abs(1 - 2 * (y * y + z * z)) * half[0] + Math.abs(2 * (x * y - w * z)) * half[1] + Math.abs(2 * (x * z + w * y)) * half[2],
    Math.abs(2 * (x * y + w * z)) * half[0] + Math.abs(1 - 2 * (x * x + z * z)) * half[1] + Math.abs(2 * (y * z - w * x)) * half[2],
    Math.abs(2 * (x * z - w * y)) * half[0] + Math.abs(2 * (y * z + w * x)) * half[1] + Math.abs(1 - 2 * (x * x + y * y)) * half[2],
  ];
  const min = center.map((value, axis) => value + transform.position[axis] - extent[axis]) as Vec3;
  const max = center.map((value, axis) => value + transform.position[axis] + extent[axis]) as Vec3;
  return min.every(Number.isFinite) && max.every(Number.isFinite) ? { min, max } : null;
}
/** Owned frame transforms and model bounds are immutable; editable data must use transformBounds. */
export function createOwnedTransformBoundsReader(): typeof transformBounds {
  const cache = new WeakMap<Parameters<typeof transformBounds>[1], { local: Bounds; world: Bounds | null }>();
  return (local, transform) => {
    const previous = cache.get(transform);
    if (previous?.local === local) return previous.world;
    const world = transformBounds(local, transform);
    cache.set(transform, { local, world });
    return world;
  };
}
export function viewportPlanes(camera: Camera, aspect: number): Plane[] {
  const { forward, right, up } = lookBasis(camera.eye, camera.target, camera.up);
  const plane = (normal: Vec3, offset: number) => ({ normal, distance: offset - dot(normal, camera.eye) });
  const planes = [plane(forward, -Math.max(0.000001, camera.near ?? 0.08))];
  if (Number.isFinite(camera.far)) planes.push(plane(forward.map((v) => -v) as Vec3, camera.far!));
  const halfHeight = camera.projection === 'orthographic' ? Math.max(0.001, camera.orthographicSize ?? 5) : Math.tan(camera.fovYDeg * Math.PI / 360);
  // Slightly pad the lateral planes for outlines and Scene picking handles.
  for (const [axis, size] of [[right, halfHeight * aspect * 1.04], [up, halfHeight * 1.04]] as const) for (const sign of [-1, 1]) {
    const normal = axis.map((v, i) => v * sign + (camera.projection === 'orthographic' ? 0 : forward[i] * size)) as Vec3;
    planes.push(plane(normal, camera.projection === 'orthographic' ? size : 0));
  }
  return planes;
}
export function boundsVisible(bounds: Bounds, planes: readonly Plane[]) {
  return planes.every(({ normal, distance }) => {
    const positive = normal.map((v, axis) => v >= 0 ? bounds.max[axis] : bounds.min[axis]) as Vec3;
    const value = dot(normal, positive) + distance;
    return !Number.isFinite(value) || value >= -0.0001;
  });
}
const contains = (outer: Bounds, inner: Bounds) => outer.min.every((v, axis) => v <= inner.min[axis] && outer.max[axis] >= inner.max[axis]);
function branch(bounds: Bounds, entries: number[], all: readonly (Bounds | null)[], depth = 0): Branch {
  if (entries.length <= 32 || depth >= 8) return { bounds, entries, children: [], residentLimit: entries.length + 32 };
  const center = bounds.min.map((v, axis) => (v + bounds.max[axis]) / 2);
  const boxes: Bounds[] = Array.from({ length: 8 }, (_, i) => ({ min: bounds.min.map((v, axis) => (i & (1 << axis)) ? center[axis] : v) as Vec3, max: bounds.max.map((v, axis) => (i & (1 << axis)) ? v : center[axis]) as Vec3 }));
  const buckets: number[][] = boxes.map(() => []), resident: number[] = [];
  for (const i of entries) { const child = boxes.findIndex((box) => contains(box, all[i]!)); if (child < 0) resident.push(i); else buckets[child].push(i); }
  return { bounds, entries: resident, children: buckets.flatMap((bucket, i) => bucket.length ? [branch(boxes[i], bucket, all, depth + 1)] : []), residentLimit: resident.length + 32 };
}
export function createViewportSpatialIndex() {
  let bounds: (Bounds | null)[] = [], root: Branch | null = null, owners: Array<Branch | undefined> = [];
  const unknown = new Set<number>();
  const copy = (b: Bounds | null): Bounds | null => b ? { min: [...b.min], max: [...b.max] } : null;
  const same = (a: Bounds | null, b: Bounds | null) => a === b || !!(a && b && a.min.every((v, axis) => v === b.min[axis] && a.max[axis] === b.max[axis]));
  const rebuild = (next: readonly (Bounds | null)[]) => {
    bounds = next.map(copy); owners = new Array(bounds.length); unknown.clear();
    const known: number[] = [], total: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    bounds.forEach((b, i) => {
      if (!b) { unknown.add(i); return; } known.push(i);
      for (let axis = 0; axis < 3; axis++) { total.min[axis] = Math.min(total.min[axis], b.min[axis]); total.max[axis] = Math.max(total.max[axis], b.max[axis]); }
    });
    // Root slack absorbs small edge animation; queries still test each object's exact bounds.
    if (known.length) for (let axis = 0; axis < 3; axis++) {
      const padding = Math.max(0.001, (total.max[axis] - total.min[axis]) * 0.05);
      total.min[axis] -= padding; total.max[axis] += padding;
    }
    root = known.length ? branch(total, known, bounds) : null;
    const remember = (node: Branch) => { for (const i of node.entries) owners[i] = node; for (const child of node.children) remember(child); };
    if (root) remember(root);
  };
  return {
    update(next: readonly (Bounds | null)[]) {
      if (next.length !== bounds.length) { rebuild(next); return; }
      const changed: number[] = [];
      for (let i = 0; i < next.length; i++) {
        if (same(next[i], bounds[i])) continue;
        if (next[i] && (!root || !contains(root.bounds, next[i]!))) { rebuild(next); return; }
        changed.push(i);
      }
      const touched = new Set<Branch>();
      for (const i of changed) {
        const b = bounds[i] = copy(next[i]), owner = owners[i];
        // Fixed spatial cells remain conservative as poses change inside them.
        if (b && owner && contains(owner.bounds, b) && !owner.children.some(child => contains(child.bounds, b))) continue;
        if (owner) { owner.entries.splice(owner.entries.indexOf(i), 1); owners[i] = undefined; }
        if (!b) { unknown.add(i); continue; }
        unknown.delete(i);
        let node = root!, child: Branch | undefined;
        while ((child = node.children.find(candidate => contains(candidate.bounds, b)))) node = child;
        node.entries.push(i); owners[i] = node; touched.add(node);
      }
      // Repartition crowded cells after migration instead of accumulating a linear resident list.
      if ([...touched].some(node => node.entries.length > node.residentLimit)) rebuild(next);
    },
    query(planes: readonly Plane[]) {
      const result = [...unknown];
      const visit = (node: Branch) => {
        if (!boundsVisible(node.bounds, planes)) return;
        for (const i of node.entries) if (boundsVisible(bounds[i]!, planes)) result.push(i);
        for (const child of node.children) visit(child);
      };
      if (root) visit(root);
      return result.sort((a, b) => a - b);
    },
  };
}
