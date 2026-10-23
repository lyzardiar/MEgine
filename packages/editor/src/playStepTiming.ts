// Author: MiYu. Successful Play request scopes carry their own session and revision.
export type NativePlayStepTiming = { workerQueueMs: number; simulationMs: number; workerMs: number; commandMs?: number };
export type PlayStepTiming = {
  sessionId: number; revision: number; invokeMs: number; applyMs: number;
  native?: NativePlayStepTiming;
  prepareMs?: number; acceptMs?: number; totalMs?: number;
};

/** Nested clocks become disjoint scopes; missing or inconsistent measurements stay unavailable. */
export function playStepTimingStages(timing: PlayStepTiming): { name: string; ms: number | undefined }[] {
  const valid = (value: number | undefined) => value != null && Number.isFinite(value) && value >= 0 ? value : undefined;
  const rest = (total: number | undefined, parts: (number | undefined)[]) => {
    if (valid(total) === undefined || parts.some(value => valid(value) === undefined)) return undefined;
    const value = total! - parts.reduce<number>((sum, part) => sum + part!, 0);
    return value >= 0 ? value : undefined;
  };
  const native = timing.native;
  return [
    { name: 'Prepare input and world', ms: valid(timing.prepareMs) },
    { name: 'Simulation worker queue', ms: valid(native?.workerQueueMs) },
    { name: 'Simulation and snapshot delta', ms: valid(native?.simulationMs) },
    { name: 'Worker publication and bookkeeping', ms: rest(native?.workerMs, [native?.simulationMs]) },
    { name: 'Command scheduling and return', ms: rest(native?.commandMs, [native?.workerQueueMs, native?.workerMs]) },
    { name: 'IPC encode, delivery and decode', ms: rest(timing.invokeMs, [native?.commandMs]) },
    { name: 'Apply and retain delta', ms: valid(timing.applyMs) },
    { name: 'Accept runtime world', ms: valid(timing.acceptMs) },
    { name: 'Other frontend work', ms: rest(timing.totalMs, [timing.prepareMs, timing.invokeMs, timing.applyMs, timing.acceptMs]) },
  ];
}
