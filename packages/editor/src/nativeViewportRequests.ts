// Author: MiYu. Bound owned native requests and publish complete frames monotonically.
import { advanceFrameDeadline, frameCadenceDelay } from './frameCadence.ts';
export type NativeViewportRequestTicket = { sequence: number; generation: number; key: string; ready: Promise<void> };
export function createNativeViewportRequestState(capacity = 2) {
  const pending = new Map<number, NativeViewportRequestTicket>();
  return {
    owner: undefined as unknown, compatibilityKey: '', generation: 0, nextSequence: 0, presentedSequence: 0, pending, capacity,
    lastRequestAt: 0, nextRequestAt: -Infinity, retryAt: 0, deferredRevisionRetries: 0, reportedError: false, error: null as string | null, resumeTimer: null as number | null, captures: 0,
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
  state.resumeTimer = null; state.lastRequestAt = -Infinity; state.nextRequestAt = -Infinity; state.retryAt = 0; state.deferredRevisionRetries = 0; state.reportedError = false; state.error = null;
}
export function nativeViewportRequestDelay(state: NativeViewportRequestState, now: number, interval: number): number {
  return interval === 1000 / 60 && Number.isFinite(state.lastRequestAt) ? frameCadenceDelay(state.nextRequestAt, state.lastRequestAt, now, interval) : Math.max(0, interval - (now - state.lastRequestAt));
}
export function beginNativeViewportRequest(state: NativeViewportRequestState, key: string, requestedAt = performance.now(), interval = 0): NativeViewportRequestTicket | null {
  if (state.full || [...state.pending.values()].some(ticket => ticket.generation === state.generation && ticket.key === key)) return null;
  const ticket = { sequence: ++state.nextSequence, generation: state.generation, key, ready: Promise.resolve() };
  state.pending.set(ticket.sequence, ticket); state.lastRequestAt = requestedAt;
  state.nextRequestAt = interval > 0 ? advanceFrameDeadline(state.nextRequestAt, requestedAt, interval) : -Infinity;
  return ticket;
}
export function nativeViewportRequestCanPublish(state: NativeViewportRequestState, ticket: NativeViewportRequestTicket): boolean {
  return state.pending.get(ticket.sequence) === ticket && state.generation === ticket.generation && ticket.sequence > state.presentedSequence;
}
export function finishNativeViewportRequest(state: NativeViewportRequestState, ticket: NativeViewportRequestTicket): void {
  state.pending.delete(ticket.sequence);
}
export const NATIVE_VIEWPORT_REVISION_DEFERRED = 'Play viewport revision deferred';
export function nativeViewportRevisionDeferred(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)).includes(NATIVE_VIEWPORT_REVISION_DEFERRED);
}
/** Two expired live requests may yield to a newer world; captures and a persistent miss keep exact snapshot fallback. */
export function deferNativeViewportRevision(state: NativeViewportRequestState, ticket: NativeViewportRequestTicket): boolean {
  if (!nativeViewportRequestCanPublish(state, ticket)) return true;
  if (state.captures > 0 || state.deferredRevisionRetries >= 2) return false;
  state.deferredRevisionRetries++;
  return true;
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
