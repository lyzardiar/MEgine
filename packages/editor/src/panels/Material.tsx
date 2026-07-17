import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import {
  createMaterialAsset,
  parseMaterialAsset,
  serializeMaterialAsset,
  type MaterialAsset,
} from '../materialAsset';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerMenuItem } from '../editorWindow';

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

export function MaterialEditor(props: {
  assetPath: string | null;
  selectedEntity: SnapshotEntity | null;
  onOpenAsset: (path: string) => void;
  onAssignMaterial: (entity: number, path: string) => void;
  onAssetsChanged: () => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [material, setMaterial] = useState<MaterialAsset | null>(null);
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!props.assetPath) {
      setMaterial(null);
      setSavedText('');
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const parsed = parseMaterialAsset(text);
        setMaterial(parsed);
        setSavedText(serializeMaterialAsset(parsed));
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
  const canAssign = Boolean(
    props.assetPath
    && props.selectedEntity?.components.MeshRenderer,
  );

  const update = <K extends keyof MaterialAsset>(key: K, value: MaterialAsset[K]) => {
    setMaterial((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!props.assetPath || !material) return;
    setSaving(true);
    setError(null);
    try {
      const text = serializeMaterialAsset(material);
      await writeProjectAssetText(props.assetPath, text);
      await refreshProjectFiles();
      setSavedText(text);
      props.onAssetsChanged();
      props.onLog(`Saved ${props.assetPath}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Material 保存失败：${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

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

  const dropTexture = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/mengine-sprite')
      || event.dataTransfer.getData('text/mengine-asset')
      || event.dataTransfer.getData('text/plain');
    try {
      const path = normalizeProjectAssetPath(raw);
      if (!/\.(?:png|jpe?g|webp|bmp|tga)$/i.test(path)) {
        throw new Error('Base Color Texture 只接受图片资源');
      }
      update('base_color_texture', path);
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
    <div className="material-editor">
      <div className="material-toolbar">
        <strong title={props.assetPath}>{materialName(props.assetPath)}{dirty ? ' *' : ''}</strong>
        <span className="material-path" title={props.assetPath}>{props.assetPath}</span>
        <button type="button" onClick={() => void createNew()}>New</button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="material-error">{error}</div>}
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
          </select></label>
          <label>Surface <select value={material.surface} onChange={(event) => update('surface', event.target.value as MaterialAsset['surface'])}>
            <option value="opaque">Opaque</option>
            <option value="transparent">Transparent</option>
            <option value="cutout">Alpha Cutout</option>
          </select></label>

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

          <div className="material-texture-slot" onDragOver={(event) => event.preventDefault()} onDrop={dropTexture}>
            <span>Base Color Texture</span>
            <input value={material.base_color_texture} placeholder="Drop a texture from Project" onChange={(event) => update('base_color_texture', event.target.value)} />
            <button type="button" disabled={!material.base_color_texture} onClick={() => update('base_color_texture', '')}>×</button>
          </div>
          <label>UV Scale
            <span className="material-vector"><input aria-label="UV scale X" type="number" step={0.1} value={material.uv_scale[0]} onChange={(event) => update('uv_scale', [Number(event.target.value), material.uv_scale[1]])} /><input aria-label="UV scale Y" type="number" step={0.1} value={material.uv_scale[1]} onChange={(event) => update('uv_scale', [material.uv_scale[0], Number(event.target.value)])} /></span>
          </label>
          <label>UV Offset
            <span className="material-vector"><input aria-label="UV offset X" type="number" step={0.1} value={material.uv_offset[0]} onChange={(event) => update('uv_offset', [Number(event.target.value), material.uv_offset[1]])} /><input aria-label="UV offset Y" type="number" step={0.1} value={material.uv_offset[1]} onChange={(event) => update('uv_offset', [material.uv_offset[0], Number(event.target.value)])} /></span>
          </label>
        </div>
      </div>
      <div className="material-footer">
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
