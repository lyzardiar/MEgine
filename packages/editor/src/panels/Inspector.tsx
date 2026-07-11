import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { getBehaviour } from '@mengine/behaviour';
import { getComponentCatalog } from '../componentCatalog';
import { eulerXYZToQuat, quatToEulerXYZ } from '../math3d';
import { SchemaFieldEditor } from './SchemaFieldEditor';
import { RectTransformEditor } from './RectTransformEditor';
import { ButtonEditor, ImageEditor } from './uiFieldEditors';

type Transform = {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

/** Unity-style: drag label horizontally to scrub number. Shift=快, Alt=细 */
function useScrubDrag(
  value: number,
  step: number,
  onChange: (v: number) => void,
) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const drag = useRef<{ pointerId: number; startX: number; startV: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      let sens = step;
      if (e.shiftKey) sens *= 10;
      if (e.altKey) sens *= 0.1;
      // ~1 step per 5px
      const next = d.startV + (dx / 5) * sens;
      const places = Math.min(6, Math.max(0, Math.ceil(-Math.log10(Math.abs(sens) || 1)) + 1));
      onChangeRef.current(parseFloat(next.toFixed(places)));
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      document.body.classList.remove('insp-scrubbing');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [step]);

  return (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startV: valueRef.current,
    };
    document.body.classList.add('insp-scrubbing');
  };
}

function AxisInput(props: {
  label: 'x' | 'y' | 'z';
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const step = props.step ?? 0.1;
  const onScrub = useScrubDrag(props.value, step, props.onChange);
  return (
    <div className="axis">
      <span
        className={`${props.label} scrub-label`}
        title="拖拽调节数值 · Shift 加速 · Alt 精细"
        onPointerDown={onScrub}
      >
        {props.label.toUpperCase()}
      </span>
      <input
        type="number"
        step={step}
        value={Number(props.value.toFixed(3))}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function CompBlock(props: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onRemove?: () => void;
  contextMenuItems?: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="comp">
      <div className="comp-head">
        <button type="button" className="comp-toggle" onClick={() => setOpen(!open)}>
          <span>{open ? '▾' : '▸'}</span>
          <span>{props.title}</span>
        </button>
        <div className="comp-head-actions" ref={menuRef}>
          {!!props.contextMenuItems?.length && (
            <>
              <button
                type="button"
                className="comp-menu-btn"
                title="Context Menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((o) => !o);
                }}
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="comp-context-menu">
                  {props.contextMenuItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="comp-context-item"
                      onClick={() => {
                        item.onClick();
                        setMenuOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {props.onRemove && (
            <button
              type="button"
              className="comp-remove"
              title="Remove Component"
              onClick={(e) => {
                e.stopPropagation();
                props.onRemove?.();
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {open && <div className="comp-body">{props.children}</div>}
    </div>
  );
}

function NumField(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const step = props.step ?? 1;
  const onScrub = useScrubDrag(props.value, step, props.onChange);
  return (
    <div className="field-row">
      <label
        className="scrub-label"
        title="拖拽调节数值 · Shift 加速 · Alt 精细"
        onPointerDown={onScrub}
      >
        {props.label}
      </label>
      <input
        type="number"
        step={step}
        value={Number(props.value.toFixed(3))}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function Camera3DEditor(props: {
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const d = props.data;
  const projection = String(d.projection ?? 'perspective');
  const isOrtho = projection === 'orthographic';
  return (
    <>
      <div className="field-row">
        <label>Projection</label>
        <select
          value={isOrtho ? 'orthographic' : 'perspective'}
          onChange={(e) => props.onChange({ ...d, projection: e.target.value })}
        >
          <option value="perspective">Perspective</option>
          <option value="orthographic">Orthographic</option>
        </select>
      </div>
      {!isOrtho && (
        <NumField
          label="FOV Y"
          value={typeof d.fov_y_degrees === 'number' ? d.fov_y_degrees : 60}
          step={1}
          onChange={(fov_y_degrees) => props.onChange({ ...d, fov_y_degrees })}
        />
      )}
      {isOrtho && (
        <NumField
          label="Ortho Size"
          value={typeof d.orthographic_size === 'number' ? d.orthographic_size : 5}
          step={0.1}
          onChange={(orthographic_size) => props.onChange({ ...d, orthographic_size })}
        />
      )}
      <NumField
        label="Near"
        value={typeof d.near === 'number' ? d.near : 0.3}
        step={0.05}
        onChange={(near) => props.onChange({ ...d, near })}
      />
      <NumField
        label="Far"
        value={typeof d.far === 'number' ? d.far : 50}
        step={1}
        onChange={(far) => props.onChange({ ...d, far })}
      />
      <NumField
        label="Aspect"
        value={typeof d.aspect === 'number' ? d.aspect : 16 / 9}
        step={0.01}
        onChange={(aspect) => props.onChange({ ...d, aspect })}
      />
      <div className="field-row">
        <label>Primary</label>
        <input
          type="checkbox"
          checked={!!d.primary}
          onChange={(e) => props.onChange({ ...d, primary: e.target.checked })}
        />
      </div>
      <div className="field-hint">Scene 视锥按 Near / Far / FOV·Size / Aspect 绘制</div>
    </>
  );
}

function GenericCompEditor(props: {
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(props.data);
  if (!entries.length) {
    return <div className="field-hint">No fields</div>;
  }
  return (
    <>
      {entries.map(([key, val]) => {
        if (typeof val === 'boolean') {
          return (
            <div className="field-row" key={key}>
              <label>{key}</label>
              <input
                type="checkbox"
                checked={val}
                onChange={(e) => props.onChange({ ...props.data, [key]: e.target.checked })}
              />
            </div>
          );
        }
        if (typeof val === 'number') {
          return (
            <NumField
              key={key}
              label={key}
              value={val}
              onChange={(v) => props.onChange({ ...props.data, [key]: v })}
            />
          );
        }
        if (typeof val === 'string') {
          return (
            <div className="field-row" key={key}>
              <label>{key}</label>
              <input
                type="text"
                value={val}
                onChange={(e) => props.onChange({ ...props.data, [key]: e.target.value })}
              />
            </div>
          );
        }
        if (Array.isArray(val) && val.every((x) => typeof x === 'number')) {
          const arr = val as number[];
          if (arr.length === 3) {
            return (
              <div className="axis-row" key={key}>
                <label>{key}</label>
                {(['x', 'y', 'z'] as const).map((ax, i) => (
                  <AxisInput
                    key={ax}
                    label={ax}
                    value={arr[i]}
                    onChange={(v) => {
                      const next = [...arr];
                      next[i] = v;
                      props.onChange({ ...props.data, [key]: next });
                    }}
                  />
                ))}
              </div>
            );
          }
        }
        return (
          <div className="field-row" key={key}>
            <label>{key}</label>
            <code className="field-code">{JSON.stringify(val)}</code>
          </div>
        );
      })}
    </>
  );
}

export function Inspector(props: {
  entity: { entity: number; name?: string | null; components: Record<string, unknown> } | null;
  entities?: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  selectionCount?: number;
  onChangeTransform: (entity: number, t: Transform) => void;
  onAddComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  onRemoveComponent: (entity: number, type: string) => void;
  onSetComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  /** Merge patch into existing component (avoids stale full-replace wiping fields). */
  onPatchComponent?: (entity: number, type: string, patch: Record<string, unknown>) => void;
  onInvokeBehaviourMethod?: (entity: number, type: string, method: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  if (!props.entity) {
    return <div className="empty-state">Select a GameObject to inspect</div>;
  }

  if ((props.selectionCount ?? 1) > 1) {
    return (
      <div className="dock-body">
        <div className="insp-header">
          <div className="insp-name">{props.selectionCount} selected</div>
          <div className="insp-tag">Multi-edit Transform is not available yet</div>
        </div>
      </div>
    );
  }

  const entity = props.entity;
  const hasRect = !!entity.components.RectTransform;
  const hasTransform = !!entity.components.Transform;
  const t = (entity.components.Transform ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }) as Transform;

  const setPos = (i: number, v: number) => {
    const position = [...t.position] as [number, number, number];
    position[i] = v;
    props.onChangeTransform(entity.entity, { ...t, position });
  };
  const setRot = (i: number, v: number) => {
    const euler = quatToEulerXYZ(t.rotation);
    euler[i] = v;
    const rotation = eulerXYZToQuat(euler[0], euler[1], euler[2]);
    props.onChangeTransform(entity.entity, { ...t, rotation });
  };
  const setScale = (i: number, v: number) => {
    const scale = [...t.scale] as [number, number, number];
    scale[i] = v;
    props.onChangeTransform(entity.entity, { ...t, scale });
  };

  const euler = quatToEulerXYZ(t.rotation);

  const extras = Object.keys(entity.components).filter(
    (k) => k !== 'Transform' && k !== 'RectTransform',
  );
  const available = getComponentCatalog().filter((c) => {
    if (entity.components[c.type] != null) {
      const b = getBehaviour(c.type);
      if (b?.disallowMultiple) return false;
      return false;
    }
    return true;
  });

  return (
    <div className="dock-body">
      <div className="insp-header">
        <div className="insp-name">{entity.name ?? `Entity ${entity.entity}`}</div>
        <div className="insp-tag">Tag: Untagged · Layer: Default</div>
      </div>

      {hasRect && (
        <CompBlock title="Rect Transform">
          <RectTransformEditor
            data={entity.components.RectTransform}
            onChange={(next) => props.onSetComponent(entity.entity, 'RectTransform', next)}
          />
        </CompBlock>
      )}

      {hasTransform && (
        <CompBlock title="Transform">
          <div className="axis-row">
            <label>Position</label>
            <AxisInput label="x" value={t.position[0]} onChange={(v) => setPos(0, v)} />
            <AxisInput label="y" value={t.position[1]} onChange={(v) => setPos(1, v)} />
            <AxisInput label="z" value={t.position[2]} onChange={(v) => setPos(2, v)} />
          </div>
          <div className="axis-row">
            <label>Rotation</label>
            <AxisInput label="x" value={euler[0]} step={1} onChange={(v) => setRot(0, v)} />
            <AxisInput label="y" value={euler[1]} step={1} onChange={(v) => setRot(1, v)} />
            <AxisInput label="z" value={euler[2]} step={1} onChange={(v) => setRot(2, v)} />
          </div>
          <div className="axis-row">
            <label>Scale</label>
            <AxisInput label="x" value={t.scale[0]} onChange={(v) => setScale(0, v)} />
            <AxisInput label="y" value={t.scale[1]} onChange={(v) => setScale(1, v)} />
            <AxisInput label="z" value={t.scale[2]} onChange={(v) => setScale(2, v)} />
          </div>
        </CompBlock>
      )}

      {!hasRect && !hasTransform && (
        <div className="empty-state" style={{ padding: 8 }}>
          No Transform / RectTransform
        </div>
      )}

      {extras.map((k) => {
        const data = entity.components[k] as Record<string, unknown>;
        const behaviour = getBehaviour(k);
        const ctxItems =
          behaviour?.methods
            .filter((m) => m.contextMenu)
            .map((m) => ({
              label: m.contextMenu ?? m.label ?? m.key,
              onClick: () => props.onInvokeBehaviourMethod?.(entity.entity, k, m.key),
            })) ?? [];
        return (
          <CompBlock
            key={k}
            title={behaviour?.label ?? k}
            onRemove={() => props.onRemoveComponent(entity.entity, k)}
            contextMenuItems={ctxItems}
          >
            {behaviour ? (
              <SchemaFieldEditor
                fields={behaviour.fields}
                methods={behaviour.methods}
                data={data}
                onChange={(next) => props.onSetComponent(entity.entity, k, next)}
                onInvokeMethod={(method) =>
                  props.onInvokeBehaviourMethod?.(entity.entity, k, method)
                }
              />
            ) : k === 'Camera3D' ? (
              <Camera3DEditor
                data={data}
                onChange={(next) => props.onSetComponent(entity.entity, 'Camera3D', next)}
              />
            ) : k === 'Image' ? (
              <ImageEditor
                data={data}
                rectTransform={entity.components.RectTransform}
                onPatch={(patch) => {
                  if (props.onPatchComponent) {
                    props.onPatchComponent(entity.entity, 'Image', patch);
                  } else {
                    props.onSetComponent(entity.entity, 'Image', { ...data, ...patch });
                  }
                }}
                onPatchRect={(patch) => {
                  const rt = (entity.components.RectTransform as Record<string, unknown>) ?? {};
                  if (props.onPatchComponent) {
                    props.onPatchComponent(entity.entity, 'RectTransform', patch);
                  } else {
                    props.onSetComponent(entity.entity, 'RectTransform', { ...rt, ...patch });
                  }
                }}
              />
            ) : k === 'Button' ? (
              <ButtonEditor
                data={data}
                entities={props.entities ?? [entity]}
                onPatch={(patch) => {
                  if (props.onPatchComponent) {
                    props.onPatchComponent(entity.entity, 'Button', patch);
                  } else {
                    props.onSetComponent(entity.entity, 'Button', { ...data, ...patch });
                  }
                }}
              />
            ) : (
              <GenericCompEditor
                data={data}
                onChange={(next) => props.onSetComponent(entity.entity, k, next)}
              />
            )}
          </CompBlock>
        );
      })}

      <div className="add-comp-wrap" ref={menuRef}>
        <button
          type="button"
          className="add-comp"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Add Component
        </button>
        {menuOpen && (
          <div className="add-comp-menu">
            {available.length === 0 && (
              <div className="add-comp-empty">No more components</div>
            )}
            {available.map((c) => (
              <button
                key={c.type}
                type="button"
                className="add-comp-item"
                onClick={() => {
                  props.onAddComponent(entity.entity, c.type, c.create());
                  setMenuOpen(false);
                }}
              >
                <span className="add-comp-title">{c.label}</span>
                <span className="add-comp-desc">{c.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
