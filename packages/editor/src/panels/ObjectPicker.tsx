/** Unity-style searchable Object Picker popup. */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="object-picker-head">
        <span>{props.title}</span>
        <button type="button" className="object-picker-x" onClick={props.onClose}>
          ×
        </button>
      </div>
      <input
        ref={inputRef}
        className="object-picker-search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="object-picker-list">
        {props.allowNone && (
          <button
            type="button"
            className={`object-picker-item${!props.current ? ' active' : ''}`}
            onClick={() => {
              props.onPick(null);
              props.onClose();
            }}
          >
            <span className="object-picker-ico">∅</span>
            <span className="object-picker-lab">{props.noneLabel ?? 'None'}</span>
          </button>
        )}
        {filtered.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`object-picker-item${props.current === it.id ? ' active' : ''}`}
            onClick={() => {
              props.onPick(it.id);
              props.onClose();
            }}
          >
            <span className="object-picker-ico">
              {it.thumbUrl ? <img src={it.thumbUrl} alt="" /> : (it.icon ?? '○')}
            </span>
            <span className="object-picker-texts">
              <span className="object-picker-lab">{it.label}</span>
              {it.sub && <span className="object-picker-sub">{it.sub}</span>}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="object-picker-empty">No results</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
