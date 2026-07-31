import type { EditorUiSnapshot, EditorUiWaitResult } from './protocol';

export const MAX_PENDING_WINDOW_UI_WAITS = 16;
export const WINDOW_UI_WAIT_POLL_INTERVAL_MS = 250;

type WindowUiWaitOptions<T extends EditorUiSnapshot> = {
  expectedSnapshotRevision: string;
  timeoutMs: number;
  inspect: () => Promise<T>;
  signal?: AbortSignal;
  pollIntervalMs?: number;
};

/**
 * Long-poll a semantic editor-window revision without making the Agent issue
 * repeated transport requests. The final observation is always returned, even
 * on timeout, so the caller can continue from one coherent snapshot.
 */
export async function waitForWindowUiChange<T extends EditorUiSnapshot>({
  expectedSnapshotRevision,
  timeoutMs,
  inspect,
  signal,
  pollIntervalMs = WINDOW_UI_WAIT_POLL_INTERVAL_MS,
}: WindowUiWaitOptions<T>): Promise<EditorUiWaitResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  while (true) {
    throwIfAborted(signal);
    const snapshot = await inspect();
    throwIfAborted(signal);
    const changed = snapshot.snapshotRevision !== expectedSnapshotRevision;
    const now = Date.now();
    if (changed || now >= deadline) {
      return {
        ...snapshot,
        expectedSnapshotRevision,
        changed,
        timedOut: !changed,
        // A zero timeout means "observe once without waiting". Keep that
        // contract deterministic even when the inspection crosses a clock tick.
        waitedMs: timeoutMs === 0 ? 0 : Math.max(0, now - startedAt),
      };
    }
    await abortableDelay(
      Math.min(Math.max(0, pollIntervalMs), Math.max(0, deadline - now)),
      signal,
    );
  }
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(windowUiWaitAbortError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(windowUiWaitAbortError());
    };
    const timer = setTimeout(finish, delayMs);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw windowUiWaitAbortError();
}

function windowUiWaitAbortError(): Error {
  const error = new Error('Editor window UI wait cancelled');
  error.name = 'AbortError';
  return error;
}
