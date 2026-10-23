// Author: MiYu. Keep a fixed frame timebase while skipping missed slots without burst catch-up.
export function advanceFrameDeadline(deadline: number, now: number, interval: number): number {
  if (!Number.isFinite(deadline) || deadline > now + 1e-6) return now + interval;
  const next = deadline + (Math.floor((now - deadline) / interval) + 1) * interval;
  return next > now + 1e-6 ? next : next + interval;
}

/** Late wakeups may recover phase, but adjacent starts stay at least half a period apart. */
export function frameCadenceDelay(deadline: number, lastStartedAt: number, now: number, interval: number): number {
  if (!Number.isFinite(deadline)) return 0;
  const delay = Math.max(0, deadline - now, lastStartedAt + interval / 2 - now);
  return delay > 1e-6 ? delay : 0;
}
