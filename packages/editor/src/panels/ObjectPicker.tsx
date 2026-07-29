/** Unity-style searchable Object Picker popup. */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  nextObjectPickerOptionIndex,
  type ObjectPickerNavigationKey,
} from '../objectPickerNavigation';

export type PickerItem = {
  id: string;
  label: string;
  sub?: string;
  thumbUrl?: string | null;
  icon?: string;
};

export function ObjectPicker(props: {
  title: string;
  items: PickerItem[];
  current?: string | null;
  allowNone?: boolean;
  noneLabel?: string;
  /** Prefer open near this rect (slot button). */
  anchorRect?: DOMRect | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.items;
    return props.items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.sub ?? '').toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q),
    );
  }, [props.items, query]);

  const options = useMemo(() => [
    ...(props.allowNone ? [{ key: 'none', value: null as string | null }] : []),
    ...filtered.map((item) => ({ key: `item:${item.id}`, value: item.id })),
  ], [filtered, props.allowNone]);
  const activeIndex = options.findIndex((option) => option.key === activeKey);
  const activeOptionId = activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    setActiveKey((currentKey) => {
      if (currentKey && options.some((option) => option.key === currentKey)) return currentKey;
      const selectedKey = props.current
        ? `item:${props.current}`
        : props.allowNone
          ? 'none'
          : null;
      if (selectedKey && options.some((option) => option.key === selectedKey)) return selectedKey;
      return options[0]?.key ?? null;
    });
  }, [options, props.allowNone, props.current]);

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      props.onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [props.onClose]);

  const choose = (value: string | null) => {
    props.onPick(value);
    props.onClose();
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key === 'Enter') {
      const active = options[activeIndex];
      if (!active) return;
      event.preventDefault();
      event.stopPropagation();
      choose(active.value);
      return;
    }
    if (![
      'ArrowDown',
      'ArrowUp',
      'Home',
      'End',
      'PageDown',
      'PageUp',
    ].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = nextObjectPickerOptionIndex(
      options.length,
      activeIndex,
      event.key as ObjectPickerNavigationKey,
    );
    setActiveKey(options[nextIndex]?.key ?? null);
  };

  const style: CSSProperties = (() => {
    const w = 280;
    const h = 340;
    const pad = 8;
    const r = props.anchorRect;
    if (!r) {
      return {
        left: Math.max(pad, (window.innerWidth - w) / 2),
        top: Math.max(pad, (window.innerHeight - h) / 2),
        width: w,
        height: h,
      };
    }
    let left = r.right - w;
    let top = r.bottom + 4;
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 4);
    return { left, top, width: w, height: h };
  })();

  return createPortal(
    <div
      ref={panelRef}
      className="object-picker"
      role="dialog"
      aria-label={props.title}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="object-picker-head">
        <span>{props.title}</span>
        <button type="button" className="object-picker-x" aria-label={`Close ${props.title}`} onClick={props.onClose}>
          ×
        </button>
      </div>
      <input
        ref={inputRef}
        type="search"
        className="object-picker-search"
        role="combobox"
        aria-label={`Search ${props.title}`}
        aria-controls={listId}
        aria-expanded="true"
        aria-activedescendant={activeOptionId}
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
      />
      <div
        id={listId}
        className="object-picker-list"
        role="listbox"
        aria-label={`${props.title} options`}
      >
        {props.allowNone && (
          <button
            id={`${listId}-option-0`}
            type="button"
            role="option"
            aria-selected={activeKey === 'none'}
            className={`object-picker-item${activeKey === 'none' ? ' active' : ''}`}
            onPointerMove={() => setActiveKey('none')}
            onClick={() => choose(null)}
          >
            <span className="object-picker-ico">∅</span>
            <span className="object-picker-lab">{props.noneLabel ?? 'None'}</span>
          </button>
        )}
        {filtered.map((it, index) => {
          const optionKey = `item:${it.id}`;
          const optionIndex = index + (props.allowNone ? 1 : 0);
          return (
            <button
              key={it.id}
              id={`${listId}-option-${optionIndex}`}
              type="button"
              role="option"
              aria-selected={activeKey === optionKey}
              className={`object-picker-item${activeKey === optionKey ? ' active' : ''}`}
              onPointerMove={() => setActiveKey(optionKey)}
              onClick={() => choose(it.id)}
            >
              <span className="object-picker-ico">
                {it.thumbUrl ? <img src={it.thumbUrl} alt="" /> : (it.icon ?? '○')}
              </span>
              <span className="object-picker-texts">
                <span className="object-picker-lab">{it.label}</span>
                {it.sub && <span className="object-picker-sub">{it.sub}</span>}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="object-picker-empty">No results</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
