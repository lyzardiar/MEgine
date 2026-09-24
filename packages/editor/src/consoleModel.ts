// Author: MiYu
import { parseConsoleLog, type LogLevel } from './agent/LogService.ts';

export type ConsoleRow = { key: string; line: string; message: string; level: LogLevel; count: number };

export function buildConsoleRows(lines: readonly string[], levels: ReadonlySet<LogLevel>, search: string, collapse: boolean) {
  const counts = { info: 0, warn: 0, error: 0 };
  const rows: ConsoleRow[] = [];
  const occurrences = new Map<string, number>();
  const groups = new Map<string, ConsoleRow>();
  const query = search.trim().toLocaleLowerCase();
  for (const line of lines) {
    const { level, message } = parseConsoleLog(line);
    counts[level]++;
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    if (!levels.has(level) || (query && !line.toLocaleLowerCase().includes(query))) continue;
    const existing = collapse ? groups.get(line) : undefined;
    if (existing) {
      existing.count++;
      continue;
    }
    const row = { key: JSON.stringify([line, occurrence]), line, message, level, count: 1 };
    groups.set(line, row);
    rows.push(row);
  }
  return { rows, counts };
}
