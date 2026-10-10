// Author: MiYu. Conservative octree candidates for the browser world renderer; simulation stays independent.
import { dot, lookBasis, quatRotateVec, type Camera, type Vec3 } from './math3d.ts';
export type Bounds = { min: Vec3; max: Vec3 };
type Plane = { normal: Vec3; distance: number };
type Branch = { bounds: Bounds; entries: number[]; children: Branch[] };
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
  const points: Vec3[] = [];
  for (let corner = 0; corner < 8; corner++) {
    const local = [0, 1, 2].map((axis) => ((corner & (1 << axis)) ? bounds.max[axis] : bounds.min[axis]) * transform.scale[axis]) as Vec3;
    const rotated = quatRotateVec(transform.rotation as [number, number, number, number], local);
    points.push(rotated.map((v, axis) => v + transform.position[axis]) as Vec3);
  }
  return pointBounds(points);
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
  if (entries.length <= 32 || depth >= 8) return { bounds, entries, children: [] };
  const center = bounds.min.map((v, axis) => (v + bounds.max[axis]) / 2);
  const boxes: Bounds[] = Array.from({ length: 8 }, (_, i) => ({ min: bounds.min.map((v, axis) => (i & (1 << axis)) ? center[axis] : v) as Vec3, max: bounds.max.map((v, axis) => (i & (1 << axis)) ? v : center[axis]) as Vec3 }));
  const buckets: number[][] = boxes.map(() => []), resident: number[] = [];
  for (const i of entries) { const child = boxes.findIndex((box) => contains(box, all[i]!)); if (child < 0) resident.push(i); else buckets[child].push(i); }
  return { bounds, entries: resident, children: buckets.flatMap((bucket, i) => bucket.length ? [branch(boxes[i], bucket, all, depth + 1)] : []) };
}
export function createViewportSpatialIndex() {
  let bounds: readonly (Bounds | null)[] = [], root: Branch | null = null, unknown: number[] = [];
  return {
    update(next: readonly (Bounds | null)[]) {
      if (next.length === bounds.length && next.every((b, i) => b === bounds[i] || (b && bounds[i] && b.min.every((v, axis) => v === bounds[i]!.min[axis] && b.max[axis] === bounds[i]!.max[axis])))) return;
      bounds = next.map((b) => b ? { min: [...b.min], max: [...b.max] } : null);
      unknown = []; const known: number[] = [];
      const total: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      next.forEach((b, i) => {
        if (!b) { unknown.push(i); return; } known.push(i);
        for (let axis = 0; axis < 3; axis++) { total.min[axis] = Math.min(total.min[axis], b.min[axis]); total.max[axis] = Math.max(total.max[axis], b.max[axis]); }
      });
      root = known.length ? branch(total, known, bounds) : null;
    },
    query(planes: readonly Plane[]) {
      const result = unknown.slice();
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
