export type TimelineAudioPreviewItem = {
  key: string;
  label: string;
  target: number;
  clip: string;
  clipStart: number;
  clipIn: number;
  sourceTime: number;
  volume: number;
  pitch: number;
  looped: boolean;
  muted: boolean;
  pan: number;
};

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function timelineAudioFadeFactor(
  elapsed: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
  curve: 'linear' | 'ease_in_out',
): number {
  const length = Math.max(0, finite(duration, 0));
  const local = Math.max(0, Math.min(length, finite(elapsed, 0)));
  const shape = (value: number) => {
    const normalized = Math.max(0, Math.min(1, value));
    return curve === 'ease_in_out'
      ? normalized * normalized * (3 - 2 * normalized)
      : normalized;
  };
  const incoming = fadeIn > 0 ? shape(local / fadeIn) : 1;
  const outgoing = fadeOut > 0 ? shape((length - local) / fadeOut) : 1;
  return Math.max(0, Math.min(1, Math.min(incoming, outgoing)));
}

export function timelineAudioSourceTime(
  sourceDuration: number,
  requestedTime: number,
  looped: boolean,
): number | null {
  const duration = finite(sourceDuration, 0);
  const requested = Math.max(0, finite(requestedTime, 0));
  if (duration <= 0) return null;
  if (!looped) return requested < duration ? requested : null;
  return requested % duration;
}
