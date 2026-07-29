/**
 * Bounded idempotency support for AgentBridge write requests.
 *
 * Network clients can time out after the editor has already committed a
 * mutation. Reusing the same request id must therefore join an in-flight
 * operation or replay its completed result instead of executing it again.
 */

export interface IdempotencyOutcome<T> {
  value: T;
  replayed: boolean;
  fromCompleted: boolean;
}

interface PendingEntry<T> {
  fingerprint: string;
  promise: Promise<T>;
}

interface CompletedEntry<T> {
  fingerprint: string;
  value: T;
}

export class IdempotencyConflictError extends Error {
  readonly requestId: string;

  constructor(requestId: string) {
    super(`requestId "${requestId}" was already used for a different write request`);
    this.name = 'IdempotencyConflictError';
    this.requestId = requestId;
  }
}

export class IdempotencyCapacityError extends Error {
  readonly pendingEntries: number;
  readonly maxPendingEntries: number;

  constructor(pendingEntries: number, maxPendingEntries: number) {
    super(`AgentBridge already has ${pendingEntries} pending unique write requests`);
    this.name = 'IdempotencyCapacityError';
    this.pendingEntries = pendingEntries;
    this.maxPendingEntries = maxPendingEntries;
  }
}

/**
 * Keeps all in-flight operations plus the most recent completed results.
 * Failed operations are deliberately not cached so transient failures can be
 * retried with the same key.
 */
export class IdempotentRequestCache<T> {
  private readonly pending = new Map<string, PendingEntry<T>>();
  private readonly completed = new Map<string, CompletedEntry<T>>();
  private readonly maxCompletedEntries: number;
  private readonly compactCompletedValue: (value: T) => T;
  private readonly maxPendingEntries: number;

  constructor(
    maxCompletedEntries = 256,
    compactCompletedValue: (value: T) => T = (value) => value,
    maxPendingEntries = 64,
  ) {
    if (!Number.isSafeInteger(maxCompletedEntries) || maxCompletedEntries < 1) {
      throw new Error('maxCompletedEntries must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxPendingEntries) || maxPendingEntries < 1) {
      throw new Error('maxPendingEntries must be a positive safe integer');
    }
    this.maxCompletedEntries = maxCompletedEntries;
    this.compactCompletedValue = compactCompletedValue;
    this.maxPendingEntries = maxPendingEntries;
  }

  async run(
    requestId: string,
    fingerprint: string,
    operation: () => Promise<T> | T,
  ): Promise<IdempotencyOutcome<T>> {
    const completed = this.completed.get(requestId);
    if (completed) {
      this.assertSameFingerprint(requestId, completed.fingerprint, fingerprint);
      // Refresh insertion order so frequently retried requests remain cached.
      this.completed.delete(requestId);
      this.completed.set(requestId, completed);
      return {
        value: completed.value,
        replayed: true,
        fromCompleted: true,
      };
    }

    const pending = this.pending.get(requestId);
    if (pending) {
      this.assertSameFingerprint(requestId, pending.fingerprint, fingerprint);
      return {
        value: await pending.promise,
        replayed: true,
        fromCompleted: false,
      };
    }

    if (this.pending.size >= this.maxPendingEntries) {
      throw new IdempotencyCapacityError(
        this.pending.size,
        this.maxPendingEntries,
      );
    }

    const promise = Promise.resolve().then(operation);
    this.pending.set(requestId, { fingerprint, promise });
    try {
      const value = await promise;
      this.pending.delete(requestId);
      this.completed.set(requestId, {
        fingerprint,
        value: this.compactCompletedValue(value),
      });
      while (this.completed.size > this.maxCompletedEntries) {
        const oldest = this.completed.keys().next().value;
        if (oldest === undefined) break;
        this.completed.delete(oldest);
      }
      return { value, replayed: false, fromCompleted: false };
    } catch (error) {
      this.pending.delete(requestId);
      throw error;
    }
  }

  private assertSameFingerprint(
    requestId: string,
    existing: string,
    incoming: string,
  ): void {
    if (existing !== incoming) throw new IdempotencyConflictError(requestId);
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => item === undefined ? null : canonicalizeJson(item));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalizeJson(item);
    }
    return result;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

/** Stable across harmless JSON object-key ordering differences. */
export function createExecuteFingerprint(
  command: string,
  args: Record<string, unknown>,
  options: Record<string, unknown>,
): string {
  return JSON.stringify(canonicalizeJson({ command, args, options }));
}
