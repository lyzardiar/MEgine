import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  createEditorStore,
  type EditorMode,
  type GameAspect,
  type GameOrientation,
  type GizmoMode,
} from './store';
import { getBehaviour } from '@mengine/behaviour';
import {
  getActiveSceneName,
  initSceneLibrary,
  isDiskBackend,
  listScenes,
  normalizeSceneName,
  readSceneJson,
  renameScene,
  sceneExists,
  sceneFileName,
  setActiveSceneName,
  setEditorPrefs,
  writeScene,
} from './sceneLibrary';
import { MenuBar } from './panels/MenuBar';
import { ToolBar } from './panels/ToolBar';
import { Hierarchy } from './panels/Hierarchy';
import { Inspector } from './panels/Inspector';
import { Project } from './panels/Project';
import { Console } from './panels/Console';
import { Timeline } from './panels/Timeline';
import { AnimatorEditor, OPEN_ANIMATOR_EVENT, openAnimatorAsset } from './panels/Animator';
import { BuildSettings } from './panels/BuildSettings';
import { ProjectSettings } from './panels/ProjectSettings';
import {
  MaterialEditor,
  OPEN_MATERIAL_EVENT,
  PROJECT_ASSETS_CHANGED_EVENT,
  openMaterialAsset,
} from './panels/Material';
import {
  OPEN_SURFACE_SHADER_EVENT,
  SurfaceShaderEditor,
  openSurfaceShaderAsset,
} from './panels/SurfaceShader';
import { Viewport } from './panels/Viewport';
import {
  OPEN_SPRITE_EDITOR_EVENT,
  SpriteEditor,
  openSpriteAsset,
} from './panels/SpriteEditor';
import {
  OPEN_SPRITE_ATLAS_EVENT,
  SpriteAtlasEditor,
  openSpriteAtlasAsset,
} from './panels/SpriteAtlasEditor';
import { DockWorkspace, type PanelKind } from './panels/DockWorkspace';
import { EditorWindowHost } from './editorWindow';
import { resolveUnityAction } from './panels/uiFieldEditors';
import { refreshSprites } from './spriteLibrary';
import { combineMarqueeSelection } from './marqueeSelection';
import { instantiateProjectPrefab } from './prefabWorkflow';
import { isDesktopEditor } from './transport/editorTransport';
import type { ToolHandleOrientation, ToolPivotMode } from './editorTool';
import { loadSortingLayers, SORTING_LAYERS_CHANGED_EVENT } from './sortingLayers';
import './editorWindow'; // MenuItem side-effects

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function allowsEditorHistoryShortcut(el: EventTarget | null) {
  if (!isTypingTarget(el)) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['text', 'search', 'password', 'email', 'url', 'tel'].includes(el.type);
}

function askSceneName(title: string, initial: string): string | null {
  const raw = window.prompt(title, initial);
  if (raw == null) return null;
  return normalizeSceneName(raw);
}

const ASPECTS: GameAspect[] = ['free', '16:9', '16:10', '4:3', '1:1'];

function parseGameAspect(v: unknown): GameAspect | null {
  return typeof v === 'string' && (ASPECTS as string[]).includes(v) ? (v as GameAspect) : null;
}

function parseGameOrientation(v: unknown): GameOrientation | null {
  return v === 'landscape' || v === 'portrait' ? v : null;
}

type WorkspaceSyncMessage =
  | { type: 'request-scene'; sender: string }
  | {
      type: 'scene-state';
      sender: string;
      timestamp: number;
      mode: EditorMode;
      sceneName: string | null;
      sceneJson: string;
      selectedIds: number[];
      logs: string[];
      dirty: boolean;
    };

const WORKSPACE_CHANNEL = 'mengine.editor.workspace.v1';

export function App(props: { detachedPanel?: PanelKind | null } = {}) {
  const store = useMemo(() => createEditorStore(), []);
  const [snap, setSnap] = useState<WorldSnapshotView & { selectedIds?: number[] }>(store.snapshot());
  const [mode, setMode] = useState<EditorMode>('edit');
  const [gizmo, setGizmo] = useState<GizmoMode>('translate');
  const [pivotMode, setPivotMode] = useState<ToolPivotMode>('pivot');
  const [handleOrientation, setHandleOrientation] = useState<ToolHandleOrientation>('local');
  const [viewTab, setViewTab] = useState<'scene' | 'game'>('scene');
  const [gameAspect, setGameAspect] = useState(store.gameAspect);
  const [gameOrientation, setGameOrientation] = useState(store.gameOrientation);
  const [hierFilter, setHierFilter] = useState('');
  const [pendingRenameId, setPendingRenameId] = useState<number | null>(null);
  const [treeTick, setTreeTick] = useState(0);
  const [sceneTick, setSceneTick] = useState(0);
  const [sceneName, setSceneName] = useState<string | null>(null);
  const [materialPath, setMaterialPath] = useState<string | null>(null);
  const [materialDirty, setMaterialDirty] = useState(false);
  const [shaderPath, setShaderPath] = useState<string | null>(null);
  const [shaderDirty, setShaderDirty] = useState(false);
  const [animatorPath, setAnimatorPath] = useState<string | null>(null);
  const [animatorDirty, setAnimatorDirty] = useState(false);
  const [spritePath, setSpritePath] = useState<string | null>(null);
  const [spriteDirty, setSpriteDirty] = useState(false);
  const [spriteAtlasPath, setSpriteAtlasPath] = useState<string | null>(null);
  const [spriteAtlasDirty, setSpriteAtlasDirty] = useState(false);
  const [animationDirty, setAnimationDirty] = useState(false);
  const [projectSettingsDirty, setProjectSettingsDirty] = useState(false);
  const [sceneDirty, setSceneDirty] = useState(false);
  const dirtyPanels = useMemo(() => {
    const dirty = new Set<PanelKind>();
    if (materialDirty) dirty.add('material');
    if (shaderDirty) dirty.add('shader');
    if (animatorDirty) dirty.add('animator');
    if (spriteDirty) dirty.add('spriteEditor');
    if (spriteAtlasDirty) dirty.add('spriteAtlas');
    if (animationDirty) dirty.add('timeline');
    if (projectSettingsDirty) dirty.add('projectSettings');
    return dirty;
  }, [animationDirty, animatorDirty, materialDirty, projectSettingsDirty, shaderDirty, spriteAtlasDirty, spriteDirty]);
  const [logs, setLogs] = useState<string[]>([
    'MEngine Editor',
    '场景落盘：packages/editor/project/Assets/Scenes/*.mscene',
    '新建会弹出命名；双击 .mscene 打开；Ctrl+S 保存',
  ]);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const logEnd = useRef(0);
  const logsRef = useRef(logs);
  const booted = useRef(false);
  const sceneNameRef = useRef<string | null>(null);
  const sceneDirtyRef = useRef(false);
  const savedSceneFingerprint = useRef(store.sceneContentFingerprint());
  const remoteSceneFingerprint = useRef(savedSceneFingerprint.current);
  const remoteSceneDirty = useRef(false);
  const syncSender = useRef(crypto.randomUUID());
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const syncTimer = useRef<number | null>(null);
  const applyingRemote = useRef(false);
  const lastRemoteTimestamp = useRef(0);
  const syncReady = useRef(!props.detachedPanel);
  sceneNameRef.current = sceneName;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const dirty = props.detachedPanel
        ? materialDirty || shaderDirty || animationDirty || animatorDirty || spriteDirty || spriteAtlasDirty
        : sceneDirty || materialDirty || shaderDirty || animationDirty || animatorDirty || spriteDirty || spriteAtlasDirty;
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [animationDirty, animatorDirty, materialDirty, props.detachedPanel, sceneDirty, shaderDirty, spriteAtlasDirty, spriteDirty]);

  const broadcastScene = (immediate = false) => {
    const channel = syncChannel.current;
    if (!channel || !syncReady.current || applyingRemote.current || !booted.current) return;
    const send = () => {
      syncTimer.current = null;
      channel.postMessage({
        type: 'scene-state',
        sender: syncSender.current,
        timestamp: Date.now(),
        sceneName: sceneNameRef.current,
        mode: store.mode,
        sceneJson: store.saveSessionSceneJson(sceneNameRef.current ?? 'Untitled'),
        selectedIds: store.selectedIds,
        logs: logsRef.current,
        dirty: sceneDirtyRef.current,
      } satisfies WorkspaceSyncMessage);
    };
    if (immediate) {
      if (syncTimer.current != null) window.clearTimeout(syncTimer.current);
      send();
      return;
    }
    if (syncTimer.current == null) syncTimer.current = window.setTimeout(send, 33);
  };

  const updateSceneDirty = () => {
    if (store.mode !== 'edit') return;
    const current = store.sceneContentFingerprint();
    const next = props.detachedPanel
      ? (current === remoteSceneFingerprint.current ? remoteSceneDirty.current : true)
      : current !== savedSceneFingerprint.current;
    sceneDirtyRef.current = next;
    setSceneDirty(next);
  };

  const refresh = (publish = true) => {
    setSnap(store.snapshot());
    setMode(store.mode);
    setGizmo(store.gizmo);
    setSelected(store.selected);
    setSelectedIds(store.selectedIds);
    setGameAspect(store.gameAspect);
    setGameOrientation(store.gameOrientation);
    setTreeTick((t) => t + 1);
    updateSceneDirty();
    if (publish) broadcastScene();
  };

  const bumpScenes = () => setSceneTick((t) => t + 1);

  useEffect(() => {
    const openMaterial = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path === 'string' && path) setMaterialPath(path);
    };
    const openShader = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path === 'string' && path) setShaderPath(path);
    };
    const openAnimator = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path === 'string' && path) setAnimatorPath(path);
    };
    const openSprite = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      if (spriteDirty && path !== spritePath
        && !window.confirm('Sprite import settings have unsaved changes. Discard them and open another texture?')) return;
      setSpritePath(path);
    };
    const openSpriteAtlas = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      if (spriteAtlasDirty && path !== spriteAtlasPath
        && !window.confirm('Sprite Atlas has unsaved changes. Discard them and open another atlas?')) return;
      setSpriteAtlasPath(path);
    };
    const assetsChanged = () => bumpScenes();
    window.addEventListener(OPEN_MATERIAL_EVENT, openMaterial);
    window.addEventListener(OPEN_SURFACE_SHADER_EVENT, openShader);
    window.addEventListener(OPEN_ANIMATOR_EVENT, openAnimator);
    window.addEventListener(OPEN_SPRITE_EDITOR_EVENT, openSprite);
    window.addEventListener(OPEN_SPRITE_ATLAS_EVENT, openSpriteAtlas);
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, assetsChanged);
    return () => {
      window.removeEventListener(OPEN_MATERIAL_EVENT, openMaterial);
      window.removeEventListener(OPEN_SURFACE_SHADER_EVENT, openShader);
      window.removeEventListener(OPEN_ANIMATOR_EVENT, openAnimator);
      window.removeEventListener(OPEN_SPRITE_EDITOR_EVENT, openSprite);
      window.removeEventListener(OPEN_SPRITE_ATLAS_EVENT, openSpriteAtlas);
      window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, assetsChanged);
    };
  }, [spriteAtlasDirty, spriteAtlasPath, spriteDirty, spritePath]);

  const log = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const prefix = level === 'info' ? '' : level === 'warn' ? '[Warn] ' : '[Error] ';
    const next = [...logsRef.current, `${prefix}${msg}`].slice(-300);
    logsRef.current = next;
    logEnd.current = next.length;
    setLogs(next);
    broadcastScene();
  };

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
    syncChannel.current = channel;
    channel.onmessage = (event: MessageEvent<WorkspaceSyncMessage>) => {
      const message = event.data;
      if (!message || message.sender === syncSender.current) return;
      if (message.type === 'request-scene') {
        broadcastScene(true);
        return;
      }
      if (message.type !== 'scene-state' || message.timestamp < lastRemoteTimestamp.current) return;
      try {
        applyingRemote.current = true;
        syncReady.current = true;
        lastRemoteTimestamp.current = message.timestamp;
        store.loadRemoteSceneJson(message.sceneJson, message.mode);
        store.selectMany(message.selectedIds, 'replace');
        const remoteFingerprint = store.sceneContentFingerprint();
        if (props.detachedPanel) {
          remoteSceneFingerprint.current = remoteFingerprint;
          remoteSceneDirty.current = message.dirty === true;
          sceneDirtyRef.current = remoteSceneDirty.current;
          setSceneDirty(remoteSceneDirty.current);
        } else {
          if (message.dirty === false) savedSceneFingerprint.current = remoteFingerprint;
          const dirty = remoteFingerprint !== savedSceneFingerprint.current;
          sceneDirtyRef.current = dirty;
          setSceneDirty(dirty);
        }
        setSceneName(message.sceneName);
        setSnap(store.snapshot());
        setMode(store.mode);
        setGizmo(store.gizmo);
        setSelected(store.selected);
        setSelectedIds(store.selectedIds);
        setGameAspect(store.gameAspect);
        setGameOrientation(store.gameOrientation);
        if (Array.isArray(message.logs)) {
          logsRef.current = message.logs;
          logEnd.current = message.logs.length;
          setLogs(message.logs);
        }
        setTreeTick((tick) => tick + 1);
      } catch (reason) {
        console.error('Failed to apply detached-window scene state', reason);
      } finally {
        applyingRemote.current = false;
      }
    };
    if (props.detachedPanel) {
      channel.postMessage({
        type: 'request-scene',
        sender: syncSender.current,
      } satisfies WorkspaceSyncMessage);
    }
    const fallback = window.setTimeout(() => {
      syncReady.current = true;
    }, 1500);
    return () => {
      window.clearTimeout(fallback);
      if (syncTimer.current != null) window.clearTimeout(syncTimer.current);
      syncChannel.current = null;
      channel.close();
    };
  }, [props.detachedPanel, store]);

  const confirmDiscardSceneChanges = (action: string) => (
    !sceneDirtyRef.current
    || window.confirm(`当前场景有未保存的修改。${action}将丢失这些修改，是否继续？`)
  );

  const openSceneByName = async (name: string, silent = false) => {
    const json = readSceneJson(name);
    if (!json) {
      if (!silent) log(`Scene not found: ${name}`, 'warn');
      return false;
    }
    if (!silent && !confirmDiscardSceneChanges(`打开 ${sceneFileName(name)}`)) return false;
    try {
      store.loadSceneJson(json);
      const openedFingerprint = store.sceneContentFingerprint();
      savedSceneFingerprint.current = openedFingerprint;
      if (props.detachedPanel) {
        remoteSceneFingerprint.current = openedFingerprint;
        remoteSceneDirty.current = false;
      }
      sceneDirtyRef.current = false;
      setSceneDirty(false);
      sceneNameRef.current = name;
      setSceneName(name);
      await setActiveSceneName(name);
      if (!silent) log(`Opened ${sceneFileName(name)}`);
      refresh(!props.detachedPanel);
      bumpScenes();
      return true;
    } catch (err) {
      log(`Failed to open scene: ${err}`, 'error');
      return false;
    }
  };

  const persistScene = async (name: string) => {
    try {
      const json = store.saveSceneJson(name);
      const savedFingerprint = store.sceneContentFingerprint();
      await writeScene(name, json);
      savedSceneFingerprint.current = savedFingerprint;
      if (props.detachedPanel) {
        remoteSceneFingerprint.current = savedFingerprint;
        remoteSceneDirty.current = false;
      }
      updateSceneDirty();
      sceneNameRef.current = name;
      setSceneName(name);
      bumpScenes();
      const where = isDiskBackend()
        ? 'project/Assets/Scenes'
        : 'localStorage（磁盘 API 不可用）';
      log(`Saved ${sceneFileName(name)} → ${where}`);
      return true;
    } catch (err) {
      log(`保存失败: ${err}`, 'error');
      return false;
    }
  };

  const saveSceneForBuild = async () => {
    const current = sceneNameRef.current;
    if (!current) {
      log('Build requires a named scene.', 'warn');
      return false;
    }
    return persistScene(current);
  };

  const saveScene = () => {
    const current = sceneNameRef.current;
    if (current) {
      void persistScene(current);
      return;
    }
    const name = askSceneName('保存场景 — 请输入名称', 'Untitled');
    if (!name) return;
    if (sceneExists(name) && !window.confirm(`场景「${name}」已存在，要覆盖吗？`)) return;
    void persistScene(name);
  };

  const saveSceneAs = () => {
    const name = askSceneName('另存为 — 请输入新名称', sceneNameRef.current ?? 'Untitled');
    if (!name) return;
    if (sceneExists(name) && name !== sceneNameRef.current) {
      if (!window.confirm(`场景「${name}」已存在，要覆盖吗？`)) return;
    }
    void persistScene(name);
  };

  const newScene = () => {
    const name = askSceneName('新建场景 — 请输入名称', 'NewScene');
    if (!name) return;
    if (sceneExists(name) && !window.confirm(`场景「${name}」已存在，要覆盖吗？`)) return;
    if (!confirmDiscardSceneChanges('新建场景')) return;
    store.newScene();
    void persistScene(name).then(() => refresh());
  };

  useEffect(() => {
    const title = `${sceneDirty ? '* ' : ''}${sceneName ? sceneFileName(sceneName) : 'Untitled'} — MEngine Editor`;
    document.title = props.detachedPanel ? `${props.detachedPanel} — ${title}` : title;
  }, [props.detachedPanel, sceneDirty, sceneName]);

  useEffect(() => {
    if (props.detachedPanel) return;
    if (!isDesktopEditor()) {
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        if (!sceneDirtyRef.current) return;
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      if (
        sceneDirtyRef.current
        && !window.confirm('当前场景有未保存的修改。关闭编辑器将丢失这些修改，是否继续？')
      ) {
        event.preventDefault();
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((error) => {
      console.error('Failed to register the editor close guard', error);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [props.detachedPanel]);

  const openSceneDialog = () => {
    const scenes = listScenes();
    if (!scenes.length) {
      log('还没有已保存的场景。先 File → New Scene 并命名。', 'warn');
      return;
    }
    const hint = scenes.map((s) => s.name).join(', ');
    const name = askSceneName(`打开场景（已有: ${hint}）`, scenes[0].name);
    if (!name) return;
    void openSceneByName(name);
  };

  const applyEditorPrefs = (prefs: { gameAspect?: string; gameOrientation?: string }) => {
    const aspect = parseGameAspect(prefs.gameAspect);
    const orient = parseGameOrientation(prefs.gameOrientation);
    if (aspect) store.setGameAspect(aspect);
    if (orient) store.setGameOrientation(orient);
  };

  const persistGameViewPrefs = () => {
    void setEditorPrefs({
      gameAspect: store.gameAspect,
      gameOrientation: store.gameOrientation,
    });
  };

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const { backend, migrated, prefs } = await initSceneLibrary();
      try {
        await loadSortingLayers();
      } catch (reason) {
        log(`Sorting layer settings could not be loaded: ${String(reason)}`, 'warn');
      }
      await refreshSprites();
      bumpScenes();
      // A detached panel is a view of the main editor's in-memory scene. It must
      // never restore the last saved scene from disk, otherwise its boot refresh
      // can broadcast stale data and overwrite unsaved edits in the main window.
      if (props.detachedPanel) {
        refresh(false);
        return;
      }
      if (backend === 'disk' || backend === 'desktop') {
        log('场景存储：磁盘 project/Assets/Scenes');
      } else {
        log('场景存储：localStorage（请用 Vite dev 启动以启用磁盘）', 'warn');
      }
      if (migrated > 0) {
        log(`已从浏览器迁移 ${migrated} 个场景到磁盘`);
      }
      const active = getActiveSceneName() ?? listScenes()[0]?.name;
      if (active && (await openSceneByName(active, true))) {
        log(`已恢复场景 ${sceneFileName(active)}`);
      }
      // 编辑器偏好覆盖场景里的值（改横竖屏无需 Ctrl+S）
      applyEditorPrefs(prefs);
      refresh();
    })();
  }, [props.detachedPanel, store]);

  useEffect(() => {
    const onChanged = () => refresh(false);
    window.addEventListener(SORTING_LAYERS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SORTING_LAYERS_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      // Edit 模式不要每帧 refresh，否则整树 60fps 重绘会卡死
      if (store.mode !== 'play') return;
      store.tick(1 / 60);
      refresh(!props.detachedPanel);
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [props.detachedPanel, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (
        allowsEditorHistoryShortcut(e.target)
        && ctrl
        && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        store.redo();
        refresh();
        return;
      }
      if (allowsEditorHistoryShortcut(e.target) && ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.undo();
        refresh();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'build' }));
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newScene();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveScene();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openSceneDialog();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        store.duplicateSelection();
        log('Duplicate');
        refresh();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.copySelection();
        log('Copy');
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        store.cutSelection();
        log('Cut');
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        store.paste();
        log('Paste');
        refresh();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        store.selectAllVisible();
        refresh();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelection();
        log('Delete');
        refresh();
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        const id = store.selected;
        if (id != null) setPendingRenameId(id);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        store.frameSelected();
        refresh();
        return;
      }
      const sceneViewportFocused =
        e.target instanceof HTMLCanvasElement && e.target.dataset.sceneViewport === 'true';
      if (sceneViewportFocused && e.key.startsWith('Arrow')) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        store.navigateVisible(-1);
        refresh();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        store.navigateVisible(1);
        refresh();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        store.navigateHorizontal(-1);
        refresh();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        store.navigateHorizontal(1);
        refresh();
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        store.setGizmo('translate');
        refresh();
      } else if (e.key === 'e' || e.key === 'E') {
        store.setGizmo('rotate');
        refresh();
      } else if (e.key === 'r' || e.key === 'R') {
        store.setGizmo('scale');
        refresh();
      } else if (e.key === 't' || e.key === 'T') {
        store.setGizmo('rect');
        refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const treeNodes = useMemo(() => store.getVisibleFlat(), [store, snap, treeTick]);

  return (
    <div className={`unity-shell${props.detachedPanel ? ' detached-shell' : ''}`}>
      <MenuBar
        onNew={newScene}
        onSave={saveScene}
        onSaveAs={saveSceneAs}
        onLoad={openSceneDialog}
        onUndo={() => {
          store.undo();
          refresh();
        }}
        onRedo={() => {
          store.redo();
          refresh();
        }}
        onDuplicate={() => {
          store.duplicateSelection();
          log('Duplicate');
          refresh();
        }}
        store={store}
        selectedIds={selectedIds}
        onRefresh={refresh}
        onLog={log}
      />

      <ToolBar
        mode={mode}
        gizmo={gizmo}
        pivotMode={pivotMode}
        handleOrientation={handleOrientation}
        onGizmo={(m) => {
          store.setGizmo(m);
          refresh();
        }}
        onPivotMode={setPivotMode}
        onHandleOrientation={setHandleOrientation}
        onPlay={() => {
          store.play();
          setViewTab('game');
          log('Entered Play Mode → Game');
          refresh();
        }}
        onPause={() => {
          store.pause();
          log(store.mode === 'pause' ? 'Paused' : 'Resumed');
          refresh();
        }}
        onStop={() => {
          store.stop();
          setViewTab('scene');
          log('Exited Play Mode → Scene');
          refresh();
        }}
      />

      <DockWorkspace
        detachedPanel={props.detachedPanel}
        dirtyPanels={dirtyPanels}
        panels={{
          hierarchy: (
            <Hierarchy
              store={store}
              nodes={treeNodes}
              selectedIds={selectedIds}
              filter={hierFilter}
              pendingRenameId={pendingRenameId}
              onFilter={setHierFilter}
              onPendingRenameConsumed={() => setPendingRenameId(null)}
              onRefresh={refresh}
              onLog={log}
              onFrame={() => {
                store.frameSelected();
                refresh();
              }}
              onInstantiatePrefab={(path, parent) => {
                void instantiateProjectPrefab(store, path, parent)
                  .then(() => {
                    log(`Instantiated ${path}`);
                    refresh();
                  })
                  .catch((error) => log(`Prefab instantiate failed: ${String(error)}`, 'error'));
              }}
            />
          ),
          viewport: (
            <Viewport
              tab={viewTab}
              clearColor={snap.clearColor}
              entities={snap.entities}
              selected={selected}
              selectedIds={selectedIds}
              angle={store.viewAngle}
              gizmo={gizmo}
              pivotMode={pivotMode}
              handleOrientation={handleOrientation}
              playing={mode !== 'edit'}
              sceneCamera={store.sceneCamera}
              gameAspect={gameAspect}
              gameOrientation={gameOrientation}
              activeInHierarchy={(id) => store.activeInHierarchy(id)}
              onPick={(id, modifiers) => {
                if (modifiers.toggle) store.selectMany([id], 'toggle', id);
                else if (modifiers.additive) store.selectMany([id], 'add', id);
                else store.select(id);
                refresh();
              }}
              onMarqueeSelect={(ids, selectionMode) => {
                const next = combineMarqueeSelection(store.selectedIds, ids, selectionMode);
                store.selectMany(next, 'replace');
                refresh();
              }}
              onSceneCamera={(partial) => {
                store.setSceneCamera(partial);
                refresh();
              }}
              onBeginGesture={() => store.beginTransformGesture()}
              onEndGesture={() => store.endTransformGesture()}
              onLinePointChange={(entity, points) => {
                store.patchComponent(entity, 'Line2D', { points });
                refresh();
              }}
              onTilemapChange={(entity, cells, sprites) => {
                store.patchComponent(entity, 'Tilemap', { cells, sprites });
                refresh();
              }}
              onDuplicateRectDrag={() => {
                const duplicated = store.duplicateSelection();
                if (duplicated != null) log('Duplicate (Alt Drag)');
                refresh();
                return duplicated;
              }}
              onTranslate={(entity, delta) => {
                store.translateSelectedTransformsBy(entity, delta);
                refresh();
              }}
              onGizmoScale={(entity, pivot, axis, axisWorld, amount) => {
                store.scaleSelectedTransformsAlong(entity, pivot, axis, axisWorld, amount);
                refresh();
              }}
              onRotateWorld={(entity, pivot, axis, degrees) => {
                store.rotateSelectedTransformsAround(entity, pivot, axis, degrees);
                refresh();
              }}
              onRectTranslate={(_entity, dx, dy) => {
                store.translateSelectedRectsBy(dx, dy);
                refresh();
              }}
              onRectNudge={(dx, dy) => {
                store.nudgeSelectedRects(dx, dy);
                refresh();
              }}
              onRectAlign={(deltas) => {
                store.applySelectedRectDeltas(deltas);
                refresh();
              }}
              onRectPivot={(entity, pivot, parentSize) => {
                store.setRectPivot(entity, pivot, parentSize);
                refresh();
              }}
              onRectAnchors={(entity, anchorMin, anchorMax, parentSize) => {
                store.setRectAnchors(entity, anchorMin, anchorMax, parentSize);
                refresh();
              }}
              onRectRotate={(deltas) => {
                store.rotateSelectedRectsBy(deltas);
                refresh();
              }}
              onRectScale={(deltas) => {
                store.scaleSelectedRectsBy(deltas);
                refresh();
              }}
              onRectResize={(entity, handle, dx, dy, options) => {
                const plan = store.resizeRectBy(entity, handle, dx, dy, options);
                refresh();
                return plan;
              }}
              onUiClick={(entity, onClick) => {
                const action = resolveUnityAction(entity, onClick);
                if (action) {
                  const ents = store.snapshot().entities as Array<{
                    entity: number;
                    components: Record<string, unknown>;
                  }>;
                  const target = ents.find((x) => x.entity === action.entity);
                  if (target) {
                    if (action.component && target.components[action.component]) {
                      store.invokeBehaviourMethod(
                        action.entity,
                        action.component,
                        action.method,
                      );
                      log(`Button onClick → ${action.component}.${action.method}()`);
                      refresh();
                      return;
                    }
                    for (const type of Object.keys(target.components)) {
                      const b = getBehaviour(type);
                      if (b?.methods.some((m) => m.key === action.method)) {
                        store.invokeBehaviourMethod(action.entity, type, action.method);
                        log(`Button onClick → ${type}.${action.method}()`);
                        refresh();
                        return;
                      }
                    }
                  }
                  log(
                    `Button onClick → ${action.component || '?'}.${action.method}() (not found)`,
                    'warn',
                  );
                } else {
                  log(`Button clicked (entity ${entity})`);
                }
                refresh();
              }}
              onUiValueChange={(entity, component, patch, callback) => {
                if (component === 'Toggle' && typeof patch.is_on === 'boolean') {
                  store.setToggleValue(entity, patch.is_on);
                } else {
                  store.patchComponent(entity, component, patch);
                }
                const action = resolveUnityAction(entity, callback);
                if (action) {
                  const target = store
                    .snapshot()
                    .entities.find((candidate) => candidate.entity === action.entity);
                  if (target) {
                    if (action.component && target.components[action.component]) {
                      store.invokeBehaviourMethod(
                        action.entity,
                        action.component,
                        action.method,
                      );
                    } else {
                      const behaviourType = Object.keys(target.components).find((type) =>
                        getBehaviour(type)?.methods.some((method) => method.key === action.method),
                      );
                      if (behaviourType) {
                        store.invokeBehaviourMethod(action.entity, behaviourType, action.method);
                      }
                    }
                  }
                }
                if (component === 'Toggle') {
                  log(`${component} value changed (entity ${entity})`);
                }
                refresh();
              }}
              onAspect={(a) => {
                store.setGameAspect(a);
                setGameAspect(a);
                persistGameViewPrefs();
                refresh();
              }}
              onOrientation={(o) => {
                store.setGameOrientation(o);
                setGameOrientation(o);
                if (o === 'portrait' && store.gameAspect === 'free') {
                  store.setGameAspect('16:9');
                  setGameAspect('16:9');
                }
                persistGameViewPrefs();
                refresh();
              }}
              onFrame={() => {
                store.frameSelected();
                refresh();
              }}
            />
          ),
          inspector: (
            <Inspector
              entity={snap.entities.find((e) => e.entity === selected) ?? null}
              entities={snap.entities}
              selectedIds={selectedIds}
              selectionCount={selectedIds.length}
              onBeginEditGesture={() => store.beginTransformGesture()}
              onEndEditGesture={() => store.endTransformGesture()}
              onRename={(entity, name) => {
                store.rename(entity, name);
                refresh();
              }}
              onSetActive={(entity, active) => {
                store.setActive(entity, active);
                refresh();
              }}
              onChangeTransform={(entity, transform) => {
                store.setTransform(entity, transform);
                refresh();
              }}
              onChangeTransforms={(updates) => {
                store.setTransforms(updates);
                refresh();
              }}
              onAddComponent={(entity, type, value) => {
                if (store.addComponent(entity, type, value)) {
                  log(`Added ${type}`);
                  refresh();
                } else {
                  log(`Cannot add ${type}`, 'warn');
                }
              }}
              onRemoveComponent={(entity, type) => {
                if (store.removeComponent(entity, type)) {
                  log(`Removed ${type}`);
                  refresh();
                }
              }}
              onSetComponent={(entity, type, value) => {
                if (type === 'MeshRenderer') {
                  const current = store.authoredEntities()
                    .find((entry) => entry.entity === entity)
                    ?.components.MeshRenderer as Record<string, unknown> | undefined;
                  if (current?.material !== value.material) {
                    const result = store.assignMaterial(
                      entity,
                      String(value.material ?? 'default'),
                      value,
                    );
                    if (result?.removedOverride) {
                      log('Removed PbrMaterial override so the assigned material asset is active');
                    }
                    refresh();
                    return;
                  }
                }
                store.setComponent(entity, type, value);
                refresh();
              }}
              onSetComponents={(type, updates) => {
                store.setComponents(type, updates);
                refresh();
              }}
              onPatchComponent={(entity, type, patch) => {
                store.patchComponent(entity, type, patch);
                refresh();
              }}
              onInvokeBehaviourMethod={(entity, type, method) => {
                store.invokeBehaviourMethod(entity, type, method);
                refresh();
              }}
            />
          ),
          project: (
            <Project
              activeScene={sceneName}
              sceneTick={sceneTick}
              onInstantiatePrefab={(path) => {
                void instantiateProjectPrefab(store, path)
                  .then(() => {
                    log(`Instantiated ${path}`);
                    refresh();
                  })
                  .catch((error) => log(`Prefab instantiate failed: ${String(error)}`, 'error'));
              }}
              onInstantiateModel={(path) => {
                store.spawnModel(path);
                log(`Instantiated model ${path}`);
                refresh();
              }}
              onOpenScene={(name) => {
                void openSceneByName(name);
              }}
              onOpenMaterial={(path) => openMaterialAsset(path)}
              onOpenShader={(path) => openSurfaceShaderAsset(path)}
              onOpenAnimator={(path) => openAnimatorAsset(path)}
              onOpenSprite={(path) => openSpriteAsset(path)}
              onOpenSpriteAtlas={(path) => openSpriteAtlasAsset(path)}
              onRenameScene={async (oldName, newName) => {
                const next = await renameScene(oldName, newName);
                if (next == null) {
                  log(
                    `重命名失败：名称无效或「${normalizeSceneName(newName) ?? newName}」已存在`,
                    'warn',
                  );
                  bumpScenes();
                  return false;
                }
                if (next !== oldName) {
                  if (sceneNameRef.current === oldName) {
                    sceneNameRef.current = next;
                    setSceneName(next);
                  }
                  bumpScenes();
                  log(`Renamed ${sceneFileName(oldName)} → ${sceneFileName(next)}`);
                }
                return true;
              }}
              onLog={log}
            />
          ),
          timeline: (
            <Timeline
              entity={snap.entities.find((entity) => entity.entity === selected) ?? null}
              entities={snap.entities}
              authoredEntities={store.authoredEntities()}
              onAddComponent={(entity, type, value) => {
                if (store.addComponent(entity, type, value)) {
                  log(`Added ${type}`);
                  refresh();
                }
              }}
              onPatchComponent={(entity, type, patch) => {
                store.patchComponent(entity, type, patch);
                refresh();
              }}
              onPreview={(entity, samples) => {
                if (store.setAnimationPreview(entity, samples)) refresh(false);
              }}
              onClearPreview={() => {
                if (store.clearAnimationPreview()) refresh(false);
              }}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setAnimationDirty}
              onLog={log}
            />
          ),
          animator: (
            <AnimatorEditor
              assetPath={animatorPath}
              selectedEntity={snap.entities.find((entity) => entity.entity === selected) ?? null}
              onOpenAsset={setAnimatorPath}
              onAssignAnimator={(entity, path) => {
                const current = store.authoredEntities()
                  .find((entry) => entry.entity === entity)
                  ?.components.Animator;
                if (current) {
                  store.patchComponent(entity, 'Animator', { controller: path });
                } else {
                  store.addComponent(entity, 'Animator', {
                    controller: path,
                    play_on_awake: true,
                    playing: true,
                    speed: 1,
                    current_state: '',
                    parameters_json: '{}',
                    state_time: 0,
                    normalized_time: 0,
                    transition_to: '',
                    transition_progress: 0,
                  });
                }
                log(`Assigned ${path}`);
                refresh();
              }}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setAnimatorDirty}
              onLog={log}
            />
          ),
          material: (
            <MaterialEditor
              assetPath={materialPath}
              selectedEntity={snap.entities.find((entity) => entity.entity === selected) ?? null}
              onOpenAsset={setMaterialPath}
              onAssignMaterial={(entity, path) => {
                const result = store.assignMaterial(entity, path);
                if (!result) {
                  log('Cannot assign material: the selected entity has no MeshRenderer', 'warn');
                  return;
                }
                log(result.removedOverride
                  ? `Assigned ${path} and removed the PbrMaterial override`
                  : `Assigned ${path}`);
                refresh();
              }}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setMaterialDirty}
              onLog={log}
            />
          ),
          shader: (
            <SurfaceShaderEditor
              assetPath={shaderPath}
              onOpenAsset={setShaderPath}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setShaderDirty}
              onLog={log}
            />
          ),
          spriteEditor: (
            <SpriteEditor
              assetPath={spritePath}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setSpriteDirty}
              onLog={log}
            />
          ),
          spriteAtlas: (
            <SpriteAtlasEditor
              assetPath={spriteAtlasPath}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setSpriteAtlasDirty}
              onLog={log}
            />
          ),
          build: (
            <BuildSettings
              sceneName={sceneName}
              sceneTick={sceneTick}
              sceneDirty={sceneDirty}
              resourceDirty={materialDirty || shaderDirty || animationDirty || animatorDirty || spriteDirty || spriteAtlasDirty}
              onSaveScene={saveSceneForBuild}
              onLog={log}
            />
          ),
          projectSettings: (
            <ProjectSettings onDirtyChange={setProjectSettingsDirty} onLog={log} />
          ),
          console: <Console lines={logs} />,
        }}
      />

      <div className="status-bar">
        <span>
          {mode === 'edit' ? 'Edit Mode' : mode === 'play' ? (
            <span className="on">Play Mode</span>
          ) : (
            <span className="on">Paused</span>
          )}
          {' · '}
          {sceneDirty ? '* ' : ''}{sceneName ? sceneFileName(sceneName) : '未命名场景'}
          {' · '}
          {snap.entities.length} objects
          {' · '}
          {selectedIds.length > 1 ? `${selectedIds.length} selected · ` : ''}
          gizmo: {gizmo}
        </span>
        <span>MEngine · Project/Assets/Scenes</span>
      </div>

      <EditorWindowHost />
    </div>
  );
}
