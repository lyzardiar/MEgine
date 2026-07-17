/** Unity-like Inspector widgets for Image / Button (uGUI). */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { getBehaviour, listBehaviours } from '@mengine/behaviour';
import {
  listSprites,
  normalizeSpriteRef,
  refreshSprites,
  resolveSpriteId,
  spriteAssetUrl,
  spriteDisplayName,
} from '../spriteLibrary';
import { loadSpriteNativeSize } from '../spriteDraw';
import { pingEntity, pingSprite } from '../pingBus';
import { ObjectPicker } from './ObjectPicker';

export type UnityPersistentCall = {
  target: number | null;
  component: string;
  method: string;
};

const IMAGE_TYPES = [
  { value: 'Simple', label: 'Simple' },
  { value: 'Sliced', label: 'Sliced' },
] as const;

const BUTTON_TRANSITIONS = [
  { value: 'None', label: 'None' },
  { value: 'ColorTint', label: 'Color Tint' },
] as const;

function colorToHex(c: number[]): string {
  const r = Math.round(Math.min(1, Math.max(0, c[0] ?? 0)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, c[1] ?? 0)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, c[2] ?? 0)) * 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function BoolField(props: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="field-row">
      <label>{props.label}</label>
      <input
        type="checkbox"
        className="field-bool"
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </div>
  );
}

export function ColorField(props: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const arr = (
    Array.isArray(props.value) && props.value.length >= 3 ? props.value : [1, 1, 1, 1]
  ) as number[];
  const hasAlpha = arr.length >= 4;
  const a = arr[3] ?? 1;
  return (
    <div className="field-row">
      <label>{props.label}</label>
      <div className="color-field">
        <input
          type="color"
          className="color-swatch"
          value={colorToHex(arr)}
          title={colorToHex(arr)}
          onChange={(e) => {
            const [r, g, b] = hexToRgb(e.target.value);
            props.onChange(hasAlpha ? [r, g, b, a] : [r, g, b]);
          }}
        />
        {hasAlpha && (
          <label className="color-alpha-wrap" title="Alpha">
            <span>A</span>
            <input
              type="number"
              className="color-alpha"
              min={0}
              max={1}
              step={0.01}
              value={Number(a.toFixed(3))}
              onChange={(e) => {
                const next = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
                props.onChange([arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1, next]);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function SpriteSlot(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const normalized = normalizeSpriteRef(props.value);
  const resolved = useMemo(() => {
    void tick;
    return resolveSpriteId(normalized);
  }, [tick, normalized]);

  useEffect(() => {
    void refreshSprites().then(() => setTick((t) => t + 1));
  }, []);

  // 仅在路径可规范成 Assets/... 时写回；用 resolve 避免只存文件名
  useEffect(() => {
    if (!props.value) return;
    const canon = resolveSpriteId(props.value);
    if (canon !== props.value) props.onChange(canon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  const pickerItems = useMemo(() => {
    void tick;
    const disk = listSprites().map((s) => ({
      id: s.id,
      label: s.name,
      sub: s.folder,
      thumbUrl: spriteAssetUrl(s.id),
      icon: '🖼️',
    }));
    return [
      { id: 'white', label: 'white', sub: 'Builtin', icon: '⬜', thumbUrl: null as string | null },
      ...disk,
    ];
  }, [tick]);

  const thumb = spriteAssetUrl(resolved);
  const label = spriteDisplayName(resolved);

  const acceptDrag = (dt: DataTransfer) => {
    const types = Array.from(dt.types as unknown as string[]);
    return (
      types.includes('text/mengine-sprite') ||
      types.includes('text/plain') ||
      types.includes('text/uri-list') ||
      types.includes('Files')
    );
  };

  const onDragOver = (e: DragEvent) => {
    if (!acceptDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (e.currentTarget as HTMLElement).contains(to)) return;
    setDragOver(false);
  };

  const applyRaw = (raw: string) => {
    const id = resolveSpriteId(raw);
    if (id) props.onChange(id);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const custom =
      e.dataTransfer.getData('text/mengine-sprite') ||
      e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain');
    if (custom?.trim()) {
      applyRaw(custom);
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      applyRaw(file.name);
    }
  };

  const openPicker = () => {
    setAnchor(pickerBtnRef.current?.getBoundingClientRect() ?? null);
    setPickerOpen(true);
  };

  const onPing = () => {
    if (!resolved || resolved === 'white') return;
    const hit = listSprites().find((s) => s.id === resolved);
    pingSprite(resolved, hit?.folder);
  };

  return (
    <div className="field-row">
      <label>{props.label}</label>
      <div
        className={[
          'object-slot',
          'sprite-slot',
          dragOver ? 'drag-over' : '',
          resolved && resolved !== 'white' ? 'filled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        title="点击名称 Ping · 右侧按钮选择 · 可拖入 PNG"
      >
        <div className="object-slot-thumb" aria-hidden>
          {thumb ? <img src={thumb} alt="" draggable={false} /> : '▭'}
        </div>
        <button
          type="button"
          className="object-slot-name-btn"
          onClick={onPing}
          title="Ping in Project"
        >
          {label || 'None (Sprite)'}
        </button>
        <button
          ref={pickerBtnRef}
          type="button"
          className="object-slot-picker"
          title="Select Sprite"
          onClick={openPicker}
        />
        {resolved && resolved !== 'white' && (
          <button
            type="button"
            className="object-slot-clear"
            title="Clear"
            onClick={() => props.onChange('white')}
          >
            ×
          </button>
        )}
      </div>
      {pickerOpen && (
        <ObjectPicker
          title="Select Sprite"
          items={pickerItems}
          current={resolved === 'white' ? null : resolved}
          allowNone
          noneLabel="None (white)"
          anchorRect={anchor}
          onPick={(id) => props.onChange(id ?? 'white')}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

export function parseUnityPersistentCall(raw: unknown): UnityPersistentCall {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const target =
      typeof o.target === 'number'
        ? o.target
        : typeof o.target === 'string' && o.target !== ''
          ? Number(o.target)
          : null;
    return {
      target: target != null && !Number.isNaN(target) ? target : null,
      component: String(o.component ?? ''),
      method: String(o.method ?? o.methodName ?? ''),
    };
  }
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s.startsWith('{')) {
      try {
        return parseUnityPersistentCall(JSON.parse(s));
      } catch {
        /* fallthrough */
      }
    }
    if (s.includes('.')) {
      const i = s.lastIndexOf('.');
      return { target: null, component: s.slice(0, i), method: s.slice(i + 1) };
    }
    return { target: null, component: '', method: s };
  }
  return { target: null, component: '', method: '' };
}

export function formatUnityPersistentCall(c: UnityPersistentCall): UnityPersistentCall {
  return {
    target: c.target,
    component: c.component,
    method: c.method,
  };
}

/** Resolve invoke target for Game view Button click. */
export function resolveUnityAction(
  buttonEntity: number,
  raw: unknown,
): { entity: number; component: string; method: string } | null {
  const call = parseUnityPersistentCall(raw);
  if (!call.method) return null;
  const entity = call.target ?? buttonEntity;
  return {
    entity,
    component: call.component,
    method: call.method,
  };
}

type EntRef = {
  entity: number;
  name?: string | null;
  components: Record<string, unknown>;
};

function UnityEventField(props: {
  label: string;
  value: unknown;
  entities: EntRef[];
  onChange: (v: UnityPersistentCall) => void;
}) {
  const call = parseUnityPersistentCall(props.value);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const targetEnt = call.target != null
    ? props.entities.find((e) => e.entity === call.target)
    : null;

  const componentOptions = useMemo(() => {
    if (!targetEnt) return [] as { type: string; label: string; methods: string[] }[];
    const out: { type: string; label: string; methods: string[] }[] = [];
    for (const type of Object.keys(targetEnt.components)) {
      const b = getBehaviour(type);
      if (!b || !b.methods.length) continue;
      out.push({
        type,
        label: b.label || type,
        methods: b.methods.map((m) => m.key),
      });
    }
    if (!out.length) {
      for (const type of Object.keys(targetEnt.components)) {
        if (listBehaviours().some((b) => b.type === type)) {
          out.push({ type, label: type, methods: [] });
        }
      }
    }
    return out;
  }, [targetEnt]);

  const activeComp =
    componentOptions.find((c) => c.type === call.component) ?? componentOptions[0];
  const methods = activeComp?.methods ?? [];

  const patch = (partial: Partial<UnityPersistentCall>) => {
    const next = formatUnityPersistentCall({ ...call, ...partial });
    props.onChange(next);
  };

  const bindEntity = (id: number) => {
    const ent = props.entities.find((x) => x.entity === id);
    if (!ent) return;
    const comps = Object.keys(ent.components)
      .map((type) => {
        const b = getBehaviour(type);
        return b && b.methods.length
          ? { type, methods: b.methods.map((m) => m.key) }
          : null;
      })
      .filter(Boolean) as { type: string; methods: string[] }[];
    const first = comps[0];
    patch({
      target: id,
      component: first?.type ?? '',
      method: first?.methods[0] ?? '',
    });
  };

  const hasEntityDrag = (dt: DataTransfer) => {
    const types = Array.from(dt.types as unknown as string[]);
    return (
      types.includes('text/mengine-entity') ||
      types.includes('text/plain') ||
      types.some((t) => t.toLowerCase().includes('mengine-entity'))
    );
  };

  const onDragOver = (e: DragEvent) => {
    if (!hasEntityDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (e.currentTarget as HTMLElement).contains(to)) return;
    setDragOver(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const id = Number(
      e.dataTransfer.getData('text/mengine-entity') ||
        e.dataTransfer.getData('text/plain'),
    );
    if (!Number.isFinite(id)) return;
    bindEntity(id);
  };

  const targetLabel = targetEnt
    ? (targetEnt.name ?? `Entity ${targetEnt.entity}`)
    : call.target != null
      ? `Missing (${call.target})`
      : 'None (GameObject)';

  const entityItems = useMemo(
    () =>
      props.entities.map((e) => ({
        id: String(e.entity),
        label: e.name ?? `Entity ${e.entity}`,
        sub: `id ${e.entity}`,
        icon: '○',
      })),
    [props.entities],
  );

  return (
    <div className="unity-event">
      <div className="unity-event-head">{props.label}</div>
      <div className="unity-event-list">
        <div className="unity-event-call">
          <div
            className={[
              'object-slot',
              'entity-slot',
              call.target != null ? 'filled' : '',
              dragOver ? 'drag-over' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragEnter={onDragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            title="点击名称 Ping · 右侧按钮选择 · 可拖入 Hierarchy"
          >
            <div className="object-slot-thumb" aria-hidden>
              ○
            </div>
            <button
              type="button"
              className="object-slot-name-btn"
              title="Ping in Hierarchy"
              onClick={() => {
                if (call.target != null) pingEntity(call.target);
              }}
            >
              {targetLabel}
            </button>
            <button
              ref={pickerBtnRef}
              type="button"
              className="object-slot-picker"
              title="Select GameObject"
              onClick={() => {
                setAnchor(pickerBtnRef.current?.getBoundingClientRect() ?? null);
                setPickerOpen(true);
              }}
            />
            {call.target != null && (
              <button
                type="button"
                className="object-slot-clear"
                title="Clear"
                onClick={() => patch({ target: null, component: '', method: '' })}
              >
                ×
              </button>
            )}
          </div>

          {pickerOpen && (
            <ObjectPicker
              title="Select GameObject"
              items={entityItems}
              current={call.target != null ? String(call.target) : null}
              allowNone
              noneLabel="None (GameObject)"
              anchorRect={anchor}
              onPick={(id) => {
                if (id == null) {
                  patch({ target: null, component: '', method: '' });
                  return;
                }
                bindEntity(Number(id));
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}

          {call.target != null && (
            <>
              <div className="field-row">
                <label>Component</label>
                <select
                  value={activeComp?.type ?? ''}
                  disabled={!componentOptions.length}
                  onChange={(e) => {
                    const comp = componentOptions.find((c) => c.type === e.target.value);
                    patch({
                      component: e.target.value,
                      method: comp?.methods[0] ?? '',
                    });
                  }}
                >
                  {!componentOptions.length && <option value="">(no Behaviour)</option>}
                  {componentOptions.map((c) => (
                    <option key={c.type} value={c.type}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label>Method</label>
                <select
                  value={methods.includes(call.method) ? call.method : methods[0] ?? ''}
                  disabled={!methods.length}
                  onChange={(e) => patch({ method: e.target.value })}
                >
                  {!methods.length && <option value="">(no methods)</option>}
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {call.target == null && (
            <div className="field-hint">拖入 Hierarchy 物体，或点 ○ 选择</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ImageEditor(props: {
  data: Record<string, unknown>;
  rectTransform?: unknown;
  /** Merge into Image — must use store.patchComponent (latest data). */
  onPatch: (patch: Record<string, unknown>) => void;
  onPatchRect?: (patch: Record<string, unknown>) => void;
}) {
  const d = props.data;
  const [nativeBusy, setNativeBusy] = useState(false);

  const setNativeSize = () => {
    if (!props.onPatchRect) return;
    const sprite = String(d.sprite ?? 'white');
    setNativeBusy(true);
    void loadSpriteNativeSize(sprite)
      .then((size) => {
        if (!size) return;
        props.onPatchRect?.({ size_delta: [size.w, size.h] });
      })
      .finally(() => setNativeBusy(false));
  };

  return (
    <>
      <SpriteSlot
        label="Sprite"
        value={String(d.sprite ?? 'white')}
        onChange={(sprite) => props.onPatch({ sprite: resolveSpriteId(sprite) })}
      />
      <ColorField
        label="Color"
        value={(d.color as number[]) ?? [1, 1, 1, 1]}
        onChange={(color) => props.onPatch({ color })}
      />
      <div className="field-row">
        <label>Image Type</label>
        <select
          value={String(d.image_type ?? d.imageType ?? 'Simple')}
          onChange={(e) => props.onPatch({ image_type: e.target.value })}
        >
          {IMAGE_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <BoolField
        label="Raycast Target"
        value={d.raycast_target !== false && d.raycastTarget !== false}
        onChange={(raycast_target) => props.onPatch({ raycast_target })}
      />
      <div className="schema-buttons">
        <button
          type="button"
          className="schema-btn"
          disabled={nativeBusy || !props.onPatchRect}
          title="将 RectTransform Size 设为精灵像素尺寸"
          onClick={setNativeSize}
        >
          {nativeBusy ? 'Loading…' : 'Set Native Size'}
        </button>
      </div>
    </>
  );
}

export function ButtonEditor(props: {
  data: Record<string, unknown>;
  entities: EntRef[];
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const d = props.data;

  return (
    <>
      <BoolField
        label="Interactable"
        value={d.interactable !== false}
        onChange={(interactable) => props.onPatch({ interactable })}
      />
      <div className="field-row">
        <label>Transition</label>
        <select
          value={String(d.transition ?? 'ColorTint')}
          onChange={(e) => props.onPatch({ transition: e.target.value })}
        >
          {BUTTON_TRANSITIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <UnityEventField
        label="On Click ()"
        value={d.on_click ?? d.onClick}
        entities={props.entities}
        onChange={(on_click) => props.onPatch({ on_click })}
      />
    </>
  );
}
