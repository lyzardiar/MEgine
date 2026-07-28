export interface ViewportSimulationClockState {
  runtime: boolean;
  simulationTimeSeconds: number;
  wallTimeMs: number;
}

export interface ViewportSimulationClockSample {
  state: ViewportSimulationClockState;
  deltaSeconds: number;
  animationTimeSeconds: number;
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function createViewportSimulationClock(
  runtime: boolean,
  simulationTimeSeconds: number,
  wallTimeMs: number,
): ViewportSimulationClockState {
  return {
    runtime,
    simulationTimeSeconds: Math.max(0, finiteOrZero(simulationTimeSeconds)),
    wallTimeMs: finiteOrZero(wallTimeMs),
  };
}

/**
 * Edit-mode previews follow wall time. Play and Pause use the editor's
 * simulation clock so Pause is visually frozen and a single Step advances all
 * viewport-only systems by exactly the requested simulation delta.
 */
export function sampleViewportSimulationClock(
  previous: ViewportSimulationClockState,
  runtime: boolean,
  simulationTimeSeconds: number,
  wallTimeMs: number,
): ViewportSimulationClockSample {
  const next = createViewportSimulationClock(runtime, simulationTimeSeconds, wallTimeMs);
  const deltaSeconds = runtime
    ? previous.runtime
      ? Math.max(0, next.simulationTimeSeconds - previous.simulationTimeSeconds)
      : 0
    : previous.runtime
      ? 0
      : Math.max(0, Math.min(0.1, (next.wallTimeMs - previous.wallTimeMs) / 1_000));

  return {
    state: next,
    deltaSeconds,
    animationTimeSeconds: runtime
      ? next.simulationTimeSeconds
      : next.wallTimeMs / 1_000,
  };
}
