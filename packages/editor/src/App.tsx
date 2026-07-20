import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  createEditorStore,
  type EditorMode,
  type GizmoMode,
} from './store';
import { createEditorUndoService } from './editorUndoService';
import {
  legacyGameResolution,
  normalizeGameResolution,
  type GameResolution,
} from './gameResolution';
import { getBehaviour } from '@mengine/behaviour';
import {
  getActiveSceneName,
  deleteScene,
  initSceneLibrary,
  isDiskBackend,
  listScenes,
  normalizeSceneName,
  readSceneJson,
  reloadSceneFromBackend,
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
import { Console } from './panels/Console';
import {
  OPEN_ANIMATION_CLIP_EVENT,
  openAnimationClipAsset,
  OPEN_TIMELINE_ASSET_EVENT,
  openTimelineAsset,
  OPEN_ANIMATOR_EVENT,
  openAnimatorAsset,
  OPEN_MATERIAL_EVENT,
  PROJECT_ASSETS_CHANGED_EVENT,
  PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT,
  openMaterialAsset,
  OPEN_SURFACE_SHADER_EVENT,
  openSurfaceShaderAsset,
  OPEN_SPRITE_EDITOR_EVENT,
  openSpriteAsset,
  OPEN_SPRITE_ATLAS_EVENT,
  openSpriteAtlasAsset,
  type ProjectAssetLifecycleDetail,
} from './assetEditorEvents';
import {
  pollProjectFileChanges,
  refreshProjectFiles,
  type ProjectAssetChange,
} from './projectAssets';
import { Viewport } from './panels/Viewport';
import { DockWorkspace, type PanelKind } from './panels/DockWorkspace';
import { EditorWindowHost } from './editorWindow';
import { resolveUnityAction } from './panels/uiFieldEditors';
import {
  refreshSprites,
  resolveSpritePixelsPerUnit,
  resolveSpritePivot,
  spriteDisplayName,
} from './spriteLibrary';
import { loadSpriteNativeSize } from './spriteDraw';
import { spriteNativeWorldSize } from './spriteImport';
import { combineMarqueeSelection } from './marqueeSelection';
import { instantiateProjectPrefab } from './prefabWorkflow';
import { exitDesktopEditor, isDesktopEditor } from './transport/editorTransport';
import {
  checkpointDesktopScene,
  discardDesktopSceneRecovery,
  getDesktopSceneRecovery,
  restoreDesktopSceneRecovery,
} from './transport/desktopProjectSession';
import type { ToolHandleOrientation, ToolPivotMode } from './editorTool';
import { loadSortingLayers, SORTING_LAYERS_CHANGED_EVENT } from './sortingLayers';
import { saveAllResources } from './saveAll';
import { buildWorldTransforms } from './worldTransform';
import type { TimelineScenePreview } from './timelineScenePreview';
import {
  approveEditorClose,
  beginNativeEditorClose,
  beginRequestedEditorClose,
  cancelEditorClose,
  createEditorCloseState,
  editorCloseWarning,
} from './editorClose';
import './editorWindow'; // MenuItem side-effects

const Timeline = lazy(async () => ({ default: (await import('./panels/Timeline')).Timeline }));
const Project = lazy(async () => ({ default: (await import('./panels/Project')).Project }));
const Sequencer = lazy(async () => ({ default: (await import('./panels/Sequencer')).Sequencer }));
const AnimatorEditor = lazy(async () => ({ default: (await import('./panels/Animator')).AnimatorEditor }));
const MaterialEditor = lazy(async () => ({ default: (await import('./panels/Material')).MaterialEditor }));
const SurfaceShaderEditor = lazy(async () => ({ default: (await import('./panels/SurfaceShader')).SurfaceShaderEditor }));
const SpriteEditor = lazy(async () => ({ default: (await import('./panels/SpriteEditor')).SpriteEditor }));
const SpriteAtlasEditor = lazy(async () => ({ default: (await import('./panels/SpriteAtlasEditor')).SpriteAtlasEditor }));
const BuildSettings = lazy(async () => ({ default: (await import('./panels/BuildSettings')).BuildSettings }));
const Profiler = lazy(async () => ({ default: (await import('./panels/Profiler')).Profiler }));
const ProjectSettings = lazy(async () => ({ default: (await import('./panels/ProjectSettings')).ProjectSettings }));

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

type WorkspaceSyncMessage =
  | { type: 'request-scene'; sender: string }
  | { type: 'request-timeline-preview'; sender: string }
  | { type: 'timeline-preview'; sender: string; preview: TimelineScenePreview | null }
  | { type: 'request-dirty-state'; sender: string }
  | { type: 'window-closing'; sender: string }
  | {
      type: 'dirty-state';
      sender: string;
      timestamp: number;
      panel: string;
      dirty: boolean;
    }
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
      timelineAssetPath?: string | null;
    };

const WORKSPACE_CHANNEL = 'mengine.editor.workspace.v1';
const WORKSPACE_HEARTBEAT_MS = 2_000;
const WORKSPACE_PEER_TIMEOUT_MS = 5_000;
const WORKSPACE_PEER_CHECK_MS = 1_000;

export function App(props: { detachedPanel?: PanelKind | null } = {}) {
  const undoService = useMemo(() => createEditorUndoService(), []);
  const store = useMemo(() => createEditorStore(undoService), [undoService]);
  const [, setUndoRevision] = useState(undoService.revision);
  const [snap, setSnap] = useState<WorldSnapshotView & { selectedIds?: number[] }>(store.snapshot());
  const [mode, setMode] = useState<EditorMode>('edit');
  const [gizmo, setGizmo] = useState<GizmoMode>('translate');
  const [pivotMode, setPivotMode] = useState<ToolPivotMode>('pivot');
  const [handleOrientation, setHandleOrientation] = useState<ToolHandleOrientation>('local');
  const [viewTab, setViewTab] = useState<'scene' | 'game'>('scene');
  const [gameResolution, setGameResolution] = useState(store.gameResolution);
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
  const [animationAssetPath, setAnimationAssetPath] = useState<string | null>(null);
  const [timelineAssetPath, setTimelineAssetPath] = useState<string | null>(null);
  const [sequencerDirty, setSequencerDirty] = useState(false);
  const [projectSettingsDirty, setProjectSettingsDirty] = useState(false);
  const [buildSettingsDirty, setBuildSettingsDirty] = useState(false);
  const [sceneDirty, setSceneDirty] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState<ReadonlySet<PanelKind>>(
    () => new Set(props.detachedPanel
      ? [props.detachedPanel]
      : ['hierarchy', 'scene', 'inspector', 'project']),
  );
  const updateVisiblePanels = useCallback((panels: ReadonlySet<PanelKind>) => {
    setVisiblePanels((current) => {
      if (current.size === panels.size && [...current].every((panel) => panels.has(panel))) {
        return current;
      }
      return new Set(panels);
    });
  }, []);
  const [assetReloadEpoch, setAssetReloadEpoch] = useState({
    animation: 0,
    sequencer: 0,
    animator: 0,
    material: 0,
    shader: 0,
    sprite: 0,
    spriteAtlas: 0,
  });
  const resourceDirty = materialDirty
    || shaderDirty
    || animationDirty
    || sequencerDirty
    || animatorDirty
    || spriteDirty
    || spriteAtlasDirty
    || projectSettingsDirty
    || buildSettingsDirty;
  const hasUnsavedChanges = resourceDirty || (!props.detachedPanel && sceneDirty);
  const dirtyPanels = useMemo(() => {
    const dirty = new Set<PanelKind>();
    if (materialDirty) dirty.add('material');
    if (shaderDirty) dirty.add('shader');
    if (animatorDirty) dirty.add('animator');
    if (spriteDirty) dirty.add('spriteEditor');
    if (spriteAtlasDirty) dirty.add('spriteAtlas');
    if (animationDirty || sequencerDirty) dirty.add('timeline');
    if (projectSettingsDirty) dirty.add('projectSettings');
    if (buildSettingsDirty) dirty.add('build');
    return dirty;
  }, [animationDirty, animatorDirty, buildSettingsDirty, materialDirty, projectSettingsDirty, sequencerDirty, shaderDirty, spriteAtlasDirty, spriteDirty]);
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
  const unsavedChangesRef = useRef(false);
  const editorCloseState = useRef(createEditorCloseState());
  const savedSceneFingerprint = useRef(store.sceneContentFingerprint());
  const remoteSceneFingerprint = useRef(savedSceneFingerprint.current);
  const remoteSceneDirty = useRef(false);
  const syncSender = useRef(crypto.randomUUID());
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const localTimelinePreview = useRef<TimelineScenePreview | null>(null);
  const remoteTimelinePreview = useRef<{
    sender: string;
    preview: TimelineScenePreview;
    lastSeenAt: number;
  } | null>(null);
  const workspaceDirtyRef = useRef(false);
  const timelineAssetPathRef = useRef<string | null>(timelineAssetPath);
  const remoteDirtyPeers = useRef(new Map<string, {
    timestamp: number;
    panel: string;
    dirty: boolean;
  }>());
  const recoveryTimer = useRef<number | null>(null);
  const lastRecoveryError = useRef<string | null>(null);
  const lastAssetPollError = useRef<string | null>(null);
  const recoveryReady = useRef(false);
  const recoveryCheckpointActive = useRef(false);

  useEffect(() => undoService.subscribe(() => setUndoRevision(undoService.revision)), [undoService]);
  const syncTimer = useRef<number | null>(null);
  const applyingRemote = useRef(false);
  const lastRemoteTimestamp = useRef(0);
  const syncReady = useRef(!props.detachedPanel);
  sceneNameRef.current = sceneName;
  unsavedChangesRef.current = hasUnsavedChanges;
  workspaceDirtyRef.current = hasUnsavedChanges;
  timelineAssetPathRef.current = timelineAssetPath;

  const postWorkspaceDirtyState = () => {
    syncChannel.current?.postMessage({
      type: 'dirty-state',
      sender: syncSender.current,
      timestamp: Date.now(),
      panel: props.detachedPanel ?? 'main window',
      dirty: workspaceDirtyRef.current,
    } satisfies WorkspaceSyncMessage);
  };

  const queryRemoteDirtyPanels = async (): Promise<string[]> => {
    const channel = syncChannel.current;
    if (!channel) return [];
    channel.postMessage({
      type: 'request-dirty-state',
      sender: syncSender.current,
    } satisfies WorkspaceSyncMessage);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const cutoff = Date.now() - 5_000;
    const dirty = new Set<string>();
    for (const [sender, peer] of remoteDirtyPeers.current) {
      if (peer.timestamp < cutoff) {
        remoteDirtyPeers.current.delete(sender);
      } else if (peer.dirty) {
        dirty.add(peer.panel);
      }
    }
    return [...dirty].sort();
  };

  useEffect(() => {
    if (isDesktopEditor()) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

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
        timelineAssetPath: timelineAssetPathRef.current,
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
    setGameResolution(store.gameResolution);
    setTreeTick((t) => t + 1);
    updateSceneDirty();
    if (publish) broadcastScene();
  };

  const postTimelinePreview = (preview: TimelineScenePreview | null) => {
    syncChannel.current?.postMessage({
      type: 'timeline-preview',
      sender: syncSender.current,
      preview,
    } satisfies WorkspaceSyncMessage);
  };

  const requestRemoteTimelinePreview = () => {
    syncChannel.current?.postMessage({
      type: 'request-timeline-preview',
      sender: syncSender.current,
    } satisfies WorkspaceSyncMessage);
  };

  const applyLocalTimelinePreview = (preview: TimelineScenePreview) => {
    localTimelinePreview.current = structuredClone(preview);
    if (store.setTimelinePreview(preview)) refresh(false);
    postTimelinePreview(preview);
  };

  const clearLocalTimelinePreview = () => {
    if (!localTimelinePreview.current) return;
    localTimelinePreview.current = null;
    const fallback = remoteTimelinePreview.current?.preview ?? null;
    const changed = fallback
      ? store.setTimelinePreview(fallback)
      : store.clearTimelinePreview();
    if (changed) refresh(false);
    postTimelinePreview(null);
    requestRemoteTimelinePreview();
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
    const openTimeline = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path === 'string' && path) setTimelineAssetPath(path);
    };
    const openAnimation = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      setAnimationAssetPath(path);
      setTimelineAssetPath(null);
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
    const assetsChanged = (event: Event) => {
      const detail = (event as CustomEvent<
        (ProjectAssetLifecycleDetail & { remote?: boolean }) | undefined
      >).detail;
      if (detail?.remote && (detail.action === 'renamed' || detail.action === 'deleted')) {
        const remap = (value: string | null): string | null => {
          if (!value) return value;
          const marker = value.indexOf('#');
          const file = marker < 0 ? value : value.slice(0, marker);
          const fragment = marker < 0 ? '' : value.slice(marker);
          if (file.replace(/\\/g, '/').toLocaleLowerCase()
            !== detail.sourcePath.toLocaleLowerCase()) return value;
          return detail.action === 'renamed' ? `${detail.destinationPath}${fragment}` : null;
        };
        setMaterialPath(remap);
        setShaderPath(remap);
        setAnimatorPath(remap);
        setSpritePath(remap);
        setSpriteAtlasPath(remap);
        setAnimationAssetPath(remap);
        setTimelineAssetPath(remap);
        for (const scope of [
          'animation',
          'timeline',
          'animator',
          'avatar-mask',
          'material',
          'material-instance',
          'surface-shader',
        ]) undoService.clear(`${scope}:${detail.sourcePath}`);
        setAssetReloadEpoch((current) => ({
          animation: current.animation + 1,
          sequencer: current.sequencer + 1,
          animator: current.animator + 1,
          material: current.material + 1,
          shader: current.shader + 1,
          sprite: current.sprite + 1,
          spriteAtlas: current.spriteAtlas + 1,
        }));
      }
      bumpScenes();
    };
    window.addEventListener(OPEN_MATERIAL_EVENT, openMaterial);
    window.addEventListener(OPEN_SURFACE_SHADER_EVENT, openShader);
    window.addEventListener(OPEN_ANIMATOR_EVENT, openAnimator);
    window.addEventListener(OPEN_TIMELINE_ASSET_EVENT, openTimeline);
    window.addEventListener(OPEN_ANIMATION_CLIP_EVENT, openAnimation);
    window.addEventListener(OPEN_SPRITE_EDITOR_EVENT, openSprite);
    window.addEventListener(OPEN_SPRITE_ATLAS_EVENT, openSpriteAtlas);
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, assetsChanged);
    return () => {
      window.removeEventListener(OPEN_MATERIAL_EVENT, openMaterial);
      window.removeEventListener(OPEN_SURFACE_SHADER_EVENT, openShader);
      window.removeEventListener(OPEN_ANIMATOR_EVENT, openAnimator);
      window.removeEventListener(OPEN_TIMELINE_ASSET_EVENT, openTimeline);
      window.removeEventListener(OPEN_ANIMATION_CLIP_EVENT, openAnimation);
      window.removeEventListener(OPEN_SPRITE_EDITOR_EVENT, openSprite);
      window.removeEventListener(OPEN_SPRITE_ATLAS_EVENT, openSpriteAtlas);
      window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, assetsChanged);
    };
  }, [spriteAtlasDirty, spriteAtlasPath, spriteDirty, spritePath]);

  useEffect(() => {
    const onExternalChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        changes?: ProjectAssetChange[];
      }>).detail;
      const changes = detail?.changes ?? [];
      const changed = new Map(changes.map((change) => [change.relPath.toLocaleLowerCase(), change]));
      const reload = (
        panel: keyof typeof assetReloadEpoch,
        path: string | null,
        dirty: boolean,
        setPath: (path: string | null) => void,
      ) => {
        if (!path) return;
        const hashIndex = path.indexOf('#');
        const filePath = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
        const fragment = hashIndex >= 0 ? path.slice(hashIndex) : '';
        const change = changed.get(filePath.toLocaleLowerCase())
          ?? (panel === 'sprite'
            ? changed.get(`${filePath}.sprite.json`.toLocaleLowerCase())
            : undefined);
        if (!change) return;
        if (dirty) {
          const discard = window.confirm(
            `${path} 已在磁盘外部变化，并与本地未保存草稿冲突。\n\n`
            + '确定：丢弃该编辑器窗口中的未保存草稿并加载磁盘版本。\n'
            + '取消：保留本地草稿（保存会被阻止，避免覆盖外部版本）。',
          );
          if (!discard) {
            log(`${path} 的本地草稿已保留；保存会被阻止，直到重新加载磁盘版本。`, 'warn');
            return;
          }
          log(`已按用户选择丢弃本地草稿，准备重载 ${path}。`, 'warn');
        }
        for (const scope of [
          'animation',
          'timeline',
          'animator',
          'avatar-mask',
          'material',
          'material-instance',
          'surface-shader',
        ]) {
          undoService.clear(`${scope}:${filePath}`);
        }
        const deletedPrimaryAsset = change.relPath.toLocaleLowerCase() === filePath.toLocaleLowerCase();
        if (change.type === 'deleted' && deletedPrimaryAsset) {
          setPath(null);
          log(`${path} 已在磁盘外部删除，已关闭对应编辑文档。`, 'warn');
          return;
        }
        const changedPath = change.current?.relPath;
        const canonicalFilePath = changedPath?.toLocaleLowerCase().endsWith('.sprite.json')
          ? filePath
          : (changedPath ?? filePath);
        const canonicalPath = `${canonicalFilePath}${fragment}`;
        if (canonicalPath !== path) setPath(canonicalPath);
        setAssetReloadEpoch((current) => ({ ...current, [panel]: current[panel] + 1 }));
        log(`已从磁盘重新加载 ${canonicalPath}`);
      };
      reload('animation', animationAssetPath, animationDirty, setAnimationAssetPath);
      reload('sequencer', timelineAssetPath, sequencerDirty, setTimelineAssetPath);
      reload('animator', animatorPath, animatorDirty, setAnimatorPath);
      reload('material', materialPath, materialDirty, setMaterialPath);
      reload('shader', shaderPath, shaderDirty, setShaderPath);
      reload('sprite', spritePath, spriteDirty, setSpritePath);
      reload('spriteAtlas', spriteAtlasPath, spriteAtlasDirty, setSpriteAtlasPath);

      const currentSceneName = sceneNameRef.current;
      if (currentSceneName) {
        const currentScenePath = `Assets/Scenes/${sceneFileName(currentSceneName)}`;
        const sceneChange = changed.get(currentScenePath.toLocaleLowerCase());
        if (sceneChange) {
          if (sceneChange.type === 'deleted') {
            savedSceneFingerprint.current = `deleted:${crypto.randomUUID()}`;
            sceneDirtyRef.current = true;
            setSceneDirty(true);
            log(`${currentScenePath} 已在磁盘外部删除。内存场景仍保留，请使用 Save As 保存到新文件。`, 'warn');
          } else {
            const nextPath = sceneChange.current?.relPath ?? currentScenePath;
            const nextName = nextPath.split('/').pop()?.replace(/\.mscene$/i, '') ?? currentSceneName;
            if (sceneDirtyRef.current && !window.confirm(
              `${currentScenePath} 已在磁盘外部修改，并与当前未保存场景冲突。\n\n`
              + '确定：丢弃当前未保存修改并加载磁盘版本。\n'
              + '取消：保留内存场景（直接保存会被阻止）。',
            )) {
              log(`${currentScenePath} 的内存修改已保留；直接保存会被阻止。`, 'warn');
              return;
            }
            void reloadSceneFromBackend(nextName)
              .then((json) => {
                store.loadSceneJson(json);
                const fingerprint = store.sceneContentFingerprint();
                savedSceneFingerprint.current = fingerprint;
                sceneNameRef.current = nextName;
                setSceneName(nextName);
                sceneDirtyRef.current = false;
                setSceneDirty(false);
                refresh();
                log(`已从磁盘重新加载 ${sceneFileName(nextName)}`);
              })
              .catch((reason) => log(`场景外部变化重载失败: ${String(reason)}`, 'error'));
          }
        }
      }
    };
    window.addEventListener(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, onExternalChange);
    return () => window.removeEventListener(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, onExternalChange);
  }, [animationAssetPath, animationDirty, animatorDirty, animatorPath, materialDirty, materialPath, sequencerDirty, shaderDirty, shaderPath, spriteAtlasDirty, spriteAtlasPath, spriteDirty, spritePath, timelineAssetPath]);

  const log = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const prefix = level === 'info' ? '' : level === 'warn' ? '[Warn] ' : '[Error] ';
    const next = [...logsRef.current, `${prefix}${msg}`].slice(-300);
    logsRef.current = next;
    logEnd.current = next.length;
    setLogs(next);
    broadcastScene();
  };

  useEffect(() => {
    if (props.detachedPanel || !isDesktopEditor() || !recoveryReady.current) return;
    if (recoveryTimer.current != null) window.clearTimeout(recoveryTimer.current);
    if (!sceneDirty) {
      if (!recoveryCheckpointActive.current) return;
      recoveryCheckpointActive.current = false;
      void discardDesktopSceneRecovery().catch((reason) => {
        recoveryCheckpointActive.current = true;
        const message = String(reason);
        if (lastRecoveryError.current === message) return;
        lastRecoveryError.current = message;
        log(`自动恢复点清理失败: ${message}`, 'warn');
      });
      return;
    }
    if (!sceneName || store.mode !== 'edit') return;
    recoveryTimer.current = window.setTimeout(() => {
      recoveryTimer.current = null;
      const sceneJson = store.saveSessionSceneJson(sceneNameRef.current ?? sceneName);
      void checkpointDesktopScene(sceneJson)
        .then((recovery) => {
          recoveryCheckpointActive.current = recovery != null;
          lastRecoveryError.current = null;
        })
        .catch((reason) => {
          const message = String(reason);
          if (lastRecoveryError.current === message) return;
          lastRecoveryError.current = message;
          log(`场景自动恢复点写入失败: ${message}`, 'warn');
        });
    }, 1000);
    return () => {
      if (recoveryTimer.current != null) {
        window.clearTimeout(recoveryTimer.current);
        recoveryTimer.current = null;
      }
    };
  }, [props.detachedPanel, sceneDirty, sceneName, treeTick, store]);

  useEffect(() => {
    if (props.detachedPanel) return;
    let disposed = false;
    let polling = false;
    const check = async () => {
      if (disposed || polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const changes = await pollProjectFileChanges();
        lastAssetPollError.current = null;
        if (!disposed && changes.length > 0) {
          const detail = { changes, detectedAt: Date.now() };
          window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, { detail }));
          window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, { detail }));
          const counts = changes.reduce((result, change) => {
            result[change.type] += 1;
            return result;
          }, { added: 0, modified: 0, deleted: 0 });
          const examples = changes.slice(0, 3).map((change) => change.relPath).join(', ');
          log(
            `检测到工程外部文件变化：新增 ${counts.added}、修改 ${counts.modified}、删除 ${counts.deleted}`
            + `${examples ? `（${examples}${changes.length > 3 ? '…' : ''}）` : ''}`,
            'warn',
          );
        }
      } catch (reason) {
        const message = String(reason);
        if (lastAssetPollError.current !== message) {
          lastAssetPollError.current = message;
          log(`工程文件变化检查失败: ${message}`, 'warn');
        }
      } finally {
        polling = false;
      }
    };
    void refreshProjectFiles().then(() => {
      if (!disposed) void check();
    });
    const interval = window.setInterval(() => void check(), 2000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [props.detachedPanel]);

  const instantiateSpriteAsset = (
    path: string,
    options: { parent?: number | null; position?: [number, number, number] } = {},
  ) => {
    void loadSpriteNativeSize(path)
      .then((pixelSize) => {
        const size = spriteNativeWorldSize(
          pixelSize ? [pixelSize.w, pixelSize.h] : [100, 100],
          resolveSpritePixelsPerUnit(path),
        );
        const id = store.spawnSpriteAsset(path, {
          name: spriteDisplayName(path).replace(/\.[^.]+$/, ''),
          parent: options.parent ?? null,
          position: options.position ?? [0, 0, 0],
          size,
          pivot: resolveSpritePivot(path),
        });
        if (options.position == null) store.frameSelected();
        log(`Created SpriteRenderer ${path} (entity ${id})`);
        refresh();
      })
      .catch((error) => log(`Sprite creation failed: ${String(error)}`, 'error'));
  };

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
    syncChannel.current = channel;
    channel.onmessage = (event: MessageEvent<WorkspaceSyncMessage>) => {
      const message = event.data;
      if (!message || message.sender === syncSender.current) return;
      if (message.type === 'request-dirty-state') {
        postWorkspaceDirtyState();
        return;
      }
      if (message.type === 'request-timeline-preview') {
        if (localTimelinePreview.current) postTimelinePreview(localTimelinePreview.current);
        return;
      }
      if (message.type === 'timeline-preview') {
        if (localTimelinePreview.current) return;
        if (message.preview) {
          remoteTimelinePreview.current = {
            sender: message.sender,
            preview: structuredClone(message.preview),
            lastSeenAt: Date.now(),
          };
          if (store.setTimelinePreview(message.preview)) setSnap(store.snapshot());
        } else if (remoteTimelinePreview.current?.sender === message.sender) {
          remoteTimelinePreview.current = null;
          if (store.clearTimelinePreview()) setSnap(store.snapshot());
        }
        return;
      }
      if (message.type === 'dirty-state') {
        remoteDirtyPeers.current.set(message.sender, {
          timestamp: message.timestamp,
          panel: message.panel,
          dirty: message.dirty,
        });
        if (remoteTimelinePreview.current?.sender === message.sender) {
          remoteTimelinePreview.current.lastSeenAt = Date.now();
        }
        return;
      }
      if (message.type === 'window-closing') {
        remoteDirtyPeers.current.delete(message.sender);
        if (!localTimelinePreview.current && remoteTimelinePreview.current?.sender === message.sender) {
          remoteTimelinePreview.current = null;
          if (store.clearTimelinePreview()) setSnap(store.snapshot());
          requestRemoteTimelinePreview();
        }
        return;
      }
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
        const preview = localTimelinePreview.current ?? remoteTimelinePreview.current?.preview ?? null;
        if (preview && message.mode === 'edit') store.setTimelinePreview(preview);
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
        if ('timelineAssetPath' in message) setTimelineAssetPath(message.timelineAssetPath ?? null);
        setSnap(store.snapshot());
        setMode(store.mode);
        setGizmo(store.gizmo);
        setSelected(store.selected);
        setSelectedIds(store.selectedIds);
        setGameResolution(store.gameResolution);
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
    requestRemoteTimelinePreview();
    postWorkspaceDirtyState();
    const heartbeat = window.setInterval(postWorkspaceDirtyState, WORKSPACE_HEARTBEAT_MS);
    const peerLease = window.setInterval(() => {
      const remote = remoteTimelinePreview.current;
      if (
        localTimelinePreview.current
        || !remote
        || (
          Number.isFinite(remote.lastSeenAt)
          && Date.now() - remote.lastSeenAt <= WORKSPACE_PEER_TIMEOUT_MS
        )
      ) return;
      remoteTimelinePreview.current = null;
      if (store.clearTimelinePreview()) setSnap(store.snapshot());
      requestRemoteTimelinePreview();
    }, WORKSPACE_PEER_CHECK_MS);
    const fallback = window.setTimeout(() => {
      syncReady.current = true;
    }, 1500);
    return () => {
      window.clearTimeout(fallback);
      window.clearInterval(heartbeat);
      window.clearInterval(peerLease);
      if (syncTimer.current != null) window.clearTimeout(syncTimer.current);
      if (localTimelinePreview.current) {
        channel.postMessage({
          type: 'timeline-preview',
          sender: syncSender.current,
          preview: null,
        } satisfies WorkspaceSyncMessage);
      }
      channel.postMessage({
        type: 'window-closing',
        sender: syncSender.current,
      } satisfies WorkspaceSyncMessage);
      syncChannel.current = null;
      channel.close();
    };
  }, [props.detachedPanel, store]);

  useEffect(() => {
    postWorkspaceDirtyState();
  }, [hasUnsavedChanges, props.detachedPanel]);

  useEffect(() => {
    if (booted.current) broadcastScene(true);
  }, [timelineAssetPath]);

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
      if (!silent && isDesktopEditor()) {
        try {
          await discardDesktopSceneRecovery();
          recoveryCheckpointActive.current = false;
        } catch (reason) {
          log(`场景已打开，但旧自动恢复点无法清理: ${String(reason)}`, 'warn');
        }
      }
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
      recoveryCheckpointActive.current = false;
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

  const saveEverything = async (): Promise<boolean> => {
    const hadDirtyScene = sceneDirtyRef.current;
    let sceneSaved = true;
    if (hadDirtyScene) {
      const current = sceneNameRef.current;
      if (current) {
        sceneSaved = await persistScene(current);
      } else {
        const name = askSceneName('保存场景 — 请输入名称', 'Untitled');
        sceneSaved = Boolean(name) && await persistScene(name!);
      }
    }
    const resources = await saveAllResources();
    for (const failure of resources.failures) {
      log(`Save All failed for ${failure.label}: ${failure.error}`, 'error');
    }
    if (sceneSaved && resources.failures.length === 0) {
      const count = resources.saved.length + (hadDirtyScene ? 1 : 0);
      log(`Save All completed${count > 0 ? ` (${count} item${count === 1 ? '' : 's'})` : ''}.`);
      return true;
    }
    return false;
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

  const requestEditorClose = async (
    scope: 'window' | 'application',
    requestAlreadyStarted = false,
  ): Promise<void> => {
    const state = editorCloseState.current;
    if (!requestAlreadyStarted && !beginRequestedEditorClose(state)) return;
    try {
      const dirtyPanels = unsavedChangesRef.current
        ? [props.detachedPanel ?? 'main window']
        : [];
      if (scope === 'application') dirtyPanels.push(...await queryRemoteDirtyPanels());
      const warning = editorCloseWarning(dirtyPanels, scope === 'application');
      if (warning && !window.confirm(warning)) {
        cancelEditorClose(state);
        return;
      }

      approveEditorClose(state);
      if (!isDesktopEditor()) {
        window.close();
        return;
      }
      if (scope === 'window') {
        await getCurrentWindow().destroy();
        return;
      }

      await exitDesktopEditor();
    } catch (error) {
      cancelEditorClose(state);
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to close the editor', error);
      window.alert(`关闭编辑器失败：${message}`);
    }
  };

  useEffect(() => {
    const title = `${hasUnsavedChanges ? '* ' : ''}${sceneName ? sceneFileName(sceneName) : 'Untitled'} — MEngine Editor`;
    document.title = props.detachedPanel ? `${props.detachedPanel} — ${title}` : title;
  }, [hasUnsavedChanges, props.detachedPanel, sceneName]);

  useEffect(() => {
    if (!isDesktopEditor()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      const decision = beginNativeEditorClose(editorCloseState.current);
      if (decision === 'allow') return;
      event.preventDefault();
      if (decision === 'coordinate') {
        void requestEditorClose(props.detachedPanel ? 'window' : 'application', true);
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
  }, []);

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

  const applyEditorPrefs = (prefs: {
    gameResolution?: GameResolution | null;
    gameAspect?: string;
    gameOrientation?: string;
  }) => {
    const resolution = Object.prototype.hasOwnProperty.call(prefs, 'gameResolution')
      ? normalizeGameResolution(prefs.gameResolution)
      : legacyGameResolution(prefs.gameAspect, prefs.gameOrientation);
    store.setGameResolution(resolution);
  };

  const persistGameViewPrefs = () => {
    void setEditorPrefs({
      gameResolution: store.gameResolution,
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
      if (backend === 'desktop') {
        try {
          const recovery = await getDesktopSceneRecovery();
          recoveryCheckpointActive.current = recovery != null;
          if (recovery) {
            const recordedAt = new Date(recovery.recordedAtMs).toLocaleString();
            const shouldRestore = window.confirm(
              `检测到 ${sceneFileName(recovery.sceneName)} 的自动恢复点（${recordedAt}，${recovery.entityCount} 个节点）。\n\n`
              + '确定：恢复未保存修改；取消：丢弃该恢复点并继续打开磁盘版本。',
            );
            if (shouldRestore) {
              const restored = await restoreDesktopSceneRecovery();
              store.loadSceneJson(restored.sceneJson);
              savedSceneFingerprint.current = `recovery:${crypto.randomUUID()}`;
              sceneNameRef.current = recovery.sceneName;
              setSceneName(recovery.sceneName);
              sceneDirtyRef.current = true;
              setSceneDirty(true);
              log(`已恢复 ${sceneFileName(recovery.sceneName)} 的未保存修改。请检查后保存。`, 'warn');
            } else {
              await discardDesktopSceneRecovery();
              recoveryCheckpointActive.current = false;
              log(`已丢弃 ${sceneFileName(recovery.sceneName)} 的自动恢复点。`);
            }
          }
        } catch (reason) {
          recoveryCheckpointActive.current = true;
          log(`自动恢复点无法读取: ${String(reason)}`, 'error');
          if (window.confirm('自动恢复文件已损坏或不兼容。是否删除它，避免下次启动再次提示？')) {
            try {
              await discardDesktopSceneRecovery();
              recoveryCheckpointActive.current = false;
            } catch (discardReason) {
              log(`无法删除自动恢复文件: ${String(discardReason)}`, 'error');
            }
          }
        }
      }
      recoveryReady.current = true;
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
      if (e.defaultPrevented) return;
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
      if (ctrl && e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveEverything();
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
  const snapshotWorldTransforms = useMemo(() => buildWorldTransforms(snap.entities), [snap.entities]);
  const timelinePreviewActive = store.timelinePreviewActive();
  const authoredInspectorEntities = timelinePreviewActive
    ? store.authoredEntities()
    : snap.entities;

  return (
    <div className={`unity-shell${props.detachedPanel ? ' detached-shell' : ''}`}>
      <MenuBar
        onNew={newScene}
        onSave={saveScene}
        onSaveAll={() => void saveEverything()}
        onSaveAs={saveSceneAs}
        onLoad={openSceneDialog}
        onExit={() => void requestEditorClose('application')}
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
        onVisiblePanelsChange={updateVisiblePanels}
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
              onInstantiateSprite={(path, parent) => {
                instantiateSpriteAsset(path, { parent });
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
              gameResolution={gameResolution}
              timelineCameraPreview={store.timelineCameraPreview()}
              timelineParticlePreviews={store.timelineParticlePreviews()}
              activeInHierarchy={(id) => snapshotWorldTransforms.get(id)?.active === true}
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
              onGameResolution={(resolution) => {
                store.setGameResolution(resolution);
                setGameResolution(store.gameResolution);
                persistGameViewPrefs();
                refresh();
              }}
              onFrame={() => {
                store.frameSelected();
                refresh();
              }}
              onInstantiateSprite={(path, position) => {
                instantiateSpriteAsset(path, { position });
              }}
              onLog={log}
            />
          ),
          inspector: (
            <Inspector
              entity={authoredInspectorEntities.find((e) => e.entity === selected) ?? null}
              entities={authoredInspectorEntities}
              previewNotice={timelinePreviewActive
                ? 'Timeline Preview is active. Inspector fields show and edit authored values.'
                : undefined}
              selectedIds={selectedIds}
              selectionCount={selectedIds.length}
              onBeginEditGesture={() => store.beginTransformGesture('Edit Inspector')}
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
              onInstantiateSprite={(path) => instantiateSpriteAsset(path)}
              onOpenScene={(name) => {
                void openSceneByName(name);
              }}
              onOpenMaterial={(path) => openMaterialAsset(path)}
              onOpenShader={(path) => openSurfaceShaderAsset(path)}
              onOpenAnimator={(path) => openAnimatorAsset(path)}
              onOpenAnimation={(path) => openAnimationClipAsset(path)}
              onOpenTimeline={(path) => openTimelineAsset(path)}
              onOpenSprite={(path) => openSpriteAsset(path)}
              onOpenSpriteAtlas={(path) => openSpriteAtlasAsset(path)}
              onRenameScene={async (oldName, newName) => {
                try {
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
                } catch (error) {
                  log(`Scene rename failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
                  bumpScenes();
                  return false;
                }
              }}
              onDeleteScene={async (name) => {
                try {
                  await deleteScene(name);
                  bumpScenes();
                  log(`Deleted ${sceneFileName(name)}`);
                  return true;
                } catch (error) {
                  log(`Scene deletion failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
                  bumpScenes();
                  return false;
                }
              }}
              onPrepareAssetTransaction={async () => {
                if (hasUnsavedChanges) {
                  if (!window.confirm(
                    'This asset transaction changes project files on disk. Save the current scene and all resource documents before continuing?',
                  )) return false;
                  if (!await saveEverything()) return false;
                  workspaceDirtyRef.current = false;
                  // Scene state and dirty-state messages share an ordered
                  // channel, so detached windows see the clean checkpoint
                  // before answering the query below.
                  broadcastScene(true);
                  postWorkspaceDirtyState();
                }
                const remoteDirty = await queryRemoteDirtyPanels();
                if (remoteDirty.length > 0) {
                  const panels = remoteDirty.join(', ');
                  log(`Asset transaction blocked by unsaved changes in detached window(s): ${panels}.`, 'warn');
                  window.alert(`Save or discard changes in the detached window(s) before changing project assets:\n\n${panels}`);
                  return false;
                }
                return true;
              }}
              onAssetRenamed={(sourcePath, destinationPath) => {
                const remap = (value: string | null): string | null => {
                  if (!value) return value;
                  const marker = value.indexOf('#');
                  const file = marker < 0 ? value : value.slice(0, marker);
                  const fragment = marker < 0 ? '' : value.slice(marker);
                  return file.replace(/\\/g, '/').toLocaleLowerCase()
                    === sourcePath.toLocaleLowerCase()
                    ? `${destinationPath}${fragment}`
                    : value;
                };
                setMaterialPath(remap);
                setShaderPath(remap);
                setAnimatorPath(remap);
                setSpritePath(remap);
                setSpriteAtlasPath(remap);
                setAnimationAssetPath(remap);
                setTimelineAssetPath(remap);
                for (const scope of [
                  'animation',
                  'timeline',
                  'animator',
                  'avatar-mask',
                  'material',
                  'material-instance',
                  'surface-shader',
                ]) undoService.clear(`${scope}:${sourcePath}`);
                setAssetReloadEpoch((current) => ({
                  animation: current.animation + 1,
                  sequencer: current.sequencer + 1,
                  animator: current.animator + 1,
                  material: current.material + 1,
                  shader: current.shader + 1,
                  sprite: current.sprite + 1,
                  spriteAtlas: current.spriteAtlas + 1,
                }));
                bumpScenes();
              }}
              onAssetDeleted={(sourcePath) => {
                const closeDeleted = (value: string | null): string | null => {
                  if (!value) return value;
                  const marker = value.indexOf('#');
                  const file = marker < 0 ? value : value.slice(0, marker);
                  return file.replace(/\\/g, '/').toLocaleLowerCase()
                    === sourcePath.toLocaleLowerCase()
                    ? null
                    : value;
                };
                setMaterialPath(closeDeleted);
                setShaderPath(closeDeleted);
                setAnimatorPath(closeDeleted);
                setSpritePath(closeDeleted);
                setSpriteAtlasPath(closeDeleted);
                setAnimationAssetPath(closeDeleted);
                setTimelineAssetPath(closeDeleted);
                for (const scope of [
                  'animation',
                  'timeline',
                  'animator',
                  'avatar-mask',
                  'material',
                  'material-instance',
                  'surface-shader',
                ]) undoService.clear(`${scope}:${sourcePath}`);
                setAssetReloadEpoch((current) => ({
                  animation: current.animation + 1,
                  sequencer: current.sequencer + 1,
                  animator: current.animator + 1,
                  material: current.material + 1,
                  shader: current.shader + 1,
                  sprite: current.sprite + 1,
                  spriteAtlas: current.spriteAtlas + 1,
                }));
                bumpScenes();
              }}
              onLog={log}
            />
          ),
          timeline: (
            <>
              <div hidden={timelineAssetPath != null} className="panel-visibility-host">
                <Timeline
                  key={`animation:${assetReloadEpoch.animation}`}
                  assetPath={animationAssetPath}
                  previewEnabled={visiblePanels.has('timeline') && timelineAssetPath == null}
                  onCloseAsset={() => setAnimationAssetPath(null)}
                  onCreateTimelineAsset={async () => {
                    const { createProjectTimeline } = await import('./panels/Sequencer');
                    await createProjectTimeline();
                  }}
                  entity={snap.entities.find((entity) => entity.entity === selected) ?? null}
                  entities={snap.entities}
                  authoredEntities={mode === 'edit' ? store.authoredEntities() : snap.entities}
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
                  undoService={undoService}
                  onGlobalUndo={() => {
                    store.undo();
                    refresh();
                  }}
                  onGlobalRedo={() => {
                    store.redo();
                    refresh();
                  }}
                />
              </div>
              <div hidden={timelineAssetPath == null} className="panel-visibility-host">
                <Sequencer
                  key={`sequencer:${assetReloadEpoch.sequencer}`}
                  assetPath={timelineAssetPath}
                  selectedEntity={snap.entities.find((entity) => entity.entity === selected) ?? null}
                  entities={snap.entities}
                  playMode={mode !== 'edit'}
                  previewEnabled={visiblePanels.has('timeline')}
                  onClose={() => setTimelineAssetPath(null)}
                  onAssignDirector={(entity, path) => {
                    const current = store.authoredEntities().find((entry) => entry.entity === entity)?.components.TimelineDirector;
                    if (current) store.patchComponent(entity, 'TimelineDirector', {
                      asset: path,
                      ...(typeof current === 'object'
                        && current != null
                        && String((current as { asset?: unknown }).asset ?? '') === path
                        ? {}
                        : { bindings_json: '{}' }),
                    });
                    else store.addComponent(entity, 'TimelineDirector', {
                      asset: path, bindings_json: '{}', play_on_awake: true, playing: true, speed: 1, time: 0, wrap_mode: 'Hold',
                    });
                    log(`Bound ${path} to TimelineDirector`);
                    refresh();
                  }}
                  onPatchDirector={(entity, patch) => {
                    store.patchComponent(entity, 'TimelineDirector', patch);
                    refresh();
                  }}
                  onPreview={applyLocalTimelinePreview}
                  onClearPreview={clearLocalTimelinePreview}
                  onAssetsChanged={bumpScenes}
                  onDirtyChange={setSequencerDirty}
                  onLog={log}
                  undoService={undoService}
                  onGlobalUndo={() => {
                    store.undo();
                    refresh();
                  }}
                  onGlobalRedo={() => {
                    store.redo();
                    refresh();
                  }}
                />
              </div>
            </>
          ),
          animator: (
            <AnimatorEditor
              key={`animator:${assetReloadEpoch.animator}`}
              assetPath={animatorPath}
              selectedEntity={snap.entities.find((entity) => entity.entity === selected) ?? null}
              playMode={mode !== 'edit'}
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
                    layer_weights_json: '{}',
                    layers_json: '{}',
                    state_time: 0,
                    normalized_time: 0,
                    transition_to: '',
                    transition_progress: 0,
                  });
                }
                log(`Assigned ${path}`);
                refresh();
              }}
              onPatchAnimator={(entity, patch) => {
                store.patchComponent(entity, 'Animator', patch);
                refresh();
              }}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setAnimatorDirty}
              onLog={log}
              undoService={undoService}
              onGlobalUndo={() => {
                store.undo();
                refresh();
              }}
              onGlobalRedo={() => {
                store.redo();
                refresh();
              }}
            />
          ),
          material: (
            <MaterialEditor
              key={`material:${assetReloadEpoch.material}`}
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
              undoService={undoService}
              onGlobalUndo={() => {
                store.undo();
                refresh();
              }}
              onGlobalRedo={() => {
                store.redo();
                refresh();
              }}
            />
          ),
          shader: (
            <SurfaceShaderEditor
              key={`shader:${assetReloadEpoch.shader}`}
              assetPath={shaderPath}
              onOpenAsset={setShaderPath}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setShaderDirty}
              onLog={log}
              undoService={undoService}
              onGlobalUndo={() => {
                store.undo();
                refresh();
              }}
              onGlobalRedo={() => {
                store.redo();
                refresh();
              }}
            />
          ),
          spriteEditor: (
            <SpriteEditor
              key={`sprite:${assetReloadEpoch.sprite}`}
              assetPath={spritePath}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setSpriteDirty}
              onLog={log}
            />
          ),
          spriteAtlas: (
            <SpriteAtlasEditor
              key={`sprite-atlas:${assetReloadEpoch.spriteAtlas}`}
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
              resourceDirty={resourceDirty}
              onSaveScene={saveSceneForBuild}
              onSaveAll={saveEverything}
              onDirtyChange={setBuildSettingsDirty}
              onLog={log}
            />
          ),
          projectSettings: (
            <ProjectSettings onDirtyChange={setProjectSettingsDirty} onLog={log} />
          ),
          console: <Console lines={logs} />,
          profiler: <Profiler />,
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
