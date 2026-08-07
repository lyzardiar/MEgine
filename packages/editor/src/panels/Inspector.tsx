import {
  createContext,
  useEffect,
  useId,
  useLayoutEffect,
  useContext,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  FoldVertical,
  Lock,
  LockOpen,
  MoreVertical,
  PanelTop,
  Search,
  UnfoldVertical,
  X,
} from 'lucide-react';
import { getBehaviour } from '@mengine/behaviour';
import { PROJECT_ASSETS_CHANGED_EVENT } from '../assetEditorEvents';
import { createComponentDefaults, getComponentCatalog } from '../componentCatalog';
import { componentCatalogMatches, inspectorSectionMatches } from '../inspectorSearch';
import {
  copyComponentValue,
  pasteComponentValue,
  type ComponentClipboard,
} from '../componentClipboard';
import {
  getBuiltinInspectorField,
  isInspectorFieldVisible,
  type InspectorOption,
} from '../inspectorMetadata';
import {
  normalizeCameraBackgroundColor,
  normalizeCameraClearFlags,
} from '../gameCamera';
import { eulerXYZToQuat, quatToEulerXYZ } from '../math3d';
import type { MaterialAsset } from '../materialAsset';
import { loadResolvedMaterialAsset } from '../materialInstanceAsset';
import {
  inspectMultiComponentFields,
  planMultiComponentEdit,
} from '../multiComponentEditing';
import {
  focusMenuBoundary,
  moveMenuItemFocus,
} from '../menuKeyboardNavigation';
import {
  isMaterialPropertyBlockTextureAsset,
  materialPropertyBlockBindingDiagnostics,
  materialPropertyParameterMap,
  materialPropertyTextureMap,
} from '../materialPropertyBlock';
import { readProjectAssetText } from '../projectAssets';
import { readRectTransform } from '../ui/rectLayout';
import { rectLayoutDrive } from '../ui/rectLayoutDrive';
import { loadSpineRuntime } from '../spine/spineRuntimeLoader';
import { getSortingLayerOptions } from '../sortingLayers';
import { loadSpriteNativeSize } from '../spriteDraw';
import { resolveSpritePivot, resolveSpritePixelsPerUnit } from '../spriteLibrary';
import { spriteNativeWorldSize } from '../spriteImport';
import {
  normalizeSurfaceShaderParameterValue,
  parseSurfaceShaderParameters,
  parseSurfaceShaderTextures,
  surfaceShaderParameterComponents,
  type SurfaceShaderParameter,
  type SurfaceShaderTexture,
} from '../surfaceShader';
import { SchemaFieldEditor } from './SchemaFieldEditor';
import { RectTransformEditor } from './RectTransformEditor';
import {
  InspectorEditScope,
  InspectorGestureProvider,
  useInspectorGesture,
} from './inspectorGesture';
import {
  ColorField,
  ImageEditor,
  NamedReferenceField,
  ProjectAssetSlot,
  SpriteListField,
  SpriteSlot,
  StringListField,
  UnityEventField,
  Vector2ListField,
} from './uiFieldEditors';

type Transform = {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

type UiInspectorGroup = 'Layout' | 'Appearance' | 'Interaction' | 'Advanced';

const UI_LAYOUT_COMPONENTS = new Set([
  'LayoutGroup', 'LayoutElement', 'ContentSizeFitter', 'AspectRatioFitter',
]);
const UI_APPEARANCE_COMPONENTS = new Set([
  'Image', 'RawImage', 'Text', 'Panel', 'Shadow', 'Outline', 'Mask', 'RectMask2D',
]);
const UI_INTERACTION_COMPONENTS = new Set([
  'Button', 'Toggle', 'Slider', 'Scrollbar', 'ProgressBar', 'InputField', 'Dropdown',
  'ListView', 'ScrollView', 'TabView', 'Selectable', 'GraphicRaycaster', 'CanvasGroup',
]);
const UI_GROUP_ORDER: UiInspectorGroup[] = ['Layout', 'Appearance', 'Interaction', 'Advanced'];

function uiInspectorGroup(component: string): UiInspectorGroup {
  if (UI_LAYOUT_COMPONENTS.has(component)) return 'Layout';
  if (UI_APPEARANCE_COMPONENTS.has(component)) return 'Appearance';
  if (UI_INTERACTION_COMPONENTS.has(component)) return 'Interaction';
  return 'Advanced';
}

const MIXED_SELECT_VALUE = '__mengine_mixed_value__';

/** Unity-style: drag label horizontally to scrub number. Shift=快, Alt=细 */
function useScrubDrag(
  value: number,
  step: number,
  onChange: (v: number) => void,
) {
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
        document.body.classList.remove('insp-scrubbing');
        gestureRef.current.end();
      }
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
    gestureRef.current.begin();
    document.body.classList.add('insp-scrubbing');
  };
}

function AxisInput(props: {
  label: 'x' | 'y' | 'z' | 'w' | 'h';
  ariaLabel?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  mixed?: boolean;
}) {
  const step = props.step ?? 0.1;
  const onScrub = useScrubDrag(props.value, step, props.onChange);
  return (
    <div className="axis">
      <span
        className={`${props.label} scrub-label`}
        data-agent-drag-by="true"
        aria-label={`Adjust ${props.ariaLabel ?? props.label.toUpperCase()}`}
        title="拖拽调节数值 · Shift 加速 · Alt 精细"
        onPointerDown={onScrub}
      >
        {props.label.toUpperCase()}
      </span>
      <input
        type="number"
        step={step}
        aria-label={props.ariaLabel ?? props.label.toUpperCase()}
        value={props.mixed ? '' : Number(props.value.toFixed(3))}
        placeholder={props.mixed ? 'Mixed' : undefined}
        title={props.mixed ? 'Mixed values' : undefined}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function axisSemanticLabel(scope: string, field: string, axis: string): string {
  return `${scope} ${field} ${axis.toUpperCase()}`;
}

type InspectorExpansionCommand = { revision: number; open: boolean };

const InspectorPanelContext = createContext<{
  query: string;
  expansion: InspectorExpansionCommand;
}>({ query: '', expansion: { revision: 0, open: true } });

function InspectorToolbar(props: {
  query: string;
  locked: boolean;
  onQuery: (query: string) => void;
  onExpand: (open: boolean) => void;
  onToggleLock: () => void;
}) {
  return (
    <div className="insp-toolbar">
      <label className="insp-search">
        <Search size={13} aria-hidden />
        <input
          type="search"
          aria-label="Search Inspector properties"
          placeholder="Filter components and properties…"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
        />
        {props.query && (
          <button type="button" title="Clear filter" aria-label="Clear Inspector filter" onClick={() => props.onQuery('')}>
            <X size={12} />
          </button>
        )}
      </label>
      <button type="button" title="Collapse All" aria-label="Collapse all Inspector components" onClick={() => props.onExpand(false)}>
        <FoldVertical size={14} />
      </button>
      <button type="button" title="Expand All" aria-label="Expand all Inspector components" onClick={() => props.onExpand(true)}>
        <UnfoldVertical size={14} />
      </button>
      <button
        type="button"
        className={props.locked ? 'active' : ''}
        title={props.locked ? 'Unlock Inspector' : 'Lock Inspector'}
        aria-label={props.locked ? 'Unlock Inspector' : 'Lock Inspector'}
        aria-pressed={props.locked}
        onClick={props.onToggleLock}
      >
        {props.locked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
    </div>
  );
}

function CompBlock(props: {
  title: string;
  searchText?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onRemove?: () => void;
  contextMenuItems?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    separatorBefore?: boolean;
  }>;
}) {
  const panel = useContext(InspectorPanelContext);
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuId = useId();
  const menuItems = [
    ...(props.contextMenuItems ?? []),
    ...(props.onRemove ? [{
      label: 'Remove Component',
      onClick: props.onRemove,
      separatorBefore: true,
    }] : []),
  ];

  useEffect(() => {
    if (panel.expansion.revision > 0) setOpen(panel.expansion.open);
  }, [panel.expansion]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)
        || menuButtonRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      setMenuPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setMenuPosition(null);
      menuButtonRef.current?.focus({ preventScroll: true });
    };
    const closeOnViewportChange = () => {
      setMenuOpen(false);
      setMenuPosition(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const anchor = menuButtonRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!anchor || !menu) return;
    const padding = 4;
    const left = Math.max(
      padding,
      Math.min(anchor.right - menu.width, window.innerWidth - menu.width - padding),
    );
    const below = anchor.bottom;
    const top = below + menu.height <= window.innerHeight - padding
      ? below
      : Math.max(padding, anchor.top - menu.height);
    setMenuPosition({ left, top });
  }, [menuOpen]);

  if (!inspectorSectionMatches(panel.query, props.title, props.searchText)) return null;
  const expanded = panel.query.trim() ? true : open;

  return (
    <div className="comp" data-agent-scope={props.title}>
      <div className="comp-head">
        <button
          type="button"
          className="comp-toggle"
          aria-expanded={expanded}
          onClick={() => setOpen(!open)}
        >
          <span className="comp-foldout" aria-hidden>{expanded ? '▾' : '▸'}</span>
          <span className="comp-icon" aria-hidden>{props.title.slice(0, 1).toUpperCase()}</span>
          <span className="comp-title">{props.title}</span>
        </button>
        <div className="comp-head-actions">
          {menuItems.length > 0 && (
            <>
              <button
                ref={menuButtonRef}
                type="button"
                className="comp-menu-btn"
                title="Context Menu"
                aria-label={`${props.title} Context Menu`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={contextMenuId}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuPosition(null);
                  setMenuOpen((o) => !o);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen(true);
                  window.requestAnimationFrame(() => {
                    focusMenuBoundary(
                      document.getElementById(contextMenuId),
                      event.key === 'ArrowDown' ? 'first' : 'last',
                    );
                  });
                }}
              >
                <MoreVertical size={14} />
              </button>
              {menuOpen && createPortal(
                <div
                  ref={menuRef}
                  id={contextMenuId}
                  className="comp-context-menu"
                  style={menuPosition ?? { left: 0, top: 0, visibility: 'hidden' }}
                  role="menu"
                  aria-label={`${props.title} component context menu`}
                  onKeyDown={(event) => {
                    if (moveMenuItemFocus(event.currentTarget, event.target, event.key)) {
                      event.preventDefault();
                      event.stopPropagation();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenuOpen(false);
                      setMenuPosition(null);
                      menuButtonRef.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  {menuItems.map((item, index) => (
                    <div key={`${item.label}-${index}`}>
                      {item.separatorBefore && <div className="comp-context-sep" role="separator" />}
                      <button
                        type="button"
                        role="menuitem"
                        className="comp-context-item"
                        disabled={item.disabled}
                        onClick={() => {
                          item.onClick();
                          setMenuOpen(false);
                          setMenuPosition(null);
                        }}
                      >
                        {item.label}
                      </button>
                    </div>
                  ))}
                </div>,
                document.body,
              )}
            </>
          )}
        </div>
      </div>
      {expanded && <div className="comp-body">{props.children}</div>}
    </div>
  );
}

type ComponentMenuItem = NonNullable<Parameters<typeof CompBlock>[0]['contextMenuItems']>[number];

function componentEditMenu(
  type: string,
  value: Record<string, unknown>,
  clipboard: ComponentClipboard | null,
  onCopy: (next: ComponentClipboard) => void,
  onReplace: (next: Record<string, unknown>) => void,
  canReset = true,
): ComponentMenuItem[] {
  const defaults = canReset ? createComponentDefaults(type) : null;
  return [
    {
      label: 'Reset',
      disabled: defaults == null,
      onClick: () => {
        if (defaults) onReplace(structuredClone(defaults));
      },
    },
    {
      label: 'Copy Component',
      onClick: () => onCopy(copyComponentValue(type, value)),
    },
    {
      label: 'Paste Component Values',
      disabled: clipboard?.type !== type,
      onClick: () => {
        const pasted = pasteComponentValue(clipboard, type);
        if (pasted) onReplace(pasted);
      },
    },
  ];
}

function NumField(props: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  mixed?: boolean;
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
        data-agent-drag-by="true"
        aria-label={`Adjust ${props.label}`}
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
        aria-label={props.label}
        value={props.mixed ? '' : Number(props.value.toFixed(3))}
        placeholder={props.mixed ? 'Mixed' : undefined}
        title={props.mixed ? 'Mixed values' : undefined}
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
  const clearFlags = normalizeCameraClearFlags(d.clear_flags);
  const backgroundColor = normalizeCameraBackgroundColor(d.background_color);
  return (
    <>
      <div className="field-row">
        <label>Projection</label>
        <select
          aria-label="Projection"
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
        <label>Clear Flags</label>
        <select
          aria-label="Clear Flags"
          value={clearFlags}
          onChange={(e) => props.onChange({ ...d, clear_flags: e.target.value })}
        >
          <option value="scene">Scene</option>
          <option value="skybox">Skybox</option>
          <option value="solid_color">Solid Color</option>
        </select>
      </div>
      {clearFlags === 'solid_color' && (
        <ColorField
          label="Background"
          value={backgroundColor}
          onChange={(background_color) => props.onChange({ ...d, background_color })}
        />
      )}
      <div className="field-row">
        <label>Primary</label>
        <input
          type="checkbox"
          aria-label="Camera 3D Primary"
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

function MaterialPropertyBlockEditor(props: {
  data: Record<string, unknown>;
  materialPath: string;
  entities: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [parameters, setParameters] = useState<SurfaceShaderParameter[]>([]);
  const [textures, setTextures] = useState<SurfaceShaderTexture[]>([]);
  const [material, setMaterial] = useState<MaterialAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [assetRevision, setAssetRevision] = useState(0);

  useEffect(() => {
    const changed = () => setAssetRevision((value) => value + 1);
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, changed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const path = props.materialPath.trim();
    setParameters([]);
    setTextures([]);
    setMaterial(null);
    if (!/\.(?:mmat|mat|minst)$/i.test(path)) {
      setLoading(false);
      setError('Assign a custom Material asset to expose Surface Shader overrides.');
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    void loadResolvedMaterialAsset(path)
      .then(async (resolved) => {
        if (resolved.shader !== 'custom' || !resolved.custom_shader) {
          throw new Error('The assigned material does not use a custom Surface Shader.');
        }
        const source = await readProjectAssetText(resolved.custom_shader);
        if (cancelled) return;
        setMaterial(resolved);
        setParameters(parseSurfaceShaderParameters(source));
        setTextures(parseSurfaceShaderTextures(source));
        setLoading(false);
      })
      .catch((reason) => {
        if (!cancelled) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => { cancelled = true; };
  }, [assetRevision, props.materialPath]);

  const parameterOverrides = materialPropertyParameterMap(props.data);
  const textureOverrides = materialPropertyTextureMap(props.data);
  const parameterNames = new Set(parameters.map((parameter) => parameter.name));
  const textureNames = new Set(textures.map((texture) => texture.name));
  const bindingDiagnostics = loading || error ? [] : materialPropertyBlockBindingDiagnostics(
    props.data, parameters, textures,
  );

  const writeParameters = (next: Map<string, [number, number, number, number]>) => props.onChange({
    ...props.data,
    custom_parameter_names: [...next.keys()],
    custom_parameter_values: [...next.values()],
  });
  const writeTextures = (next: Map<string, string>) => props.onChange({
    ...props.data,
    custom_texture_names: [...next.keys()],
    custom_texture_values: [...next.values()],
  });
  const setParameter = (
    parameter: SurfaceShaderParameter,
    value: [number, number, number, number] | null,
  ) => {
    const next = new Map(parameterOverrides);
    if (value == null) next.delete(parameter.name);
    else next.set(parameter.name, normalizeSurfaceShaderParameterValue(parameter, value));
    writeParameters(next);
  };
  const setTexture = (texture: SurfaceShaderTexture, value: string | null) => {
    const next = new Map(textureOverrides);
    if (value == null) next.delete(texture.name);
    else next.set(texture.name, value.trim().replaceAll('\\', '/'));
    writeTextures(next);
  };

  return (
    <>
      <GenericCompEditor
        componentType="MaterialPropertyBlock"
        data={props.data}
        entities={props.entities}
        onChange={props.onChange}
      />
      <div className="mpb-custom-section">
        <div className="mpb-custom-head">
          <strong>Surface Shader Overrides</strong>
          {bindingDiagnostics.length > 0 && (
            <button type="button" onClick={() => {
              const nextParameters = new Map([...parameterOverrides]
                .filter(([name]) => parameterNames.has(name)));
              const nextTextures = new Map([...textureOverrides]
                .filter(([name]) => textureNames.has(name)));
              props.onChange({
                ...props.data,
                custom_parameter_names: [...nextParameters.keys()],
                custom_parameter_values: [...nextParameters.values()],
                custom_texture_names: [...nextTextures.keys()],
                custom_texture_values: [...nextTextures.values()],
              });
            }}>Remove Stale Values</button>
          )}
        </div>
        {loading && <div className="field-hint">Loading Surface Shader bindings...</div>}
        {error && <div className="field-hint material-parameter-error">{error}</div>}
        {!error && bindingDiagnostics.length > 0 && (
          <div className="field-hint material-parameter-error">
            {bindingDiagnostics.map((diagnostic) => diagnostic.message).join(' ')}
          </div>
        )}
        {!error && parameters.length === 0 && textures.length === 0 && (
          <div className="field-hint">The Surface Shader declares no per-renderer values.</div>
        )}
        {parameters.map((parameter) => {
          const overridden = parameterOverrides.has(parameter.name);
          const inherited = normalizeSurfaceShaderParameterValue(
            parameter,
            material?.custom_parameters[parameter.name],
          );
          const value = normalizeSurfaceShaderParameterValue(
            parameter,
            parameterOverrides.get(parameter.name) ?? inherited,
          );
          const components = surfaceShaderParameterComponents(parameter.type);
          return (
            <div className={`mpb-custom-binding${overridden ? '' : ' inherited'}`} key={parameter.name}>
              <label className="mpb-override-toggle">
                <input
                  type="checkbox"
                  checked={overridden}
                  onChange={(event) => setParameter(parameter, event.target.checked ? inherited : null)}
                />
                <span>{parameter.label}<small>{overridden ? 'Override' : 'Material'}</small></span>
              </label>
              {overridden ? parameter.type === 'color' ? (
                <ColorField label="Value" value={value} onChange={(next) => setParameter(parameter, next as [number, number, number, number])} />
              ) : components === 1 ? (
                <NumField
                  label="Value"
                  value={value[0]}
                  min={parameter.min ?? undefined}
                  max={parameter.max ?? undefined}
                  step={0.01}
                  onChange={(next) => setParameter(parameter, [next, value[1], value[2], value[3]])}
                />
              ) : (
                <div className={`axis-row axis-${components}`}>
                  <label>Value</label>
                  {(['x', 'y', 'z', 'w'] as const).slice(0, components).map((axis, index) => (
                    <AxisInput
                      key={axis}
                      label={axis}
                      ariaLabel={axisSemanticLabel('Surface Shader', parameter.label, axis)}
                      value={value[index]}
                      step={0.01}
                      onChange={(nextValue) => {
                        const next = [...value] as [number, number, number, number];
                        next[index] = nextValue;
                        setParameter(parameter, next);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="field-row"><label>Value</label><span>{value.slice(0, components).join(', ')}</span></div>
              )}
            </div>
          );
        })}
        {textures.map((texture) => {
          const overridden = textureOverrides.has(texture.name);
          const inherited = material?.custom_textures[texture.name] ?? texture.default;
          const value = textureOverrides.get(texture.name) ?? inherited;
          return (
            <div className={`mpb-custom-binding${overridden ? '' : ' inherited'}`} key={texture.name}>
              <label className="mpb-override-toggle">
                <input
                  type="checkbox"
                  checked={overridden}
                  onChange={(event) => setTexture(texture, event.target.checked ? inherited : null)}
                />
                <span>{texture.label}<small>{overridden ? 'Override' : 'Material'} · {texture.type === 'color' ? 'sRGB' : 'Linear'}</small></span>
              </label>
              <ProjectAssetSlot
                label="Texture"
                value={value}
                assetKinds={['texture']}
                referenceType="Surface Shader Texture"
                allowNone
                noneValue=""
                accept={isMaterialPropertyBlockTextureAsset}
                onChange={(next) => setTexture(texture, next)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

function GenericCompEditor(props: {
  componentType?: string;
  data: Record<string, unknown>;
  entities: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  contextComponents?: Record<string, unknown>;
  dynamicOptions?: Record<string, InspectorOption[]>;
  layerOptions?: Array<{ value: number; label: string }>;
  mixedFields?: ReadonlySet<string>;
  mixedArrayIndices?: Readonly<Record<string, readonly boolean[]>>;
  onChange: (
    next: Record<string, unknown>,
    editedPath?: readonly (string | number)[],
  ) => void;
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
        if (!isInspectorFieldVisible(meta, viewData, props.contextComponents)) return null;
        const label = meta?.label ?? inspectorLabel(key);
        const semanticLabel = props.componentType
          ? `${getComponentCatalog().find((entry) => entry.type === props.componentType)?.label
            ?? getBehaviour(props.componentType)?.label
            ?? props.componentType} ${label}`
          : label;
        const setValue = (
          value: unknown,
          nestedPath: readonly (string | number)[] = [],
        ) => props.onChange({ ...props.data, [key]: value }, [key, ...nestedPath]);
        const mixed = props.mixedFields?.has(key) ?? false;

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
        if (meta?.kind === 'sprite-list') {
          return (
            <SpriteListField
              key={key}
              label={label}
              value={Array.isArray(val) ? val.map(String) : []}
              onChange={setValue}
            />
          );
        }
        if (meta?.kind === 'vector2-list') {
          const points = Array.isArray(val)
            ? val.filter((point): point is [number, number] =>
                Array.isArray(point) && point.length >= 2,
              )
            : [];
          return (
            <Vector2ListField
              key={key}
              label={label}
              value={points}
              onChange={setValue}
            />
          );
        }
        if (meta?.kind === 'sprite' || meta?.kind === 'texture') {
          return (
            <SpriteSlot
              key={key}
              label={label}
              value={typeof val === 'string' ? val : ''}
              noneValue={meta.noneValue}
              baseTextureOnly={meta.kind === 'texture'}
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
              noneValue={meta.noneValue}
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
              options={props.dynamicOptions?.[key] ?? meta.options ?? []}
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
                checked={!mixed && val}
                ref={(element) => {
                  if (element) element.indeterminate = mixed;
                }}
                aria-label={semanticLabel}
                aria-checked={mixed ? 'mixed' : val}
                title={mixed ? 'Mixed values' : undefined}
                onChange={(e) => setValue(e.target.checked)}
              />
            </div>
          );
        }
        if (typeof val === 'number') {
          if (meta?.kind === 'flags') {
            return (
              <BitFlagsField
                key={key}
                label={label}
                value={mixed ? 0 : val}
                mixed={mixed}
                options={meta.bitOptions ?? []}
                onChange={setValue}
              />
            );
          }
          if (meta?.kind === 'layer-mask') {
            return (
              <LayerMaskField
                key={key}
                label={label}
                value={mixed ? 0 : val}
                mixed={mixed}
                options={props.layerOptions ?? [{ value: 0, label: 'Default (0)' }]}
                onChange={setValue}
              />
            );
          }
          if (meta?.kind === 'display') {
            const display = Math.max(0, Math.min(7, Math.trunc(val)));
            return (
              <div className="field-row" key={key}>
                <label title={key}>{label}</label>
                <select
                  value={mixed ? MIXED_SELECT_VALUE : String(display)}
                  aria-label={label}
                  onChange={(event) => setValue(Number(event.target.value))}
                >
                  {mixed && <option value={MIXED_SELECT_VALUE} disabled>Mixed</option>}
                  {Array.from({ length: 8 }, (_unused, index) => (
                    <option key={index} value={index}>Display {index + 1}</option>
                  ))}
                </select>
              </div>
            );
          }
          return (
            <NumField
              key={key}
              label={label}
              value={val}
              min={meta?.min}
              max={meta?.max}
              step={meta?.step}
              mixed={mixed}
              onChange={setValue}
            />
          );
        }
        if (typeof val === 'string') {
          const selectOptions = props.dynamicOptions?.[key]
            ?? (key === 'sorting_layer' ? getSortingLayerOptions() : meta?.options);
          return (
            <div className="field-row" key={key}>
              <label title={key}>{label}</label>
              {selectOptions ? (
                <select
                  value={mixed ? MIXED_SELECT_VALUE : val}
                  aria-label={label}
                  onChange={(e) => setValue(e.target.value)}
                >
                  {mixed && <option value={MIXED_SELECT_VALUE} disabled>Mixed</option>}
                  {!selectOptions.some((option) => option.value === val) && (
                    <option value={val}>
                      {key === 'sorting_layer' && val
                        ? `${val} (Missing - uses Default)`
                        : val || 'None'}
                    </option>
                  )}
                  {selectOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : meta?.kind === 'multiline' ? (
                <textarea
                  rows={3}
                  value={mixed ? '' : val}
                  placeholder={mixed ? 'Mixed values' : undefined}
                  aria-label={label}
                  onChange={(e) => setValue(e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  value={mixed ? '' : val}
                  placeholder={mixed ? 'Mixed values' : undefined}
                  aria-label={label}
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
                    ariaLabel={`${label} ${ax.toUpperCase()}`}
                    value={arr[i]}
                    mixed={props.mixedArrayIndices?.[key]?.[i] ?? mixed}
                    onChange={(v) => {
                      const next = [...arr];
                      next[i] = v;
                      setValue(next, [i]);
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

function BitFlagsField(props: {
  label: string;
  value: number;
  mixed: boolean;
  options: Array<{ value: number; label: string }>;
  onChange: (value: number) => void;
}) {
  const validMask = props.options.reduce((mask, option) => mask | option.value, 0);
  const mask = Math.trunc(props.value) & validMask;
  const selected = props.options.filter((option) => (mask & option.value) !== 0);
  const summary = props.mixed
    ? 'Mixed values'
    : selected.length === 0
      ? 'None'
      : selected.map((option) => option.label).join(', ');
  return (
    <div className="field-row layer-mask-field bit-flags-field">
      <label>{props.label}</label>
      <details>
        <summary aria-label={props.label}>{summary}</summary>
        <div className="layer-mask-menu">
          <div>
            <button type="button" onClick={() => props.onChange(0)}>None</button>
            <button type="button" onClick={() => props.onChange(validMask)}>Everything</button>
          </div>
          {props.options.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={(mask & option.value) !== 0}
                aria-label={`${props.label} ${option.label}`}
                onChange={() => props.onChange(mask ^ option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function LayerMaskField(props: {
  label: string;
  value: number;
  mixed: boolean;
  options: Array<{ value: number; label: string }>;
  onChange: (value: number) => void;
}) {
  const mask = Math.trunc(props.value) | 0;
  const valid = props.options.filter((option) => option.value >= 0 && option.value < 32);
  const selected = valid.filter((option) => (mask & (1 << option.value)) !== 0);
  const summary = props.mixed
    ? 'Mixed values'
    : mask === -1
      ? 'Everything'
      : mask === 0
        ? 'Nothing'
        : selected.length <= 2
          ? selected.map((option) => option.label).join(', ')
          : `${selected.length} Layers`;
  return (
    <div className="field-row layer-mask-field">
      <label>{props.label}</label>
      <details>
        <summary aria-label={props.label}>{summary}</summary>
        <div className="layer-mask-menu">
          <div>
            <button type="button" onClick={() => props.onChange(0)}>Nothing</button>
            <button type="button" onClick={() => props.onChange(-1)}>Everything</button>
          </div>
          {valid.map((option) => {
            const bit = 1 << option.value;
            return (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={(mask & bit) !== 0}
                  aria-label={`${props.label} ${option.label}`}
                  onChange={() => props.onChange((mask ^ bit) | 0)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function WorldSpriteEditor(props: {
  componentType: 'SpriteRenderer' | 'AnimatedSprite2D';
  data: Record<string, unknown>;
  entities: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [sizing, setSizing] = useState(false);
  const [nativeError, setNativeError] = useState(false);
  const spriteFor = (data: Record<string, unknown>): string => {
    if (props.componentType === 'SpriteRenderer') return String(data.sprite ?? 'white');
    const frames = Array.isArray(data.frames) ? data.frames.map(String) : [];
    if (!frames.length) return 'white';
    const frame = Math.max(0, Math.min(frames.length - 1, Math.trunc(Number(data.frame) || 0)));
    return frames[frame] || 'white';
  };
  const applyChange = (next: Record<string, unknown>) => {
    const previousSprite = spriteFor(props.data);
    const nextSprite = spriteFor(next);
    props.onChange(nextSprite !== previousSprite
      ? { ...next, pivot: resolveSpritePivot(nextSprite) }
      : next);
  };
  const setNativeSize = async () => {
    const sprite = spriteFor(props.data);
    setSizing(true);
    setNativeError(false);
    try {
      const pixels = await loadSpriteNativeSize(sprite);
      if (!pixels) {
        setNativeError(true);
        return;
      }
      const ppu = resolveSpritePixelsPerUnit(sprite);
      props.onChange({
        ...props.data,
        size: spriteNativeWorldSize([pixels.w, pixels.h], ppu),
        pivot: resolveSpritePivot(sprite),
      });
    } catch {
      setNativeError(true);
    } finally {
      setSizing(false);
    }
  };
  const ppu = resolveSpritePixelsPerUnit(spriteFor(props.data));
  return (
    <>
      <GenericCompEditor
        componentType={props.componentType}
        data={props.data}
        entities={props.entities}
        onChange={applyChange}
      />
      <div className="sprite-native-size-row">
        <span className={nativeError ? 'error' : ''}>
          {nativeError ? 'Sprite could not be read' : `Asset PPU: ${Number(ppu.toFixed(3))}`}
        </span>
        <button type="button" disabled={sizing} onClick={() => void setNativeSize()}>
          {sizing ? 'Reading...' : 'Set Native Size'}
        </button>
      </div>
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
    void loadSpineRuntime()
      .then(({ loadSpineInspectorOptions }) => loadSpineInspectorOptions({
        skeleton,
        atlas,
        premultipliedAlpha,
      }))
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

function CanvasEditor(props: {
  data: Record<string, unknown>;
  entities: Array<{ entity: number; name?: string | null; components: Record<string, unknown> }>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const cameras = props.entities
    .filter((entity) => entity.components.Camera2D != null || entity.components.Camera3D != null)
    .map((entity) => ({
      value: String(entity.entity),
      label: entity.name?.trim() || `Camera ${entity.entity}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return (
    <GenericCompEditor
      componentType="Canvas"
      data={props.data}
      entities={props.entities}
      dynamicOptions={{ render_camera: cameras }}
      onChange={props.onChange}
    />
  );
}

function valuesAreMixed(values: number[]): boolean {
  return values.some((value) => Math.abs(value - values[0]) > 1e-6);
}

function MultiSelectionInspector(props: {
  count: number;
  entities: Array<{
    entity: number;
    active?: boolean;
    tag?: string;
    layer?: number;
    components: Record<string, unknown>;
  }>;
  primary: {
    entity: number;
    active?: boolean;
    tag?: string;
    layer?: number;
    components: Record<string, unknown>;
  };
  componentClipboard: ComponentClipboard | null;
  onCopyComponent: (next: ComponentClipboard) => void;
  tagOptions: Array<{ value: string; label: string }>;
  layerOptions: Array<{ value: number; label: string }>;
  onSetActives?: (ids: number[], active: boolean) => void;
  onSetTags?: (ids: number[], tag: string) => void;
  onSetLayers?: (ids: number[], layer: number) => void;
  onAddComponents?: (
    ids: number[],
    type: string,
    value: Record<string, unknown>,
  ) => void;
  onRemoveComponents?: (ids: number[], type: string) => void;
  onChangeTransforms?: (updates: Array<{ entity: number; transform: Transform }>) => void;
  onSetComponents?: (
    type: string,
    updates: Array<{ entity: number; value: Record<string, unknown> }>,
  ) => void;
  onPatchComponents?: (
    type: string,
    updates: Array<{ entity: number; patch: Record<string, unknown> }>,
  ) => void;
  onBeginEditGesture?: () => void;
  onEndEditGesture?: () => void;
}) {
  const [componentMenuOpen, setComponentMenuOpen] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const componentMenuRef = useRef<HTMLDivElement>(null);
  const transformEntities = props.entities.filter((entity) => entity.components.Transform != null);
  const rectEntities = props.entities.filter((entity) => entity.components.RectTransform != null);
  const allTransforms = transformEntities.length === props.entities.length;
  const allRects = rectEntities.length === props.entities.length;
  const primaryTransform = props.primary.components.Transform as Transform | undefined;
  const primaryRect = props.primary.components.RectTransform
    ? readRectTransform(props.primary.components.RectTransform)
    : null;
  const entityIds = props.entities.map((entity) => entity.entity);
  const selectedActives = props.entities.map((entity) => entity.active !== false);
  const selectedTags = props.entities.map((entity) => entity.tag?.trim() || 'Untagged');
  const selectedLayers = props.entities.map((entity) => (
    Number.isInteger(entity.layer) ? Number(entity.layer) : 0
  ));
  const activeMixed = selectedActives.some((value) => value !== selectedActives[0]);
  const tagMixed = selectedTags.some((value) => value !== selectedTags[0]);
  const layerMixed = selectedLayers.some((value) => value !== selectedLayers[0]);
  const tagOptions = [
    ...selectedTags
      .filter((value, index) => (
        selectedTags.indexOf(value) === index
        && !props.tagOptions.some((option) => option.value === value)
      ))
      .map((value) => ({ value, label: `${value} (Unconfigured)` })),
    ...props.tagOptions,
  ];
  const layerOptions = [
    ...selectedLayers
      .filter((value, index) => (
        selectedLayers.indexOf(value) === index
        && !props.layerOptions.some((option) => option.value === value)
      ))
      .map((value) => ({ value, label: `Layer ${value} (Unconfigured)` })),
    ...props.layerOptions,
  ];
  const catalog = getComponentCatalog();
  const availableComponents = catalog.filter((component) => (
    props.entities.every((entity) => entity.components[component.type] == null)
  ));
  const filteredAvailableComponents = availableComponents.filter((component) => (
    componentCatalogMatches(componentSearch, component)
  ));
  const sharedComponents = Object.keys(props.primary.components)
    .filter((type) => (
      type !== 'Transform'
      && type !== 'RectTransform'
      && !type.startsWith('__')
      && props.entities.every((entity) => entity.components[type] != null)
    ));

  useEffect(() => {
    if (!componentMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!componentMenuRef.current?.contains(event.target as Node)) {
        setComponentMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [componentMenuOpen]);

  const replaceTransforms = (value: Record<string, unknown>) => {
    props.onChangeTransforms?.(transformEntities.map((entity) => ({
      entity: entity.entity,
      transform: structuredClone(value) as Transform,
    })));
  };
  const replaceRects = (value: Record<string, unknown>) => {
    props.onSetComponents?.('RectTransform', rectEntities.map((entity) => ({
      entity: entity.entity,
      value: structuredClone(value),
    })));
  };
  const replaceSharedComponent = (type: string, value: Record<string, unknown>) => {
    props.onSetComponents?.(type, props.entities.map((entity) => ({
      entity: entity.entity,
      value: structuredClone(value),
    })));
  };

  const setTransformAxis = (field: 'position' | 'rotation' | 'scale', axis: number, value: number) => {
    props.onChangeTransforms?.(transformEntities.map((entity) => {
      const current = entity.components.Transform as Transform;
      if (field === 'rotation') {
        const euler = quatToEulerXYZ(current.rotation);
        euler[axis] = value;
        return {
          entity: entity.entity,
          transform: {
            ...current,
            rotation: eulerXYZToQuat(euler[0], euler[1], euler[2]),
          },
        };
      }
      const vector = [...current[field]] as [number, number, number];
      vector[axis] = value;
      return { entity: entity.entity, transform: { ...current, [field]: vector } };
    }));
  };

  const rectValues = rectEntities.map((entity) => readRectTransform(entity.components.RectTransform));
  const setRectAxis = (
    field: 'anchored_position' | 'size_delta' | 'local_scale',
    axis: 0 | 1,
    value: number,
  ) => {
    props.onSetComponents?.('RectTransform', rectEntities.map((entity, index) => {
      const current = rectValues[index];
      const vector = [...current[field]] as [number, number];
      vector[axis] = value;
      return { entity: entity.entity, value: { ...current, [field]: vector } };
    }));
  };
  const setRectRotation = (value: number) => {
    props.onSetComponents?.('RectTransform', rectEntities.map((entity, index) => ({
      entity: entity.entity,
      value: { ...rectValues[index], local_rotation: value },
    })));
  };

  return (
    <InspectorGestureProvider
      begin={props.onBeginEditGesture ?? (() => {})}
      end={props.onEndEditGesture ?? (() => {})}
    >
      <InspectorEditScope>
        <div className="insp-header">
          <div className="insp-object-row">
            <input
              className="insp-active"
              type="checkbox"
              checked={!activeMixed && selectedActives[0]}
              ref={(element) => {
                if (element) element.indeterminate = activeMixed;
              }}
              title={activeMixed ? 'Active (mixed)' : 'Active'}
              aria-label="Active"
              aria-checked={activeMixed ? 'mixed' : selectedActives[0]}
              onChange={(event) => props.onSetActives?.(entityIds, event.target.checked)}
            />
            <div className="insp-name">{props.count} selected</div>
          </div>
          <div className="insp-tag">Editing shared values</div>
          <div className="insp-meta-row">
            <label>
              <span>Tag</span>
              <select
                aria-label="Tag"
                value={tagMixed ? '' : selectedTags[0]}
                onChange={(event) => {
                  if (event.target.value) props.onSetTags?.(entityIds, event.target.value);
                }}
              >
                {tagMixed && <option value="" disabled>— Mixed —</option>}
                {tagOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Layer</span>
              <select
                aria-label="Layer"
                value={layerMixed ? '' : selectedLayers[0]}
                onChange={(event) => {
                  if (event.target.value !== '') {
                    props.onSetLayers?.(entityIds, Number(event.target.value));
                  }
                }}
              >
                {layerMixed && <option value="" disabled>— Mixed —</option>}
                {layerOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {allRects && primaryRect && (
          <CompBlock
            title="Rect Transform (Multi)"
            searchText="anchor pivot position size width height rotation scale left right top bottom"
            contextMenuItems={componentEditMenu(
              'RectTransform',
              primaryRect,
              props.componentClipboard,
              props.onCopyComponent,
              replaceRects,
              !rectEntities.some((entity) => entity.components.Canvas != null),
            )}
          >
            <div className="axis-row">
              <label>Position</label>
              {([0, 1] as const).map((axis) => (
                <AxisInput
                  key={axis}
                  label={axis === 0 ? 'x' : 'y'}
                  ariaLabel={axisSemanticLabel('Rect Transform', 'Position', axis === 0 ? 'x' : 'y')}
                  value={primaryRect.anchored_position[axis]}
                  mixed={valuesAreMixed(rectValues.map((value) => value.anchored_position[axis]))}
                  onChange={(value) => setRectAxis('anchored_position', axis, value)}
                />
              ))}
            </div>
            <div className="axis-row">
              <label>Size</label>
              {([0, 1] as const).map((axis) => (
                <AxisInput
                  key={axis}
                  label={axis === 0 ? 'w' : 'h'}
                  ariaLabel={axisSemanticLabel('Rect Transform', 'Size', axis === 0 ? 'w' : 'h')}
                  value={primaryRect.size_delta[axis]}
                  mixed={valuesAreMixed(rectValues.map((value) => value.size_delta[axis]))}
                  onChange={(value) => setRectAxis('size_delta', axis, value)}
                />
              ))}
            </div>
            <div className="axis-row">
              <label>Rotation</label>
              <AxisInput
                label="z"
                ariaLabel={axisSemanticLabel('Rect Transform', 'Rotation', 'z')}
                value={primaryRect.local_rotation}
                mixed={valuesAreMixed(rectValues.map((value) => value.local_rotation))}
                step={1}
                onChange={setRectRotation}
              />
            </div>
            <div className="axis-row">
              <label>Scale</label>
              {([0, 1] as const).map((axis) => (
                <AxisInput
                  key={axis}
                  label={axis === 0 ? 'x' : 'y'}
                  ariaLabel={axisSemanticLabel('Rect Transform', 'Scale', axis === 0 ? 'x' : 'y')}
                  value={primaryRect.local_scale[axis]}
                  mixed={valuesAreMixed(rectValues.map((value) => value.local_scale[axis]))}
                  onChange={(value) => setRectAxis('local_scale', axis, value)}
                />
              ))}
            </div>
          </CompBlock>
        )}
        {allTransforms && primaryTransform && (
          <CompBlock
            title="Transform (Multi)"
            searchText="position rotation scale x y z"
            contextMenuItems={componentEditMenu(
              'Transform',
              primaryTransform as unknown as Record<string, unknown>,
              props.componentClipboard,
              props.onCopyComponent,
              replaceTransforms,
            )}
          >
            {(['position', 'rotation', 'scale'] as const).map((field) => {
              const primaryValues = field === 'rotation'
                ? quatToEulerXYZ(primaryTransform.rotation)
                : primaryTransform[field];
              const allValues = transformEntities.map((entity) => {
                const transform = entity.components.Transform as Transform;
                return field === 'rotation' ? quatToEulerXYZ(transform.rotation) : transform[field];
              });
              return (
                <div className="axis-row" key={field}>
                  <label>{field[0].toUpperCase() + field.slice(1)}</label>
                  {([0, 1, 2] as const).map((axis) => (
                    <AxisInput
                      key={axis}
                      label={(['x', 'y', 'z'] as const)[axis]}
                      ariaLabel={axisSemanticLabel(
                        'Transform',
                        field[0].toUpperCase() + field.slice(1),
                        (['x', 'y', 'z'] as const)[axis],
                      )}
                      value={primaryValues[axis]}
                      mixed={valuesAreMixed(allValues.map((values) => values[axis]))}
                      step={field === 'rotation' ? 1 : 0.1}
                      onChange={(value) => setTransformAxis(field, axis, value)}
                    />
                  ))}
                </div>
              );
            })}
          </CompBlock>
        )}
        {!allRects && !allTransforms && (
          <div className="empty-state">Selection has no shared Transform type</div>
        )}
        {sharedComponents.map((type) => {
          const value = props.primary.components[type] as Record<string, unknown>;
          const label = catalog.find((entry) => entry.type === type)?.label
            ?? getBehaviour(type)?.label
            ?? type;
          const fieldState = inspectMultiComponentFields(props.entities, type);
          return (
            <CompBlock
              key={type}
              title={`${label} (Multi)`}
              searchText={`${type} ${Object.keys(value).join(' ')}`}
              onRemove={() => props.onRemoveComponents?.(entityIds, type)}
              contextMenuItems={componentEditMenu(
                type,
                value,
                props.componentClipboard,
                props.onCopyComponent,
                (next) => replaceSharedComponent(type, next),
              )}
            >
              {fieldState.mixedFields.size > 0 && (
                <div className="field-hint">
                  Mixed: {[...fieldState.mixedFields].map(inspectorLabel).join(', ')}.
                  Editing changes only that field on all {props.count} GameObjects.
                </div>
              )}
              <GenericCompEditor
                componentType={type}
                data={value}
                entities={props.entities}
                contextComponents={props.primary.components}
                layerOptions={props.layerOptions}
                mixedFields={fieldState.mixedFields}
                mixedArrayIndices={fieldState.mixedArrayIndices}
                onChange={(next, editedPath) => {
                  const updates = planMultiComponentEdit(
                    props.entities,
                    type,
                    value,
                    next,
                    editedPath,
                  );
                  if (updates.length) props.onPatchComponents?.(type, updates);
                }}
              />
            </CompBlock>
          );
        })}
        <div className="add-comp-wrap" ref={componentMenuRef}>
          <button
            type="button"
            className="add-comp"
            aria-label="Add Component to selection"
            onClick={() => {
              setComponentSearch('');
              setComponentMenuOpen((open) => !open);
            }}
          >
            Add Component
          </button>
          {componentMenuOpen && (
            <div className="add-comp-menu">
              <div className="add-comp-search">
                <Search size={13} aria-hidden />
                <input
                  autoFocus
                  type="search"
                  aria-label="Search shared components"
                  placeholder="Search components…"
                  value={componentSearch}
                  onChange={(event) => setComponentSearch(event.target.value)}
                />
              </div>
              {filteredAvailableComponents.length === 0 && (
                <div className="add-comp-empty">No shared component can be added</div>
              )}
              {filteredAvailableComponents.map((component) => (
                <button
                  key={component.type}
                  type="button"
                  className="add-comp-item"
                  onClick={() => {
                    props.onAddComponents?.(
                      entityIds,
                      component.type,
                      component.create(),
                    );
                    setComponentMenuOpen(false);
                  }}
                >
                  <span className="add-comp-title">{component.label}</span>
                  <span className="add-comp-desc">{component.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </InspectorEditScope>
    </InspectorGestureProvider>
  );
}

export function Inspector(props: {
  entity: {
    entity: number;
    parent?: number | null;
    name?: string | null;
    active?: boolean;
    tag?: string;
    layer?: number;
    components: Record<string, unknown>;
  } | null;
  entities?: Array<{
    entity: number;
    parent?: number | null;
    name?: string | null;
    active?: boolean;
    tag?: string;
    layer?: number;
    components: Record<string, unknown>;
  }>;
  selectedIds?: number[];
  selectionCount?: number;
  previewNotice?: string;
  canvasSize?: { width: number; height: number };
  onChangeTransform: (entity: number, t: Transform) => void;
  onChangeTransforms?: (updates: Array<{ entity: number; transform: Transform }>) => void;
  onAddComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  onRemoveComponent: (entity: number, type: string) => void;
  onSetComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  onSetComponents?: (
    type: string,
    updates: Array<{ entity: number; value: Record<string, unknown> }>,
  ) => void;
  onPatchComponents?: (
    type: string,
    updates: Array<{ entity: number; patch: Record<string, unknown> }>,
  ) => void;
  /** Merge patch into existing component (avoids stale full-replace wiping fields). */
  onPatchComponent?: (entity: number, type: string, patch: Record<string, unknown>) => void;
  onInvokeBehaviourMethod?: (entity: number, type: string, method: string) => void;
  onRename?: (entity: number, name: string) => void;
  onSetActive?: (entity: number, active: boolean) => void;
  tagOptions?: Array<{ value: string; label: string }>;
  layerOptions?: Array<{ value: number; label: string }>;
  onSetTag?: (entity: number, tag: string) => void;
  onSetLayer?: (entity: number, layer: number) => void;
  onSetActives?: (ids: number[], active: boolean) => void;
  onSetTags?: (ids: number[], tag: string) => void;
  onSetLayers?: (ids: number[], layer: number) => void;
  onAddComponents?: (
    ids: number[],
    type: string,
    value: Record<string, unknown>,
  ) => void;
  onRemoveComponents?: (ids: number[], type: string) => void;
  onBeginEditGesture?: () => void;
  onEndEditGesture?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [inspectorQuery, setInspectorQuery] = useState('');
  const [expansion, setExpansion] = useState<InspectorExpansionCommand>({ revision: 0, open: true });
  const [nameDraft, setNameDraft] = useState('');
  const [componentClipboard, setComponentClipboard] = useState<ComponentClipboard | null>(null);
  const [lockedSelection, setLockedSelection] = useState<{
    ids: number[];
    primary: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const entitiesById = new Map([
    ...(props.entities ?? []),
    ...(props.entity ? [props.entity] : []),
  ].map((entity) => [entity.entity, entity]));
  const lockedEntities = lockedSelection
    ? lockedSelection.ids
      .map((id) => entitiesById.get(id))
      .filter((entity): entity is NonNullable<typeof entity> => entity != null)
    : [];
  const inspectedEntity = lockedSelection
    ? entitiesById.get(lockedSelection.primary) ?? lockedEntities[0] ?? null
    : props.entity;
  const inspectedIds = lockedSelection
    ? lockedEntities.map((entity) => entity.entity)
    : props.selectedIds ?? (props.entity ? [props.entity.entity] : []);
  const inspectedSelectionCount = lockedSelection
    ? lockedEntities.length
    : props.selectionCount ?? inspectedIds.length;
  const toggleInspectorLock = () => {
    if (lockedSelection) {
      setLockedSelection(null);
      return;
    }
    if (!props.entity) return;
    setLockedSelection({
      ids: inspectedIds.length > 0 ? [...inspectedIds] : [props.entity.entity],
      primary: props.entity.entity,
    });
  };

  useEffect(() => {
    setNameDraft(inspectedEntity?.name ?? (inspectedEntity ? `Entity ${inspectedEntity.entity}` : ''));
  }, [inspectedEntity?.entity, inspectedEntity?.name]);

  useEffect(() => {
    if (lockedSelection && lockedEntities.length === 0) setLockedSelection(null);
  }, [lockedEntities.length, lockedSelection]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  if (!inspectedEntity) {
    return <div className="empty-state">Select a GameObject to inspect</div>;
  }

  if (inspectedSelectionCount > 1) {
    const selectedEntities = inspectedIds
      .map((id) => entitiesById.get(id))
      .filter((entity): entity is NonNullable<typeof entity> => entity != null);
    return (
      <InspectorPanelContext.Provider value={{ query: inspectorQuery, expansion }}>
        <InspectorToolbar
          query={inspectorQuery}
          locked={lockedSelection != null}
          onQuery={setInspectorQuery}
          onExpand={(open) => setExpansion((current) => ({ revision: current.revision + 1, open }))}
          onToggleLock={toggleInspectorLock}
        />
        {props.previewNotice && <div className="inspector-preview-notice">{props.previewNotice}</div>}
        <MultiSelectionInspector
          count={selectedEntities.length}
          entities={selectedEntities}
          primary={inspectedEntity}
          componentClipboard={componentClipboard}
          onCopyComponent={setComponentClipboard}
          tagOptions={props.tagOptions ?? [{ value: 'Untagged', label: 'Untagged' }]}
          layerOptions={props.layerOptions ?? [{ value: 0, label: 'Default (0)' }]}
          onSetActives={props.onSetActives}
          onSetTags={props.onSetTags}
          onSetLayers={props.onSetLayers}
          onAddComponents={props.onAddComponents}
          onRemoveComponents={props.onRemoveComponents}
          onChangeTransforms={props.onChangeTransforms}
          onSetComponents={props.onSetComponents}
          onPatchComponents={props.onPatchComponents}
          onBeginEditGesture={props.onBeginEditGesture}
          onEndEditGesture={props.onEndEditGesture}
        />
      </InspectorPanelContext.Provider>
    );
  }

  const entity = inspectedEntity;
  const tag = entity.tag?.trim() || 'Untagged';
  const layer = Number.isInteger(entity.layer) ? Number(entity.layer) : 0;
  const configuredTags = props.tagOptions ?? [{ value: 'Untagged', label: 'Untagged' }];
  const configuredLayers = props.layerOptions ?? [{ value: 0, label: 'Default (0)' }];
  const tagOptions = configuredTags.some((option) => option.value === tag)
    ? configuredTags
    : [{ value: tag, label: `${tag} (Unconfigured)` }, ...configuredTags];
  const layerOptions = configuredLayers.some((option) => option.value === layer)
    ? configuredLayers
    : [{ value: layer, label: `Layer ${layer} (Unconfigured)` }, ...configuredLayers];
  const hasRect = !!entity.components.RectTransform;
  const hasTransform = !!entity.components.Transform;
  const t = (entity.components.Transform ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }) as Transform;
  const rectParent = entity.parent == null
    ? null
    : props.entities?.find((candidate) => candidate.entity === entity.parent) ?? null;
  const parentRect = readRectTransform(rectParent?.components.RectTransform);
  const rectParentSize: [number, number] = rectParent?.components.Canvas
    ? [props.canvasSize?.width ?? 1920, props.canvasSize?.height ?? 1080]
    : [
        Math.max(1, Math.abs(parentRect.size_delta[0])),
        Math.max(1, Math.abs(parentRect.size_delta[1])),
      ];
  const drivenRect = rectLayoutDrive(entity, rectParent);

  const replaceComponent = (type: string, value: Record<string, unknown>) => {
    if (type === 'Transform') {
      props.onChangeTransform(entity.entity, value as Transform);
      return;
    }
    props.onSetComponent(entity.entity, type, value);
  };
  const standardComponentMenu = (
    type: string,
    value: Record<string, unknown>,
    canReset = true,
  ) => componentEditMenu(
    type,
    value,
    componentClipboard,
    setComponentClipboard,
    (next) => replaceComponent(type, next),
    canReset,
  );

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
    (k) => k !== 'Transform' && k !== 'RectTransform' && !k.startsWith('__'),
  );
  const orderedExtras = hasRect
    ? [...extras].sort((left, right) => (
        UI_GROUP_ORDER.indexOf(uiInspectorGroup(left))
        - UI_GROUP_ORDER.indexOf(uiInspectorGroup(right))
      ))
    : extras;
  const catalog = getComponentCatalog();
  const available = catalog.filter((c) => {
    if (entity.components[c.type] != null) {
      const b = getBehaviour(c.type);
      if (b?.disallowMultiple) return false;
      return false;
    }
    return true;
  });
  const filteredAvailable = available.filter((component) => (
    componentCatalogMatches(componentSearch, component)
  ));

  return (
    <InspectorPanelContext.Provider value={{ query: inspectorQuery, expansion }}>
    <InspectorToolbar
      query={inspectorQuery}
      locked={lockedSelection != null}
      onQuery={setInspectorQuery}
      onExpand={(open) => setExpansion((current) => ({ revision: current.revision + 1, open }))}
      onToggleLock={toggleInspectorLock}
    />
    <InspectorGestureProvider
      begin={props.onBeginEditGesture ?? (() => {})}
      end={props.onEndEditGesture ?? (() => {})}
    >
    <InspectorEditScope>
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
            {hasRect ? <PanelTop size={15} /> : <Box size={15} />}
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
            <select
              value={tag}
              aria-label="Tag"
              onChange={(event) => props.onSetTag?.(entity.entity, event.target.value)}
            >
              {tagOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Layer</span>
            <select
              value={layer}
              aria-label="Layer"
              onChange={(event) => props.onSetLayer?.(entity.entity, Number(event.target.value))}
            >
              {layerOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {props.previewNotice && <div className="inspector-preview-notice">{props.previewNotice}</div>}

      {hasRect && inspectorSectionMatches(
        inspectorQuery,
        'Rect Transform',
        'anchor pivot position size width height rotation scale left right top bottom driven',
      ) && (
        <div className="insp-ui-group">
          <div className="insp-ui-group-title">Layout</div>
        <CompBlock
          title="Rect Transform"
          searchText="anchor pivot position size width height rotation scale left right top bottom driven"
          contextMenuItems={standardComponentMenu(
            'RectTransform',
            entity.components.RectTransform as Record<string, unknown>,
            entity.components.Canvas == null,
          )}
        >
          <RectTransformEditor
            data={entity.components.RectTransform}
            parentSize={rectParentSize}
            driven={drivenRect}
            onChange={(next) => props.onSetComponent(entity.entity, 'RectTransform', next)}
          />
        </CompBlock>
        </div>
      )}

      {hasTransform && (
        <CompBlock
          title={hasRect ? 'Advanced · Transform' : 'Transform'}
          searchText="position rotation scale x y z"
          defaultOpen={!hasRect}
          contextMenuItems={standardComponentMenu(
            'Transform',
            t as unknown as Record<string, unknown>,
          )}
        >
          <div className="axis-row">
            <label>Position</label>
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Position', 'x')}
              label="x"
              value={t.position[0]}
              onChange={(v) => setPos(0, v)}
            />
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Position', 'y')}
              label="y"
              value={t.position[1]}
              onChange={(v) => setPos(1, v)}
            />
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Position', 'z')}
              label="z"
              value={t.position[2]}
              onChange={(v) => setPos(2, v)}
            />
          </div>
          <div className="axis-row">
            <label>Rotation</label>
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Rotation', 'x')}
              label="x"
              value={euler[0]}
              step={1}
              onChange={(v) => setRot(0, v)}
            />
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Rotation', 'y')}
              label="y"
              value={euler[1]}
              step={1}
              onChange={(v) => setRot(1, v)}
            />
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Rotation', 'z')}
              label="z"
              value={euler[2]}
              step={1}
              onChange={(v) => setRot(2, v)}
            />
          </div>
          <div className="axis-row">
            <label>Scale</label>
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Scale', 'x')}
              label="x"
              value={t.scale[0]}
              onChange={(v) => setScale(0, v)}
            />
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Scale', 'y')}
              label="y"
              value={t.scale[1]}
              onChange={(v) => setScale(1, v)}
            />
            <AxisInput
              ariaLabel={axisSemanticLabel('Transform', 'Scale', 'z')}
              label="z"
              value={t.scale[2]}
              onChange={(v) => setScale(2, v)}
            />
          </div>
        </CompBlock>
      )}

      {!hasRect && !hasTransform && (
        <div className="empty-state" style={{ padding: 8 }}>
          No Transform / RectTransform
        </div>
      )}

      {orderedExtras.map((k, index) => {
        const data = entity.components[k] as Record<string, unknown>;
        const group = uiInspectorGroup(k);
        const previousGroup = index > 0 ? uiInspectorGroup(orderedExtras[index - 1]) : null;
        const behaviour = getBehaviour(k);
        const blockTitle = behaviour?.label ?? catalog.find((entry) => entry.type === k)?.label ?? k;
        const blockSearchText = `${k} ${Object.keys(data).join(' ')} ${behaviour?.fields.map((field) => field.label ?? field.key).join(' ') ?? ''}`;
        if (!inspectorSectionMatches(inspectorQuery, blockTitle, blockSearchText)) return null;
        const behaviourItems =
          behaviour?.methods
            .filter((m) => m.contextMenu)
            .map((m) => ({
              label: m.contextMenu ?? m.label ?? m.key,
              onClick: () => props.onInvokeBehaviourMethod?.(entity.entity, k, m.key),
            })) ?? [];
        const ctxItems: ComponentMenuItem[] = [
          ...standardComponentMenu(k, data),
          ...behaviourItems.map((item, index) => ({
            ...item,
            separatorBefore: index === 0,
          })),
        ];
        return (
          <div className="insp-ui-group" key={k}>
          {hasRect && group !== previousGroup && (
            <div className="insp-ui-group-title">{group}</div>
          )}
          <CompBlock
            title={blockTitle}
            searchText={blockSearchText}
            defaultOpen={!hasRect || group !== 'Advanced'}
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
            ) : k === 'Canvas' ? (
              <CanvasEditor
                data={data}
                entities={props.entities ?? [entity]}
                onChange={(next) => props.onSetComponent(entity.entity, 'Canvas', next)}
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
            ) : k === 'SpriteRenderer' || k === 'AnimatedSprite2D' ? (
              <WorldSpriteEditor
                componentType={k}
                data={data}
                entities={props.entities ?? [entity]}
                onChange={(next) => props.onSetComponent(entity.entity, k, next)}
              />
            ) : k === 'MaterialPropertyBlock' ? (
              <MaterialPropertyBlockEditor
                data={data}
                materialPath={String(
                  (entity.components.MeshRenderer as Record<string, unknown> | undefined)?.material
                    ?? 'default',
                )}
                entities={props.entities ?? [entity]}
                onChange={(next) => props.onSetComponent(entity.entity, k, next)}
              />
            ) : (
              <GenericCompEditor
                componentType={k}
                data={data}
                entities={props.entities ?? [entity]}
                contextComponents={entity.components}
                layerOptions={configuredLayers}
                onChange={(next) => props.onSetComponent(entity.entity, k, next)}
              />
            )}
          </CompBlock>
          </div>
        );
      })}

      <div className="add-comp-wrap" ref={menuRef}>
        <button
          type="button"
          className="add-comp"
          onClick={() => {
            setComponentSearch('');
            setMenuOpen((open) => !open);
          }}
        >
          Add Component
        </button>
        {menuOpen && (
          <div className="add-comp-menu">
            <div className="add-comp-search">
              <Search size={13} aria-hidden />
              <input
                autoFocus
                type="search"
                aria-label="Search components"
                placeholder="Search components…"
                value={componentSearch}
                onChange={(event) => setComponentSearch(event.target.value)}
              />
            </div>
            {filteredAvailable.length === 0 && (
              <div className="add-comp-empty">No more components</div>
            )}
            {filteredAvailable.map((c) => (
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
    </InspectorEditScope>
    </InspectorGestureProvider>
    </InspectorPanelContext.Provider>
  );
}
