import type { MaterialPreviewAppearance } from './materialPreview.ts';

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
  material?: MaterialPreviewAppearance,
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
    const [r, g, b, a] = previewMaterialColor(material, 0.9);
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
        const shades = [0.68, 0.95, 0.58, 1.05, 0.48, 1.15];
        return shades.map((shade) => previewMaterialCss(material, shade));
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

/** Canvas preview for imported triangle meshes. Runtime uses the full GPU mesh. */
export function drawTriangleMesh(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
  center: Vec3,
  objectScale: Vec3,
  positions: readonly Vec3[],
  indices: readonly number[],
  selected: boolean,
  rotation?: Quat | null,
  material?: MaterialPreviewAppearance,
): { x: number; y: number; r: number } | null {
  const q = rotation ? quatNormalize(rotation) : null;
  const world = positions.map((position): Vec3 => {
    const scaled: Vec3 = [
      position[0] * objectScale[0],
      position[1] * objectScale[1],
      position[2] * objectScale[2],
    ];
    const point = q ? quatRotateVec(q, scaled) : scaled;
    return add(center, point);
  });
  const projected = world.map((point) => project(point, cam, viewport));
  const triangles: Array<{ indices: [number, number, number]; depth: number; shade: number }> = [];
  const light = norm([0.35, 0.8, 0.45]);
  // Canvas2D is an authoring preview, not the Player GPU path. Bound work per frame so importing a
  // production mesh cannot freeze dock interaction; the standalone Player still renders all faces.
  const triangleCount = Math.min(Math.floor(indices.length / 3), 10_000);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = indices[triangle * 3];
    const b = indices[triangle * 3 + 1];
    const c = indices[triangle * 3 + 2];
    const pa = projected[a], pb = projected[b], pc = projected[c];
    if (!pa || !pb || !pc || !world[a] || !world[b] || !world[c]) continue;
    const normal = norm(cross(sub(world[b], world[a]), sub(world[c], world[a])));
    triangles.push({
      indices: [a, b, c],
      depth: (pa.depth + pb.depth + pc.depth) / 3,
      shade: 0.35 + Math.abs(dot(normal, light)) * 0.75,
    });
  }
  triangles.sort((left, right) => right.depth - left.depth);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const triangle of triangles) {
    const a = projected[triangle.indices[0]]!;
    const b = projected[triangle.indices[1]]!;
    const c = projected[triangle.indices[2]]!;
    const shade = selected ? triangle.shade * 0.9 : triangle.shade;
    const color = selected
      ? [0.35, 0.65, 0.95, material?.baseColor[3] ?? 1]
      : previewMaterialColor(material, shade);
    const displayShade = selected ? shade : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${Math.round(Math.min(1, color[0] * displayShade) * 255)},${Math.round(
      Math.min(1, color[1] * displayShade) * 255,
    )},${Math.round(Math.min(1, color[2] * displayShade) * 255)},${color[3]})`;
    ctx.fill();
    ctx.strokeStyle = selected ? 'rgba(255,224,140,0.45)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = selected ? 1 : 0.5;
    ctx.stroke();
    for (const point of [a, b, c]) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  const projectedCenter = project(center, cam, viewport);
  if (!projectedCenter || triangles.length === 0) return null;
  return {
    x: projectedCenter.x,
    y: projectedCenter.y,
    r: Math.max(8, Math.max(maxX - minX, maxY - minY) * 0.55),
  };
}

function previewMaterialCss(material: MaterialPreviewAppearance | undefined, shade: number): string {
  const color = previewMaterialColor(material, shade);
  return `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},${color[3]})`;
}

function previewMaterialColor(
  material: MaterialPreviewAppearance | undefined,
  shade: number,
): [number, number, number, number] {
  const source = material ?? {
    baseColor: [0.8, 0.8, 0.8, 1] as [number, number, number, number],
    metallic: 0,
    roughness: 0.5,
    emissive: [0, 0, 0] as [number, number, number],
    emissiveStrength: 1,
    unlit: false,
  };
  const lighting = source.unlit ? 1 : Math.max(0, shade) * (1 - source.metallic * 0.25);
  const highlight = source.unlit
    ? 0
    : (0.04 + source.metallic * 0.36) * (1 - source.roughness) * Math.max(0, shade - 0.45);
  return [0, 1, 2, 3].map((channel) => {
    if (channel === 3) return source.baseColor[3];
    const linear = source.baseColor[channel] * lighting
      + highlight
      + source.emissive[channel] * source.emissiveStrength;
    return Math.max(0, Math.min(1, linear));
  }) as [number, number, number, number];
}

export function spriteSourceAffine(
  projectedCorners: ReadonlyArray<{ x: number; y: number }>,
  sourceWidth: number,
  sourceHeight: number,
  flipX = false,
  flipY = false,
): [number, number, number, number, number, number] | null {
  if (projectedCorners.length < 4 || sourceWidth <= 0 || sourceHeight <= 0) return null;
  const bottomLeft = projectedCorners[0];
  const topRight = projectedCorners[2];
  const topLeft = projectedCorners[3];
  const x = { x: topRight.x - topLeft.x, y: topRight.y - topLeft.y };
  const y = { x: bottomLeft.x - topLeft.x, y: bottomLeft.y - topLeft.y };
  const cleanZero = (value: number) => value === 0 ? 0 : value;
  return [
    cleanZero((flipX ? -x.x : x.x) / sourceWidth),
    cleanZero((flipX ? -x.y : x.y) / sourceWidth),
    cleanZero((flipY ? -y.x : y.x) / sourceHeight),
    cleanZero((flipY ? -y.y : y.y) / sourceHeight),
    cleanZero(topLeft.x + (flipX ? x.x : 0) + (flipY ? y.x : 0)),
    cleanZero(topLeft.y + (flipX ? x.y : 0) + (flipY ? y.y : 0)),
  ];
}

export function spriteLocalCorners(
  halfSize: [number, number],
  pivot: [number, number] = [0.5, 0.5],
): Vec3[] {
  const hx = Math.abs(halfSize[0]);
  const hy = Math.abs(halfSize[1]);
  const safePivot: [number, number] = [
    Number.isFinite(pivot[0]) ? Math.max(0, Math.min(1, pivot[0])) : 0.5,
    Number.isFinite(pivot[1]) ? Math.max(0, Math.min(1, pivot[1])) : 0.5,
  ];
  const width = hx * 2;
  const height = hy * 2;
  const left = -width * safePivot[0];
  const right = width * (1 - safePivot[0]);
  const bottom = -height * safePivot[1];
  const top = height * (1 - safePivot[1]);
  const cleanZero = (value: number) => value === 0 ? 0 : value;
  return [
    [cleanZero(left), cleanZero(bottom), 0],
    [cleanZero(right), cleanZero(bottom), 0],
    [cleanZero(right), cleanZero(top), 0],
    [cleanZero(left), cleanZero(top), 0],
  ];
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
  image?: CanvasImageSource | null,
  flipX = false,
  flipY = false,
  pivot: [number, number] = [0.5, 0.5],
  sourceRect?: [number, number, number, number] | null,
): { x: number; y: number; r: number } | null {
  const hx = Math.abs(halfSize[0]);
  const hy = Math.abs(halfSize[1]);
  if (!Number.isFinite(hx) || !Number.isFinite(hy) || hx <= 0 || hy <= 0) return null;
  const local = spriteLocalCorners([hx, hy], pivot);
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
  let textured = false;
  const source = image as (CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }) | null | undefined;
  const sourceWidth = Number(source?.naturalWidth ?? source?.width ?? 0);
  const sourceHeight = Number(source?.naturalHeight ?? source?.height ?? 0);
  if (source && sourceWidth > 0 && sourceHeight > 0) {
    const authoredX = Number(sourceRect?.[0]);
    const authoredY = Number(sourceRect?.[1]);
    const authoredWidth = Number(sourceRect?.[2]);
    const authoredHeight = Number(sourceRect?.[3]);
    const sourceX = sourceRect ? Math.max(0, Math.min(sourceWidth, authoredX)) : 0;
    const sourceY = sourceRect ? Math.max(0, Math.min(sourceHeight, authoredY)) : 0;
    const croppedWidth = sourceRect
      ? Math.max(0, Math.min(sourceWidth - sourceX, authoredWidth))
      : sourceWidth;
    const croppedHeight = sourceRect
      ? Math.max(0, Math.min(sourceHeight - sourceY, authoredHeight))
      : sourceHeight;
    const drawX = croppedWidth > 0 && croppedHeight > 0 ? sourceX : 0;
    const drawY = croppedWidth > 0 && croppedHeight > 0 ? sourceY : 0;
    const drawWidth = croppedWidth > 0 && croppedHeight > 0 ? croppedWidth : sourceWidth;
    const drawHeight = croppedWidth > 0 && croppedHeight > 0 ? croppedHeight : sourceHeight;
    const affine = spriteSourceAffine(P, drawWidth, drawHeight, flipX, flipY);
    if (!affine) return null;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha *= Math.max(0, Math.min(1, ca));
    // Canvas affine mapping uses top-left, top-right and bottom-left projected corners.
    ctx.transform(...affine);
    ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
    ctx.restore();
    textured = true;
  }
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.closePath();
  if (!textured) {
    ctx.fillStyle = `rgba(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0},${ca})`;
    ctx.fill();
  }
  ctx.strokeStyle = selected ? 'rgba(255,224,140,0.9)' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.stroke();
  const c = project(center, cam, viewport)!;
  if (selected) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,224,140,0.95)';
    ctx.fillStyle = 'rgba(26,26,26,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  const radius = Math.max(...P.map((point) => Math.hypot(point.x - c.x, point.y - c.y)));
  return { x: c.x, y: c.y, r: Math.max(6, radius) };
}

export function drawWorldLine2D(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  viewport: { x: number; y: number; w: number; h: number },
  center: Vec3,
  scale3: Vec3,
  points: Array<[number, number]>,
  width: number,
  color: [number, number, number, number] | ((position: Vec3) => [number, number, number, number]),
  closed: boolean,
  selected: boolean,
  rotation?: Quat | null,
): { x: number; y: number; r: number } | null {
  if (points.length < 2 || width <= 0) return null;
  const q = rotation ? quatNormalize(rotation) : ([0, 0, 0, 1] as Quat);
  const worldPoint = (point: [number, number]) => {
    const local: Vec3 = [point[0] * scale3[0], point[1] * scale3[1], 0];
    const rotated = quatRotateVec(q, local);
    return add(center, rotated);
  };
  const pairs = points.slice(1).map((point, index) => [points[index], point] as const);
  if (closed && points.length > 2) pairs.push([points[points.length - 1], points[0]]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let drawn = 0;
  for (const [start, end] of pairs) {
    const dxLocal = end[0] - start[0];
    const dyLocal = end[1] - start[1];
    const localLength = Math.hypot(dxLocal, dyLocal);
    if (localLength < 1e-6) continue;
    const worldStart = worldPoint(start);
    const worldEnd = worldPoint(end);
    const midpoint = scale(add(worldStart, worldEnd), 0.5);
    const segmentColor = typeof color === 'function' ? color(midpoint) : color;
    if (segmentColor[3] <= 0) continue;
    const normalLocal: Vec3 = [
      (-dyLocal / localLength) * scale3[0] * width * 0.5,
      (dxLocal / localLength) * scale3[1] * width * 0.5,
      0,
    ];
    const normalWorld = add(midpoint, quatRotateVec(q, normalLocal));
    const a = project(worldStart, cam, viewport);
    const b = project(worldEnd, cam, viewport);
    const mid = project(midpoint, cam, viewport);
    const normal = project(normalWorld, cam, viewport);
    if (!a || !b || !mid || !normal) continue;
    const screenWidth = Math.max(0.5, Math.hypot(normal.x - mid.x, normal.y - mid.y) * 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = `rgba(${(segmentColor[0] * 255) | 0},${(segmentColor[1] * 255) | 0},${(segmentColor[2] * 255) | 0},${segmentColor[3]})`;
    ctx.lineWidth = screenWidth;
    ctx.stroke();
    if (selected) {
      ctx.strokeStyle = 'rgba(255,224,140,0.9)';
      ctx.lineWidth = Math.max(1, screenWidth * 0.18);
      ctx.stroke();
    }
    minX = Math.min(minX, a.x, b.x);
    minY = Math.min(minY, a.y, b.y);
    maxX = Math.max(maxX, a.x, b.x);
    maxY = Math.max(maxY, a.y, b.y);
    drawn++;
  }
  if (!drawn) return null;
  return {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    r: Math.max(10, Math.hypot(maxX - minX, maxY - minY) * 0.5),
  };
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
