import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  listProjectFiles,
  loadProjectImage,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { refreshSprites, resolveSpriteId } from '../spriteLibrary';
import { invalidateSpriteImage } from '../spriteDraw';
import {
  createSpriteAtlasAsset,
  parseSpriteAtlasAsset,
  serializeSpriteAtlasAsset,
  spriteAtlasTexturePath,
  type SpriteAtlasAsset,
  type SpriteAtlasPlan,
} from '../spriteAtlas';
import { buildSpriteAtlas } from '../spriteAtlasBuild';
import {
  openSpriteAtlasAsset,
  PROJECT_ASSETS_CHANGED_EVENT,
} from '../assetEditorEvents';
import { registerSaveAllParticipant } from '../saveAll';
import { SpriteListField } from './uiFieldEditors';

function uniqueAtlasPath(): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLocaleLowerCase()));
  let index = 1;
  let path = 'Assets/Atlases/New Sprite Atlas.matlas';
  while (used.has(path.toLocaleLowerCase())) {
    index += 1;
    path = `Assets/Atlases/New Sprite Atlas ${index}.matlas`;
  }
  return path;
}

export async function createProjectSpriteAtlas(): Promise<string> {
  await refreshProjectFiles();
  const path = uniqueAtlasPath();
  const name = path.split('/').pop()!.replace(/\.matlas$/i, '');
  await writeProjectAssetText(path, serializeSpriteAtlasAsset(createSpriteAtlasAsset(name)));
  await refreshProjectFiles();
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
  openSpriteAtlasAsset(path);
  return path;
}

function cloneAsset(asset: SpriteAtlasAsset): SpriteAtlasAsset {
  return structuredClone(asset);
}

export function SpriteAtlasEditor(props: {
  assetPath: string | null;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [asset, setAsset] = useState<SpriteAtlasAsset | null>(null);
  const [savedAsset, setSavedAsset] = useState<SpriteAtlasAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SpriteAtlasPlan | null>(null);
  const [preview, setPreview] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 480, height: 320 });

  const dirty = useMemo(() => {
    if (!asset || !savedAsset) return false;
    return JSON.stringify(asset) !== JSON.stringify(savedAsset);
  }, [asset, savedAsset]);

  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useEffect(() => () => props.onDirtyChange(false), [props.onDirtyChange]);

  useEffect(() => {
    if (!props.assetPath) {
      setAsset(null);
      setSavedAsset(null);
      setPreview(null);
      setPlan(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAsset(null);
    setSavedAsset(null);
    setPlan(null);
    setPreview(null);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const parsed = parseSpriteAtlasAsset(text);
        setAsset(parsed);
        setSavedAsset(cloneAsset(parsed));
        const texturePath = spriteAtlasTexturePath(props.assetPath!);
        void loadProjectImage(texturePath)
          .then((image) => {
            if (!cancelled) setPreview(image);
          })
          .catch(() => undefined);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.assetPath]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const update = () => setPreviewSize({
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(previewSize.width * ratio);
    canvas.height = Math.round(previewSize.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, previewSize.width, previewSize.height);
    context.fillStyle = '#191919';
    context.fillRect(0, 0, previewSize.width, previewSize.height);
    if (!preview) return;
    const scale = Math.min(
      Math.max(1, previewSize.width - 24) / preview.naturalWidth,
      Math.max(1, previewSize.height - 24) / preview.naturalHeight,
    );
    const width = preview.naturalWidth * scale;
    const height = preview.naturalHeight * scale;
    const x = (previewSize.width - width) * 0.5;
    const y = (previewSize.height - height) * 0.5;
    context.imageSmoothingEnabled = false;
    context.drawImage(preview, x, y, width, height);
    if (plan) {
      context.lineWidth = 1;
      context.font = '10px sans-serif';
      for (const entry of plan.entries) {
        const left = x + entry.rect[0] * scale;
        const top = y + entry.rect[1] * scale;
        const drawWidth = entry.rect[2] * scale;
        const drawHeight = entry.rect[3] * scale;
        context.strokeStyle = 'rgba(104,215,255,0.82)';
        context.strokeRect(left + 0.5, top + 0.5, Math.max(0, drawWidth - 1), Math.max(0, drawHeight - 1));
        if (drawWidth > 40) {
          context.fillStyle = '#e7f8ff';
          context.fillText(entry.name, left + 3, top + 11, Math.max(0, drawWidth - 6));
        }
      }
    }
  }, [plan, preview, previewSize]);

  const save = async (): Promise<SpriteAtlasAsset> => {
    if (!asset || !props.assetPath) throw new Error('no sprite atlas is open');
    setSaving(true);
    setError(null);
    try {
      const text = serializeSpriteAtlasAsset(asset);
      const normalized = parseSpriteAtlasAsset(text);
      await writeProjectAssetText(props.assetPath, text);
      setAsset(normalized);
      setSavedAsset(cloneAsset(normalized));
      await refreshProjectFiles();
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
      props.onAssetsChanged();
      return normalized;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => registerSaveAllParticipant('Sprite Atlas', () => (
    dirty && !saving && !packing
      ? async () => { await save(); }
      : null
  )), [asset, dirty, packing, props.assetPath, saving]);

  const pack = async () => {
    if (!asset || !props.assetPath) return;
    setPacking(true);
    setError(null);
    try {
      const normalized = await save();
      const result = await buildSpriteAtlas(props.assetPath, normalized);
      invalidateSpriteImage(result.texturePath);
      await Promise.all([refreshSprites(), refreshProjectFiles()]);
      const image = await loadProjectImage(result.texturePath);
      setPreview(image);
      setPlan(result.plan);
      props.onAssetsChanged();
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
      props.onLog(`Packed ${result.plan.entries.length} sprites into ${result.texturePath} (${result.plan.width}x${result.plan.height})`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Sprite Atlas pack failed: ${message}`, 'error');
    } finally {
      setPacking(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!asset) return;
    const raw = event.dataTransfer.getData('text/mengine-sprite');
    if (!raw) {
      setError('Drop a Sprite or texture from Project.');
      return;
    }
    const sprite = resolveSpriteId(raw);
    if (asset.sprites.some((candidate) => candidate.toLocaleLowerCase() === sprite.toLocaleLowerCase())) return;
    setAsset({ ...asset, sprites: [...asset.sprites, sprite] });
  };

  if (!props.assetPath) {
    return <div className="sprite-atlas-empty">Create or double-click a .matlas asset to build a runtime-batchable Sprite Atlas.</div>;
  }

  return (
    <div className="sprite-atlas-editor">
      <div className="sprite-editor-toolbar">
        <strong>{props.assetPath.split('/').pop()}</strong>
        <span>{plan ? `${plan.width} x ${plan.height} / ${plan.entries.length} sprites` : 'Not packed in this session'}</span>
        <span className="sprite-editor-spacer" />
        <button type="button" disabled={!dirty || saving || packing} onClick={() => {
          if (savedAsset) {
            setAsset(cloneAsset(savedAsset));
            setError(null);
          }
        }}>Revert</button>
        <button type="button" disabled={!dirty || saving || packing} onClick={() => void save().catch((reason) => setError(String(reason)))}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="primary" disabled={loading || saving || packing || !asset?.sprites.length} onClick={() => void pack()}>
          {packing ? 'Packing...' : 'Pack Atlas'}
        </button>
      </div>
      {error && <div className="sprite-editor-error">{error}</div>}
      <div className="sprite-atlas-body">
        <div className="sprite-atlas-preview" ref={previewRef}>
          {loading && <div className="sprite-editor-loading">Loading...</div>}
          {!preview && !loading && <div className="sprite-atlas-preview-empty">Pack Atlas to generate the PNG and Sprite subresources.</div>}
          <canvas ref={canvasRef} style={{ width: previewSize.width, height: previewSize.height }} />
        </div>
        <aside className="sprite-atlas-inspector" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          {asset && (
            <>
              <section>
                <h3>Atlas Settings</h3>
                <label>Name<input value={asset.name} onChange={(event) => setAsset({ ...asset, name: event.target.value })} /></label>
                <label>Max Size
                  <select value={asset.max_size} onChange={(event) => setAsset({ ...asset, max_size: Number(event.target.value) as SpriteAtlasAsset['max_size'] })}>
                    {[256, 512, 1024, 2048, 4096, 8192].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <label>Padding<input type="number" min={0} max={64} step={1} value={asset.padding} onChange={(event) => setAsset({ ...asset, padding: Number(event.target.value) })} /></label>
                <label>Pixels Per Unit<input type="number" min={0.01} max={100000} step={1} value={asset.pixels_per_unit} onChange={(event) => setAsset({ ...asset, pixels_per_unit: Number(event.target.value) })} /></label>
                <div className="sprite-atlas-output">Output: {spriteAtlasTexturePath(props.assetPath)}</div>
              </section>
              <section className="sprite-atlas-sources">
                <h3>Sources ({asset.sprites.length})</h3>
                <div className="sprite-atlas-drop">Drop Sprites here, or use Add Sprite Frame and its picker.</div>
                <SpriteListField label="Sprites" value={asset.sprites} onChange={(sprites) => setAsset({ ...asset, sprites })} />
              </section>
              {plan && (
                <section>
                  <h3>Generated Subresources</h3>
                  <div className="sprite-atlas-results">
                    {plan.entries.map((entry) => (
                      <div key={entry.reference}><span>{entry.name}</span><small>{entry.rect[2]} x {entry.rect[3]}</small></div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
