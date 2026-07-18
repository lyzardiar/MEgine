import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import {
  createMaterialAsset,
  isMaterialTexturePath,
  materialReferenceDiagnostics,
  parseMaterialAsset,
  serializeMaterialAsset,
  type MaterialAsset,
} from '../materialAsset';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  projectAssetUrl,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
  type ProjectFileAsset,
} from '../projectAssets';
import { pingProjectAsset } from '../pingBus';
import { registerMenuItem } from '../editorWindow';
import { registerSaveAllParticipant } from '../saveAll';
import { ImageIcon, Search, X } from 'lucide-react';
import { ObjectPicker } from './ObjectPicker';

export const OPEN_MATERIAL_EVENT = 'mengine:open-material';
export const PROJECT_ASSETS_CHANGED_EVENT = 'mengine:project-assets-changed';

export function openMaterialAsset(path: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_MATERIAL_EVENT, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'material' }));
}

function uniqueMaterialPath(baseName = 'New Material'): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let index = 1;
  let path = `Assets/Materials/${baseName}.mmat`;
  while (used.has(path.toLowerCase())) {
    index += 1;
    path = `Assets/Materials/${baseName} ${index}.mmat`;
  }
  return path;
}

export async function createProjectMaterial(): Promise<string> {
  await refreshProjectFiles();
  const path = uniqueMaterialPath();
  const name = path.split('/').pop()!.replace(/\.mmat$/i, '');
  await writeProjectAssetText(path, serializeMaterialAsset(createMaterialAsset(name)));
  await refreshProjectFiles();
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
  openMaterialAsset(path);
  return path;
}

registerMenuItem(
  'Assets/Create/Material',
  async (context) => {
    try {
      const path = await createProjectMaterial();
      context.log(`Created ${path}`);
    } catch (reason) {
      context.log(
        `Material 创建失败：${reason instanceof Error ? reason.message : String(reason)}`,
      );
    }
  },
  { priority: 200 },
);

type SnapshotEntity = WorldSnapshotView['entities'][number];

function byteHex(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function colorHex(value: readonly number[]): string {
  return `#${byteHex(value[0] ?? 0)}${byteHex(value[1] ?? 0)}${byteHex(value[2] ?? 0)}`;
}

function parseHex(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

function materialName(path: string): string {
  return path.split('/').pop()?.replace(/\.(?:mmat|mat)$/i, '') ?? 'Material';
}

function automaticRenderQueue(surface: MaterialAsset['surface']): number {
  if (surface === 'transparent') return 3000;
  if (surface === 'cutout') return 2450;
  return 2000;
}

function MaterialTextureSlot(props: {
  label: string;
  hint?: string;
  colorSpace: 'sRGB' | 'Linear';
  value: string;
  assets: ProjectFileAsset[];
  missing: boolean;
  onChange: (value: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const current = props.assets.find(
    (asset) => asset.relPath.toLowerCase() === props.value.replace(/\\/g, '/').toLowerCase(),
  );
  const items = props.assets.map((asset) => ({
    id: asset.relPath,
    label: asset.name,
    sub: asset.folder,
    thumbUrl: /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(asset.relPath)
      ? projectAssetUrl(asset.relPath)
      : null,
  }));
  return (
    <div
      className={`material-texture-slot${props.missing ? ' missing' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={props.onDrop}
    >
      <span className="material-texture-label" title={props.hint}>
        {props.label}
        <small>{props.colorSpace}</small>
      </span>
      <div className="material-texture-reference">
        <button
          type="button"
          className="material-texture-thumb"
          disabled={!current}
          title={current ? 'Ping texture in Project' : props.value ? 'Texture is missing' : 'No texture assigned'}
          onClick={() => current && pingProjectAsset(current.relPath, current.folder)}
        >
          {current && /\.(?:png|jpe?g|webp|gif|bmp)$/i.test(current.relPath)
            ? <img src={projectAssetUrl(current.relPath)} alt="" draggable={false} />
            : <ImageIcon size={13} aria-hidden="true" />}
        </button>
        <input
          aria-label={props.label}
          value={props.value}
          placeholder="None (Texture)"
          title={props.missing ? `Missing texture: ${props.value}` : props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <button
          ref={pickerButton}
          type="button"
          title={`Select ${props.label}`}
          aria-label={`Select ${props.label}`}
          onClick={() => {
            setAnchor(pickerButton.current?.getBoundingClientRect() ?? null);
            setPickerOpen(true);
          }}
        >
          <Search size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!props.value}
          title={`Clear ${props.label}`}
          aria-label={`Clear ${props.label}`}
          onClick={() => props.onChange('')}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      {pickerOpen && (
        <ObjectPicker
          title={`Select ${props.label}`}
          items={items}
          current={props.value || null}
          allowNone
          noneLabel="None (Texture)"
          anchorRect={anchor}
          onPick={(id) => props.onChange(id ?? '')}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

export function MaterialEditor(props: {
  assetPath: string | null;
  selectedEntity: SnapshotEntity | null;
  onOpenAsset: (path: string) => void;
  onAssignMaterial: (entity: number, path: string) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [material, setMaterial] = useState<MaterialAsset | null>(null);
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { material: MaterialAsset; savedText: string }>());

  useEffect(() => {
    let cancelled = false;
    const previousPath = loadedPath.current;
    if (previousPath && material) {
      if (serializeMaterialAsset(material) !== savedText) {
        drafts.current.set(previousPath, {
          material: structuredClone(material),
          savedText,
        });
      } else {
        drafts.current.delete(previousPath);
      }
    }
    loadedPath.current = props.assetPath;
    setError(null);
    setMaterial(null);
    setSavedText('');
    setLoading(false);
    if (!props.assetPath) {
      return () => { cancelled = true; };
    }
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      setMaterial(structuredClone(draft.material));
      setSavedText(draft.savedText);
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void Promise.all([readProjectAssetText(props.assetPath), refreshProjectFiles()])
      .then(([text]) => {
        if (cancelled) return;
        const parsed = parseMaterialAsset(text);
        setMaterial(parsed);
        setSavedText(serializeMaterialAsset(parsed));
        setAssetRevision((revision) => revision + 1);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setMaterial(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const serialized = useMemo(
    () => material ? serializeMaterialAsset(material) : '',
    [material],
  );
  const dirty = Boolean(material && serialized !== savedText);
  const anyDirty = dirty || drafts.current.size > 0;
  const projectAssets = useMemo(() => {
    void assetRevision;
    return listProjectFiles();
  }, [assetRevision]);
  const textureAssets = useMemo(
    () => projectAssets.filter((asset) => asset.kind === 'texture'),
    [projectAssets],
  );
  const diagnostics = useMemo(
    () => material ? materialReferenceDiagnostics(
      material,
      projectAssets.map((asset) => asset.relPath),
    ) : [],
    [material, projectAssets],
  );

  useEffect(() => {
    props.onDirtyChange(anyDirty);
  }, [anyDirty, props.onDirtyChange]);
  const canAssign = Boolean(
    props.assetPath
    && props.selectedEntity?.components.MeshRenderer,
  );

  const update = <K extends keyof MaterialAsset>(key: K, value: MaterialAsset[K]) => {
    setMaterial((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async (): Promise<boolean> => {
    if (!props.assetPath || !material) return false;
    setSaving(true);
    setError(null);
    try {
      const text = serializeMaterialAsset(material);
      await writeProjectAssetText(props.assetPath, text);
      await refreshProjectFiles();
      setAssetRevision((revision) => revision + 1);
      drafts.current.delete(props.assetPath);
      setSavedText(text);
      props.onAssetsChanged();
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
      props.onLog(`Saved ${props.assetPath}`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Material 保存失败：${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    if (dirty && !await save()) throw new Error('Current Material could not be saved');
    const failures: string[] = [];
    let savedDraft = false;
    for (const [path, draft] of [...drafts.current]) {
      try {
        await writeProjectAssetText(path, serializeMaterialAsset(draft.material));
        drafts.current.delete(path);
        savedDraft = true;
        props.onLog(`Saved ${path}`);
      } catch (reason) {
        failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    }
    if (savedDraft) {
      await refreshProjectFiles();
      setAssetRevision((revision) => revision + 1);
      props.onAssetsChanged();
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  };

  useEffect(() => registerSaveAllParticipant('Materials', () => (
    anyDirty && !saving ? saveAll : null
  )), [anyDirty, dirty, material, props.assetPath, savedText, saving]);

  const createNew = async () => {
    try {
      const path = await createProjectMaterial();
      props.onOpenAsset(path);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      props.onLog(
        `Material 创建失败：${reason instanceof Error ? reason.message : String(reason)}`,
        'error',
      );
    }
  };

  const dropTexture = (
    event: DragEvent<HTMLDivElement>,
    field: 'base_color_texture' | 'normal_texture' | 'metallic_roughness_texture' | 'occlusion_texture' | 'emissive_texture',
    label: string,
  ) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/mengine-sprite')
      || event.dataTransfer.getData('text/mengine-asset')
      || event.dataTransfer.getData('text/plain');
    try {
      const path = normalizeProjectAssetPath(raw);
      if (!isMaterialTexturePath(path)) {
        throw new Error(`${label} only accepts image assets`);
      }
      update(field, path);
    } catch (reason) {
      props.onLog(reason instanceof Error ? reason.message : String(reason), 'warn');
    }
  };

  if (!props.assetPath || !material) {
    return (
      <div className="material-empty">
        <strong>{loading ? 'Loading Material…' : 'Material Editor'}</strong>
        <span>{error ?? '双击 Project 中的 .mmat 材质，或创建一个新材质。'}</span>
        <button type="button" onClick={() => void createNew()}>Create Material</button>
      </div>
    );
  }

  const baseRgb = colorHex(material.base_color);
  const emissiveRgb = colorHex(material.emissive);
  return (
    <div
      className="material-editor"
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }
      }}
    >
      <div className="material-toolbar">
        <strong title={props.assetPath}>{materialName(props.assetPath)}{dirty ? ' *' : ''}</strong>
        <span className="material-path" title={props.assetPath}>{props.assetPath}</span>
        <button type="button" onClick={() => void createNew()}>New</button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="material-error">{error}</div>}
      {diagnostics.length > 0 && (
        <div className="material-reference-diagnostics" role="status">
          <strong>{diagnostics.length} unresolved material reference{diagnostics.length === 1 ? '' : 's'}</strong>
          {diagnostics.map((diagnostic) => (
            <span key={`${diagnostic.field}:${diagnostic.message}`}>{diagnostic.message}</span>
          ))}
        </div>
      )}
      <div className="material-body">
        <div
          className="material-preview"
          style={{
            '--material-color': `rgba(${material.base_color.slice(0, 3).map((value) => Math.round(value * 255)).join(',')},${material.base_color[3]})`,
          } as CSSProperties}
        >
          <div className="material-preview-sphere" />
          <span>{material.shader.toUpperCase()} · {material.surface}</span>
        </div>

        <div className="material-fields">
          <label>Name <input value={material.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label>Shader <select value={material.shader} onChange={(event) => update('shader', event.target.value as MaterialAsset['shader'])}>
            <option value="pbr">PBR</option>
            <option value="unlit">Unlit</option>
            <option value="custom">Custom Surface</option>
          </select></label>
          {material.shader === 'custom' && (
            <label>Surface Shader
              <select
                value={material.custom_shader}
                onChange={(event) => update('custom_shader', event.target.value)}
              >
                <option value="">Select .mshader...</option>
                {material.custom_shader
                  && !projectAssets.some((asset) => asset.kind === 'shader' && asset.relPath === material.custom_shader)
                  && <option value={material.custom_shader}>{material.custom_shader} (missing)</option>}
                {projectAssets.filter((asset) => asset.kind === 'shader').map((asset) => (
                  <option key={asset.id} value={asset.relPath}>{asset.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!material.custom_shader}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mengine:open-surface-shader', { detail: material.custom_shader }));
                  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'shader' }));
                }}
              >Open</button>
            </label>
          )}
          <label>Surface <select value={material.surface} onChange={(event) => update('surface', event.target.value as MaterialAsset['surface'])}>
            <option value="opaque">Opaque</option>
            <option value="transparent">Transparent</option>
            <option value="cutout">Alpha Cutout</option>
          </select></label>
          {material.surface === 'transparent' && (
            <>
              <label>Blend <select value={material.blend_mode} onChange={(event) => update('blend_mode', event.target.value as MaterialAsset['blend_mode'])}>
                <option value="alpha">Alpha</option>
                <option value="premultiplied">Premultiplied Alpha</option>
                <option value="additive">Additive</option>
                <option value="multiply">Multiply</option>
              </select></label>
              <label className="material-check"><input type="checkbox" checked={material.transparent_depth_write} onChange={(event) => update('transparent_depth_write', event.target.checked)} /> Depth Write</label>
            </>
          )}
          <label>Render Queue
            <span className="material-suffixed-input">
              <input
                aria-label="Material render queue"
                type="number"
                min={-1}
                max={5000}
                step={1}
                value={material.render_queue}
                title="-1 uses the surface default"
                onChange={(event) => update('render_queue', Number(event.target.value))}
              />
              <span>{material.render_queue < 0 ? `Auto (${automaticRenderQueue(material.surface)})` : 'Custom'}</span>
            </span>
          </label>

          <label className="material-color-row">Base Color
            <input type="color" value={baseRgb} onChange={(event) => {
              const [r, g, b] = parseHex(event.target.value);
              update('base_color', [r, g, b, material.base_color[3]]);
            }} />
            <input aria-label="Base color alpha" type="number" min={0} max={1} step={0.01} value={material.base_color[3]} onChange={(event) => update('base_color', [material.base_color[0], material.base_color[1], material.base_color[2], Number(event.target.value)])} />
          </label>

          <label>Metallic <input type="range" min={0} max={1} step={0.01} value={material.metallic} onChange={(event) => update('metallic', Number(event.target.value))} /><output>{material.metallic.toFixed(2)}</output></label>
          <label>Roughness <input type="range" min={0.04} max={1} step={0.01} value={material.roughness} onChange={(event) => update('roughness', Number(event.target.value))} /><output>{material.roughness.toFixed(2)}</output></label>

          <label className="material-color-row">Emissive
            <input type="color" value={emissiveRgb} onChange={(event) => update('emissive', parseHex(event.target.value))} />
          </label>
          <label>Emission Strength <input type="number" min={0} step={0.1} value={material.emissive_strength} onChange={(event) => update('emissive_strength', Number(event.target.value))} /></label>
          <label className="material-check"><input type="checkbox" checked={material.double_sided} onChange={(event) => update('double_sided', event.target.checked)} /> Double Sided</label>
          {material.surface === 'cutout' && (
            <label>Alpha Cutoff <input type="range" min={0} max={1} step={0.01} value={material.alpha_cutoff} onChange={(event) => update('alpha_cutoff', Number(event.target.value))} /><output>{material.alpha_cutoff.toFixed(2)}</output></label>
          )}

          <MaterialTextureSlot
            label="Base Color Texture"
            colorSpace="sRGB"
            value={material.base_color_texture}
            assets={textureAssets}
            missing={diagnostics.some((diagnostic) => diagnostic.field === 'base_color_texture')}
            onChange={(value) => update('base_color_texture', value)}
            onDrop={(event) => dropTexture(event, 'base_color_texture', 'Base Color Texture')}
          />
          <MaterialTextureSlot
            label="Normal Texture"
            hint="Tangent-space normal map sampled as linear data"
            colorSpace="Linear"
            value={material.normal_texture}
            assets={textureAssets}
            missing={diagnostics.some((diagnostic) => diagnostic.field === 'normal_texture')}
            onChange={(value) => update('normal_texture', value)}
            onDrop={(event) => dropTexture(event, 'normal_texture', 'Normal Texture')}
          />
          <label>Normal Scale <input type="number" min={0} step={0.05} value={material.normal_scale} onChange={(event) => update('normal_scale', Number(event.target.value))} /></label>
          <MaterialTextureSlot
            label="ORM Texture"
            hint="Linear packed map: G = roughness, B = metallic; R remains the AO fallback"
            colorSpace="Linear"
            value={material.metallic_roughness_texture}
            assets={textureAssets}
            missing={diagnostics.some((diagnostic) => diagnostic.field === 'metallic_roughness_texture')}
            onChange={(value) => update('metallic_roughness_texture', value)}
            onDrop={(event) => dropTexture(event, 'metallic_roughness_texture', 'ORM Texture')}
          />
          <MaterialTextureSlot
            label="Occlusion Texture"
            hint="Optional linear map: R = ambient occlusion. When empty, ORM R is used for compatibility."
            colorSpace="Linear"
            value={material.occlusion_texture}
            assets={textureAssets}
            missing={diagnostics.some((diagnostic) => diagnostic.field === 'occlusion_texture')}
            onChange={(value) => update('occlusion_texture', value)}
            onDrop={(event) => dropTexture(event, 'occlusion_texture', 'Occlusion Texture')}
          />
          <label>Occlusion Strength <input type="range" min={0} max={1} step={0.01} value={material.occlusion_strength} onChange={(event) => update('occlusion_strength', Number(event.target.value))} /><output>{material.occlusion_strength.toFixed(2)}</output></label>
          <MaterialTextureSlot
            label="Emissive Texture"
            colorSpace="sRGB"
            value={material.emissive_texture}
            assets={textureAssets}
            missing={diagnostics.some((diagnostic) => diagnostic.field === 'emissive_texture')}
            onChange={(value) => update('emissive_texture', value)}
            onDrop={(event) => dropTexture(event, 'emissive_texture', 'Emissive Texture')}
          />
          <label>UV Scale
            <span className="material-vector"><input aria-label="UV scale X" type="number" step={0.1} value={material.uv_scale[0]} onChange={(event) => update('uv_scale', [Number(event.target.value), material.uv_scale[1]])} /><input aria-label="UV scale Y" type="number" step={0.1} value={material.uv_scale[1]} onChange={(event) => update('uv_scale', [material.uv_scale[0], Number(event.target.value)])} /></span>
          </label>
          <label>UV Offset
            <span className="material-vector"><input aria-label="UV offset X" type="number" step={0.1} value={material.uv_offset[0]} onChange={(event) => update('uv_offset', [Number(event.target.value), material.uv_offset[1]])} /><input aria-label="UV offset Y" type="number" step={0.1} value={material.uv_offset[1]} onChange={(event) => update('uv_offset', [material.uv_offset[0], Number(event.target.value)])} /></span>
          </label>
          <label>UV Rotation
            <span className="material-suffixed-input"><input aria-label="UV rotation" type="number" step={1} value={material.uv_rotation} onChange={(event) => update('uv_rotation', Number(event.target.value))} /><span>°</span></span>
          </label>
          <label>Wrap U <select value={material.wrap_u} onChange={(event) => update('wrap_u', event.target.value as MaterialAsset['wrap_u'])}>
            <option value="repeat">Repeat</option>
            <option value="clamp">Clamp</option>
            <option value="mirror">Mirror</option>
          </select></label>
          <label>Wrap V <select value={material.wrap_v} onChange={(event) => update('wrap_v', event.target.value as MaterialAsset['wrap_v'])}>
            <option value="repeat">Repeat</option>
            <option value="clamp">Clamp</option>
            <option value="mirror">Mirror</option>
          </select></label>
          <label>Texture Filter <select
            value={material.filter}
            disabled={material.anisotropy > 1}
            title={material.anisotropy > 1 ? 'Anisotropic filtering requires linear texture filtering' : undefined}
            onChange={(event) => update('filter', event.target.value as MaterialAsset['filter'])}
          >
            <option value="linear">Linear</option>
            <option value="nearest">Nearest</option>
          </select></label>
          <label>Mipmap Filter <select
            value={material.mipmap_filter}
            disabled={material.anisotropy > 1}
            title={material.anisotropy > 1 ? 'Anisotropic filtering requires linear mipmap filtering' : undefined}
            onChange={(event) => update('mipmap_filter', event.target.value as MaterialAsset['mipmap_filter'])}
          >
            <option value="linear">Trilinear</option>
            <option value="nearest">Bilinear</option>
          </select></label>
          <label>Anisotropy <select
            value={material.anisotropy}
            title="Improves texture clarity at grazing angles; unsupported GPUs safely fall back to 1x"
            onChange={(event) => {
              const anisotropy = Number(event.target.value);
              setMaterial((current) => current ? {
                ...current,
                anisotropy,
                ...(anisotropy > 1 ? { filter: 'linear', mipmap_filter: 'linear' } : {}),
              } : current);
            }}
          >
            {[1, 2, 4, 8, 16].map((value) => (
              <option key={value} value={value}>{value}x</option>
            ))}
          </select></label>
        </div>
      </div>
      <div className="material-footer">
        {props.selectedEntity?.components.PbrMaterial != null && (
          <span title="PbrMaterial overrides material assets at runtime">
            Assigning will replace the selected renderer's PBR override.
          </span>
        )}
        <button
          type="button"
          disabled={!canAssign}
          onClick={() => props.onAssignMaterial(props.selectedEntity!.entity, props.assetPath!)}
        >
          Assign to Selected MeshRenderer
        </button>
      </div>
    </div>
  );
}
