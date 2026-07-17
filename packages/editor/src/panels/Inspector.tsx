import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { getBehaviour } from '@mengine/behaviour';
import { createComponentDefaults, getComponentCatalog } from '../componentCatalog';
import { getBuiltinInspectorField, type InspectorOption } from '../inspectorMetadata';
import { eulerXYZToQuat, quatToEulerXYZ } from '../math3d';
import { loadSpineInspectorOptions } from '../spine/spineCanvasRuntime';
import { SchemaFieldEditor } from './SchemaFieldEditor';
import { RectTransformEditor } from './RectTransformEditor';
import {
  ColorField,
  ImageEditor,
  NamedReferenceField,
  ProjectAssetSlot,
  SpriteSlot,
  StringListField,
  UnityEventField,
} from './uiFieldEditors';

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
  label: 'x' | 'y' | 'z' | 'w';
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
          <span className="comp-foldout">{open ? '▾' : '▸'}</span>
          <span className="comp-icon" aria-hidden>{props.title.slice(0, 1).toUpperCase()}</span>
          <span className="comp-title">{props.title}</span>
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
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const step = props.step ?? 1;
  const clamp = (value: number) => Math.min(
    props.max ?? Number.POSITIVE_INFINITY,
    Math.max(props.min ?? Number.NEGATIVE_INFINITY, value),
  );
  const onScrub = useScrubDrag(props.value, step, (value) => props.onChange(clamp(value)));
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
        min={props.min}
        max={props.max}
        value={Number(props.value.toFixed(3))}
        onChange={(e) => props.onChange(clamp(parseFloat(e.target.value) || 0))}
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

function inspectorLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function JsonValueField(props: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const serialized = JSON.stringify(props.value, null, 2) ?? 'null';
  const [draft, setDraft] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(serialized);
    setInvalid(false);
  }, [serialized]);
  const commit = () => {
    try {
      props.onChange(JSON.parse(draft));
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };
  return (
    <div className="field-row">
      <label>{props.label}</label>
      <textarea
        className={`field-json${invalid ? ' invalid' : ''}`}
        value={draft}
        aria-label={`${props.label} JSON`}
        title={invalid ? 'Invalid JSON' : 'Structured value'}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

function GenericCompEditor(props: {
  componentType?: string;
  data: Record<string, unknown>;
  entities: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  dynamicOptions?: Record<string, InspectorOption[]>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const isColorVector = (key: string, value: number[]) => {
    if (value.length !== 3 && value.length !== 4) return false;
    const normalized = key.toLowerCase();
    return normalized === 'emissive'
      || normalized === 'tint'
      || /(^|_)color($|_)/.test(normalized);
  };
  const defaults = props.componentType
    ? (createComponentDefaults(props.componentType) ?? {})
    : {};
  const viewData = { ...defaults, ...props.data };
  const entries = Object.entries(viewData);
  if (!entries.length) {
    return <div className="field-hint">No fields</div>;
  }
  return (
    <>
      {entries.map(([key, val]) => {
        const meta = getBuiltinInspectorField(props.componentType, key);
        if (meta?.visibleWhen && viewData[meta.visibleWhen.field] !== meta.visibleWhen.equals) {
          return null;
        }
        const label = meta?.label ?? inspectorLabel(key);
        const setValue = (value: unknown) => props.onChange({ ...props.data, [key]: value });

        if (meta?.kind === 'event') {
          return (
            <UnityEventField
              key={key}
              label={`${label} ()`}
              value={val}
              entities={props.entities}
              onChange={setValue}
            />
          );
        }
        if (meta?.kind === 'string-list') {
          return (
            <StringListField
              key={key}
              label={label}
              value={Array.isArray(val) ? val.map(String) : []}
              onChange={setValue}
            />
          );
        }
        if (meta?.kind === 'sprite') {
          return (
            <SpriteSlot
              key={key}
              label={label}
              value={typeof val === 'string' ? val : ''}
              noneValue={meta.noneValue}
              onChange={setValue}
            />
          );
        }
        if (meta?.kind === 'project-asset') {
          return (
            <ProjectAssetSlot
              key={key}
              label={label}
              value={typeof val === 'string' ? val : ''}
              assetKinds={meta.assetKinds ?? []}
              referenceType={meta.referenceType ?? 'Asset'}
              allowNone={meta.allowNone}
              onChange={setValue}
            />
          );
        }
        if (meta?.kind === 'named-reference') {
          return (
            <NamedReferenceField
              key={key}
              label={label}
              value={typeof val === 'string' ? val : ''}
              referenceType={meta.referenceType ?? 'Object'}
              options={meta.options ?? []}
              allowNone={meta.allowNone}
              onChange={setValue}
            />
          );
        }
        if (typeof val === 'boolean') {
          return (
            <div className="field-row" key={key}>
              <label title={key}>{label}</label>
              <input
                type="checkbox"
                checked={val}
                onChange={(e) => setValue(e.target.checked)}
              />
            </div>
          );
        }
        if (typeof val === 'number') {
          return (
            <NumField
              key={key}
              label={label}
              value={val}
              min={meta?.min}
              max={meta?.max}
              step={meta?.step}
              onChange={setValue}
            />
          );
        }
        if (typeof val === 'string') {
          const selectOptions = props.dynamicOptions?.[key] ?? meta?.options;
          return (
            <div className="field-row" key={key}>
              <label title={key}>{label}</label>
              {selectOptions ? (
                <select
                  value={val}
                  onChange={(e) => setValue(e.target.value)}
                >
                  {!selectOptions.some((option) => option.value === val) && (
                    <option value={val}>{val || 'None'}</option>
                  )}
                  {selectOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : meta?.kind === 'multiline' ? (
                <textarea
                  rows={3}
                  value={val}
                  onChange={(e) => setValue(e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  value={val}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </div>
          );
        }
        if (Array.isArray(val) && val.every((x) => typeof x === 'number')) {
          const arr = val as number[];
          if (isColorVector(key, arr)) {
            return (
              <ColorField
                key={key}
                label={label}
                value={arr}
                onChange={setValue}
              />
            );
          }
          if (arr.length >= 2 && arr.length <= 4) {
            const axes = (['x', 'y', 'z', 'w'] as const).slice(0, arr.length);
            return (
              <div className={`axis-row axis-${arr.length}`} key={key}>
                <label title={key}>{label}</label>
                {axes.map((ax, i) => (
                  <AxisInput
                    key={ax}
                    label={ax}
                    value={arr[i]}
                    onChange={(v) => {
                      const next = [...arr];
                      next[i] = v;
                      setValue(next);
                    }}
                  />
                ))}
              </div>
            );
          }
        }
        return (
          <JsonValueField key={key} label={label} value={val} onChange={setValue} />
        );
      })}
    </>
  );
}

function SpineSkeletonEditor(props: {
  data: Record<string, unknown>;
  entities: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const skeleton = String(props.data.skeleton ?? '');
  const atlas = String(props.data.atlas ?? '');
  const premultipliedAlpha = props.data.premultiplied_alpha !== false;
  const [options, setOptions] = useState<Record<string, InspectorOption[]> | undefined>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    if (!skeleton || !atlas) {
      setOptions(undefined);
      setStatus('idle');
      return () => {
        cancelled = true;
      };
    }
    setStatus('loading');
    void loadSpineInspectorOptions({ skeleton, atlas, premultipliedAlpha })
      .then((result) => {
        if (cancelled) return;
        setOptions({
          animation: [
            { value: '', label: 'Default / First Animation' },
            ...result.animations.map((value) => ({ value, label: value })),
          ],
          skin: result.skins.map((value) => ({ value, label: value })),
        });
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setOptions(undefined);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [atlas, premultipliedAlpha, skeleton]);

  return (
    <>
      <GenericCompEditor
        componentType="SpineSkeleton"
        data={props.data}
        entities={props.entities}
        dynamicOptions={options}
        onChange={props.onChange}
      />
      {status === 'loading' && <div className="field-hint">Loading animations and skins…</div>}
      {status === 'error' && (
        <div className="field-hint field-error">Could not read Spine animations or skins.</div>
      )}
    </>
  );
}

export function Inspector(props: {
  entity: {
    entity: number;
    name?: string | null;
    active?: boolean;
    components: Record<string, unknown>;
  } | null;
  entities?: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  selectionCount?: number;
  onChangeTransform: (entity: number, t: Transform) => void;
  onAddComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  onRemoveComponent: (entity: number, type: string) => void;
  onSetComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  /** Merge patch into existing component (avoids stale full-replace wiping fields). */
  onPatchComponent?: (entity: number, type: string, patch: Record<string, unknown>) => void;
  onInvokeBehaviourMethod?: (entity: number, type: string, method: string) => void;
  onRename?: (entity: number, name: string) => void;
  onSetActive?: (entity: number, active: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNameDraft(props.entity?.name ?? (props.entity ? `Entity ${props.entity.entity}` : ''));
  }, [props.entity?.entity, props.entity?.name]);

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
  const commitName = () => {
    const next = nameDraft.trim();
    const current = entity.name ?? `Entity ${entity.entity}`;
    if (!next) {
      setNameDraft(current);
      return;
    }
    if (next !== current) props.onRename?.(entity.entity, next);
  };

  const extras = Object.keys(entity.components).filter(
    (k) => k !== 'Transform' && k !== 'RectTransform',
  );
  const catalog = getComponentCatalog();
  const available = catalog.filter((c) => {
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
        <div className="insp-object-row">
          <input
            className="insp-active"
            type="checkbox"
            checked={entity.active !== false}
            title="Active"
            aria-label="Active"
            onChange={(event) => props.onSetActive?.(entity.entity, event.target.checked)}
          />
          <span className={`insp-object-icon${hasRect ? ' ui' : ''}`} aria-hidden>
            {hasRect ? '▣' : '◇'}
          </span>
          <input
            className="insp-name-input"
            value={nameDraft}
            aria-label="GameObject name"
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setNameDraft(entity.name ?? `Entity ${entity.entity}`);
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <div className="insp-meta-row">
          <label>
            <span>Tag</span>
            <select value="Untagged" disabled aria-label="Tag">
              <option>Untagged</option>
            </select>
          </label>
          <label>
            <span>Layer</span>
            <select value="Default" disabled aria-label="Layer">
              <option>Default</option>
            </select>
          </label>
        </div>
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
            title={behaviour?.label ?? catalog.find((entry) => entry.type === k)?.label ?? k}
            onRemove={() => props.onRemoveComponent(entity.entity, k)}
            contextMenuItems={ctxItems}
          >
            {behaviour ? (
              <SchemaFieldEditor
                fields={behaviour.fields}
                methods={behaviour.methods}
                data={data}
                entities={props.entities ?? [entity]}
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
            ) : k === 'SpineSkeleton' ? (
              <SpineSkeletonEditor
                data={data}
                entities={props.entities ?? [entity]}
                onChange={(next) => props.onSetComponent(entity.entity, k, next)}
              />
            ) : (
              <GenericCompEditor
                componentType={k}
                data={data}
                entities={props.entities ?? [entity]}
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
