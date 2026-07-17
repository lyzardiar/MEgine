import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  loadProjectImage,
  readProjectAssetText,
  writeProjectAssetText,
} from '../projectAssets';
import { refreshSprites } from '../spriteLibrary';
import {
  createSpriteImportSettings,
  parseSpriteImportSettings,
  serializeSpriteImportSettings,
  sliceSpriteGrid,
  spriteImportPath,
  spriteSliceName,
  spriteTexturePath,
  uniqueSpriteSliceName,
  type SpriteImportSettings,
  type SpriteSlice,
} from '../spriteImport';
import { PROJECT_ASSETS_CHANGED_EVENT } from './Material';

export const OPEN_SPRITE_EDITOR_EVENT = 'mengine:open-sprite-editor';

export function openSpriteAsset(path: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SPRITE_EDITOR_EVENT, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'spriteEditor' }));
}

type TextureSize = [number, number];

function previewLayout(width: number, height: number, texture: TextureSize) {
  const scale = Math.max(0.01, Math.min(
    Math.max(1, width - 32) / Math.max(1, texture[0]),
    Math.max(1, height - 32) / Math.max(1, texture[1]),
  ));
  const drawWidth = texture[0] * scale;
  const drawHeight = texture[1] * scale;
  return {
    x: (width - drawWidth) * 0.5,
    y: (height - drawHeight) * 0.5,
    width: drawWidth,
    height: drawHeight,
    scale,
  };
}

function cloneSettings(settings: SpriteImportSettings): SpriteImportSettings {
  return structuredClone(settings);
}

export function SpriteEditor(props: {
  assetPath: string | null;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [settings, setSettings] = useState<SpriteImportSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<SpriteImportSettings | null>(null);
  const [textureSize, setTextureSize] = useState<TextureSize>([1, 1]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [selected, setSelected] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 360 });
  const [grid, setGrid] = useState({
    cellWidth: 32,
    cellHeight: 32,
    offsetX: 0,
    offsetY: 0,
    paddingX: 0,
    paddingY: 0,
    baseName: 'Sprite',
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const basePath = props.assetPath ? spriteTexturePath(props.assetPath) : null;
  const dirty = useMemo(() => {
    if (!settings || !savedSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(savedSettings);
  }, [savedSettings, settings]);

  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useEffect(() => () => props.onDirtyChange(false), [props.onDirtyChange]);

  useEffect(() => {
    if (!basePath) {
      setSettings(null);
      setSavedSettings(null);
      setImage(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSettings(null);
    setSavedSettings(null);
    setImage(null);
    void loadProjectImage(basePath)
      .then(async (loadedImage) => {
        const size: TextureSize = [loadedImage.naturalWidth, loadedImage.naturalHeight];
        let next = createSpriteImportSettings();
        let importText: string | null = null;
        try {
          importText = await readProjectAssetText(spriteImportPath(basePath));
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          if (!/(?:^|\D)404(?:\D|$)|asset not found/i.test(message)) throw reason;
          // A missing sidecar means the texture still uses compatible Single defaults.
        }
        if (importText != null) next = parseSpriteImportSettings(importText, size);
        if (cancelled) return;
        setTextureSize(size);
        setImage(loadedImage);
        setSettings(next);
        setSavedSettings(cloneSettings(next));
        const requestedSlice = spriteSliceName(props.assetPath ?? '');
        setSelected(requestedSlice
          ? next.slices.findIndex((slice) => slice.name.toLocaleLowerCase() === requestedSlice.toLocaleLowerCase())
          : next.slices.length ? 0 : -1);
        setGrid((current) => ({
          ...current,
          cellWidth: Math.min(current.cellWidth, size[0]),
          cellHeight: Math.min(current.cellHeight, size[1]),
          baseName: basePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Sprite',
        }));
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
  }, [basePath, props.assetPath, reloadToken]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const update = () => setCanvasSize({
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
    canvas.width = Math.round(canvasSize.width * ratio);
    canvas.height = Math.round(canvasSize.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    if (!image || !settings) return;
    const layout = previewLayout(canvasSize.width, canvasSize.height, textureSize);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
    ctx.restore();
    settings.slices.forEach((slice, index) => {
      const [x, y, width, height] = slice.rect;
      const left = layout.x + x * layout.scale;
      const top = layout.y + y * layout.scale;
      const drawWidth = width * layout.scale;
      const drawHeight = height * layout.scale;
      const active = index === selected;
      ctx.fillStyle = active ? 'rgba(53, 154, 191, 0.16)' : 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(left, top, drawWidth, drawHeight);
      ctx.strokeStyle = active ? '#68d7ff' : 'rgba(255,255,255,0.72)';
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, drawWidth - 1), Math.max(0, drawHeight - 1));
      if (active || drawWidth > 52) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = active ? '#dff7ff' : '#fff';
        ctx.fillText(slice.name, left + 4, top + 13, Math.max(0, drawWidth - 8));
      }
      const pivotX = left + slice.pivot[0] * drawWidth;
      const pivotY = top + (1 - slice.pivot[1]) * drawHeight;
      ctx.strokeStyle = active ? '#ffd56a' : 'rgba(255,213,106,0.7)';
      ctx.beginPath();
      ctx.moveTo(pivotX - 5, pivotY);
      ctx.lineTo(pivotX + 5, pivotY);
      ctx.moveTo(pivotX, pivotY - 5);
      ctx.lineTo(pivotX, pivotY + 5);
      ctx.stroke();
    });
  }, [canvasSize, image, selected, settings, textureSize]);

  const updateSettings = (patch: Partial<SpriteImportSettings>) => {
    setSettings((current) => current ? { ...current, ...patch } : current);
  };

  const updateSlice = (index: number, patch: Partial<SpriteSlice>) => {
    setSettings((current) => {
      if (!current || !current.slices[index]) return current;
      const slices = current.slices.map((slice, candidate) => candidate === index
        ? { ...slice, ...patch }
        : slice);
      return { ...current, slices };
    });
  };

  const selectAtPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!settings) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const layout = previewLayout(rect.width, rect.height, textureSize);
    const x = (event.clientX - rect.left - layout.x) / layout.scale;
    const y = (event.clientY - rect.top - layout.y) / layout.scale;
    let hit = -1;
    settings.slices.forEach((slice, index) => {
      if (x >= slice.rect[0] && x <= slice.rect[0] + slice.rect[2]
        && y >= slice.rect[1] && y <= slice.rect[1] + slice.rect[3]) hit = index;
    });
    setSelected(hit);
  };

  const apply = async () => {
    if (!settings || !basePath) return;
    setSaving(true);
    setError(null);
    try {
      const text = serializeSpriteImportSettings(settings, textureSize);
      await writeProjectAssetText(spriteImportPath(basePath), text);
      const normalized = parseSpriteImportSettings(text, textureSize);
      setSettings(normalized);
      setSavedSettings(cloneSettings(normalized));
      await refreshSprites();
      props.onAssetsChanged();
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
      props.onLog(`Applied sprite import settings: ${basePath}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Sprite import failed: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!basePath) {
    return <div className="sprite-editor-empty">Double-click a texture in Project to edit its sprite import settings.</div>;
  }

  const activeSlice = settings?.slices[selected] ?? null;
  return (
    <div className="sprite-editor">
      <div className="sprite-editor-toolbar">
        <strong>{basePath.split('/').pop()}</strong>
        <span>{textureSize[0]} x {textureSize[1]}</span>
        <span className="sprite-editor-spacer" />
        <button type="button" disabled={!dirty || saving} onClick={() => {
          if (savedSettings) {
            setSettings(cloneSettings(savedSettings));
            setSelected(savedSettings.slices.length ? Math.min(Math.max(0, selected), savedSettings.slices.length - 1) : -1);
            setError(null);
          }
        }}>Revert</button>
        <button type="button" className="primary" disabled={!dirty || saving} onClick={() => void apply()}>
          {saving ? 'Applying...' : 'Apply'}
        </button>
        <button type="button" disabled={loading || saving} onClick={() => setReloadToken((value) => value + 1)}>Reload</button>
      </div>
      {error && <div className="sprite-editor-error">{error}</div>}
      <div className="sprite-editor-body">
        <div className="sprite-editor-preview" ref={previewRef}>
          {loading && <div className="sprite-editor-loading">Loading...</div>}
          <canvas
            ref={canvasRef}
            style={{ width: canvasSize.width, height: canvasSize.height }}
            onPointerDown={selectAtPointer}
          />
        </div>
        <aside className="sprite-editor-inspector">
          {settings && (
            <>
              <section>
                <h3>Import Settings</h3>
                <label>Sprite Mode
                  <select value={settings.mode} onChange={(event) => {
                    const mode = event.target.value as SpriteImportSettings['mode'];
                    if (mode === 'multiple' && settings.slices.length === 0) {
                      updateSettings({
                        mode,
                        slices: [{ name: uniqueSpriteSliceName([], 'Sprite'), rect: [0, 0, textureSize[0], textureSize[1]], pivot: [0.5, 0.5] }],
                      });
                      setSelected(0);
                    } else {
                      updateSettings({ mode, slices: mode === 'single' ? [] : settings.slices });
                      setSelected(mode === 'single' ? -1 : Math.max(0, selected));
                    }
                  }}>
                    <option value="single">Single</option>
                    <option value="multiple">Multiple</option>
                  </select>
                </label>
                <label>Pixels Per Unit
                  <input type="number" min={0.01} max={100000} step={1} value={settings.pixels_per_unit} onChange={(event) => updateSettings({ pixels_per_unit: Number(event.target.value) })} />
                </label>
              </section>

              {settings.mode === 'multiple' && (
                <>
                  <section>
                    <div className="sprite-editor-section-title">
                      <h3>Slices ({settings.slices.length})</h3>
                      <span>
                        <button type="button" title="Add full-texture slice" onClick={() => {
                          const slices = [...settings.slices, {
                            name: uniqueSpriteSliceName(settings.slices),
                            rect: [0, 0, textureSize[0], textureSize[1]] as [number, number, number, number],
                            pivot: [0.5, 0.5] as [number, number],
                          }];
                          updateSettings({ slices });
                          setSelected(slices.length - 1);
                        }}>+</button>
                        <button type="button" disabled={!activeSlice} title="Remove selected slice" onClick={() => {
                          const slices = settings.slices.filter((_, index) => index !== selected);
                          updateSettings({ slices });
                          setSelected(slices.length ? Math.min(selected, slices.length - 1) : -1);
                        }}>-</button>
                      </span>
                    </div>
                    <div className="sprite-slice-list">
                      {settings.slices.map((slice, index) => (
                        <button type="button" key={`${slice.name}-${index}`} className={selected === index ? 'active' : ''} onClick={() => setSelected(index)}>
                          <span>{slice.name}</span><small>{slice.rect[2]} x {slice.rect[3]}</small>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3>Grid Slice</h3>
                    <div className="sprite-number-grid">
                      {(['cellWidth', 'cellHeight', 'offsetX', 'offsetY', 'paddingX', 'paddingY'] as const).map((key) => (
                        <label key={key}>{key.replace(/([A-Z])/g, ' $1')}
                          <input type="number" min={key.startsWith('cell') ? 1 : 0} step={1} value={grid[key]} onChange={(event) => setGrid({ ...grid, [key]: Number(event.target.value) })} />
                        </label>
                      ))}
                    </div>
                    <label>Base Name<input value={grid.baseName} onChange={(event) => setGrid({ ...grid, baseName: event.target.value })} /></label>
                    <button type="button" className="wide" onClick={() => {
                      try {
                        const slices = sliceSpriteGrid(textureSize, grid);
                        updateSettings({ slices });
                        setSelected(0);
                        setError(null);
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : String(reason));
                      }
                    }}>Slice Grid (Replace)</button>
                  </section>

                  {activeSlice && (
                    <section>
                      <h3>Selected Slice</h3>
                      <label>Name<input value={activeSlice.name} onChange={(event) => updateSlice(selected, { name: event.target.value })} /></label>
                      <div className="sprite-number-grid">
                        {(['X', 'Y', 'W', 'H'] as const).map((label, axis) => (
                          <label key={label}>{label}
                            <input type="number" min={0} step={1} value={activeSlice.rect[axis]} onChange={(event) => {
                              const rect = [...activeSlice.rect] as SpriteSlice['rect'];
                              rect[axis] = Number(event.target.value);
                              updateSlice(selected, { rect });
                            }} />
                          </label>
                        ))}
                      </div>
                      <div className="sprite-number-grid pivot">
                        {(['Pivot X', 'Pivot Y'] as const).map((label, axis) => (
                          <label key={label}>{label}
                            <input type="number" min={0} max={1} step={0.05} value={activeSlice.pivot[axis]} onChange={(event) => {
                              const pivot = [...activeSlice.pivot] as SpriteSlice['pivot'];
                              pivot[axis] = Number(event.target.value);
                              updateSlice(selected, { pivot });
                            }} />
                          </label>
                        ))}
                      </div>
                      <div className="sprite-pivot-presets" aria-label="Pivot presets">
                        {[1, 0.5, 0].flatMap((y) => [0, 0.5, 1].map((x) => (
                          <button
                            type="button"
                            key={`${x}-${y}`}
                            className={activeSlice.pivot[0] === x && activeSlice.pivot[1] === y ? 'active' : ''}
                            title={`Pivot ${x}, ${y}`}
                            onClick={() => updateSlice(selected, { pivot: [x, y] })}
                          />
                        )))}
                      </div>
                      <button type="button" className="wide" onClick={() => {
                        const reference = `${basePath}#${activeSlice.name}`;
                        void navigator.clipboard.writeText(reference)
                          .then(() => props.onLog(`Copied sprite reference: ${reference}`))
                          .catch((reason) => props.onLog(`Copy failed: ${String(reason)}`, 'warn'));
                      }}>
                        Copy Sprite Reference
                      </button>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
