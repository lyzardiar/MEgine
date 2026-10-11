// Author: MiYu. Keep Scene frames visible while the next camera render is pending.
import type { Camera } from './math3d.ts';

export type NativeScenePaintState = { key: string; epoch: number; frame: unknown; preview: unknown };
export function pendingNativeScenePaintUnchanged(previous: NativeScenePaintState | null, current: NativeScenePaintState): boolean {
  return previous != null && previous.key === current.key && previous.epoch === current.epoch && previous.frame === current.frame && previous.preview === current.preview;
}

type NativeSceneViewport = {
  w: number;
  h: number;
};

export type NativeSceneFrameRequestIdentity = {
  width: number;
  height: number;
  key: string;
  presentationKey: string;
};

/** Request new camera pixels while retaining the last compatible presentation. */
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
  const presentationKey = JSON.stringify({ width, height, hiddenEntityIds: [...hiddenEntityIds].sort((left, right) => left - right) });
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
  return { width, height, key, presentationKey };
}

/** World/session validity is checked before choosing a compatible camera frame. */
export function nativeSceneFrameForPresentation<T extends { presentationKey: string }>(frame: T | null, identity: NativeSceneFrameRequestIdentity | null): T | null {
  return frame && identity && frame.presentationKey === identity.presentationKey ? frame : null;
}
