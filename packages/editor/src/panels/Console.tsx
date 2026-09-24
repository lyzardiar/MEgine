// Author: MiYu
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import type { LogLevel } from '../agent/LogService';
import { buildConsoleRows } from '../consoleModel';

const LEVEL_ICONS = { info: Info, warn: AlertTriangle, error: CircleAlert };

export function Console(props: { lines: string[]; onClear?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const rowId = useId();
  const [follow, setFollow] = useState(true);
  const [levels, setLevels] = useState(() => new Set<LogLevel>(['info', 'warn', 'error']));
  const [search, setSearch] = useState('');
  const [collapse, setCollapse] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const { rows, counts } = useMemo(() => buildConsoleRows(props.lines, levels, search, collapse), [props.lines, levels, search, collapse]);
  const selectedIndex = rows.findIndex((row) => row.key === selection);
  const selected = rows[selectedIndex];

  useEffect(() => {
    if (ref.current && follow) ref.current.scrollTop = ref.current.scrollHeight;
  }, [rows, follow]);

  return (
    <div className="console-panel">
      <div className="console-toolbar" role="toolbar" aria-label="Console controls">
        <button type="button" onClick={() => { setSelection(null); props.onClear?.(); }} disabled={!props.lines.length || !props.onClear}>Clear</button>
        <button type="button" className={collapse ? 'active' : ''} aria-pressed={collapse} title="Group identical messages" onClick={() => setCollapse(!collapse)}>Collapse</button>
        <button type="button" className={follow ? 'active' : ''} aria-pressed={follow} title="Scroll to new messages" onClick={() => setFollow(!follow)}>Follow</button>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search logs" aria-label="Search console logs" />
        <div className="console-levels">
          {(['info', 'warn', 'error'] as const).map((level) => {
            const Icon = LEVEL_ICONS[level];
            return (
              <button key={level} type="button" className={`console-level ${level}${levels.has(level) ? ' active' : ''}`} aria-label={`${level} messages (${counts[level]})`} aria-pressed={levels.has(level)} title={`Toggle ${level} messages`} onClick={() => setLevels((current) => {
                const next = new Set(current);
                if (next.has(level)) next.delete(level);
                else next.add(level);
                return next;
              })}>
                <Icon size={13} aria-hidden="true" />{counts[level]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="console-body" ref={ref} role="listbox" aria-label="Editor Console" tabIndex={0} aria-activedescendant={selected ? `${rowId}-${selectedIndex}` : undefined} onScroll={(event) => {
        const element = event.currentTarget;
        setFollow(element.scrollHeight - element.scrollTop - element.clientHeight <= 4);
      }} onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !rows.length) return;
        event.preventDefault();
        event.stopPropagation();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, selectedIndex + (event.key === 'ArrowUp' ? -1 : 1)));
        setSelection(rows[index].key);
        setFollow(false);
        event.currentTarget.children[index]?.scrollIntoView({ block: 'nearest' });
      }}>
        {rows.map((row, index) => {
          const Icon = LEVEL_ICONS[row.level];
          return (
            <div key={row.key} id={`${rowId}-${index}`} role="option" aria-selected={index === selectedIndex} className={`console-line ${row.level}${index === selectedIndex ? ' selected' : ''}`} onClick={() => {
              setSelection(row.key);
              setFollow(false);
              ref.current?.focus({ preventScroll: true });
            }}>
              <Icon size={15} aria-hidden="true" />
              <span className="console-message">{row.message.split(/\r?\n/, 1)[0] || '(empty message)'}</span>
              {collapse && row.count > 1 && <span className="console-count" aria-label={`${row.count} occurrences`}>{row.count}</span>}
            </div>
          );
        })}
        {!rows.length && <div className="console-empty">{!props.lines.length ? 'Console is empty.' : 'No matching logs.'}</div>}
      </div>
      {selected && <div className="console-detail">
        <div className="console-detail-heading">{selected.level.toUpperCase()}{collapse && selected.count > 1 ? ` · ${selected.count} occurrences` : ''}</div>
        <textarea readOnly aria-label="Selected log details" value={selected.line} spellCheck={false} />
      </div>}
      <div className="console-summary" role="status">{rows.length} {collapse ? 'groups' : 'messages'} shown · {props.lines.length} retained</div>
    </div>
  );
}
