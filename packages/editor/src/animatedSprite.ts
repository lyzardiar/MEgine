export type AnimatedSpriteData = {
  frames?: unknown;
  fps?: unknown;
  playing?: unknown;
  looped?: unknown;
  frame?: unknown;
};

export function animatedSpriteFrameIndex(
  frameCount: number,
  baseFrame: unknown,
  fps: unknown,
  playing: unknown,
  looped: unknown,
  elapsedSeconds: number,
): number | null {
  const count = Math.max(0, Math.trunc(frameCount));
  if (!count) return null;
  const base = Math.max(0, Math.min(count - 1, Math.trunc(Number(baseFrame) || 0)));
  const rate = Math.max(0, Number(fps) || 0);
  if (playing === false || rate <= 0 || !Number.isFinite(elapsedSeconds)) return base;
  const advanced = base + Math.max(0, Math.floor(elapsedSeconds * rate));
  return looped === false ? Math.min(count - 1, advanced) : advanced % count;
}

export function resolveAnimatedSpriteFrame(
  component: AnimatedSpriteData,
  elapsedSeconds: number,
): string {
  const frames = Array.isArray(component.frames)
    ? component.frames.map((frame) => String(frame)).filter(Boolean)
    : [];
  const index = animatedSpriteFrameIndex(
    frames.length,
    component.frame,
    component.fps,
    component.playing,
    component.looped,
    elapsedSeconds,
  );
  return index == null ? 'white' : frames[index];
}
