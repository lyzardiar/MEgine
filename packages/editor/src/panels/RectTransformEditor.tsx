import { useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { readRectTransform, type Vec2 } from '../ui/rectLayout';

type RT = ReturnType<typeof readRectTransform>;

function useScrub(value: number, step: number, onChange: (v: number) => void) {
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
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [step]);

  return (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startV: valueRef.current };
  };
}

function Axis(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const step = props.step ?? 1;
  const onScrub = useScrub(props.value, step, props.onChange);
  const cls = props.label === 'z' ? 'z' : props.label;
  return (
    <div className="axis">
      <span className={`scrub-label ${cls}`} onPointerDown={onScrub}>
        {props.label.toUpperCase()}
      </span>
      <input
        type="number"
        step={step}
        value={Number(props.value.toFixed(4))}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

export function RectTransformEditor(props: {
  data: unknown;
  onChange: (next: RT) => void;
}) {
  const rt = readRectTransform(props.data);
  const set = (partial: Partial<RT>) => props.onChange({ ...rt, ...partial });
  const setV2 = (key: keyof RT, i: number, v: number) => {
    const cur = [...(rt[key] as Vec2)] as Vec2;
    cur[i] = v;
    set({ [key]: cur } as Partial<RT>);
  };

  return (
    <>
      <div className="axis-row">
        <label>Anch Min</label>
        <Axis label="x" value={rt.anchor_min[0]} step={0.05} onChange={(v) => setV2('anchor_min', 0, v)} />
        <Axis label="y" value={rt.anchor_min[1]} step={0.05} onChange={(v) => setV2('anchor_min', 1, v)} />
      </div>
      <div className="axis-row">
        <label>Anch Max</label>
        <Axis label="x" value={rt.anchor_max[0]} step={0.05} onChange={(v) => setV2('anchor_max', 0, v)} />
        <Axis label="y" value={rt.anchor_max[1]} step={0.05} onChange={(v) => setV2('anchor_max', 1, v)} />
      </div>
      <div className="axis-row">
        <label>Pivot</label>
        <Axis label="x" value={rt.pivot[0]} step={0.05} onChange={(v) => setV2('pivot', 0, v)} />
        <Axis label="y" value={rt.pivot[1]} step={0.05} onChange={(v) => setV2('pivot', 1, v)} />
      </div>
      <div className="axis-row">
        <label>Pos</label>
        <Axis label="x" value={rt.anchored_position[0]} onChange={(v) => setV2('anchored_position', 0, v)} />
        <Axis label="y" value={rt.anchored_position[1]} onChange={(v) => setV2('anchored_position', 1, v)} />
      </div>
      <div className="axis-row">
        <label>Rotation</label>
        <Axis
          label="z"
          value={rt.local_rotation}
          step={1}
          onChange={(v) => set({ local_rotation: v })}
        />
      </div>
      <div className="axis-row">
        <label>Size</label>
        <Axis label="x" value={rt.size_delta[0]} onChange={(v) => setV2('size_delta', 0, v)} />
        <Axis label="y" value={rt.size_delta[1]} onChange={(v) => setV2('size_delta', 1, v)} />
      </div>
      <div className="axis-row">
        <label>Scale</label>
        <Axis label="x" value={rt.local_scale[0]} onChange={(v) => setV2('local_scale', 0, v)} />
        <Axis label="y" value={rt.local_scale[1]} onChange={(v) => setV2('local_scale', 1, v)} />
      </div>
    </>
  );
}
