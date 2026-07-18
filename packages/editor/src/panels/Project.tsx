import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Bone,
  Box,
  FileCode2,
  FileJson2,
  Film,
  Folder,
  Image as ImageIcon,
  Layers3,
  Map as MapIcon,
  Music,
  Package,
  Palette,
  Upload,
  Workflow,
} from 'lucide-react';
import { listScenes, sceneFileName, type SceneMeta } from '../sceneLibrary';
import {
  listScripts,
  openScriptInIde,
  refreshScripts,
  type ScriptAsset,
} from '../scriptLibrary';
import {
  listAssetFolders,
  listSprites,
  refreshSprites,
  spriteAssetUrl,
  type SpriteAsset,
} from '../spriteLibrary';
import { subscribePing } from '../pingBus';
import {
  listProjectFiles,
  refreshProjectFiles,
  toggleProjectAudioPreview,
  type ProjectFileAsset,
} from '../projectAssets';
import {
  formatAssetImportSummary,
  importProjectAssetFiles,
  importProjectAssetsFromPicker,
  setActiveAssetImportFolder,
} from '../assetImport';

const STATIC_FOLDERS = [
  'Assets',
  'Assets/Scenes',
  'Assets/Animations',
  'Assets/Timelines',
  'Assets/Audio',
  'Assets/Prefabs',
  'Assets/Scripts',
  'Assets/Materials',
  'Assets/Shaders',
  'Assets/Models',
  'Assets/Sprites',
];

type AssetItem = {
  folder: string;
  name: string;
  kind: 'animation' | 'animator-controller' | 'avatar-mask' | 'timeline' | 'audio' | 'model' | 'prefab' | 'script' | 'material' | 'shader' | 'scene' | 'sprite' | 'sprite-atlas' | 'texture' | 'spine';
  spawn: string | null;
  icon: ReactNode;
  sceneName?: string;
  script?: ScriptAsset;
  spriteId?: string;
  thumbUrl?: string | null;
};

export function Project(props: {
  activeScene: string | null;
  sceneTick: number;
  onInstantiatePrefab: (path: string) => void;
  onInstantiateModel: (path: string) => void;
  onInstantiateSprite: (path: string) => void;
  onOpenScene: (name: string) => void;
  onOpenMaterial: (path: string) => void;
  onOpenShader: (path: string) => void;
  onOpenAnimator: (path: string) => void;
  onOpenAnimation: (path: string) => void;
  onOpenTimeline: (path: string) => void;
  onOpenSprite: (path: string) => void;
  onOpenSpriteAtlas: (path: string) => void;
  onRenameScene: (oldName: string, newName: string) => boolean | Promise<boolean>;
  onLog?: (msg: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [folder, setFolder] = useState('Assets/Scenes');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [ctx, setCtx] = useState<{ x: number; y: number; asset: AssetItem } | null>(null);
  const [libTick, setLibTick] = useState(0);
  const [pingKey, setPingKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const lastClick = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    void Promise.all([refreshScripts(), refreshSprites(), refreshProjectFiles()])
      .then(() => setLibTick((t) => t + 1));
  }, [props.sceneTick]);

  useEffect(() => {
    setActiveAssetImportFolder(folder);
  }, [folder]);

  useEffect(() => {
    return subscribePing((e) => {
      if (e.kind !== 'asset') return;
      const sprites = listSprites();
      const projectAsset = listProjectFiles().find((asset) => asset.id === e.assetId);
      const hit = sprites.find((s) => s.id === (e.spriteId ?? e.assetId));
      if (hit) setFolder(hit.folder);
      else if (projectAsset) setFolder(projectAsset.folder);
      else if (e.folder) setFolder(e.folder);
      const key = hit?.name ?? projectAsset?.name ?? e.assetId.split('/').pop() ?? e.assetId;
      setSelected(key);
      setPingKey(key);
      window.setTimeout(() => setPingKey((cur) => (cur === key ? null : cur)), 900);
      requestAnimationFrame(() => {
        cardRefs.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }, []);

  const scenes: SceneMeta[] = useMemo(() => listScenes(), [props.sceneTick, props.activeScene]);
  const scripts = useMemo(() => listScripts(), [libTick, props.sceneTick]);
  const sprites = useMemo(() => listSprites(), [libTick, props.sceneTick]);
  const diskFolders = useMemo(() => listAssetFolders(), [libTick, props.sceneTick]);
  const projectFiles = useMemo(() => listProjectFiles(), [libTick, props.sceneTick]);

  const folders = useMemo(() => {
    const set = new Set([
      ...STATIC_FOLDERS,
      ...diskFolders,
      ...projectFiles.map((asset) => asset.folder),
    ]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [diskFolders, projectFiles]);

  const sceneAssets: AssetItem[] = scenes.map((s) => ({
    folder: 'Assets/Scenes',
    name: sceneFileName(s.name),
    kind: 'scene',
    spawn: null,
    icon: <MapIcon size={24} strokeWidth={1.4} aria-hidden="true" />,
    sceneName: s.name,
  }));

  const scriptAssets: AssetItem[] = scripts.map((s) => ({
    folder: s.folder,
    name: s.name,
    kind: 'script',
    spawn: null,
    icon: <FileCode2 size={24} strokeWidth={1.4} aria-hidden="true" />,
    script: s,
  }));

  const spriteAssets: AssetItem[] = sprites.map((s: SpriteAsset) => ({
    folder: s.folder,
    name: s.name,
    kind: 'sprite' as const,
    spawn: null,
    icon: <ImageIcon size={24} strokeWidth={1.4} aria-hidden="true" />,
    spriteId: s.id,
    thumbUrl: spriteAssetUrl(s.id),
  }));

  const spriteTexturePaths = new Set(
    sprites.map((sprite) => (sprite.textureId ?? sprite.relPath).toLowerCase()),
  );
  const authoringAssets: AssetItem[] = projectFiles
    // Sprite textures already have richer cards. Keep every other recognized
    // texture visible even when the browser cannot decode it as a Sprite.
    .filter((asset) => asset.kind !== 'texture' || !spriteTexturePaths.has(asset.relPath.toLowerCase()))
    .map((asset: ProjectFileAsset) => {
    const kind: AssetItem['kind'] = asset.kind === 'animation'
      ? 'animation'
      : asset.kind === 'animator-controller'
        ? 'animator-controller'
      : asset.kind === 'avatar-mask'
        ? 'avatar-mask'
      : asset.kind === 'timeline'
        ? 'timeline'
      : asset.kind === 'sprite-atlas'
        ? 'sprite-atlas'
      : asset.kind === 'texture'
        ? 'texture'
      : asset.kind === 'audio'
        ? 'audio'
      : asset.kind === 'material'
        ? 'material'
        : asset.kind === 'shader'
          ? 'shader'
        : asset.kind === 'model'
          ? 'model'
        : asset.kind === 'prefab'
          ? 'prefab'
          : 'spine';
    return {
      folder: asset.folder,
      name: asset.name,
      kind,
      spawn: null,
      icon: kind === 'texture'
        ? <ImageIcon size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'shader'
        ? <FileCode2 size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'animator-controller'
        ? <Workflow size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'avatar-mask'
        ? <Bone size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'timeline'
        ? <Film size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'sprite-atlas'
        ? <Layers3 size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'audio'
        ? <Music size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'animation'
        ? <Film size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'material'
          ? <Palette size={24} strokeWidth={1.4} aria-hidden="true" />
          : kind === 'model'
            ? <Box size={24} strokeWidth={1.4} aria-hidden="true" />
            : kind === 'prefab'
            ? <Package size={24} strokeWidth={1.4} aria-hidden="true" />
            : asset.kind === 'spine-atlas'
              ? <FileJson2 size={24} strokeWidth={1.4} aria-hidden="true" />
              : <Bone size={24} strokeWidth={1.4} aria-hidden="true" />,
      spriteId: asset.id,
    };
  });

  const allAssets: AssetItem[] = [
    ...sceneAssets,
    ...scriptAssets,
    ...spriteAssets,
    ...authoringAssets,
  ];
  const visible =
    folder === 'Assets'
      ? allAssets
      : allAssets.filter((a) => a.folder === folder);

  const beginRename = (sceneName: string) => {
    setEditing(sceneName);
    setEditValue(sceneName);
    setCtx(null);
  };

  const commitRename = () => {
    if (editing == null) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === editing) {
      setEditing(null);
      return;
    }
    const old = editing;
    setEditing(null);
    void Promise.resolve(props.onRenameScene(old, editValue)).then((ok) => {
      if (ok) {
        const base = trimmed.replace(/\.mscene$/i, '');
        setSelected(sceneFileName(base));
      }
    });
  };

  const openScript = (a: AssetItem) => {
    if (!a.script) return;
    void openScriptInIde(a.script).then((ok) => {
      if (ok) props.onLog?.(`已在 IDE 打开 ${a.script!.name}`);
      else props.onLog?.(`无法打开 ${a.name}（请确认 cursor/code CLI 可用）`, 'warn');
    });
  };

  const onCardClick = (a: AssetItem, ev: MouseEvent) => {
    if (editing) return;
    setSelected(a.name);

    if (a.kind === 'scene' && a.sceneName) {
      const now = Date.now();
      const key = a.name;
      const slow =
        lastClick.current.key === key &&
        now - lastClick.current.t > 250 &&
        now - lastClick.current.t < 700;
      lastClick.current = { key, t: now };
      if (slow) beginRename(a.sceneName);
      void ev;
    }
  };

  const onCardDoubleClick = (a: AssetItem) => {
    if (a.kind === 'scene' && a.sceneName) {
      props.onOpenScene(a.sceneName);
      return;
    }
    if (a.kind === 'script') {
      openScript(a);
      return;
    }
    if (a.kind === 'sprite' && a.spriteId) {
      props.onOpenSprite(a.spriteId);
      return;
    }
    if (a.kind === 'sprite-atlas' && a.spriteId) {
      props.onOpenSpriteAtlas(a.spriteId);
      return;
    }
    if (a.kind === 'material' && a.spriteId) {
      props.onOpenMaterial(a.spriteId);
      return;
    }
    if (a.kind === 'shader' && a.spriteId) {
      props.onOpenShader(a.spriteId);
      return;
    }
    if ((a.kind === 'animator-controller' || a.kind === 'avatar-mask') && a.spriteId) {
      props.onOpenAnimator(a.spriteId);
      return;
    }
    if (a.kind === 'animation' && a.spriteId) {
      props.onOpenAnimation(a.spriteId);
      return;
    }
    if (a.kind === 'timeline' && a.spriteId) {
      props.onOpenTimeline(a.spriteId);
      return;
    }
    if (a.kind === 'audio' && a.spriteId) {
      void toggleProjectAudioPreview(a.spriteId)
        .then((state) => props.onLog?.(`${state === 'playing' ? 'Previewing' : 'Stopped'} ${a.name}`))
        .catch((error) => props.onLog?.(`Audio preview failed: ${String(error)}`, 'error'));
      return;
    }
    if (a.kind === 'prefab' && a.spriteId) {
      props.onInstantiatePrefab(a.spriteId);
      return;
    }
    if (a.kind === 'model' && a.spriteId) {
      props.onInstantiateModel(a.spriteId);
      return;
    }
  };

  const onContext = (e: MouseEvent, a: AssetItem) => {
    e.preventDefault();
    if (a.kind !== 'sprite' && a.kind !== 'scene') return;
    setSelected(a.name);
    setCtx({ x: e.clientX, y: e.clientY, asset: a });
  };

  const completeImport = async (files?: Iterable<File>) => {
    if (importing) return;
    setImporting(true);
    try {
      const result = files
        ? await importProjectAssetFiles(files, folder)
        : await importProjectAssetsFromPicker(folder);
      const summary = formatAssetImportSummary(result, folder);
      if (summary) {
        props.onLog?.(summary, result.rejected.length > 0 ? 'warn' : 'info');
      }
      if (result.imported.length > 0) setLibTick((tick) => tick + 1);
    } catch (error) {
      props.onLog?.(
        `Asset import failed: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      setImporting(false);
      setDraggingFiles(false);
    }
  };

  const onFileDrop = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    void completeImport(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="project-layout" ref={rootRef} tabIndex={0}>
      <div className="project-tree">
        {folders.map((f) => (
          <div
            key={f}
            className={`row${folder === f ? ' active' : ''}`}
            onClick={() => setFolder(f)}
          >
            <Folder size={13} strokeWidth={1.6} aria-hidden="true" />
            <span>{f.replace('Assets/', '') || 'Assets'}</span>
          </div>
        ))}
      </div>
      <div className="project-content">
        <div className="project-toolbar">
          <button
            type="button"
            className="project-import-button"
            disabled={importing}
            onClick={() => void completeImport()}
          >
            <Upload size={13} aria-hidden="true" />
            {importing ? 'Importing...' : 'Import'}
          </button>
          <span className="project-folder-path" title={folder}>{folder}</span>
        </div>
        <div
          className={`project-grid${draggingFiles ? ' file-drop-active' : ''}`}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes('Files')) setDraggingFiles(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDraggingFiles(false);
            }
          }}
          onDrop={onFileDrop}
        >
          {visible.length === 0 && folder === 'Assets/Scenes' && (
            <div className="project-empty">
              No scenes yet. Create one from File &gt; New Scene.
            </div>
          )}
          {visible.length === 0 && folder === 'Assets/Scripts' && (
            <div className="project-empty">
              No scripts yet. Create a Behaviour under Assets/Scripts.
            </div>
          )}
          {visible.length === 0 && folder !== 'Assets/Scenes' && folder !== 'Assets/Scripts' && (
            <div className="project-empty">
              Drop supported files here or use Import. Existing files are kept; name collisions receive a numeric suffix.
            </div>
          )}
          {visible.map((a) => {
          const isActiveScene = a.kind === 'scene' && a.sceneName === props.activeScene;
          const isEditing = a.kind === 'scene' && a.sceneName != null && editing === a.sceneName;
          return (
            <div
              key={`${a.folder}/${a.kind}/${a.spriteId ?? a.script?.id ?? a.name}`}
              ref={(el) => {
                if (el) cardRefs.current.set(a.name, el);
                else cardRefs.current.delete(a.name);
              }}
              className={[
                'asset-card',
                selected === a.name ? 'selected' : '',
                isActiveScene ? 'active-scene' : '',
                pingKey === a.name ? 'ping' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="button"
              tabIndex={0}
              aria-label={`${a.name} (${a.kind})`}
              draggable={
                a.kind === 'sprite'
                || a.kind === 'spine'
                || a.kind === 'animation'
                || a.kind === 'animator-controller'
                || a.kind === 'avatar-mask'
                || a.kind === 'timeline'
                || a.kind === 'sprite-atlas'
                || a.kind === 'texture'
                || a.kind === 'audio'
                || a.kind === 'material'
                || a.kind === 'shader'
                || a.kind === 'model'
                || a.kind === 'prefab'
              }
              onDragStart={(e) => {
                if (
                  a.kind !== 'sprite'
                  && a.kind !== 'spine'
                  && a.kind !== 'animation'
                  && a.kind !== 'animator-controller'
                  && a.kind !== 'avatar-mask'
                  && a.kind !== 'timeline'
                  && a.kind !== 'sprite-atlas'
                  && a.kind !== 'texture'
                  && a.kind !== 'audio'
                  && a.kind !== 'material'
                  && a.kind !== 'shader'
                  && a.kind !== 'model'
                  && a.kind !== 'prefab'
                ) return;
                const id = a.spriteId ?? a.name;
                if (a.kind === 'sprite') e.dataTransfer.setData('text/mengine-sprite', id);
                if (a.kind === 'prefab') e.dataTransfer.setData('text/mengine-prefab', id);
                e.dataTransfer.setData('text/mengine-asset', id);
                e.dataTransfer.setData('text/plain', id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={(e) => onCardClick(a, e)}
              onDoubleClick={() => onCardDoubleClick(a)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                onCardDoubleClick(a);
              }}
              onContextMenu={(e) => onContext(e, a)}
              title={
                a.kind === 'scene'
                  ? '双击打开 · F2 / 慢双击重命名'
                  : a.kind === 'script'
                    ? '双击在 IDE 中打开'
                    : a.kind === 'sprite'
                      ? `拖到 Scene/Hierarchy 创建 SpriteRenderer · 双击编辑 · ${a.spriteId}`
                      : a.kind === 'spine'
                        ? `拖到 Spine Skeleton 资源字段 · ${a.spriteId}`
                        : a.kind === 'animation'
                          ? `Animation Clip · ${a.spriteId}`
                          : a.kind === 'sprite-atlas'
                            ? `Sprite Atlas - double-click to edit - ${a.spriteId}`
                          : a.kind === 'texture'
                            ? `Environment Texture - drag to Environment Light - ${a.spriteId}`
                          : a.kind === 'animator-controller'
                            ? `Animator Controller · ${a.spriteId}`
                          : a.kind === 'avatar-mask'
                            ? `Avatar Mask - double-click to edit - ${a.spriteId}`
                          : a.kind === 'timeline'
                            ? `Timeline Sequencer - double-click to edit - ${a.spriteId}`
                          : a.kind === 'material'
                            ? `Material Asset · ${a.spriteId}`
                            : a.kind === 'model'
                              ? `3D Model · double-click to instantiate · ${a.spriteId}`
                              : a.kind === 'prefab'
                              ? `Prefab Asset · ${a.spriteId}`
                              : a.spawn
                                ? '双击实例化'
                                : a.name
              }
            >
              <div className="asset-thumb">
                {a.thumbUrl ? (
                  <img src={a.thumbUrl} alt="" draggable={false} />
                ) : (
                  a.icon
                )}
              </div>
              {isEditing ? (
                <input
                  className="asset-rename"
                  autoFocus
                  value={editValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <div className="asset-name">{a.name}</div>
              )}
              {isActiveScene && !isEditing && <div className="asset-badge">打开中</div>}
            </div>
          );
          })}
          {draggingFiles && (
            <div className="project-drop-overlay" aria-hidden="true">
              Drop to import into {folder}
            </div>
          )}
        </div>
      </div>

      {ctx &&
        createPortal(
          <div
            className="hier-ctx"
            style={{ left: ctx.x, top: ctx.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ctx.asset.kind === 'sprite' && ctx.asset.spriteId && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onInstantiateSprite(ctx.asset.spriteId!);
                    setCtx(null);
                  }}
                >
                  Create Sprite in Scene
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onOpenSprite(ctx.asset.spriteId!);
                    setCtx(null);
                  }}
                >
                  Open Sprite Editor
                </button>
              </>
            )}
            {ctx.asset.kind === 'scene' && ctx.asset.sceneName && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onOpenScene(ctx.asset.sceneName!);
                    setCtx(null);
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    beginRename(ctx.asset.sceneName!);
                  }}
                >
                  Rename <span className="hint">F2</span>
                </button>
              </>
            )}
            <div className="sep" />
            <button type="button" onPointerDown={() => setCtx(null)}>
              Cancel
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
