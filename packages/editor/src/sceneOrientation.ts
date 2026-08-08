import { dot, lookBasis, orbitEye, type Vec3 } from './math3d.ts';

export type SceneOrientationView =
  | 'right'
  | 'left'
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'perspective';

export type SceneOrientationHandle = {
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  view: Exclude<SceneOrientationView, 'perspective'>;
  x: number;
  y: number;
  depth: number;
};

export type SceneOrientationCubeFace = {
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  view: Exclude<SceneOrientationView, 'perspective'>;
  points: Array<{ x: number; y: number }>;
  depth: number;
};

const CAMERA_PRESETS: Record<SceneOrientationView, { yaw: number; pitch: number }> = {
  right: { yaw: 90, pitch: 0 },
  left: { yaw: -90, pitch: 0 },
  top: { yaw: 0, pitch: 89 },
  bottom: { yaw: 0, pitch: -89 },
  front: { yaw: 0, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  perspective: { yaw: 35, pitch: 25 },
};

const AXES: Array<{
  axis: SceneOrientationHandle['axis'];
  direction: Vec3;
  positive: SceneOrientationHandle['view'];
  negative: SceneOrientationHandle['view'];
}> = [
  { axis: 'x', direction: [1, 0, 0], positive: 'right', negative: 'left' },
  { axis: 'y', direction: [0, 1, 0], positive: 'top', negative: 'bottom' },
  { axis: 'z', direction: [0, 0, 1], positive: 'front', negative: 'back' },
];

export function sceneOrientationCamera(view: SceneOrientationView) {
  return { ...CAMERA_PRESETS[view] };
}

export function sceneOrientationHandles(
  yaw: number,
  pitch: number,
  radius = 31,
): SceneOrientationHandle[] {
  const eye = orbitEye([0, 0, 0], yaw, pitch, 1);
  const { right, up } = lookBasis(eye, [0, 0, 0]);
  return AXES.flatMap(({ axis, direction, positive, negative }) => (
    ([1, -1] as const).map((sign) => {
      const world = direction.map((value) => value * sign) as Vec3;
      return {
        axis,
        sign,
        view: sign === 1 ? positive : negative,
        x: dot(world, right) * radius,
        y: -dot(world, up) * radius,
        depth: dot(world, eye),
      };
    })
  ));
}

const CUBE_FACES: Array<{
  axis: SceneOrientationCubeFace['axis'];
  sign: 1 | -1;
  view: SceneOrientationCubeFace['view'];
  normal: Vec3;
  corners: Vec3[];
}> = [
  { axis: 'x', sign: 1, view: 'right', normal: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { axis: 'x', sign: -1, view: 'left', normal: [-1, 0, 0], corners: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { axis: 'y', sign: 1, view: 'top', normal: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { axis: 'y', sign: -1, view: 'bottom', normal: [0, -1, 0], corners: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
  { axis: 'z', sign: 1, view: 'front', normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { axis: 'z', sign: -1, view: 'back', normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

/** Visible faces for a camera-aligned cube, sharing the same basis as its axis arms. */
export function sceneOrientationCubeFaces(
  yaw: number,
  pitch: number,
  radius = 12,
): SceneOrientationCubeFace[] {
  const eye = orbitEye([0, 0, 0], yaw, pitch, 1);
  const { right, up } = lookBasis(eye, [0, 0, 0]);
  return CUBE_FACES
    .filter((face) => dot(face.normal, eye) > 1e-6)
    .map((face) => {
      const points = face.corners.map((corner) => ({
        x: dot(corner, right) * radius,
        y: -dot(corner, up) * radius,
      }));
      const depth = face.corners.reduce((sum, corner) => sum + dot(corner, eye), 0)
        / face.corners.length;
      return { axis: face.axis, sign: face.sign, view: face.view, points, depth };
    })
    .sort((left, right) => left.depth - right.depth);
}

function angleDelta(a: number, b: number) {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export function activeSceneOrientation(
  yaw: number,
  pitch: number,
  tolerance = 1,
): Exclude<SceneOrientationView, 'perspective'> | null {
  for (const view of ['right', 'left', 'top', 'bottom', 'front', 'back'] as const) {
    const preset = CAMERA_PRESETS[view];
    if (angleDelta(yaw, preset.yaw) <= tolerance && Math.abs(pitch - preset.pitch) <= tolerance) {
      return view;
    }
  }
  return null;
}

export function sceneOrientationLabel(yaw: number, pitch: number) {
  const active = activeSceneOrientation(yaw, pitch);
  return active ? active[0].toUpperCase() + active.slice(1) : 'Perspective';
}
