/** Scene-view icon / frustum / light gizmos (2D canvas projection). */

import type { Camera, Quat, Vec3 } from './math3d';
import {
  add,
  lookBasis,
  project,
  quatNormalize,
  quatRotateVec,
  scale,
  sub,
  dot,
} from './math3d.ts';

export type { Camera2DData, Camera3DData, Transform as TransformLike } from '@mengine/behaviour';
import type { Camera2DData, Camera3DData, Transform as TransformLike } from '@mengine/behaviour';

/** Local basis: forward = -Z (camera looks / light shines). */
export function transformBasis(rotation?: Quat | null): {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
} {
  const raw = rotation ?? ([0, 0, 0, 1] as Quat);
  const q = quatNormalize([
    Number(raw[0]) || 0,
    Number(raw[1]) || 0,
    Number(raw[2]) || 0,
    Number.isFinite(Number(raw[3])) ? Number(raw[3]) : 1,
  ]);
  return {
    right: quatRotateVec(q, [1, 0, 0]),
    up: quatRotateVec(q, [0, 1, 0]),
    forward: quatRotateVec(q, [0, 0, -1]),
  };
}

type Vp = { x: number; y: number; w: number; h: number };

const CLIP_NEAR = 0.15;

function viewZ(world: Vec3, cam: Camera): number {
  const { forward } = lookBasis(cam.eye, cam.target);
  return dot(sub(world, cam.eye), forward);
}

/** Project with near-plane clip; more tolerant than math3d.project for gizmos. */
function projectPoint(
  world: Vec3,
  cam: Camera,
  vp: Vp,
): { x: number; y: number; depth: number } | null {
  const z = viewZ(world, cam);
  if (z < CLIP_NEAR) return null;
  const p = project(world, cam, vp);
  return p;
}

/**
 * Draw a world-space segment. Clips against the view near plane and
 * subdivides so long frustum edges still show up.
 */
function strokeWorldSeg(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Vp,
  a: Vec3,
  b: Vec3,
  color: string,
  width: number,
) {
  let p0 = a;
  let p1 = b;
  let z0 = viewZ(p0, cam);
  let z1 = viewZ(p1, cam);
  if (z0 < CLIP_NEAR && z1 < CLIP_NEAR) return;

  if (z0 < CLIP_NEAR || z1 < CLIP_NEAR) {
    const t = (CLIP_NEAR - z0) / (z1 - z0 || 1e-6);
    const clipped: Vec3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
    if (z0 < CLIP_NEAR) {
      p0 = clipped;
      z0 = CLIP_NEAR;
    } else {
      p1 = clipped;
      z1 = CLIP_NEAR;
    }
  }

  const parts = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let started = false;
  ctx.beginPath();
  for (let i = 0; i <= parts; i++) {
    const t = i / parts;
    const w: Vec3 = [
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
      p0[2] + (p1[2] - p0[2]) * t,
    ];
    const sp = projectPoint(w, cam, vp);
    if (!sp) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(sp.x, sp.y);
      started = true;
    } else {
      ctx.lineTo(sp.x, sp.y);
    }
  }
  ctx.stroke();
}

function frustumCorners(
  origin: Vec3,
  basis: { right: Vec3; up: Vec3; forward: Vec3 },
  camData: Camera3DData,
  nearDist: number,
  farDist: number,
): { near: Vec3[]; far: Vec3[] } {
  const aspect = Math.max(0.05, Number(camData.aspect) || 16 / 9);
  const isOrtho = (camData.projection ?? 'perspective') === 'orthographic';

  let nearH: number;
  let nearW: number;
  let farH: number;
  let farW: number;

  if (isOrtho) {
    const size = Math.max(0.01, Number(camData.orthographic_size) || 5);
    nearH = farH = size;
    nearW = farW = size * aspect;
  } else {
    const fov = ((Number(camData.fov_y_degrees) || 60) * Math.PI) / 180;
    const t = Math.tan(fov * 0.5);
    nearH = nearDist * t;
    farH = farDist * t;
    nearW = nearH * aspect;
    farW = farH * aspect;
  }

  const corner = (dist: number, w: number, h: number, sx: number, sy: number): Vec3 => {
    const c = add(origin, scale(basis.forward, dist));
    return add(add(c, scale(basis.right, sx * w)), scale(basis.up, sy * h));
  };

  return {
    near: [
      corner(nearDist, nearW, nearH, -1, -1),
      corner(nearDist, nearW, nearH, +1, -1),
      corner(nearDist, nearW, nearH, +1, +1),
      corner(nearDist, nearW, nearH, -1, +1),
    ],
    far: [
      corner(farDist, farW, farH, -1, -1),
      corner(farDist, farW, farH, +1, -1),
      corner(farDist, farW, farH, +1, +1),
      corner(farDist, farW, farH, -1, +1),
    ],
  };
}

export function drawCameraGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  camData: Camera3DData,
  selected: boolean,
): { x: number; y: number; r: number } | null {
  const origin: Vec3 = [
    Number(transform.position[0]) || 0,
    Number(transform.position[1]) || 0,
    Number(transform.position[2]) || 0,
  ];
  const basis = transformBasis(transform.rotation);
  const color = selected ? '#ffcc66' : '#6ec8ff';
  const width = selected ? 2.2 : 1.6;

  const near = Math.max(0.05, Number(camData.near) || 0.3);
  const far = Math.max(near + 0.05, Number(camData.far) || 50);

  const { near: n, far: f } = frustumCorners(origin, basis, camData, near, far);

  for (let i = 0; i < 4; i++) {
    strokeWorldSeg(ctx, viewCam, vp, n[i], n[(i + 1) % 4], color, width);
    strokeWorldSeg(ctx, viewCam, vp, f[i], f[(i + 1) % 4], color, width);
    strokeWorldSeg(ctx, viewCam, vp, n[i], f[i], color, width);
    strokeWorldSeg(ctx, viewCam, vp, origin, n[i], color, width * 0.85);
  }

  // Screen-space body
  const pr = projectPoint(origin, viewCam, vp);
  if (!pr) {
    // Still try to draw frustum only; no hit target
    return null;
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = 'rgba(30, 40, 55, 0.85)';
  ctx.lineWidth = width;
  ctx.fillRect(pr.x - 11, pr.y - 8, 18, 16);
  ctx.strokeRect(pr.x - 11, pr.y - 8, 18, 16);
  ctx.beginPath();
  ctx.moveTo(pr.x + 7, pr.y - 4);
  ctx.lineTo(pr.x + 16, pr.y - 8);
  ctx.lineTo(pr.x + 16, pr.y + 8);
  ctx.lineTo(pr.x + 7, pr.y + 4);
  ctx.closePath();
  ctx.stroke();

  const isOrtho = (camData.projection ?? 'perspective') === 'orthographic';
  ctx.fillStyle = color;
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(isOrtho ? 'Ortho' : 'Persp', pr.x - 10, pr.y - 14);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = selected ? '#ffe8a0' : '#a8d4ff';
  ctx.fillText(`n ${near.toFixed(2)}  f ${far.toFixed(1)}`, pr.x - 10, pr.y + 24);
  ctx.restore();

  return { x: pr.x, y: pr.y, r: 22 };
}

type BoxColliderData = {
  size?: number[];
  center?: number[];
  is_trigger?: boolean;
};

type SphereColliderData = {
  radius?: number;
  center?: number[];
  is_trigger?: boolean;
};

type BoxCollider2DData = {
  size?: number[];
  offset?: number[];
  is_trigger?: boolean;
};

type CircleCollider2DData = {
  radius?: number;
  offset?: number[];
  is_trigger?: boolean;
};

function colliderOrigin(transform: TransformLike, center?: number[]): {
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  localZ: Vec3;
  scale3: Vec3;
} {
  const position = transform.position.map((value) => Number(value) || 0) as Vec3;
  const scale3 = transform.scale.map((value) => Number(value) || 0) as Vec3;
  const basis = transformBasis(transform.rotation);
  const localZ = scale(basis.forward, -1);
  const offset = center ?? [0, 0, 0];
  const origin = add(
    add(position, scale(basis.right, (Number(offset[0]) || 0) * scale3[0])),
    add(
      scale(basis.up, (Number(offset[1]) || 0) * scale3[1]),
      scale(localZ, (Number(offset[2]) || 0) * scale3[2]),
    ),
  );
  return { origin, right: basis.right, up: basis.up, localZ, scale3 };
}

/** Selected collider wireframe matching the runtime's scaled Rapier cuboid. */
export function drawBoxColliderGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  collider: BoxColliderData,
) {
  const { origin, right, up, localZ, scale3 } = colliderOrigin(transform, collider.center);
  const size = collider.size ?? [1, 1, 1];
  const half: Vec3 = [
    Math.max(0.001, Math.abs((Number(size[0]) || 0) * scale3[0])) * 0.5,
    Math.max(0.001, Math.abs((Number(size[1]) || 0) * scale3[1])) * 0.5,
    Math.max(0.001, Math.abs((Number(size[2]) || 0) * scale3[2])) * 0.5,
  ];
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        corners.push(
          add(
            add(origin, scale(right, x * half[0])),
            add(scale(up, y * half[1]), scale(localZ, z * half[2])),
          ),
        );
      }
    }
  }
  const color = collider.is_trigger ? '#ffd76a' : '#72f2a8';
  for (let a = 0; a < corners.length; a++) {
    for (let b = a + 1; b < corners.length; b++) {
      const differingAxes = ((a ^ b) & 1 ? 1 : 0) + ((a ^ b) & 2 ? 1 : 0) + ((a ^ b) & 4 ? 1 : 0);
      if (differingAxes === 1) strokeWorldSeg(ctx, viewCam, vp, corners[a], corners[b], color, 2);
    }
  }
}

/** Selected collider wireframe matching the runtime's max-axis scaled sphere. */
export function drawSphereColliderGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  collider: SphereColliderData,
) {
  const { origin, right, up, localZ, scale3 } = colliderOrigin(transform, collider.center);
  const authoredRadius = Number(collider.radius);
  const radius = Math.max(0.001, Math.abs(Number.isFinite(authoredRadius) ? authoredRadius : 0.5)
    * Math.max(Math.abs(scale3[0]), Math.abs(scale3[1]), Math.abs(scale3[2])));
  const color = collider.is_trigger ? '#ffd76a' : '#72f2a8';
  const circles: Array<[Vec3, Vec3]> = [[right, up], [right, localZ], [up, localZ]];
  for (const [axisA, axisB] of circles) {
    let previous = add(origin, scale(axisA, radius));
    for (let i = 1; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const current = add(
        origin,
        add(scale(axisA, Math.cos(angle) * radius), scale(axisB, Math.sin(angle) * radius)),
      );
      strokeWorldSeg(ctx, viewCam, vp, previous, current, color, 1.8);
      previous = current;
    }
  }
}

/** Selected planar box matching the scaled Rapier2D cuboid. */
export function drawBoxCollider2DGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  collider: BoxCollider2DData,
) {
  const offset = collider.offset ?? [0, 0];
  const { origin, right, up, scale3 } = colliderOrigin(transform, [offset[0] ?? 0, offset[1] ?? 0, 0]);
  const size = collider.size ?? [1, 1];
  const half = [
    Math.max(0.001, Math.abs((Number(size[0]) || 0) * scale3[0])) * 0.5,
    Math.max(0.001, Math.abs((Number(size[1]) || 0) * scale3[1])) * 0.5,
  ];
  const corners: Vec3[] = [
    add(add(origin, scale(right, -half[0])), scale(up, -half[1])),
    add(add(origin, scale(right, half[0])), scale(up, -half[1])),
    add(add(origin, scale(right, half[0])), scale(up, half[1])),
    add(add(origin, scale(right, -half[0])), scale(up, half[1])),
  ];
  const color = collider.is_trigger ? '#ffd76a' : '#68f5d0';
  for (let i = 0; i < corners.length; i++) {
    strokeWorldSeg(ctx, viewCam, vp, corners[i], corners[(i + 1) % corners.length], color, 2);
  }
}

/** Selected planar circle matching the max-XY scaled Rapier2D ball. */
export function drawCircleCollider2DGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  collider: CircleCollider2DData,
) {
  const offset = collider.offset ?? [0, 0];
  const { origin, right, up, scale3 } = colliderOrigin(transform, [offset[0] ?? 0, offset[1] ?? 0, 0]);
  const authoredRadius = Number(collider.radius);
  const radius = Math.max(
    0.001,
    Math.abs(Number.isFinite(authoredRadius) ? authoredRadius : 0.5)
      * Math.max(Math.abs(scale3[0]), Math.abs(scale3[1])),
  );
  const color = collider.is_trigger ? '#ffd76a' : '#68f5d0';
  let previous = add(origin, scale(right, radius));
  for (let i = 1; i <= 40; i++) {
    const angle = (i / 40) * Math.PI * 2;
    const current = add(
      origin,
      add(scale(right, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius)),
    );
    strokeWorldSeg(ctx, viewCam, vp, previous, current, color, 2);
    previous = current;
  }
}

export function drawCamera2DGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  camData: Camera2DData,
  gameAspect: number,
  selected: boolean,
): { x: number; y: number; r: number } | null {
  const origin: Vec3 = [
    Number(transform.position[0]) || 0,
    Number(transform.position[1]) || 0,
    Number(transform.position[2]) || 0,
  ];
  const basis = transformBasis(transform.rotation);
  const halfHeight = Math.max(0.001, Number(camData.size) || 5);
  const halfWidth = halfHeight * Math.max(0.05, gameAspect || 16 / 9);
  const center = add(origin, scale(basis.forward, 0.15));
  const corners = [
    add(add(center, scale(basis.right, -halfWidth)), scale(basis.up, -halfHeight)),
    add(add(center, scale(basis.right, +halfWidth)), scale(basis.up, -halfHeight)),
    add(add(center, scale(basis.right, +halfWidth)), scale(basis.up, +halfHeight)),
    add(add(center, scale(basis.right, -halfWidth)), scale(basis.up, +halfHeight)),
  ];
  const color = selected ? '#ffcc66' : '#70d8ff';
  const width = selected ? 2.2 : 1.6;
  for (let i = 0; i < corners.length; i++) {
    strokeWorldSeg(ctx, viewCam, vp, corners[i], corners[(i + 1) % corners.length], color, width);
  }
  strokeWorldSeg(ctx, viewCam, vp, center, add(center, scale(basis.right, halfWidth * 0.12)), color, 1);
  strokeWorldSeg(ctx, viewCam, vp, center, add(center, scale(basis.up, halfHeight * 0.12)), color, 1);

  const pr = projectPoint(origin, viewCam, vp);
  if (!pr) return null;
  ctx.save();
  ctx.fillStyle = 'rgba(30, 40, 55, 0.88)';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.fillRect(pr.x - 12, pr.y - 9, 24, 18);
  ctx.strokeRect(pr.x - 12, pr.y - 9, 24, 18);
  ctx.fillStyle = color;
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('2D', pr.x - 7, pr.y + 4);
  ctx.font = '10px sans-serif';
  ctx.fillText(`Size ${halfHeight.toFixed(1)}`, pr.x - 12, pr.y + 25);
  ctx.restore();
  return { x: pr.x, y: pr.y, r: 22 };
}

export function drawDirectionalLightGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  selected: boolean,
): { x: number; y: number; r: number } | null {
  const origin: Vec3 = [
    Number(transform.position[0]) || 0,
    Number(transform.position[1]) || 0,
    Number(transform.position[2]) || 0,
  ];
  const { forward, right, up } = transformBasis(transform.rotation);
  const color = selected ? '#ffe08a' : '#ffd060';
  const width = selected ? 2.4 : 1.8;
  const len = selected ? 3.2 : 2.6;

  const tip = add(origin, scale(forward, len));

  // World-space direction + parallel rays
  strokeWorldSeg(ctx, viewCam, vp, origin, tip, color, width);
  const head = 0.4;
  strokeWorldSeg(ctx, viewCam, vp, tip, add(tip, add(scale(forward, -head), scale(right, head * 0.5))), color, width);
  strokeWorldSeg(ctx, viewCam, vp, tip, add(tip, add(scale(forward, -head), scale(right, -head * 0.5))), color, width);
  strokeWorldSeg(ctx, viewCam, vp, tip, add(tip, add(scale(forward, -head), scale(up, head * 0.5))), color, width);
  strokeWorldSeg(ctx, viewCam, vp, tip, add(tip, add(scale(forward, -head), scale(up, -head * 0.5))), color, width);

  for (const o of [scale(right, 0.4), scale(right, -0.4), scale(up, 0.4), scale(up, -0.4)]) {
    const a = add(origin, o);
    strokeWorldSeg(ctx, viewCam, vp, a, add(a, scale(forward, len * 0.85)), color, Math.max(1.2, width - 0.5));
  }

  const pr = projectPoint(origin, viewCam, vp);
  if (!pr) return null;

  // Screen-space fallback arrow (always visible when icon is)
  const tipP = projectPoint(tip, viewCam, vp);
  if (tipP) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width + 0.5;
    ctx.beginPath();
    ctx.moveTo(pr.x, pr.y);
    ctx.lineTo(tipP.x, tipP.y);
    ctx.stroke();
    const ang = Math.atan2(tipP.y - pr.y, tipP.x - pr.x);
    ctx.beginPath();
    ctx.moveTo(tipP.x, tipP.y);
    ctx.lineTo(tipP.x - 14 * Math.cos(ang - 0.4), tipP.y - 14 * Math.sin(ang - 0.4));
    ctx.lineTo(tipP.x - 14 * Math.cos(ang + 0.4), tipP.y - 14 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Sun disc + rays
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, selected ? 9 : 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff3c0';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(pr.x + Math.cos(a) * 11, pr.y + Math.sin(a) * 11);
    ctx.lineTo(pr.x + Math.cos(a) * 16, pr.y + Math.sin(a) * 16);
    ctx.stroke();
  }
  ctx.restore();

  return { x: pr.x, y: pr.y, r: 20 };
}

export function drawPointLightGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  range: number,
  selected: boolean,
): { x: number; y: number; r: number } | null {
  const origin: Vec3 = [
    Number(transform.position[0]) || 0,
    Number(transform.position[1]) || 0,
    Number(transform.position[2]) || 0,
  ];
  const color = selected ? '#ffe08a' : '#ffbd66';
  const radius = Math.min(Math.max(Number(range) || 1, 0.2), 20);
  const axisRadius = Math.min(radius, selected ? 1.5 : 0.9);
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as Vec3[]) {
    strokeWorldSeg(ctx, viewCam, vp, add(origin, scale(axis, -axisRadius)), add(origin, scale(axis, axisRadius)), color, selected ? 2 : 1.3);
  }
  const pr = projectPoint(origin, viewCam, vp);
  if (!pr) return null;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = 'rgba(255, 184, 80, 0.22)';
  ctx.lineWidth = selected ? 2.4 : 1.7;
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, selected ? 11 : 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, selected ? 17 : 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return { x: pr.x, y: pr.y, r: 20 };
}

export function drawSpotLightGizmo(
  ctx: CanvasRenderingContext2D,
  viewCam: Camera,
  vp: Vp,
  transform: TransformLike,
  range: number,
  outerAngleDegrees: number,
  selected: boolean,
): { x: number; y: number; r: number } | null {
  const origin: Vec3 = [
    Number(transform.position[0]) || 0,
    Number(transform.position[1]) || 0,
    Number(transform.position[2]) || 0,
  ];
  const { forward, right, up } = transformBasis(transform.rotation);
  const length = Math.min(Math.max(Number(range) || 1, 0.2), 12);
  const halfAngle = (Math.min(Math.max(Number(outerAngleDegrees) || 40, 1), 178) * Math.PI) / 360;
  const ringRadius = Math.tan(halfAngle) * length;
  const center = add(origin, scale(forward, length));
  const color = selected ? '#ffe08a' : '#90c8ff';
  const ring: Vec3[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ring.push(
      add(center, add(scale(right, Math.cos(angle) * ringRadius), scale(up, Math.sin(angle) * ringRadius))),
    );
  }
  for (let i = 0; i < ring.length; i++) {
    strokeWorldSeg(ctx, viewCam, vp, ring[i], ring[(i + 1) % ring.length], color, selected ? 2 : 1.3);
  }
  for (const index of [0, 3, 6, 9]) {
    strokeWorldSeg(ctx, viewCam, vp, origin, ring[index], color, selected ? 2 : 1.3);
  }
  const pr = projectPoint(origin, viewCam, vp);
  if (!pr) return null;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, selected ? 9 : 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return { x: pr.x, y: pr.y, r: 18 };
}
