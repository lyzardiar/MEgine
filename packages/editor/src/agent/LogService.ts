/**
 * Structured log service for the AI-agent observation surface.
 *
 * The editor historically kept logs as a plain `string[]` in `App.tsx`
 * (prefixed with `[Warn] `/`[Error] `, capped at 300). That works for the
 * Console panel but is hard for an agent to filter. This service keeps
 * structured entries (level / message / time / source) that the AgentBridge
 * exposes via `console.get_logs`.
 *
 * Phase 1 mirrors entries here from `App.tsx`'s existing `log()` so the
 * Console panel and window broadcast keep working unchanged; a later pass can
 * make this service the single source of truth for the Console panel too.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  /** Epoch milliseconds when the entry was recorded. */
  time: number;
  source?: string;
}

export interface LogQuery {
  level?: LogLevel;
  /** Only entries recorded at or after this epoch-ms timestamp. */
  since?: number;
  /** Return at most this many of the most recent matching entries. */
  limit?: number;
}

const CAPACITY = 300;

class LogService {
  private entries: LogEntry[] = [];
  private listeners = new Set<() => void>();

  log(message: string, level: LogLevel = 'info', source?: string): void {
    this.entries.push({ level, message, time: Date.now(), source });
    if (this.entries.length > CAPACITY) {
      this.entries.splice(0, this.entries.length - CAPACITY);
    }
    this.notify();
  }

  getEntries(query: LogQuery = {}): LogEntry[] {
    let result = this.entries;
    if (query.level) result = result.filter((e) => e.level === query.level);
    if (typeof query.since === 'number') {
      result = result.filter((e) => e.time >= query.since!);
    }
    if (typeof query.limit === 'number' && query.limit >= 0) {
      result = result.slice(-query.limit);
    }
    return result.map((e) => ({ ...e }));
  }

  clear(): void {
    this.entries = [];
    this.notify();
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

/** Process-wide log sink, mirrored from App.tsx and read by the AgentBridge. */
export const logService = new LogService();
