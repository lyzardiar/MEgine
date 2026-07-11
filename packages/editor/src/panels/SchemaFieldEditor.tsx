import { useMemo, useState, type ReactNode } from 'react';
import type { FieldMeta, MethodMeta } from '@mengine/behaviour';

function condOk(
  data: Record<string, unknown>,
  cond: { field: string; equals: unknown } | undefined,
  invert = false,
): boolean {
  if (!cond) return true;
  const hit = Object.is(data[cond.field], cond.equals) || data[cond.field] === cond.equals;
  return invert ? !hit : hit;
}

function fieldVisible(f: FieldMeta, data: Record<string, unknown>): boolean {
  if (f.hideInInspector) return false;
  if (f.showIf && !condOk(data, f.showIf)) return false;
  if (f.hideIf && condOk(data, f.hideIf)) return false;
  return true;
}

function fieldEnabled(f: FieldMeta, data: Record<string, unknown>): boolean {
  if (f.readOnly) return false;
  if (f.enableIf && !condOk(data, f.enableIf)) return false;
  if (f.disableIf && condOk(data, f.disableIf)) return false;
  return true;
}

function colorToHex(c: number[]): string {
  const r = Math.round(Math.min(1, Math.max(0, c[0] ?? 0)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, c[1] ?? 0)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, c[2] ?? 0)) * 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function hexToColor(hex: string, alpha = 1): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1, alpha];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

type AxisInputProps = {
  label: 'x' | 'y' | 'z';
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
};

function MiniAxis(props: AxisInputProps) {
  return (
    <div className="axis">
      <span className={props.label}>{props.label.toUpperCase()}</span>
      <input
        type="number"
        step={0.1}
        disabled={props.disabled}
        value={Number(props.value.toFixed(3))}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function FieldChrome(props: {
  field: FieldMeta;
  children: ReactNode;
}) {
  const f = props.field;
  return (
    <div
      className="schema-field"
      style={f.spaceBefore ? { marginTop: f.spaceBefore } : undefined}
    >
      {f.header && <div className="schema-header">{f.header}</div>}
      {f.title && <div className="schema-title">{f.title}</div>}
      {f.infoBox && <div className="schema-infobox">{f.infoBox}</div>}
      {props.children}
    </div>
  );
}

export function SchemaFieldEditor(props: {
  fields: FieldMeta[];
  methods?: MethodMeta[];
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onInvokeMethod?: (methodKey: string) => void;
}) {
  const [foldOpen, setFoldOpen] = useState<Record<string, boolean>>({});

  const visible = useMemo(
    () => props.fields.filter((f) => fieldVisible(f, props.data)),
    [props.fields, props.data],
  );

  const setKey = (f: FieldMeta, value: unknown) => {
    const next = { ...props.data, [f.key]: value };
    props.onChange(next);
    if (f.onValueChanged) props.onInvokeMethod?.(f.onValueChanged);
  };

  const renderWidget = (f: FieldMeta) => {
    const label = f.label ?? f.key;
    const title = f.tooltip;
    const raw = props.data[f.key];
    const enabled = fieldEnabled(f, props.data);
    const requiredEmpty =
      f.required &&
      (raw == null || raw === '' || (typeof raw === 'number' && Number.isNaN(raw)));

    if (f.type === 'boolean') {
      const row = (
        <div
          className={`field-row${requiredEmpty ? ' field-required' : ''}`}
          title={title}
        >
          <label>{label}</label>
          <input
            type="checkbox"
            className="field-bool"
            checked={!!raw}
            disabled={!enabled}
            onChange={(e) => setKey(f, e.target.checked)}
          />
        </div>
      );
      return <FieldChrome key={f.key} field={f}>{row}</FieldChrome>;
    }

    if (f.type === 'vec3') {
      const arr = (Array.isArray(raw) && raw.length >= 3 ? raw : [0, 0, 0]) as number[];
      return (
        <FieldChrome key={f.key} field={f}>
          <div className={`axis-row${requiredEmpty ? ' field-required' : ''}`} title={title}>
            <label>{label}</label>
            {(['x', 'y', 'z'] as const).map((ax, i) => (
              <MiniAxis
                key={ax}
                label={ax}
                value={Number(arr[i]) || 0}
                disabled={!enabled}
                onChange={(v) => {
                  const next = [Number(arr[0]) || 0, Number(arr[1]) || 0, Number(arr[2]) || 0];
                  next[i] = v;
                  setKey(f, next);
                }}
              />
            ))}
          </div>
        </FieldChrome>
      );
    }

    if (f.type === 'color') {
      const arr = (Array.isArray(raw) && raw.length >= 3 ? raw : [1, 1, 1, 1]) as number[];
      return (
        <FieldChrome key={f.key} field={f}>
          <div className={`field-row${requiredEmpty ? ' field-required' : ''}`} title={title}>
            <label>{label}</label>
            <input
              type="color"
              disabled={!enabled}
              value={colorToHex(arr)}
              onChange={(e) => setKey(f, hexToColor(e.target.value, arr[3] ?? 1))}
            />
          </div>
        </FieldChrome>
      );
    }

    if (f.type === 'enum' && f.enumOptions?.length) {
      return (
        <FieldChrome key={f.key} field={f}>
          <div className={`field-row${requiredEmpty ? ' field-required' : ''}`} title={title}>
            <label>{label}</label>
            <select
              disabled={!enabled}
              value={String(raw ?? f.enumOptions[0].value)}
              onChange={(e) => {
                const opt = f.enumOptions!.find((o) => String(o.value) === e.target.value);
                setKey(f, opt ? opt.value : e.target.value);
              }}
            >
              {f.enumOptions.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </FieldChrome>
      );
    }

    if (f.type === 'string') {
      const rows = f.textAreaMinLines ?? f.multilineLines ?? 3;
      return (
        <FieldChrome key={f.key} field={f}>
          <div className={`field-row${requiredEmpty ? ' field-required' : ''}`} title={title}>
            <label>{label}</label>
            {f.multiline ? (
              <textarea
                disabled={!enabled}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(e) => setKey(f, e.target.value)}
                rows={rows}
                style={
                  f.textAreaMaxLines
                    ? { maxHeight: f.textAreaMaxLines * 18, overflow: 'auto' }
                    : undefined
                }
              />
            ) : (
              <input
                type="text"
                disabled={!enabled}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(e) => setKey(f, e.target.value)}
              />
            )}
          </div>
        </FieldChrome>
      );
    }

    // number
    let num = typeof raw === 'number' ? raw : Number(raw) || 0;
    if (f.range) num = Math.min(f.range[1], Math.max(f.range[0], num));
    if (f.min != null) num = Math.max(f.min, num);
    if (f.max != null) num = Math.min(f.max, num);

    const clamp = (v: number) => {
      let next = v;
      if (f.range) next = Math.min(f.range[1], Math.max(f.range[0], next));
      if (f.min != null) next = Math.max(f.min, next);
      if (f.max != null) next = Math.min(f.max, next);
      return next;
    };

    if (f.range || f.progressBar) {
      const lo = f.range?.[0] ?? f.min ?? 0;
      const hi = f.range?.[1] ?? f.max ?? 100;
      const pct = hi > lo ? ((num - lo) / (hi - lo)) * 100 : 0;
      return (
        <FieldChrome key={f.key} field={f}>
          <div className={`field-row field-slider${requiredEmpty ? ' field-required' : ''}`} title={title}>
            <label>{label}</label>
            <div className="slider-wrap">
              {f.progressBar && (
                <div className="progress-bar" aria-hidden>
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              )}
              <input
                type="range"
                disabled={!enabled}
                min={lo}
                max={hi}
                step={(hi - lo) / 200 || 0.01}
                value={num}
                onChange={(e) => setKey(f, clamp(parseFloat(e.target.value) || 0))}
              />
              <div className={`field-num-suffix${f.suffix ? ' has-suffix' : ''}`}>
                <input
                  type="number"
                  className="slider-num"
                  disabled={!enabled}
                  value={Number(num.toFixed(3))}
                  onChange={(e) => setKey(f, clamp(parseFloat(e.target.value) || 0))}
                />
                {f.suffix && <span className="field-suffix">{f.suffix}</span>}
              </div>
            </div>
          </div>
        </FieldChrome>
      );
    }

    return (
      <FieldChrome key={f.key} field={f}>
        <div className={`field-row${requiredEmpty ? ' field-required' : ''}`} title={title}>
          <label>{label}</label>
          <div className={`field-num-suffix${f.suffix ? ' has-suffix' : ''}`}>
            <input
              type="number"
              disabled={!enabled}
              step={f.min != null || f.max != null ? 0.1 : 1}
              value={Number(num.toFixed(3))}
              onChange={(e) => setKey(f, clamp(parseFloat(e.target.value) || 0))}
            />
            {f.suffix && <span className="field-suffix">{f.suffix}</span>}
          </div>
        </div>
      </FieldChrome>
    );
  };

  // Grouping
  type Bucket =
    | { kind: 'plain'; fields: FieldMeta[] }
    | { kind: 'box' | 'foldout' | 'horizontal'; name: string; fields: FieldMeta[] };

  const buckets: Bucket[] = [];
  const pushPlain = (f: FieldMeta) => {
    const last = buckets[buckets.length - 1];
    if (last?.kind === 'plain') last.fields.push(f);
    else buckets.push({ kind: 'plain', fields: [f] });
  };

  for (const f of visible) {
    if (f.foldoutGroup) {
      const name = f.foldoutGroup;
      const last = buckets[buckets.length - 1];
      if (last && last.kind === 'foldout' && last.name === name) last.fields.push(f);
      else buckets.push({ kind: 'foldout', name, fields: [f] });
    } else if (f.boxGroup) {
      const name = f.boxGroup;
      const last = buckets[buckets.length - 1];
      if (last && last.kind === 'box' && last.name === name) last.fields.push(f);
      else buckets.push({ kind: 'box', name, fields: [f] });
    } else if (f.horizontalGroup) {
      const name = f.horizontalGroup;
      const last = buckets[buckets.length - 1];
      if (last && last.kind === 'horizontal' && last.name === name) last.fields.push(f);
      else buckets.push({ kind: 'horizontal', name, fields: [f] });
    } else {
      pushPlain(f);
    }
  }

  const buttons = (props.methods ?? []).filter((m) => m.button);
  const buttonGroups = new Map<string, MethodMeta[]>();
  const loneButtons: MethodMeta[] = [];
  for (const m of buttons) {
    if (m.buttonGroup) {
      const list = buttonGroups.get(m.buttonGroup) ?? [];
      list.push(m);
      buttonGroups.set(m.buttonGroup, list);
    } else loneButtons.push(m);
  }

  if (!visible.length && !buttons.length) {
    return <div className="field-hint">No serialized fields</div>;
  }

  return (
    <>
      {buckets.map((b, i) => {
        if (b.kind === 'plain') {
          return <div key={`p-${i}`}>{b.fields.map(renderWidget)}</div>;
        }
        if (b.kind === 'horizontal') {
          return (
            <div key={`h-${b.name}-${i}`} className="schema-horizontal">
              {b.fields.map(renderWidget)}
            </div>
          );
        }
        if (b.kind === 'box') {
          return (
            <div key={`b-${b.name}-${i}`} className="schema-box">
              <div className="schema-box-title">{b.name}</div>
              {b.fields.map(renderWidget)}
            </div>
          );
        }
        // foldout
        const open = foldOpen[b.name] ?? true;
        return (
          <div key={`f-${b.name}-${i}`} className="schema-foldout">
            <button
              type="button"
              className="schema-foldout-toggle"
              onClick={() => setFoldOpen((s) => ({ ...s, [b.name]: !open }))}
            >
              {open ? '▾' : '▸'} {b.name}
            </button>
            {open && b.fields.map(renderWidget)}
          </div>
        );
      })}

      {(loneButtons.length > 0 || buttonGroups.size > 0) && (
        <div className="schema-buttons">
          {loneButtons.map((m) => (
            <button
              key={m.key}
              type="button"
              className="schema-btn"
              onClick={() => props.onInvokeMethod?.(m.key)}
            >
              {m.label ?? m.key}
            </button>
          ))}
          {[...buttonGroups.entries()].map(([g, list]) => (
            <div key={g} className="schema-btn-group">
              {list.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="schema-btn"
                  onClick={() => props.onInvokeMethod?.(m.key)}
                >
                  {m.label ?? m.key}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
