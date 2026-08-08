import type { Camera } from './math3d.ts';

type NativeSceneViewport = {
  w: number;
  h: number;
};

export type NativeSceneFrameRequestIdentity = {
  width: number;
  height: number;
  key: string;
};

/**
 * Identity for the exact native bitmap that may be composited into Scene view.
 * A frame rendered for an older orbit camera must never cover the live preview.
 */
export function nativeSceneFrameRequestIdentity(
  camera: Camera,
  viewport: NativeSceneViewport,
  devicePixelRatio: number,
  hiddenEntityIds: readonly number[],
  maxDimension = 4_096,
): NativeSceneFrameRequestIdentity {
  const scale = Math.min(
    Math.max(0.01, devicePixelRatio),
    maxDimension / Math.max(1, viewport.w),
    maxDimension / Math.max(1, viewport.h),
  );
  const width = Math.max(1, Math.round(viewport.w * scale));
  const height = Math.max(1, Math.round(viewport.h * scale));
  const key = JSON.stringify({
    width,
    height,
    eye: camera.eye,
    target: camera.target,
    up: camera.up,
    projection: camera.projection ?? 'perspective',
    orthographicSize: camera.orthographicSize ?? null,
    fovYDeg: camera.fovYDeg,
    near: camera.near ?? null,
    far: camera.far ?? null,
    hiddenEntityIds: [...hiddenEntityIds].sort((left, right) => left - right),
  });
  return { width, height, key };
}
