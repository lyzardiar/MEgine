import type { Quat, Vec3 } from './math3d.ts';
import { add, quatRotateVec } from './math3d.ts';

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value: unknown, fallback: number): number {
  return Math.max(0.0001, Math.abs(finite(value, fallback)));
}

export type SpriteFrame = {
  pivot: Vec3;
  distance: number;
};

/**
 * Frame a SpriteRenderer/AnimatedSprite2D around its visual bounds rather than
 * around the Transform origin. This matters for sliced sprites with authored pivots.
 */
export function frameWorldSprite(
  worldPosition: readonly number[],
  worldRotation: readonly number[],
  worldScale: readonly number[],
  size: readonly number[],
  pivot: readonly number[],
): SpriteFrame {
  const width = positive(size[0], 1);
  const height = positive(size[1], 1);
  const scaleX = positive(worldScale[0], 1);
  const scaleY = positive(worldScale[1], 1);
  const pivotX = Math.max(0, Math.min(1, finite(pivot[0], 0.5)));
  const pivotY = Math.max(0, Math.min(1, finite(pivot[1], 0.5)));
  const position: Vec3 = [
    finite(worldPosition[0], 0),
    finite(worldPosition[1], 0),
    finite(worldPosition[2], 0),
  ];
  const rotation: Quat = [
    finite(worldRotation[0], 0),
    finite(worldRotation[1], 0),
    finite(worldRotation[2], 0),
    finite(worldRotation[3], 1),
  ];
  const visualCenter = quatRotateVec(rotation, [
    (0.5 - pivotX) * width * scaleX,
    (0.5 - pivotY) * height * scaleY,
    0,
  ]);
  return {
    pivot: add(position, visualCenter),
    distance: Math.max(1, width * scaleX, height * scaleY) * 1.35,
  };
}
