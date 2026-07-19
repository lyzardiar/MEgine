export type TimelineTimeDisplayMode = 'frames' | 'seconds';

function safeFrameRate(frameRate: number): number {
  return Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 60;
}

function safeTime(time: number): number {
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

function timelineSecondsPrecision(stepSeconds: number, minimum: number): number {
  const step = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : 0.01;
  return Math.max(minimum, Math.min(6, Math.ceil(-Math.log10(step))));
}

export function timelineFrameAtTime(time: number, frameRate: number): number {
  return Math.round(safeTime(time) * safeFrameRate(frameRate));
}

export function formatTimelineTimeInput(
  time: number,
  frameRate: number,
  mode: TimelineTimeDisplayMode,
): string {
  return mode === 'frames'
    ? String(timelineFrameAtTime(time, frameRate))
    : safeTime(time).toFixed(timelineSecondsPrecision(1 / safeFrameRate(frameRate), 3));
}

export function formatTimelineTimeLabel(
  time: number,
  frameRate: number,
  mode: TimelineTimeDisplayMode,
  minimumStepSeconds = 0.01,
): string {
  return mode === 'frames'
    ? `${timelineFrameAtTime(time, frameRate)}f`
    : `${safeTime(time).toFixed(timelineSecondsPrecision(minimumStepSeconds, 2))}s`;
}

export function formatTimelineTimeTooltip(time: number, frameRate: number): string {
  const normalized = safeTime(time);
  const precision = timelineSecondsPrecision(1 / safeFrameRate(frameRate), 3);
  return `${timelineFrameAtTime(normalized, frameRate)}f · ${normalized.toFixed(precision)}s`;
}

export function timelineTimeFromDisplayValue(
  value: number,
  frameRate: number,
  mode: TimelineTimeDisplayMode,
  duration = Number.POSITIVE_INFINITY,
): number {
  const fps = safeFrameRate(frameRate);
  const requested = Number.isFinite(value) ? Math.max(0, value) : 0;
  const time = mode === 'frames' ? Math.round(requested) / fps : requested;
  const snapped = Math.round(time * fps) / fps;
  const maximum = Number.isFinite(duration) ? Math.max(0, duration) : Number.POSITIVE_INFINITY;
  return Math.min(maximum, snapped);
}

export function timelineRulerStepCount(
  requestedSteps: number,
  duration: number,
  frameRate: number,
  mode: TimelineTimeDisplayMode,
): number {
  const steps = Number.isFinite(requestedSteps) ? Math.max(1, Math.round(requestedSteps)) : 1;
  if (mode === 'seconds') return steps;
  return Math.min(steps, Math.max(1, timelineFrameAtTime(duration, frameRate)));
}
