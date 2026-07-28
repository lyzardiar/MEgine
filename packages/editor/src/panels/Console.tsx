import { useEffect, useMemo, useRef, useState } from 'react';

type ConsoleLevel = 'all' | 'info' | 'warn' | 'error';

function levelForLine(line: string): Exclude<ConsoleLevel, 'all'> {
  if (line.startsWith('[Warn]')) return 'warn';
  if (line.startsWith('[Error]')) return 'error';
  return 'info';
}

export function Console(props: { lines: string[]; onClear?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [level, setLevel] = useState<ConsoleLevel>('all');
  const [search, setSearch] = useState('');
  const counts = useMemo(() => {
    const next = { all: props.lines.length, info: 0, warn: 0, error: 0 };
    for (const line of props.lines) next[levelForLine(line)] += 1;
    return next;
  }, [props.lines]);
  const visibleLines = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return props.lines
      .map((line, index) => ({ line, index, level: levelForLine(line) }))
      .filter((entry) => level === 'all' || entry.level === level)
      .filter((entry) => !query || entry.line.toLocaleLowerCase().includes(query));
  }, [level, props.lines, search]);

  useEffect(() => {
    if (ref.current && stickToBottom.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [visibleLines]);

  return (
    <div className="console-panel">
      <div className="console-toolbar" role="toolbar" aria-label="Console controls">
        <button
          type="button"
          onClick={props.onClear}
          disabled={props.lines.length === 0 || !props.onClear}
        >
          Clear
        </button>
        {(['all', 'info', 'warn', 'error'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={level === candidate ? 'active' : ''}
            aria-pressed={level === candidate}
            onClick={() => setLevel(candidate)}
          >
            {candidate === 'all'
              ? 'All'
              : candidate[0].toUpperCase() + candidate.slice(1)}
            {' '}{counts[candidate]}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search logs"
          aria-label="Search console logs"
        />
      </div>
      <div
        className="console-body"
        ref={ref}
        role="log"
        aria-label="Editor Console"
        aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = (
            element.scrollHeight - element.scrollTop - element.clientHeight
          ) <= 4;
        }}
      >
        {visibleLines.map(({ line, index, level: entryLevel }) => (
          <div key={index} className={`console-line ${entryLevel}`}>
            {line}
          </div>
        ))}
        {visibleLines.length === 0 && (
          <div className="console-empty">
            {props.lines.length === 0 ? 'Console is empty.' : 'No matching logs.'}
          </div>
        )}
      </div>
    </div>
  );
}
