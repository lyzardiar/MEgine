import { useRef, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { readRectTransform, type Vec2 } from '../ui/rectLayout';
import {
  ANCHOR_PRESETS,
  applyAnchorsKeepingRect,
  applyAnchorPreset,
  applyPivotKeepingRect,
  readRectAxis,
  writeRectAxis,
} from '../ui/rectTransformModel';
import type { RectLayoutDrive } from '../ui/rectLayoutDrive';
import { useInspectorGesture } from './inspectorGesture';

type RT = ReturnType<typeof readRectTransform>;

function useScrub(value: number, step: number, onChange: (v: number) => void) {
  const gesture = useInspectorGesture();
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const drag = useRef<{ pointerId: number; startX: number; startV: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      let sens = step;
      if (e.shiftKey) sens *= 10;
      if (e.altKey) sens *= 0.1;
      const next = d.startV + ((e.clientX - d.startX) / 5) * sens;
      onChangeRef.current(parseFloat(next.toFixed(4)));
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.current || e.pointerId !== drag.current.pointerId) return;
      drag.current = null;
      gestureRef.current.end();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (drag.current) {
        drag.current = null;
        gestureRef.current.end();
      }
    };
  }, [step]);

  return (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startV: valueRef.current };
    gestureRef.current.begin();
  };
}

function Axis(props: {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  disabled?: boolean;
  drivenBy?: string;
}) {
  const step = props.step ?? 1;
  const onScrub = useScrub(props.value, step, props.onChange);
  const cls = props.label === 'z' ? 'z' : props.label;
  return (
    <div className="axis">
      <span
        className={`scrub-label ${cls}${props.disabled ? ' disabled' : ''}`}
        data-agent-drag-by="true"
        aria-label={`Adjust ${props.ariaLabel}`}
        title={props.drivenBy ? `Driven by ${props.drivenBy}` : undefined}
        onPointerDown={props.disabled ? undefined : onScrub}
      >
        {props.label.toUpperCase()}
      </span>
      <input
        type="number"
        step={step}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        title={props.drivenBy ? `Driven by ${props.drivenBy}` : undefined}
        value={Number(props.value.toFixed(4))}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function AnchorIcon(props: { min: Vec2; max: Vec2 }) {
  const width = Math.max(0, props.max[0] - props.min[0]);
  const height = Math.max(0, props.max[1] - props.min[1]);
  return (
    <span className="rect-anchor-icon" aria-hidden>
      <span className="rect-anchor-icon-frame" />
      <span
        className="rect-anchor-icon-range"
        style={{
          left: `${props.min[0] * 100}%`,
          top: `${(1 - props.max[1]) * 100}%`,
          width: `${width * 100}%`,
          height: `${height * 100}%`,
        }}
      />
      <span
        className="rect-anchor-icon-point"
        style={{ left: `${props.min[0] * 100}%`, top: `${(1 - props.min[1]) * 100}%` }}
      />
      <span
        className="rect-anchor-icon-point"
        style={{ left: `${props.max[0] * 100}%`, top: `${(1 - props.max[1]) * 100}%` }}
      />
    </span>
  );
}

export function RectTransformEditor(props: {
  data: unknown;
  onChange: (next: RT) => void;
  parentSize?: Vec2;
  driven?: RectLayoutDrive;
}) {
  const rt = readRectTransform(props.data);
  const [presetOpen, setPresetOpen] = useState(false);
  const [rawEdit, setRawEdit] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);
  const set = (partial: Partial<RT>) => props.onChange({ ...rt, ...partial });
  const setV2 = (key: keyof RT, i: number, v: number) => {
    const cur = [...(rt[key] as Vec2)] as Vec2;
    cur[i] = v;
    set({ [key]: cur } as Partial<RT>);
  };
  const horizontal = readRectAxis(rt, 0);
  const vertical = readRectAxis(rt, 1);
  const parentSize = props.parentSize ?? [1920, 1080];

  useEffect(() => {
    if (!presetOpen) return;
    const close = (event: PointerEvent) => {
      if (!presetRef.current?.contains(event.target as Node)) setPresetOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setPresetOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeWithEscape, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeWithEscape, true);
    };
  }, [presetOpen]);

  return (
    <>
      <div className="rect-anchor-section" ref={presetRef}>
        <button
          type="button"
          className={`rect-anchor-current${presetOpen ? ' active' : ''}`}
          title="Anchor Presets"
          aria-label="Anchor Presets"
          aria-haspopup="dialog"
          aria-expanded={presetOpen}
          aria-controls="rect-anchor-presets-dialog"
          onClick={() => setPresetOpen((open) => !open)}
        >
          <AnchorIcon min={rt.anchor_min} max={rt.anchor_max} />
        </button>
        <div className="rect-anchor-summary">
          <strong>Anchor Presets</strong>
          <span>
            {rt.anchor_min.map((value) => value.toFixed(2)).join(', ')} →{' '}
            {rt.anchor_max.map((value) => value.toFixed(2)).join(', ')}
          </span>
        </div>
        {presetOpen && (
          <div
            id="rect-anchor-presets-dialog"
            className="rect-anchor-popup"
            role="dialog"
            aria-label="Anchor Presets"
          >
            <div className="rect-anchor-popup-title">Anchor Presets</div>
            <div className="rect-anchor-popup-hint">
              {rawEdit ? 'Raw Edit · Shift: pivot · Alt: snap' : 'Keeps visual bounds · Shift: pivot · Alt: snap'}
            </div>
            <div className="rect-anchor-preset-grid">
              {ANCHOR_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.key}
                  title={preset.label}
                  aria-label={preset.label}
                  onClick={(event) => {
                    let next = rawEdit
                      ? applyAnchorPreset(rt, preset, {
                          setPivot: event.shiftKey,
                          snap: event.altKey,
                        })
                      : applyAnchorsKeepingRect(
                          rt,
                          preset.anchorMin,
                          preset.anchorMax,
                          parentSize,
                        );
                    if (!rawEdit && event.shiftKey) {
                      next = applyPivotKeepingRect(next, preset.pivot);
                    }
                    if (!rawEdit && event.altKey) {
                      next = applyAnchorPreset(next, preset, {
                        setPivot: event.shiftKey,
                        snap: true,
                      });
                    }
                    props.onChange(next);
                    setPresetOpen(false);
                  }}
                >
                  <AnchorIcon min={preset.anchorMin} max={preset.anchorMax} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <label className="rect-raw-edit">
        <input type="checkbox" checked={rawEdit} onChange={(event) => setRawEdit(event.target.checked)} />
        Raw Edit
      </label>
      {rawEdit && (
        <>
          <div className="axis-row">
            <label>Anch Min</label>
            <Axis label="x" ariaLabel="Anchor Min X" value={rt.anchor_min[0]} step={0.05} onChange={(v) => setV2('anchor_min', 0, v)} />
            <Axis label="y" ariaLabel="Anchor Min Y" value={rt.anchor_min[1]} step={0.05} onChange={(v) => setV2('anchor_min', 1, v)} />
          </div>
          <div className="axis-row">
            <label>Anch Max</label>
            <Axis label="x" ariaLabel="Anchor Max X" value={rt.anchor_max[0]} step={0.05} onChange={(v) => setV2('anchor_max', 0, v)} />
            <Axis label="y" ariaLabel="Anchor Max Y" value={rt.anchor_max[1]} step={0.05} onChange={(v) => setV2('anchor_max', 1, v)} />
          </div>
        </>
      )}
      {(props.driven?.horizontal || props.driven?.vertical) && (
        <div className="rect-driven-notice">
          Layout values are driven by {[...new Set([
            props.driven.horizontal,
            props.driven.vertical,
          ].filter(Boolean))].join(' and ')}.
        </div>
      )}
      <div className="axis-row">
        <label>Pivot</label>
        <Axis label="x" ariaLabel="Pivot X" value={rt.pivot[0]} step={0.05} onChange={(v) => setV2('pivot', 0, v)} />
        <Axis label="y" ariaLabel="Pivot Y" value={rt.pivot[1]} step={0.05} onChange={(v) => setV2('pivot', 1, v)} />
      </div>
      <div className="axis-row">
        <label>Horizontal</label>
        <Axis
          label={horizontal.firstLabel.toLowerCase()}
          ariaLabel={`Horizontal ${horizontal.firstLabel}`}
          value={horizontal.first}
          disabled={!!props.driven?.horizontal}
          drivenBy={props.driven?.horizontal}
          onChange={(value) => props.onChange(writeRectAxis(rt, 0, 0, value))}
        />
        <Axis
          label={horizontal.secondLabel.toLowerCase()}
          ariaLabel={`Horizontal ${horizontal.secondLabel}`}
          value={horizontal.second}
          disabled={!!props.driven?.horizontal}
          drivenBy={props.driven?.horizontal}
          onChange={(value) => props.onChange(writeRectAxis(rt, 0, 1, value))}
        />
      </div>
      <div className="axis-row">
        <label>Vertical</label>
        <Axis
          label={vertical.firstLabel.toLowerCase()}
          ariaLabel={`Vertical ${vertical.firstLabel}`}
          value={vertical.first}
          disabled={!!props.driven?.vertical}
          drivenBy={props.driven?.vertical}
          onChange={(value) => props.onChange(writeRectAxis(rt, 1, 0, value))}
        />
        <Axis
          label={vertical.secondLabel.toLowerCase()}
          ariaLabel={`Vertical ${vertical.secondLabel}`}
          value={vertical.second}
          disabled={!!props.driven?.vertical}
          drivenBy={props.driven?.vertical}
          onChange={(value) => props.onChange(writeRectAxis(rt, 1, 1, value))}
        />
      </div>
      <div className="axis-row">
        <label>Rotation</label>
        <Axis
          label="z"
          ariaLabel="Rotation Z"
          value={rt.local_rotation}
          step={1}
          onChange={(v) => set({ local_rotation: v })}
        />
      </div>
      <div className="axis-row">
        <label>Scale</label>
        <Axis label="x" ariaLabel="Scale X" value={rt.local_scale[0]} onChange={(v) => setV2('local_scale', 0, v)} />
        <Axis label="y" ariaLabel="Scale Y" value={rt.local_scale[1]} onChange={(v) => setV2('local_scale', 1, v)} />
      </div>
    </>
  );
}
