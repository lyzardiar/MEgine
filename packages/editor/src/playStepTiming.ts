// Author: MiYu. Successful Play request scopes carry their own session and revision.
export type NativePlayStepTiming = { workerQueueMs: number; simulationMs: number; workerMs: number; commandMs?: number };
export type PlayStepTiming = {
  sessionId: number; revision: number; invokeMs: number; applyMs: number;
  native?: NativePlayStepTiming;
  prepareMs?: number; acceptMs?: number; totalMs?: number;
};

/** Own duration measurements only for the accepted native world; absent data stays unknown. */
export function retainPlayStepTiming(timing: Readonly<PlayStepTiming> | undefined, sessionId: number | undefined, revision: number | undefined): Readonly<PlayStepTiming> | undefined {
  if (!timing || typeof timing !== 'object' || Array.isArray(timing) || !Number.isSafeInteger(sessionId) || sessionId! < 0 || !Number.isSafeInteger(revision) || revision! < 0) return;
  const valid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const owned: PlayStepTiming = { sessionId: timing.sessionId, revision: timing.revision, invokeMs: timing.invokeMs, applyMs: timing.applyMs };
  if (owned.sessionId !== sessionId || owned.revision !== revision || !valid(owned.invokeMs) || !valid(owned.applyMs)) return;
  for (const key of ['prepareMs', 'acceptMs', 'totalMs'] as const) { const duration = timing[key]; if (duration !== undefined) { if (!valid(duration)) return; owned[key] = duration; } }
  const input = timing.native;
  if (input !== undefined) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    const native: NativePlayStepTiming = { workerQueueMs: input.workerQueueMs, simulationMs: input.simulationMs, workerMs: input.workerMs };
    const command = input.commandMs;
    if (![native.workerQueueMs, native.simulationMs, native.workerMs].every(valid) || command !== undefined && !valid(command)) return;
    if (command !== undefined) native.commandMs = command;
    owned.native = Object.freeze(native);
  }
  return Object.freeze(owned);
}

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
