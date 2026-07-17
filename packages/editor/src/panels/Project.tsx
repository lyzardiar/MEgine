import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
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
  type ProjectFileAsset,
} from '../projectAssets';

const STATIC_FOLDERS = [
  'Assets',
  'Assets/Scenes',
  'Assets/Animations',
  'Assets/Prefabs',
  'Assets/Scripts',
  'Assets/Materials',
  'Assets/Sprites',
];

type AssetItem = {
  folder: string;
  name: string;
  kind: 'animation' | 'prefab' | 'script' | 'material' | 'scene' | 'sprite' | 'spine';
  spawn: string | null;
  icon: string;
  sceneName?: string;
  script?: ScriptAsset;
  spriteId?: string;
  thumbUrl?: string | null;
};

export function Project(props: {
  activeScene: string | null;
  sceneTick: number;
  onSpawnPrefab: (name: string) => void;
  onOpenScene: (name: string) => void;
  onRenameScene: (oldName: string, newName: string) => boolean | Promise<boolean>;
  onLog?: (msg: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [folder, setFolder] = useState('Assets/Scenes');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [ctx, setCtx] = useState<{ x: number; y: number; sceneName: string } | null>(null);
  const [libTick, setLibTick] = useState(0);
  const [pingKey, setPingKey] = useState<string | null>(null);
  const lastClick = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    void Promise.all([refreshScripts(), refreshSprites(), refreshProjectFiles()])
      .then(() => setLibTick((t) => t + 1));
  }, [props.sceneTick]);

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
    icon: '🗺️',
    sceneName: s.name,
  }));

  const scriptAssets: AssetItem[] = scripts.map((s) => ({
    folder: s.folder,
    name: s.name,
    kind: 'script',
    spawn: null,
    icon: '📄',
    script: s,
  }));

  const spriteAssets: AssetItem[] = sprites.map((s: SpriteAsset) => ({
    folder: s.folder,
    name: s.name,
    kind: 'sprite' as const,
    spawn: null,
    icon: '🖼️',
    spriteId: s.id,
    thumbUrl: spriteAssetUrl(s.id),
  }));

  const authoringAssets: AssetItem[] = projectFiles.map((asset: ProjectFileAsset) => {
    const kind: AssetItem['kind'] = asset.kind === 'animation'
      ? 'animation'
      : asset.kind === 'material'
        ? 'material'
        : asset.kind === 'prefab'
          ? 'prefab'
          : 'spine';
    return {
      folder: asset.folder,
      name: asset.name,
      kind,
      spawn: null,
      icon: kind === 'animation'
        ? '◆'
        : kind === 'material'
          ? '🎨'
          : kind === 'prefab'
            ? '◇'
            : asset.kind === 'spine-atlas'
              ? '📚'
              : '🦴',
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
    if (a.spawn) props.onSpawnPrefab(a.spawn);
  };

  const onContext = (e: MouseEvent, a: AssetItem) => {
    e.preventDefault();
    if (a.kind === 'scene' && a.sceneName) {
      setSelected(a.name);
      setCtx({ x: e.clientX, y: e.clientY, sceneName: a.sceneName });
    }
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
            📁 {f.replace('Assets/', '') || 'Assets'}
          </div>
        ))}
      </div>
      <div className="project-grid">
        {visible.length === 0 && folder === 'Assets/Scenes' && (
          <div className="project-empty">
            还没有场景。用 File → New Scene 创建；选中后 F2 / 慢双击名称 / 右键 Rename。
          </div>
        )}
        {visible.length === 0 && folder === 'Assets/Scripts' && (
          <div className="project-empty">
            暂无脚本。Behaviour 放在 packages/editor/src/behaviours/。
          </div>
        )}
        {visible.length === 0 && (folder === 'Assets/Sprites' || folder.startsWith('Assets/')) && (
          <div className="project-empty">此文件夹暂无资源。PNG 放到 project/Assets 下即可。</div>
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
              draggable={
                a.kind === 'sprite'
                || a.kind === 'spine'
                || a.kind === 'animation'
                || a.kind === 'material'
                || a.kind === 'prefab'
              }
              onDragStart={(e) => {
                if (
                  a.kind !== 'sprite'
                  && a.kind !== 'spine'
                  && a.kind !== 'animation'
                  && a.kind !== 'material'
                  && a.kind !== 'prefab'
                ) return;
                const id = a.spriteId ?? a.name;
                if (a.kind === 'sprite') e.dataTransfer.setData('text/mengine-sprite', id);
                e.dataTransfer.setData('text/mengine-asset', id);
                e.dataTransfer.setData('text/plain', id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={(e) => onCardClick(a, e)}
              onDoubleClick={() => onCardDoubleClick(a)}
              onContextMenu={(e) => onContext(e, a)}
              title={
                a.kind === 'scene'
                  ? '双击打开 · F2 / 慢双击重命名'
                  : a.kind === 'script'
                    ? '双击在 IDE 中打开'
                    : a.kind === 'sprite'
                      ? `拖到 Image.Sprite · ${a.spriteId}`
                      : a.kind === 'spine'
                        ? `拖到 Spine Skeleton 资源字段 · ${a.spriteId}`
                        : a.kind === 'animation'
                          ? `Animation Clip · ${a.spriteId}`
                          : a.kind === 'material'
                            ? `Material Asset · ${a.spriteId}`
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
      </div>

      {ctx &&
        createPortal(
          <div
            className="hier-ctx"
            style={{ left: ctx.x, top: ctx.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onOpenScene(ctx.sceneName);
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
                beginRename(ctx.sceneName);
              }}
            >
              Rename <span className="hint">F2</span>
            </button>
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
