/**
 * Structured log service for the AI-agent observation surface.
 *
 * App mirrors these structured entries into its cross-window `string[]` so
 * the visible Console, detached windows, and `console.get_logs` start from
 * the same source and retain the same 300-entry capacity.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  /** Epoch milliseconds when the entry was recorded. */
  time: number;
  source?: string;
}

export type LogSeed = Omit<LogEntry, 'time'> & { time?: number };

export interface LogQuery {
  level?: LogLevel;
  /** Only entries recorded at or after this epoch-ms timestamp. */
  since?: number;
  /** Return at most this many of the most recent matching entries. */
  limit?: number;
}

export type LogChange =
  | { type: 'added'; entry: LogEntry }
  | { type: 'cleared' };

const CAPACITY = 300;

export const INITIAL_EDITOR_LOGS: readonly LogSeed[] = [
  { level: 'info', message: 'MEngine Editor', source: 'editor' },
  {
    level: 'info',
    message: '场景落盘：packages/editor/project/Assets/Scenes/*.mscene',
    source: 'editor',
  },
  {
    level: 'info',
    message: '新建会弹出命名；双击 .mscene 打开；Ctrl+S 保存',
    source: 'editor',
  },
];

export function formatConsoleLog(entry: Pick<LogEntry, 'level' | 'message'>): string {
  const prefix = entry.level === 'info'
    ? ''
    : entry.level === 'warn'
      ? '[Warn] '
      : '[Error] ';
  return `${prefix}${entry.message}`;
}

export function parseConsoleLog(line: string): Pick<LogEntry, 'level' | 'message'> {
  if (line.startsWith('[Warn] ')) {
    return { level: 'warn', message: line.slice('[Warn] '.length) };
  }
  if (line.startsWith('[Error] ')) {
    return { level: 'error', message: line.slice('[Error] '.length) };
  }
  return { level: 'info', message: line };
}

export class LogService {
  private entries: LogEntry[];
  private listeners = new Set<(change: LogChange) => void>();

  constructor(initialEntries: readonly LogSeed[] = []) {
    const now = Date.now();
    this.entries = initialEntries.slice(-CAPACITY).map((entry) => ({
      ...entry,
      time: entry.time ?? now,
    }));
  }

  log(message: string, level: LogLevel = 'info', source?: string): void {
    const entry = { level, message, time: Date.now(), source };
    this.entries.push(entry);
    if (this.entries.length > CAPACITY) {
      this.entries.splice(0, this.entries.length - CAPACITY);
    }
    this.notify({ type: 'added', entry: { ...entry } });
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
    this.notify({ type: 'cleared' });
  }

  /**
   * Reconcile a cross-window Console snapshot while preserving structured
   * entries in the overlapping tail and emitting events only for real changes.
   */
  syncConsoleLines(lines: readonly string[], source = 'workspace'): void {
    const nextLines = lines.slice(-CAPACITY);
    const currentLines = this.entries.map(formatConsoleLog);
    if (
      currentLines.length === nextLines.length
      && currentLines.every((line, index) => line === nextLines[index])
    ) return;
    if (nextLines.length === 0) {
      if (this.entries.length > 0) this.clear();
      return;
    }

    let overlap = Math.min(currentLines.length, nextLines.length);
    while (
      overlap > 0
      && !currentLines.slice(-overlap).every((line, index) => line === nextLines[index])
    ) {
      overlap -= 1;
    }
    if (overlap === 0 && this.entries.length > 0) {
      this.entries = [];
      this.notify({ type: 'cleared' });
    } else if (overlap > 0) {
      this.entries = this.entries.slice(-overlap);
    }

    const now = Date.now();
    for (const line of nextLines.slice(overlap)) {
      const parsed = parseConsoleLog(line);
      const entry = { ...parsed, time: now, source };
      this.entries.push(entry);
      this.notify({ type: 'added', entry: { ...entry } });
    }
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(fn: (change: LogChange) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(change: LogChange): void {
    for (const fn of this.listeners) fn(change);
  }
}

/** Process-wide log sink mirrored to App and read by the AgentBridge. */
export const logService = new LogService(INITIAL_EDITOR_LOGS);
