/** Minimal 3D math for editor viewport (no external deps). */

export type Vec3 = [number, number, number];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  if (l < 1e-8) return [0, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function orbitEye(pivot: Vec3, yawDeg: number, pitchDeg: number, distance: number): Vec3 {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (Math.max(-89, Math.min(89, pitchDeg)) * Math.PI) / 180;
  const cp = Math.cos(pitch);
  return [
    pivot[0] + distance * Math.sin(yaw) * cp,
    pivot[1] + distance * Math.sin(pitch),
    pivot[2] + distance * Math.cos(yaw) * cp,
  ];
}

export function lookBasis(eye: Vec3, target: Vec3): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward = norm(sub(target, eye));
  // Stable right vector when looking nearly straight up/down
  let right = cross(forward, [0, 1, 0]);
  if (len(right) < 1e-4) {
    right = cross(forward, [0, 0, 1]);
  }
  right = norm(right);
  const up = norm(cross(right, forward));
  return { forward, right, up };
}

export type Camera = {
  eye: Vec3;
  target: Vec3;
  fovYDeg: number;
  projection?: 'perspective' | 'orthographic';
  orthographicSize?: number;
};

export function project(
  world: Vec3,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
): { x: number; y: number; depth: number } | null {
  const { forward, right, up } = lookBasis(cam.eye, cam.target);
  if (len(right) < 1e-6) return null;
  const rel = sub(world, cam.eye);
  const z = dot(rel, forward);
  if (z <= 0.08) return null;
  const x = dot(rel, right);
  const y = dot(rel, up);
  const aspect = viewport.w / Math.max(1, viewport.h);
  let ndcX: number;
  let ndcY: number;
  if (cam.projection === 'orthographic') {
    const halfHeight = Math.max(0.001, cam.orthographicSize ?? 5);
    ndcX = x / (halfHeight * aspect);
    ndcY = y / halfHeight;
  } else {
    const tanHalf = Math.tan(((cam.fovYDeg * Math.PI) / 180) * 0.5);
    ndcX = x / (z * tanHalf * aspect);
    ndcY = y / (z * tanHalf);
  }
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: viewport.x + (ndcX * 0.5 + 0.5) * viewport.w,
    y: viewport.y + (1 - (ndcY * 0.5 + 0.5)) * viewport.h,
    depth: z,
  };
}

const NEAR = 0.2;

function viewDepth(world: Vec3, cam: Camera): number {
  const { forward } = lookBasis(cam.eye, cam.target);
  return dot(sub(world, cam.eye), forward);
}

export function projectSegment(
  a: Vec3,
  b: Vec3,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
): { ax: number; ay: number; bx: number; by: number } | null {
  let p0 = a;
  let p1 = b;
  let z0 = viewDepth(p0, cam);
  let z1 = viewDepth(p1, cam);
  if (z0 < NEAR && z1 < NEAR) return null;

  if (z0 < NEAR || z1 < NEAR) {
    const t = (NEAR - z0) / (z1 - z0 || 1e-6);
    const clipped: Vec3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
    if (z0 < NEAR) {
      p0 = clipped;
      z0 = NEAR;
    } else {
      p1 = clipped;
      z1 = NEAR;
    }
  }

  const sa = project(p0, cam, viewport);
  const sb = project(p1, cam, viewport);
  if (!sa || !sb) return null;
  return { ax: sa.x, ay: sa.y, bx: sb.x, by: sb.y };
}

/** Reliable ground grid — short segments, pivot-centered, distance fade. */
export function drawGroundGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
  pivot: Vec3,
  cameraDistance: number,
): void {
  const cell = Math.max(0.5, Math.pow(2, Math.round(Math.log2(Math.max(cameraDistance * 0.25, 0.5)))));
  const extent = Math.ceil(Math.min(20, Math.max(8, cameraDistance * 1.5)) / cell) * cell;
  const ox = Math.floor(pivot[0] / cell) * cell;
  const oz = Math.floor(pivot[2] / cell) * cell;
  const step = cell;

  const strokeSeg = (x0: number, z0: number, x1: number, z1: number, color: string, width: number) => {
    // Subdivide so near-plane clipping works and horizon doesn't explode
    const parts = 4;
    for (let i = 0; i < parts; i++) {
      const t0 = i / parts;
      const t1 = (i + 1) / parts;
      const ax = x0 + (x1 - x0) * t0;
      const az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1;
      const bz = z0 + (z1 - z0) * t1;
      const midDist = Math.hypot((ax + bx) * 0.5 - pivot[0], (az + bz) * 0.5 - pivot[2]);
      if (midDist > extent * 1.05) continue;
      const seg = projectSegment([ax, 0, az], [bx, 0, bz], cam, viewport);
      if (!seg) continue;
      const fade = Math.max(0, 1 - midDist / (extent * 1.05));
      ctx.globalAlpha = 0.15 + 0.55 * fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(seg.ax, seg.ay);
      ctx.lineTo(seg.bx, seg.by);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  for (let x = ox - extent; x <= ox + extent + 1e-6; x += step) {
    const isAxis = Math.abs(x) < step * 0.01;
    const major = Math.abs(Math.round(x / step)) % 5 === 0;
    strokeSeg(
      x,
      oz - extent,
      x,
      oz + extent,
      isAxis ? '#e06060' : major ? '#9a9a9a' : '#6a6a6a',
      isAxis ? 1.5 : 1,
    );
  }
  for (let z = oz - extent; z <= oz + extent + 1e-6; z += step) {
    const isAxis = Math.abs(z) < step * 0.01;
    const major = Math.abs(Math.round(z / step)) % 5 === 0;
    strokeSeg(
      ox - extent,
      z,
      ox + extent,
      z,
      isAxis ? '#6090e0' : major ? '#9a9a9a' : '#6a6a6a',
      isAxis ? 1.5 : 1,
    );
  }
}

/** Draw a unit cube centered at `center` with half-extents `half`, optional rotation quat. */
export function drawSolidCube(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
  center: Vec3,
  half: Vec3,
  selected: boolean,
  rotation?: Quat | null,
  baseColor?: [number, number, number, number],
): { x: number; y: number; r: number } | null {
  const hx = half[0], hy = half[1], hz = half[2];
  const local: Vec3[] = [
    [-hx, -hy, -hz],
    [+hx, -hy, -hz],
    [+hx, +hy, -hz],
    [-hx, +hy, -hz],
    [-hx, -hy, +hz],
    [+hx, -hy, +hz],
    [+hx, +hy, +hz],
    [-hx, +hy, +hz],
  ];
  const q = rotation && (rotation[0] !== 0 || rotation[1] !== 0 || rotation[2] !== 0 || rotation[3] !== 1)
    ? quatNormalize(rotation)
    : null;
  const corners: Vec3[] = local.map((p) => {
    const r = q ? quatRotateVec(q, p) : p;
    return [center[0] + r[0], center[1] + r[1], center[2] + r[2]];
  });
  const pts = corners.map((c) => project(c, cam, viewport));
  if (pts.some((p) => !p)) {
    // fallback: center only
    const c = project(center, cam, viewport);
    if (!c) return null;
    const s = Math.max(12, 120 / c.depth);
    const [r, g, b, a] = baseColor ?? [0.77, 0.6, 0.42, 1];
    ctx.fillStyle = selected
      ? '#5b9bd5'
      : `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
    ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
    return { x: c.x, y: c.y, r: s * 0.7 };
  }

  const P = pts as Array<{ x: number; y: number; depth: number }>;
  const faces: number[][] = [
    [0, 1, 2, 3], // -Z
    [5, 4, 7, 6], // +Z
    [4, 0, 3, 7], // -X
    [1, 5, 6, 2], // +X
    [4, 5, 1, 0], // -Y
    [3, 2, 6, 7], // +Y
  ];
  const faceColors = selected
    ? ['#4a8ab8', '#6eb0e0', '#3d7aa8', '#7ec0f0', '#2f6288', '#8ec8f5']
    : (() => {
        const color = baseColor ?? [0.77, 0.6, 0.42, 1];
        const shades = [0.68, 0.95, 0.58, 1.05, 0.48, 1.15];
        return shades.map((shade) =>
          `rgba(${Math.round(Math.min(1, color[0] * shade) * 255)},${Math.round(
            Math.min(1, color[1] * shade) * 255,
          )},${Math.round(Math.min(1, color[2] * shade) * 255)},${color[3]})`,
        );
      })();

  const faceDepth = (idx: number[]) =>
    (P[idx[0]].depth + P[idx[1]].depth + P[idx[2]].depth + P[idx[3]].depth) / 4;

  const order = faces.map((_, i) => i).sort((a, b) => faceDepth(faces[b]) - faceDepth(faces[a]));

  for (const fi of order) {
    const f = faces[fi];
    ctx.beginPath();
    ctx.moveTo(P[f[0]].x, P[f[0]].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(P[f[i]].x, P[f[i]].y);
    ctx.closePath();
    ctx.fillStyle = faceColors[fi];
    ctx.fill();
    ctx.strokeStyle = selected ? 'rgba(255,224,140,0.85)' : 'rgba(0,0,0,0.25)';
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();
  }

  const c = project(center, cam, viewport)!;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of P) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: c.x, y: c.y, r: Math.max(maxX - minX, maxY - minY) * 0.55 };
}

/** World-space textured/colored quad (SpriteRenderer) — local XY plane. */
export function drawWorldSprite(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
  center: Vec3,
  halfSize: [number, number],
  color: [number, number, number, number],
  selected: boolean,
  rotation?: Quat | null,
): { x: number; y: number; r: number } | null {
  const hx = halfSize[0];
  const hy = halfSize[1];
  const local: Vec3[] = [
    [-hx, -hy, 0],
    [+hx, -hy, 0],
    [+hx, +hy, 0],
    [-hx, +hy, 0],
  ];
  const q =
    rotation &&
    (rotation[0] !== 0 || rotation[1] !== 0 || rotation[2] !== 0 || rotation[3] !== 1)
      ? quatNormalize(rotation)
      : null;
  const corners = local.map((p) => {
    const r = q ? quatRotateVec(q, p) : p;
    return [center[0] + r[0], center[1] + r[1], center[2] + r[2]] as Vec3;
  });
  const pts = corners.map((c) => project(c, cam, viewport));
  if (pts.some((p) => !p)) return null;
  const P = pts as Array<{ x: number; y: number; depth: number }>;
  const [cr, cg, cb, ca] = color;
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0},${ca})`;
  ctx.fill();
  ctx.strokeStyle = selected ? 'rgba(255,224,140,0.9)' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.stroke();
  const c = project(center, cam, viewport)!;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of P) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: c.x, y: c.y, r: Math.max(maxX - minX, maxY - minY) * 0.55 };
}

export function dragAlongAxis(
  axis: Vec3,
  screenDelta: { dx: number; dy: number },
  cam: Camera,
  sensitivity: number,
): Vec3 {
  const { right, up } = lookBasis(cam.eye, cam.target);
  const screenAxis: Vec3 = [dot(axis, right), -dot(axis, up), 0];
  const sl = Math.hypot(screenAxis[0], screenAxis[1]) || 1;
  const along = (screenDelta.dx * screenAxis[0] + screenDelta.dy * screenAxis[1]) / sl;
  return scale(norm(axis), along * sensitivity);
}

export function quatYawPitchRoll(yawDeg: number, pitchDeg: number, rollDeg = 0): [number, number, number, number] {
  const y = (yawDeg * Math.PI) / 180 / 2;
  const p = (pitchDeg * Math.PI) / 180 / 2;
  const r = (rollDeg * Math.PI) / 180 / 2;
  const cy = Math.cos(y), sy = Math.sin(y);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cr = Math.cos(r), sr = Math.sin(r);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}

export function eulerYFromQuat(q: [number, number, number, number]): number {
  const [x, y, z, w] = q;
  const siny = 2 * (w * y + z * x);
  const cosy = 1 - 2 * (y * y + x * x);
  return (Math.atan2(siny, cosy) * 180) / Math.PI;
}

export type Quat = [number, number, number, number];

/** Quaternion → Euler XYZ degrees (Inspector / Unity-style). */
export function quatToEulerXYZ(q: Quat): [number, number, number] {
  const [qx, qy, qz, qw] = quatNormalize(q);
  const sinr = 2 * (qw * qx + qy * qz);
  const cosr = 1 - 2 * (qx * qx + qy * qy);
  const x = (Math.atan2(sinr, cosr) * 180) / Math.PI;

  const sinp = 2 * (qw * qy - qz * qx);
  const y =
    Math.abs(sinp) >= 1
      ? (Math.sign(sinp) * 90)
      : (Math.asin(sinp) * 180) / Math.PI;

  const siny = 2 * (qw * qz + qx * qy);
  const cosy = 1 - 2 * (qy * qy + qz * qz);
  const z = (Math.atan2(siny, cosy) * 180) / Math.PI;

  return [x, y, z];
}

/** Euler XYZ degrees → Quaternion. */
export function eulerXYZToQuat(xDeg: number, yDeg: number, zDeg: number): Quat {
  const x = ((xDeg || 0) * Math.PI) / 180 / 2;
  const y = ((yDeg || 0) * Math.PI) / 180 / 2;
  const z = ((zDeg || 0) * Math.PI) / 180 / 2;
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/** Axis-angle → quaternion. `deg` is degrees around normalized axis. */
export function quatAxisAngle(axis: Vec3, deg: number): Quat {
  const a = norm(axis);
  if (len(a) < 1e-8) return [0, 0, 0, 1];
  const half = (deg * Math.PI) / 180 / 2;
  const s = Math.sin(half);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(half)];
}

/** Hamilton product q * r (apply r then q when used as local spin). */
export function quatMul(q: Quat, r: Quat): Quat {
  const [qx, qy, qz, qw] = q;
  const [rx, ry, rz, rw] = r;
  return [
    qw * rx + qx * rw + qy * rz - qz * ry,
    qw * ry - qx * rz + qy * rw + qz * rx,
    qw * rz + qx * ry - qy * rx + qz * rw,
    qw * rw - qx * rx - qy * ry - qz * rz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate vector by quaternion (q * v * q^-1). */
export function quatRotateVec(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const vx = v[0], vy = v[1], vz = v[2];
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}
