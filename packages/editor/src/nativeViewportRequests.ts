// Author: MiYu. Bound owned native requests and publish complete frames monotonically.
export type NativeViewportRequestTicket = { sequence: number; generation: number; key: string; ready: Promise<void> };
export function createNativeViewportRequestState(capacity = 2) {
  const pending = new Map<number, NativeViewportRequestTicket>();
  return {
    owner: undefined as unknown, compatibilityKey: '', generation: 0, nextSequence: 0, presentedSequence: 0, pending, capacity,
    lastRequestAt: 0, retryAt: 0, reportedError: false, resumeTimer: null as number | null, captures: 0,
    get inFlight() { return pending.size > 0; },
    get full() { return pending.size >= capacity; },
    get ready(): Promise<void> | null { return pending.size ? Promise.all([...pending.values()].map(ticket => ticket.ready)).then(() => {}) : null; },
  };
}
export type NativeViewportRequestState = ReturnType<typeof createNativeViewportRequestState>;
export function synchronizeNativeViewportRequestOwner(state: NativeViewportRequestState, owner: unknown, compatibilityKey: string): void {
  if (state.owner === owner && state.compatibilityKey === compatibilityKey) return;
  state.owner = owner; state.compatibilityKey = compatibilityKey; state.generation++;
  if (state.resumeTimer != null) clearTimeout(state.resumeTimer);
  state.resumeTimer = null; state.lastRequestAt = -Infinity; state.retryAt = 0; state.reportedError = false;
}
export function beginNativeViewportRequest(state: NativeViewportRequestState, key: string): NativeViewportRequestTicket | null {
  if (state.full || [...state.pending.values()].some(ticket => ticket.generation === state.generation && ticket.key === key)) return null;
  const ticket = { sequence: ++state.nextSequence, generation: state.generation, key, ready: Promise.resolve() };
  state.pending.set(ticket.sequence, ticket);
  return ticket;
}
export function nativeViewportRequestCanPublish(state: NativeViewportRequestState, ticket: NativeViewportRequestTicket): boolean {
  return state.pending.get(ticket.sequence) === ticket && state.generation === ticket.generation && ticket.sequence > state.presentedSequence;
}
export function finishNativeViewportRequest(state: NativeViewportRequestState, ticket: NativeViewportRequestTicket): void {
  state.pending.delete(ticket.sequence);
}
export function nativeViewportReadbackBusy(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)).includes('offscreen readback busy:');
}
export function nativeViewportSessionExpired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Viewport session expired') || message.includes('Play session expired');
}
async function waitPending(states: NativeViewportRequestState[], deadline: number): Promise<boolean> {
  const ready = states.flatMap(state => { const promise = state.ready; return promise ? [promise] : []; });
  if (!ready.length) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.all(ready).then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, deadline - performance.now())); })]); }
  finally { clearTimeout(timer); }
}
export function waitNativeViewportRequests(states: NativeViewportRequestState[], timeoutMs: number): Promise<boolean> {
  return waitPending(states, performance.now() + timeoutMs);
}
/** Callers freeze automatic submissions; each retry must publish its newly requested frame. */
export async function captureLatestNativeViewportFrames(states: NativeViewportRequestState[], requestLatest: () => void, timeoutMs: number, requireNewFrame = true): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  if (!await waitPending(states, deadline)) return false;
  while (performance.now() < deadline) {
    const before = states.map(state => state.nextSequence), generations = states.map(state => state.generation);
    requestLatest();
    const targets = states.map(state => state.nextSequence);
    if (!await waitPending(states, deadline)) return false;
    if ((!requireNewFrame || targets[0] > before[0]) && states.every((state, index) => state.generation === generations[index] && (targets[index] === before[index] || state.presentedSequence >= targets[index]))) return true;
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  return false;
}
export async function retryNativeViewportReadback<T>(render: () => Promise<T>, timeoutMs: number): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    try { return await render(); }
    catch (error) { if (!nativeViewportReadbackBusy(error) || performance.now() >= deadline) throw error; }
    await new Promise(resolve => setTimeout(resolve, 16));
  }
}
