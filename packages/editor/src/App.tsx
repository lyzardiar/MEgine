// Author: MiYu
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
  normalizeGameDisplay,
  normalizeGameResolution,
  type GameResolution,
} from './gameResolution';
import { getBehaviour } from '@mengine/behaviour';
import {
  getActiveSceneName,
  deleteScene,
  initSceneLibrary,
  isSceneLibraryReady,
  isDiskBackend,
  listScenes,
  normalizeSceneName,
  readSceneJson,
  refreshSceneLibrary,
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
import {
  broadcastProjectAssetsExternalChanges,
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
  OPEN_GAMEPLAY_DATA_EVENT,
  openGameplayDataAsset,
  type ProjectAssetLifecycleDetail,
} from './assetEditorEvents';
import {
  pollProjectFileChanges,
  projectAssetHasExternalWriteConflict,
  refreshProjectFiles,
  type ProjectAssetChange,
} from './projectAssets';
import { DockWorkspace, type PanelKind } from './panels/DockWorkspace';
import {
  agentBridge,
  type AgentCreateAssetRequest,
  type AgentInstantiableAssetTarget,
  type AgentResourceEditorTarget,
  type AgentSceneProvider,
  type AgentWorkspaceDocument,
  type AgentWorkspaceProvider,
} from './agent/AgentBridge';
import { resourceEditorPreservesDrafts } from './agent/resourceTargets';
import { formatConsoleLog, logService } from './agent/LogService';
import { BridgeError, type PanelLayoutSnapshot } from './agent/protocol';
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
import {
  applySelectedPrefab,
  createProjectPrefabsFromEntities,
  instantiateProjectPrefab,
  revertSelectedPrefab,
  unpackSelectedPrefab,
} from './prefabWorkflow';
import { exitDesktopEditor, isDesktopEditor } from './transport/editorTransport';
import {
  checkpointDesktopScene,
  closeDesktopProject,
  discardDesktopSceneRecovery,
  getDesktopSceneRecovery,
  restoreDesktopSceneRecovery,
} from './transport/desktopProjectSession';
import type { ToolHandleOrientation, ToolPivotMode } from './editorTool';
import {
  getGameLayerOptions,
  getTagOptions,
  loadSortingLayers,
  SORTING_LAYERS_CHANGED_EVENT,
} from './sortingLayers';
import {
  closeResourceDocument,
  discardResourceDocument,
  mergeSaveAllResults,
  RemoteSaveCoordinator,
  saveAllResources,
  saveResourceDocument,
  type RemoteSavePeer,
  type ResourceDocumentOperation,
  type SaveAllResult,
} from './saveAll';
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
import { alertEditor, confirmEditor, promptEditor } from './editorDialog';
import { createEditorBroadcastChannel } from './editorInstance.ts';
import {
  initializeSceneViewPreferencesEvents,
  readSceneViewPreferences,
  SCENE_VIEW_PREFERENCES_CHANGED_EVENT,
  updateSceneViewPreferences,
  type SceneViewPreferencesChangeDetail,
} from './sceneViewPreferences';
import {
  gateWorkspaceResourceSelection,
  mergeWorkspaceResourceDocuments,
  resourceEditorDocuments,
  type WorkspaceResourceDocument,
} from './workspaceDocuments';
import './editorWindow'; // MenuItem side-effects

const Timeline = lazy(async () => ({ default: (await import('./panels/Timeline')).Timeline }));
const Project = lazy(async () => ({ default: (await import('./panels/Project')).Project }));
const Sequencer = lazy(async () => ({ default: (await import('./panels/Sequencer')).Sequencer }));
const Hierarchy = lazy(async () => ({ default: (await import('./panels/Hierarchy')).Hierarchy }));
const Inspector = lazy(async () => ({ default: (await import('./panels/Inspector')).Inspector }));
const Console = lazy(async () => ({ default: (await import('./panels/Console')).Console }));
const Viewport = lazy(async () => ({ default: (await import('./panels/Viewport')).Viewport }));
const AnimatorEditor = lazy(async () => ({ default: (await import('./panels/Animator')).AnimatorEditor }));
const MaterialEditor = lazy(async () => ({ default: (await import('./panels/Material')).MaterialEditor }));
const SurfaceShaderEditor = lazy(async () => ({ default: (await import('./panels/SurfaceShader')).SurfaceShaderEditor }));
const SpriteEditor = lazy(async () => ({ default: (await import('./panels/SpriteEditor')).SpriteEditor }));
const SpriteAtlasEditor = lazy(async () => ({ default: (await import('./panels/SpriteAtlasEditor')).SpriteAtlasEditor }));
const BuildSettings = lazy(async () => ({ default: (await import('./panels/BuildSettings')).BuildSettings }));
const Profiler = lazy(async () => ({ default: (await import('./panels/Profiler')).Profiler }));
const ProjectSettings = lazy(async () => ({ default: (await import('./panels/ProjectSettings')).ProjectSettings }));
const EffekseerPreview = lazy(async () => ({ default: (await import('./panels/EffekseerPreview')).EffekseerPreview }));
const GameplayDataEditor = lazy(async () => ({ default: (await import('./panels/GameplayDataEditor')).GameplayDataEditor }));

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function allowsEditorHistoryShortcut(el: EventTarget | null) {
  if (!isTypingTarget(el)) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['text', 'search', 'password', 'email', 'url', 'tel'].includes(el.type);
}

async function askSceneName(title: string, initial: string): Promise<string | null> {
  const raw = await promptEditor(title, initial, { title: 'Scene Name' });
  if (raw == null) return null;
  return normalizeSceneName(raw);
}

function sameAssetPath(left: string | null, right: string): boolean {
  return left?.replace(/\\/g, '/').toLocaleLowerCase()
    === right.replace(/\\/g, '/').toLocaleLowerCase();
}

type WorkspaceSyncMessage =
  | { type: 'request-scene'; sender: string }
  | { type: 'scene-library-changed'; sender: string }
  | { type: 'request-timeline-preview'; sender: string }
  | { type: 'timeline-preview'; sender: string; preview: TimelineScenePreview | null }
  | { type: 'request-clear-logs'; sender: string }
  | { type: 'request-dirty-state'; sender: string }
  | {
      type: 'request-save-resources';
      sender: string;
      requestId: string;
      targets: string[];
      paths?: string[];
      operation?: ResourceDocumentOperation;
    }
  | {
      type: 'save-resources-result';
      sender: string;
      recipient: string;
      requestId: string;
      result: SaveAllResult;
    }
  | { type: 'window-closing'; sender: string }
  | {
      type: 'dirty-state';
      sender: string;
      timestamp: number;
      panel: string;
      dirty: boolean;
      resourceDirty: boolean;
      documents?: WorkspaceResourceDocument[];
    }
  | {
      type: 'scene-state';
      sender: string;
      timestamp: number;
      mode: EditorMode;
      sceneName: string | null;
      sceneJson: string;
      selectedIds: number[];
      sceneHiddenIds?: number[];
      sceneUnpickableIds?: number[];
      logs: string[];
      dirty: boolean;
      animationAssetPath?: string | null;
      animatorPath?: string | null;
      materialPath?: string | null;
      shaderPath?: string | null;
      spritePath?: string | null;
      spriteAtlasPath?: string | null;
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
  const [pivotMode, setPivotMode] = useState<ToolPivotMode>(
    () => readSceneViewPreferences().pivotMode,
  );
  const [handleOrientation, setHandleOrientation] =
    useState<ToolHandleOrientation>(
      () => readSceneViewPreferences().handleOrientation,
    );
  const [viewTab, setViewTab] = useState<'scene' | 'game'>('scene');
  const [gameResolution, setGameResolution] = useState(store.gameResolution);
  const [gameDisplay, setGameDisplay] = useState(store.gameDisplay);
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
  const [effekseerPreviewPath, setEffekseerPreviewPath] = useState<string | null>(null);
  const [gameplayDataPath, setGameplayDataPath] = useState<string | null>(null);
  const [gameplayDataDirty, setGameplayDataDirty] = useState(false);
  const [sequencerDirty, setSequencerDirty] = useState(false);
  const [projectSettingsDirty, setProjectSettingsDirty] = useState(false);
  const [buildSettingsDirty, setBuildSettingsDirty] = useState(false);
  const [sceneDirty, setSceneDirty] = useState(false);
  const [animationDocuments, setAnimationDocuments] = useState<WorkspaceResourceDocument[]>([]);
  const [sequencerDocuments, setSequencerDocuments] = useState<WorkspaceResourceDocument[]>([]);
  const [animatorDocuments, setAnimatorDocuments] = useState<WorkspaceResourceDocument[]>([]);
  const [materialDocuments, setMaterialDocuments] = useState<WorkspaceResourceDocument[]>([]);
  const [shaderDocuments, setShaderDocuments] = useState<WorkspaceResourceDocument[]>([]);
  const [visiblePanels, setVisiblePanels] = useState<ReadonlySet<PanelKind>>(
    () => new Set(props.detachedPanel
      ? [props.detachedPanel]
      : ['hierarchy', 'scene', 'inspector', 'project']),
  );
  const panelLayoutRef = useRef<PanelLayoutSnapshot | null>(null);
  const logRef = useRef<(message: string) => void>(() => undefined);
  const agentSceneProviderRef = useRef<AgentSceneProvider | null>(null);
  const agentWorkspaceProviderRef = useRef<AgentWorkspaceProvider | null>(null);
  const updateVisiblePanels = useCallback((panels: ReadonlySet<PanelKind>) => {
    setVisiblePanels((current) => {
      if (current.size === panels.size && [...current].every((panel) => panels.has(panel))) {
        return current;
      }
      return new Set(panels);
    });
  }, []);
  const updatePanelLayout = useCallback((layout: PanelLayoutSnapshot) => {
    panelLayoutRef.current = layout;
    if (!props.detachedPanel) {
      agentBridge.observe();
      agentBridge.observeWorkspace();
    }
  }, [props.detachedPanel]);
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
    || gameplayDataDirty
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
    if (gameplayDataDirty) dirty.add('gameplayData');
    if (animationDirty || sequencerDirty) dirty.add('timeline');
    if (projectSettingsDirty) dirty.add('projectSettings');
    if (buildSettingsDirty) dirty.add('build');
    return dirty;
  }, [animationDirty, animatorDirty, buildSettingsDirty, gameplayDataDirty, materialDirty, projectSettingsDirty, sequencerDirty, shaderDirty, spriteAtlasDirty, spriteDirty]);
  const [logs, setLogs] = useState<string[]>(
    () => logService.getEntries().map(formatConsoleLog),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const logEnd = useRef(0);
  const logsRef = useRef(logs);
  const booted = useRef(false);
  const sceneNameRef = useRef<string | null>(null);
  const sceneDirtyRef = useRef(false);
  const resourceDirtyRef = useRef(resourceDirty);
  const unsavedChangesRef = useRef(false);
  const editorCloseState = useRef(createEditorCloseState());
  const savedSceneFingerprint = useRef(store.sceneContentFingerprint());
  const remoteSceneFingerprint = useRef(savedSceneFingerprint.current);
  const remoteSceneDirty = useRef(false);
  const syncSender = useRef(crypto.randomUUID());
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const localTimelinePreview = useRef<TimelineScenePreview | null>(null);
  const remoteTimelinePreview = useRef<{
    sender: string;
    preview: TimelineScenePreview;
    lastSeenAt: number;
  } | null>(null);
  const workspaceDirtyRef = useRef(false);
  const resourceDocumentPathsRef = useRef({
    animationAssetPath,
    animatorPath,
    materialPath,
    shaderPath,
    spritePath,
    spriteAtlasPath,
    timelineAssetPath,
  });
  const remoteDirtyPeers = useRef(new Map<string, {
    timestamp: number;
    panel: string;
    dirty: boolean;
    resourceDirty: boolean;
    documents: WorkspaceResourceDocument[];
  }>());
  const remoteSaveCoordinator = useRef<RemoteSaveCoordinator | null>(null);
  const saveResourcesInFlight = useRef<Promise<SaveAllResult> | null>(null);
  const saveDocumentInFlight = useRef(new Map<string, Promise<SaveAllResult>>());
  const discardDocumentInFlight = useRef(new Map<string, Promise<SaveAllResult>>());
  const closeDocumentInFlight = useRef(new Map<string, Promise<SaveAllResult>>());
  const recoveryTimer = useRef<number | null>(null);
  const lastRecoveryError = useRef<string | null>(null);
  const lastAssetPollError = useRef<string | null>(null);
  const recoveryReady = useRef(false);
  const recoveryCheckpointActive = useRef(false);
  const localResourceDocuments = useMemo(() => mergeWorkspaceResourceDocuments(
    gateWorkspaceResourceSelection(animationDocuments, timelineAssetPath == null),
    gateWorkspaceResourceSelection(sequencerDocuments, timelineAssetPath != null),
    animatorDocuments,
    materialDocuments,
    shaderDocuments,
    resourceEditorDocuments('sprite', 'spriteEditor', spritePath, spriteDirty, []),
    resourceEditorDocuments(
      'sprite-atlas',
      'spriteAtlas',
      spriteAtlasPath,
      spriteAtlasDirty,
      [],
    ),
  ).map((document) => ({
    ...document,
    conflicted: document.dirty
      && projectAssetHasExternalWriteConflict(document.path),
  })), [
    animationDocuments,
    animatorDocuments,
    materialDocuments,
    sequencerDocuments,
    shaderDocuments,
    spriteAtlasDirty,
    spriteAtlasPath,
    spriteDirty,
    spritePath,
    sceneTick,
    timelineAssetPath,
  ]);
  const localResourceDocumentsRef = useRef(localResourceDocuments);
  localResourceDocumentsRef.current = localResourceDocuments;

  useEffect(() => undoService.subscribe(() => setUndoRevision(undoService.revision)), [undoService]);
  const syncTimer = useRef<number | null>(null);
  const applyingRemote = useRef(false);
  const lastRemoteTimestamp = useRef(0);
  const syncReady = useRef(!props.detachedPanel);
  sceneNameRef.current = sceneName;
  unsavedChangesRef.current = hasUnsavedChanges;
  workspaceDirtyRef.current = hasUnsavedChanges;
  resourceDirtyRef.current = resourceDirty;
  resourceDocumentPathsRef.current = {
    animationAssetPath,
    animatorPath,
    materialPath,
    shaderPath,
    spritePath,
    spriteAtlasPath,
    timelineAssetPath,
  };

  const saveLocalResources = async (): Promise<SaveAllResult> => {
    const existing = saveResourcesInFlight.current;
    if (existing) return existing;
    const request = saveAllResources();
    saveResourcesInFlight.current = request;
    try {
      return await request;
    } finally {
      if (saveResourcesInFlight.current === request) saveResourcesInFlight.current = null;
    }
  };

  const saveLocalResourceDocument = async (path: string): Promise<SaveAllResult> => {
    const key = path.replace(/\\/g, '/').toLocaleLowerCase();
    const existing = saveDocumentInFlight.current.get(key);
    if (existing) return existing;
    const request = saveResourceDocument(path);
    saveDocumentInFlight.current.set(key, request);
    try {
      return await request;
    } finally {
      if (saveDocumentInFlight.current.get(key) === request) {
        saveDocumentInFlight.current.delete(key);
      }
    }
  };

  const discardLocalResourceDocument = async (path: string): Promise<SaveAllResult> => {
    const key = path.replace(/\\/g, '/').toLocaleLowerCase();
    const existing = discardDocumentInFlight.current.get(key);
    if (existing) return existing;
    const request = discardResourceDocument(path);
    discardDocumentInFlight.current.set(key, request);
    try {
      return await request;
    } finally {
      if (discardDocumentInFlight.current.get(key) === request) {
        discardDocumentInFlight.current.delete(key);
      }
    }
  };

  const closeLocalResourceDocument = async (path: string): Promise<SaveAllResult> => {
    const key = path.replace(/\\/g, '/').toLocaleLowerCase();
    const existing = closeDocumentInFlight.current.get(key);
    if (existing) return existing;
    const request = closeResourceDocument(path);
    closeDocumentInFlight.current.set(key, request);
    try {
      return await request;
    } finally {
      if (closeDocumentInFlight.current.get(key) === request) {
        closeDocumentInFlight.current.delete(key);
      }
    }
  };

  const waitForLocalResourcesClean = async (timeoutMs = 2_000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    do {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      if (!resourceDirtyRef.current) return true;
    } while (Date.now() < deadline);
    return !resourceDirtyRef.current;
  };

  const waitForLocalResourceDocumentClean = async (
    path: string,
    timeoutMs = 2_000,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    do {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      const document = localResourceDocumentsRef.current.find(
        (candidate) => sameAssetPath(candidate.path, path),
      );
      if (document && !document.dirty) return true;
    } while (Date.now() < deadline);
    const document = localResourceDocumentsRef.current.find(
      (candidate) => sameAssetPath(candidate.path, path),
    );
    return Boolean(document && !document.dirty);
  };

  const waitForLocalResourceDocumentDiscarded = async (
    path: string,
    timeoutMs = 2_000,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    do {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      const document = localResourceDocumentsRef.current.find(
        (candidate) => sameAssetPath(candidate.path, path),
      );
      if (!document || !document.dirty) return true;
    } while (Date.now() < deadline);
    return !localResourceDocumentsRef.current.some(
      (candidate) => sameAssetPath(candidate.path, path) && candidate.dirty,
    );
  };

  const waitForLocalResourceDocumentClosed = async (
    path: string,
    timeoutMs = 2_000,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    do {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      if (!localResourceDocumentsRef.current.some(
        (candidate) => sameAssetPath(candidate.path, path),
      )) {
        return true;
      }
    } while (Date.now() < deadline);
    return !localResourceDocumentsRef.current.some(
      (candidate) => sameAssetPath(candidate.path, path),
    );
  };

  useEffect(() => {
    agentBridge.connect(store);
    agentBridge.connectSceneMeta({
      sceneName: () => sceneNameRef.current,
      dirty: () => sceneDirtyRef.current,
    });
    agentBridge.connectRefresh(() => refreshRef.current());
    agentBridge.connectLog(
      (message) => logRef.current(message),
      () => {
        logsRef.current = [];
        logEnd.current = 0;
        setLogs([]);
        broadcastScene(true);
      },
    );
    agentBridge.connectPanelLayout(() => panelLayoutRef.current);
    agentBridge.connectSceneCommands(() => agentSceneProviderRef.current);
    agentBridge.connectWorkspace(() => agentWorkspaceProviderRef.current);
    if (props.detachedPanel) return undefined;
    return agentBridge.connectEventSources();
  }, [props.detachedPanel, store]);

  useEffect(() => {
    initializeSceneViewPreferencesEvents();
    const applyPreferences = (
      preferences: SceneViewPreferencesChangeDetail['preferences'],
    ) => {
      setPivotMode(preferences.pivotMode);
      setHandleOrientation(preferences.handleOrientation);
    };
    const onPreferencesChanged = (event: Event) => {
      applyPreferences(
        (event as CustomEvent<SceneViewPreferencesChangeDetail>).detail
          .preferences,
      );
    };
    window.addEventListener(
      SCENE_VIEW_PREFERENCES_CHANGED_EVENT,
      onPreferencesChanged,
    );
    applyPreferences(readSceneViewPreferences());
    return () => {
      window.removeEventListener(
        SCENE_VIEW_PREFERENCES_CHANGED_EVENT,
        onPreferencesChanged,
      );
    };
  }, []);

  const postWorkspaceDirtyState = () => {
    syncChannel.current?.postMessage({
      type: 'dirty-state',
      sender: syncSender.current,
      timestamp: Date.now(),
      panel: props.detachedPanel ?? 'main window',
      dirty: workspaceDirtyRef.current,
      resourceDirty: resourceDirtyRef.current,
      documents: structuredClone(localResourceDocumentsRef.current),
    } satisfies WorkspaceSyncMessage);
  };

  const queryRemoteWorkspacePeers = async () => {
    const channel = syncChannel.current;
    if (!channel) return [];
    channel.postMessage({
      type: 'request-dirty-state',
      sender: syncSender.current,
    } satisfies WorkspaceSyncMessage);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const cutoff = Date.now() - 5_000;
    const peers: Array<{
      sender: string;
      timestamp: number;
      panel: string;
      dirty: boolean;
      resourceDirty: boolean;
      documents: WorkspaceResourceDocument[];
    }> = [];
    for (const [sender, peer] of remoteDirtyPeers.current) {
      if (peer.timestamp < cutoff) {
        remoteDirtyPeers.current.delete(sender);
      } else {
        peers.push({ sender, ...peer });
      }
    }
    return peers.sort((left, right) => (
      left.panel.localeCompare(right.panel) || left.sender.localeCompare(right.sender)
    ));
  };

  const queryRemoteDirtyPeers = async (resourceOnly = false): Promise<RemoteSavePeer[]> => (
    (await queryRemoteWorkspacePeers())
      .filter((peer) => resourceOnly ? peer.resourceDirty : peer.dirty)
      .map((peer) => ({ sender: peer.sender, panel: peer.panel }))
  );

  const queryRemoteDirtyPanels = async (): Promise<string[]> => {
    const dirty = new Set((await queryRemoteDirtyPeers()).map((peer) => peer.panel));
    return [...dirty].sort();
  };

  const queryProjectDirtyPanels = async (): Promise<string[]> => {
    const dirty = new Set<string>();
    if (unsavedChangesRef.current) dirty.add(props.detachedPanel ?? 'main window');
    for (const panel of await queryRemoteDirtyPanels()) dirty.add(panel);
    return [...dirty].sort();
  };

  const closeWorkspaceProject = async (discardDirty: boolean): Promise<{
    closedWindows: string[];
    discardedUnsavedChanges: boolean;
  }> => {
    if (props.detachedPanel) {
      throw new BridgeError('CONFLICT', 'Close the project from the main editor window');
    }
    if (store.mode !== 'edit') {
      throw new BridgeError('READONLY', 'Stop playback before closing the project');
    }
    const dirtyPanels = await queryProjectDirtyPanels();
    if (dirtyPanels.length > 0 && !discardDirty) {
      throw new BridgeError(
        'CONFLICT',
        `Workspace has unsaved changes: ${dirtyPanels.join(', ')}; pass discardDirty=true to discard them`,
      );
    }
    try {
      const result = await closeDesktopProject(discardDirty);
      return {
        ...result,
        discardedUnsavedChanges: dirtyPanels.length > 0,
      };
    } catch (reason) {
      if (reason instanceof BridgeError) throw reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      throw new BridgeError('CONFLICT', `Could not close the project: ${message}`);
    }
  };

  const saveRemoteResources = async (): Promise<SaveAllResult> => {
    const peers = await queryRemoteDirtyPeers(true);
    if (peers.length === 0) return { saved: [], failures: [] };
    const coordinator = remoteSaveCoordinator.current;
    if (!coordinator) {
      return {
        saved: [],
        failures: peers.map((peer) => ({
          label: peer.panel,
          error: 'Workspace save channel is unavailable',
        })),
      };
    }
    return coordinator.request(peers);
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
        sceneHiddenIds: store.sceneHiddenIds,
        sceneUnpickableIds: store.sceneUnpickableIds,
        logs: logsRef.current,
        dirty: sceneDirtyRef.current,
        ...resourceDocumentPathsRef.current,
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
    setGameDisplay(store.gameDisplay);
    setTreeTick((t) => t + 1);
    updateSceneDirty();
    if (!props.detachedPanel) agentBridge.observe();
    if (publish) broadcastScene();
  };
  refreshRef.current = refresh;

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
  const postSceneLibraryChanged = () => {
    syncChannel.current?.postMessage({
      type: 'scene-library-changed',
      sender: syncSender.current,
    } satisfies WorkspaceSyncMessage);
  };

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
    const openSprite = async (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      if (spriteDirty && path !== spritePath
        && !await confirmEditor(
          'Sprite import settings have unsaved changes. Discard them and open another texture?',
          { title: 'Unsaved Sprite Settings', confirmLabel: 'Discard and Open' },
        )) return;
      setSpritePath(path);
    };
    const openSpriteAtlas = async (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      if (spriteAtlasDirty && path !== spriteAtlasPath
        && !await confirmEditor(
          'Sprite Atlas has unsaved changes. Discard them and open another atlas?',
          { title: 'Unsaved Sprite Atlas', confirmLabel: 'Discard and Open' },
        )) return;
      setSpriteAtlasPath(path);
    };
    const openGameplayData = async (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      if (gameplayDataDirty && path !== gameplayDataPath
        && !await confirmEditor(
          'Gameplay data has unsaved changes. Discard them and open another asset?',
          { title: 'Unsaved Gameplay Data', confirmLabel: 'Discard and Open' },
        )) return;
      setGameplayDataPath(path);
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
        setGameplayDataPath(remap);
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
    window.addEventListener(OPEN_GAMEPLAY_DATA_EVENT, openGameplayData);
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, assetsChanged);
    return () => {
      window.removeEventListener(OPEN_MATERIAL_EVENT, openMaterial);
      window.removeEventListener(OPEN_SURFACE_SHADER_EVENT, openShader);
      window.removeEventListener(OPEN_ANIMATOR_EVENT, openAnimator);
      window.removeEventListener(OPEN_TIMELINE_ASSET_EVENT, openTimeline);
      window.removeEventListener(OPEN_ANIMATION_CLIP_EVENT, openAnimation);
      window.removeEventListener(OPEN_SPRITE_EDITOR_EVENT, openSprite);
      window.removeEventListener(OPEN_SPRITE_ATLAS_EVENT, openSpriteAtlas);
      window.removeEventListener(OPEN_GAMEPLAY_DATA_EVENT, openGameplayData);
      window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, assetsChanged);
    };
  }, [gameplayDataDirty, gameplayDataPath, spriteAtlasDirty, spriteAtlasPath, spriteDirty, spritePath]);

  useEffect(() => {
    const onExternalChange = async (event: Event) => {
      const detail = (event as CustomEvent<{
        changes?: ProjectAssetChange[];
      }>).detail;
      const changes = detail?.changes ?? [];
      await refreshProjectFiles();
      bumpScenes();
      const changed = new Map(changes.map((change) => [change.relPath.toLocaleLowerCase(), change]));
      const reload = async (
        panel: keyof typeof assetReloadEpoch,
        path: string | null,
        dirty: boolean,
        setPath: (path: string | null) => void,
      ): Promise<void> => {
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
          const discard = await confirmEditor(
            `${path} 已在磁盘外部变化，并与本地未保存草稿冲突。\n\n`
            + '确定：丢弃该编辑器窗口中的未保存草稿并加载磁盘版本。\n'
            + '取消：保留本地草稿（保存会被阻止，避免覆盖外部版本）。',
            {
              title: '外部文件冲突',
              confirmLabel: '丢弃并重载',
            },
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
      await reload('animation', animationAssetPath, animationDirty, setAnimationAssetPath);
      await reload('sequencer', timelineAssetPath, sequencerDirty, setTimelineAssetPath);
      await reload('animator', animatorPath, animatorDirty, setAnimatorPath);
      await reload('material', materialPath, materialDirty, setMaterialPath);
      await reload('shader', shaderPath, shaderDirty, setShaderPath);
      await reload('sprite', spritePath, spriteDirty, setSpritePath);
      await reload('spriteAtlas', spriteAtlasPath, spriteAtlasDirty, setSpriteAtlasPath);

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
            if (sceneDirtyRef.current && !await confirmEditor(
              `${currentScenePath} 已在磁盘外部修改，并与当前未保存场景冲突。\n\n`
              + '确定：丢弃当前未保存修改并加载磁盘版本。\n'
              + '取消：保留内存场景（直接保存会被阻止）。',
              {
                title: '外部场景冲突',
                confirmLabel: '丢弃并重载',
              },
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
    logService.log(msg, level);
    const next = [...logsRef.current, formatConsoleLog({ level, message: msg })].slice(-300);
    logsRef.current = next;
    logEnd.current = next.length;
    setLogs(next);
    broadcastScene();
  };
  logRef.current = (message) => log(message);

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
          broadcastProjectAssetsExternalChanges(changes);
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

  const instantiateSpriteAsset = async (
    path: string,
    options: { parent?: number | null; position?: [number, number, number] } = {},
  ): Promise<number> => {
    const pixelSize = await loadSpriteNativeSize(path);
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
    if (id == null) throw new Error('Sprites can only be created in Edit mode');
    if (options.position == null) store.frameSelected();
    log(`Created SpriteRenderer ${path} (entity ${id})`);
    refresh();
    return id;
  };

  const requestSpriteInstantiation = (
    path: string,
    options: { parent?: number | null; position?: [number, number, number] } = {},
  ) => {
    void instantiateSpriteAsset(path, options)
      .catch((error) => log(`Sprite creation failed: ${String(error)}`, 'error'));
  };

  useEffect(() => {
    const channel = createEditorBroadcastChannel(WORKSPACE_CHANNEL);
    if (!channel) return;
    syncChannel.current = channel;
    const saveCoordinator = new RemoteSaveCoordinator((request) => {
      channel.postMessage({
        type: 'request-save-resources',
        sender: syncSender.current,
        requestId: request.requestId,
        targets: request.targets,
        ...(request.paths ? { paths: request.paths } : {}),
        ...(request.operation ? { operation: request.operation } : {}),
      } satisfies WorkspaceSyncMessage);
    });
    remoteSaveCoordinator.current = saveCoordinator;
    channel.onmessage = (event: MessageEvent<WorkspaceSyncMessage>) => {
      const message = event.data;
      if (!message || message.sender === syncSender.current) return;
      if (message.type === 'request-dirty-state') {
        postWorkspaceDirtyState();
        return;
      }
      if (message.type === 'request-clear-logs') {
        if (!props.detachedPanel) agentBridge.clearLogs();
        return;
      }
      if (message.type === 'request-save-resources') {
        if (!message.targets.includes(syncSender.current)) return;
        void (async () => {
          const operation = message.operation ?? 'save';
          const discarding = operation === 'discard';
          const closing = operation === 'close';
          let result: SaveAllResult;
          try {
            result = message.paths?.length
              ? mergeSaveAllResults(await Promise.all(
                  message.paths.map((path) => (
                    closing
                      ? closeLocalResourceDocument(path)
                      : discarding
                      ? discardLocalResourceDocument(path)
                      : saveLocalResourceDocument(path)
                  )),
                ))
              : operation === 'save'
                ? await saveLocalResources()
                : {
                    saved: [],
                    failures: [{
                      label: props.detachedPanel ?? 'Workspace resources',
                      error: `${operation} requires at least one exact document path`,
                    }],
                  };
          } catch (reason) {
            result = {
              saved: [],
              failures: [{
                label: props.detachedPanel ?? 'Workspace resources',
                error: reason instanceof Error ? reason.message : String(reason),
              }],
            };
          }
          const resourcesClean = message.paths?.length
            ? (
                result.failures.length > 0
                  ? message.paths.every((path) => {
                      const document = localResourceDocumentsRef.current.find(
                        (candidate) => sameAssetPath(candidate.path, path),
                      );
                      return closing
                        ? !document
                        : discarding
                        ? !document || !document.dirty
                        : Boolean(document && !document.dirty);
                    })
                  : (await Promise.all(
                      message.paths.map((path) => (
                        closing
                          ? waitForLocalResourceDocumentClosed(path)
                          : discarding
                          ? waitForLocalResourceDocumentDiscarded(path)
                          : waitForLocalResourceDocumentClean(path)
                      )),
                    )).every(Boolean)
              )
            : (
                result.failures.length > 0
                  ? !resourceDirtyRef.current
                  : await waitForLocalResourcesClean()
              );
          if (!resourcesClean && result.failures.length === 0) {
            result = {
              ...result,
              failures: [{
                label: message.paths?.join(', ') ?? props.detachedPanel ?? 'Workspace resources',
                error: message.paths?.length
                  ? closing
                    ? 'The requested document remains open after its close participant completed'
                    : `The requested document remains dirty after its ${
                        discarding ? 'discard' : 'save'
                      } participant completed`
                  : 'Workspace remains dirty after its Save All participants completed',
              }],
            };
          }
          postWorkspaceDirtyState();
          channel.postMessage({
            type: 'save-resources-result',
            sender: syncSender.current,
            recipient: message.sender,
            requestId: message.requestId,
            result,
          } satisfies WorkspaceSyncMessage);
        })();
        return;
      }
      if (message.type === 'save-resources-result') {
        if (message.recipient === syncSender.current) {
          saveCoordinator.accept(message.requestId, message.sender, message.result);
        }
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
        const previous = remoteDirtyPeers.current.get(message.sender);
        const documents = mergeWorkspaceResourceDocuments(message.documents ?? []);
        const changed = (
          previous?.panel !== message.panel
          || previous?.dirty !== message.dirty
          || previous?.resourceDirty !== message.resourceDirty
          || JSON.stringify(previous?.documents ?? []) !== JSON.stringify(documents)
        );
        remoteDirtyPeers.current.set(message.sender, {
          timestamp: message.timestamp,
          panel: message.panel,
          dirty: message.dirty,
          resourceDirty: message.resourceDirty,
          documents,
        });
        if (remoteTimelinePreview.current?.sender === message.sender) {
          remoteTimelinePreview.current.lastSeenAt = Date.now();
        }
        if (changed && !props.detachedPanel) agentBridge.observeWorkspace();
        return;
      }
      if (message.type === 'window-closing') {
        const removedDirtyPeer = remoteDirtyPeers.current.delete(message.sender);
        if (removedDirtyPeer && !props.detachedPanel) agentBridge.observeWorkspace();
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
      if (message.type === 'scene-library-changed') {
        void refreshSceneLibrary()
          .then(() => {
            bumpScenes();
            if (!props.detachedPanel) agentBridge.observe();
          })
          .catch((reason) => {
            console.error('Failed to refresh the cross-window scene library', reason);
          });
        return;
      }
      if (message.type !== 'scene-state' || message.timestamp < lastRemoteTimestamp.current) return;
      try {
        applyingRemote.current = true;
        syncReady.current = true;
        lastRemoteTimestamp.current = message.timestamp;
        store.loadRemoteSceneJson(message.sceneJson, message.mode);
        store.selectMany(message.selectedIds, 'replace');
        store.setSceneInteractionState(
          message.sceneHiddenIds ?? [],
          message.sceneUnpickableIds ?? [],
        );
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
        if ('animationAssetPath' in message) {
          setAnimationAssetPath(message.animationAssetPath ?? null);
        }
        if ('animatorPath' in message) setAnimatorPath(message.animatorPath ?? null);
        if ('materialPath' in message) setMaterialPath(message.materialPath ?? null);
        if ('shaderPath' in message) setShaderPath(message.shaderPath ?? null);
        if ('spritePath' in message) setSpritePath(message.spritePath ?? null);
        if ('spriteAtlasPath' in message) {
          setSpriteAtlasPath(message.spriteAtlasPath ?? null);
        }
        if ('timelineAssetPath' in message) setTimelineAssetPath(message.timelineAssetPath ?? null);
        setSnap(store.snapshot());
        setMode(store.mode);
        setGizmo(store.gizmo);
        setSelected(store.selected);
        setSelectedIds(store.selectedIds);
        setGameResolution(store.gameResolution);
        setGameDisplay(store.gameDisplay);
        if (Array.isArray(message.logs)) {
          logService.syncConsoleLines(
            message.logs,
            props.detachedPanel ? 'main-window' : 'detached-window',
          );
          const nextLogs = logService.getEntries().map(formatConsoleLog);
          logsRef.current = nextLogs;
          logEnd.current = nextLogs.length;
          setLogs(nextLogs);
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
      saveCoordinator.dispose();
      if (remoteSaveCoordinator.current === saveCoordinator) {
        remoteSaveCoordinator.current = null;
      }
      syncChannel.current = null;
      channel.close();
    };
  }, [props.detachedPanel, store]);

  useEffect(() => {
    postWorkspaceDirtyState();
    if (!props.detachedPanel) agentBridge.observeWorkspace();
  }, [hasUnsavedChanges, props.detachedPanel]);

  const localResourceDocumentSignature = JSON.stringify(localResourceDocuments);
  useEffect(() => {
    postWorkspaceDirtyState();
    if (!props.detachedPanel) agentBridge.observeWorkspace();
  }, [localResourceDocumentSignature, props.detachedPanel]);

  useEffect(() => {
    if (booted.current) broadcastScene(true);
    if (!props.detachedPanel) agentBridge.observeWorkspace();
  }, [
    animationAssetPath,
    animatorPath,
    materialPath,
    shaderPath,
    spriteAtlasPath,
    spritePath,
    timelineAssetPath,
    sceneName,
  ]);

  const confirmDiscardSceneChanges = async (action: string) => (
    !sceneDirtyRef.current
    || await confirmEditor(`当前场景有未保存的修改。${action}将丢失这些修改，是否继续？`, {
      title: '未保存的场景修改',
      confirmLabel: '丢弃并继续',
    })
  );

  const openSceneByName = async (
    name: string,
    silent = false,
    clearRecovery = false,
  ) => {
    const json = readSceneJson(name);
    if (!json) {
      if (!silent) log(`Scene not found: ${name}`, 'warn');
      return false;
    }
    if (!silent && !await confirmDiscardSceneChanges(`打开 ${sceneFileName(name)}`)) return false;
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
      if ((!silent || clearRecovery) && isDesktopEditor()) {
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
      postSceneLibraryChanged();
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

  const ensureEditModeForFileAction = (action: string): boolean => {
    if (store.mode === 'edit') return true;
    log(`Stop Play Mode before ${action}.`, 'warn');
    return false;
  };

  const saveSceneForBuild = async () => {
    if (!ensureEditModeForFileAction('saving a scene for a build')) return false;
    const current = sceneNameRef.current;
    if (!current) {
      log('Build requires a named scene.', 'warn');
      return false;
    }
    return persistScene(current);
  };

  const saveScene = async () => {
    if (!ensureEditModeForFileAction('saving a scene')) return;
    const current = sceneNameRef.current;
    if (current) {
      await persistScene(current);
      return;
    }
    const name = await askSceneName('保存场景 — 请输入名称', 'Untitled');
    if (!name) return;
    if (sceneExists(name) && !await confirmEditor(`场景「${name}」已存在，要覆盖吗？`, {
      title: '覆盖场景',
      confirmLabel: '覆盖',
    })) return;
    await persistScene(name);
  };

  const saveEverything = async (unnamedScene?: string): Promise<boolean> => {
    if (!ensureEditModeForFileAction('saving the workspace')) return false;
    const hadDirtyScene = sceneDirtyRef.current;
    let sceneSaved = true;
    if (hadDirtyScene) {
      const current = sceneNameRef.current;
      if (current) {
        sceneSaved = await persistScene(current);
      } else {
        const name = unnamedScene
          ?? await askSceneName('保存场景 — 请输入名称', 'Untitled');
        sceneSaved = Boolean(name) && await persistScene(name!);
      }
    }
    const resources = mergeSaveAllResults([
      await saveLocalResources(),
      await saveRemoteResources(),
    ]);
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

  const saveSceneAs = async () => {
    if (!ensureEditModeForFileAction('saving a scene')) return;
    const name = await askSceneName('另存为 — 请输入新名称', sceneNameRef.current ?? 'Untitled');
    if (!name) return;
    if (sceneExists(name) && name !== sceneNameRef.current) {
      if (!await confirmEditor(`场景「${name}」已存在，要覆盖吗？`, {
        title: '覆盖场景',
        confirmLabel: '覆盖',
      })) return;
    }
    await persistScene(name);
  };

  const newScene = async () => {
    if (!ensureEditModeForFileAction('creating a scene')) return;
    const name = await askSceneName('新建场景 — 请输入名称', 'NewScene');
    if (!name) return;
    if (sceneExists(name) && !await confirmEditor(`场景「${name}」已存在，要覆盖吗？`, {
      title: '覆盖场景',
      confirmLabel: '覆盖',
    })) return;
    if (!await confirmDiscardSceneChanges('新建场景')) return;
    store.newScene();
    await persistScene(name);
    refresh();
  };

  agentSceneProviderRef.current = {
    list: () => ({
      ready: isSceneLibraryReady(),
      activeScene: sceneNameRef.current,
      dirty: sceneDirtyRef.current,
      scenes: listScenes().map((scene) => ({ ...scene })),
    }),
    create: async ({ name: rawName, overwrite, discardDirty }) => {
      if (!isSceneLibraryReady()) {
        throw new BridgeError('NOT_READY', 'Scene library is still loading');
      }
      if (store.mode !== 'edit') {
        throw new BridgeError('READONLY', 'Stop playback before creating a scene');
      }
      const name = normalizeSceneName(rawName);
      if (!name) throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
      if (sceneDirtyRef.current && !discardDirty) {
        throw new BridgeError(
          'CONFLICT',
          'The current scene has unsaved changes; pass discardDirty=true to replace it',
        );
      }
      if (sceneExists(name) && !overwrite) {
        throw new BridgeError(
          'CONFLICT',
          `${sceneFileName(name)} already exists; pass overwrite=true to replace it`,
        );
      }
      store.newScene();
      if (!await persistScene(name)) {
        throw new BridgeError('IO_ERROR', `Failed to create ${sceneFileName(name)}`);
      }
      log(`Created ${sceneFileName(name)} from AgentBridge`);
      refresh();
      return { name };
    },
    open: async ({ name: rawName, discardDirty }) => {
      if (!isSceneLibraryReady()) {
        throw new BridgeError('NOT_READY', 'Scene library is still loading');
      }
      if (store.mode !== 'edit') {
        throw new BridgeError('READONLY', 'Stop playback before opening a scene');
      }
      const name = normalizeSceneName(rawName);
      if (!name) throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
      if (!sceneExists(name)) {
        throw new BridgeError('IO_ERROR', `Scene not found: ${sceneFileName(name)}`);
      }
      if (sceneDirtyRef.current && !discardDirty) {
        throw new BridgeError(
          'CONFLICT',
          'The current scene has unsaved changes; pass discardDirty=true to open another scene',
        );
      }
      if (!await openSceneByName(name, true, true)) {
        throw new BridgeError('IO_ERROR', `Failed to open ${sceneFileName(name)}`);
      }
      log(`Opened ${sceneFileName(name)} from AgentBridge`);
      return { name };
    },
    save: async ({ name: rawName, overwrite }) => {
      if (!isSceneLibraryReady()) {
        throw new BridgeError('NOT_READY', 'Scene library is still loading');
      }
      if (store.mode !== 'edit') {
        throw new BridgeError('READONLY', 'Stop playback before saving a scene');
      }
      const current = sceneNameRef.current;
      const name = rawName === undefined ? current : normalizeSceneName(rawName);
      if (!name) {
        throw new BridgeError(
          'INVALID_ARGS',
          'The current scene is unnamed; provide "name"',
        );
      }
      if (name !== current && sceneExists(name) && !overwrite) {
        throw new BridgeError(
          'CONFLICT',
          `${sceneFileName(name)} already exists; pass overwrite=true to replace it`,
        );
      }
      if (!await persistScene(name)) {
        throw new BridgeError('IO_ERROR', `Failed to save ${sceneFileName(name)}`);
      }
      return { name };
    },
    saveAll: async ({ unnamedScene: rawName, overwrite }) => {
      if (!isSceneLibraryReady()) {
        throw new BridgeError('NOT_READY', 'Scene library is still loading');
      }
      if (store.mode !== 'edit') {
        throw new BridgeError('READONLY', 'Stop playback before saving the workspace');
      }
      const unnamedScene = rawName === undefined
        ? undefined
        : (normalizeSceneName(rawName) ?? undefined);
      if (rawName !== undefined && unnamedScene === undefined) {
        throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
      }
      if (sceneDirtyRef.current && !sceneNameRef.current && !unnamedScene) {
        throw new BridgeError(
          'INVALID_ARGS',
          'The dirty scene is unnamed; provide "name" to save all without a dialog',
        );
      }
      if (
        sceneDirtyRef.current
        && !sceneNameRef.current
        && unnamedScene
        && sceneExists(unnamedScene)
        && !overwrite
      ) {
        throw new BridgeError(
          'CONFLICT',
          `${sceneFileName(unnamedScene)} already exists; pass overwrite=true to replace it`,
        );
      }
      if (!await saveEverything(unnamedScene)) {
        throw new BridgeError('IO_ERROR', 'Save All completed with errors');
      }
      workspaceDirtyRef.current = false;
      resourceDirtyRef.current = false;
      const remoteDirty = await queryRemoteDirtyPanels();
      if (remoteDirty.length) {
        throw new BridgeError(
          'CONFLICT',
          `Detached panels still have unsaved changes: ${remoteDirty.join(', ')}`,
        );
      }
      return { sceneName: sceneNameRef.current };
    },
    rename: async ({ oldName: rawOldName, newName: rawNewName }) => {
      if (!isSceneLibraryReady()) {
        throw new BridgeError('NOT_READY', 'Scene library is still loading');
      }
      if (store.mode !== 'edit') {
        throw new BridgeError('READONLY', 'Stop playback before renaming a scene');
      }
      const requestedOldName = normalizeSceneName(rawOldName);
      const newName = normalizeSceneName(rawNewName);
      if (!requestedOldName || !newName) {
        throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
      }
      const oldName = listScenes().find(
        (scene) => scene.name.toLocaleLowerCase() === requestedOldName.toLocaleLowerCase(),
      )?.name;
      if (!oldName) {
        throw new BridgeError('INVALID_ARGS', `Scene not found: ${sceneFileName(requestedOldName)}`);
      }
      const collision = listScenes().find(
        (scene) => (
          scene.name.toLocaleLowerCase() === newName.toLocaleLowerCase()
          && scene.name !== oldName
        ),
      );
      if (collision) {
        throw new BridgeError('CONFLICT', `${sceneFileName(collision.name)} already exists`);
      }
      const renamed = await renameScene(oldName, newName);
      if (!renamed) {
        throw new BridgeError(
          'CONFLICT',
          `Failed to rename ${sceneFileName(oldName)} to ${sceneFileName(newName)}`,
        );
      }
      if (sceneNameRef.current?.toLocaleLowerCase() === oldName.toLocaleLowerCase()) {
        sceneNameRef.current = renamed;
        setSceneName(renamed);
      }
      postSceneLibraryChanged();
      bumpScenes();
      refresh();
      log(`Renamed ${sceneFileName(oldName)} to ${sceneFileName(renamed)} from AgentBridge`);
      return {
        oldName,
        name: renamed,
        activeScene: sceneNameRef.current,
      };
    },
    delete: async ({ name: rawName, expectedRevision }) => {
      if (!isSceneLibraryReady()) {
        throw new BridgeError('NOT_READY', 'Scene library is still loading');
      }
      if (store.mode !== 'edit') {
        throw new BridgeError('READONLY', 'Stop playback before deleting a scene');
      }
      const requestedName = normalizeSceneName(rawName);
      if (!requestedName) throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
      const name = listScenes().find(
        (scene) => scene.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase(),
      )?.name;
      if (!name) {
        throw new BridgeError('INVALID_ARGS', `Scene not found: ${sceneFileName(requestedName)}`);
      }
      if (sceneNameRef.current?.toLocaleLowerCase() === name.toLocaleLowerCase()) {
        throw new BridgeError(
          'CONFLICT',
          'The active scene cannot be deleted; open another scene first',
        );
      }
      await deleteScene(name, expectedRevision);
      postSceneLibraryChanged();
      bumpScenes();
      refresh();
      log(`Deleted ${sceneFileName(name)} from AgentBridge`);
      return { name };
    },
  };
  const collectWorkspaceDocumentMutationTargets = async (requestedPath: string) => {
    const remotePeers = await queryRemoteWorkspacePeers();
    const localMatches = localResourceDocumentsRef.current.filter(
      (document) => sameAssetPath(document.path, requestedPath),
    );
    const remoteMatches = remotePeers.flatMap((peer) => (
      peer.documents
        .filter((document) => sameAssetPath(document.path, requestedPath))
        .map((document) => ({ peer, document }))
    ));
    return [
      ...localMatches.map((document) => ({
        host: 'main',
        panel: document.panel,
        document,
        peer: null,
      })),
      ...remoteMatches.map(({ peer, document }) => ({
        host: peer.sender,
        panel: peer.panel,
        document,
        peer,
      })),
    ];
  };
  const resolveWorkspaceDocumentMutationTarget = async (requestedPath: string) => {
    const matches = await collectWorkspaceDocumentMutationTargets(requestedPath);
    if (matches.length === 0) {
      throw new BridgeError(
        'INVALID_ARGS',
        `No open resource document matches "${requestedPath}"`,
      );
    }
    const dirtyMatches = matches.filter((match) => match.document.dirty);
    const canonicalPath = (dirtyMatches[0] ?? matches[0]).document.path;
    if (dirtyMatches.length === 0) return { canonicalPath, target: null, matches };
    const dirtyHosts = new Set(dirtyMatches.map((match) => match.host));
    if (dirtyHosts.size > 1 || dirtyMatches.length > 1) {
      throw new BridgeError(
        'CONFLICT',
        `Multiple editor windows contain dirty drafts for "${canonicalPath}"`,
        {
          hosts: dirtyMatches.map((match) => ({
            panel: match.panel,
            sender: match.host,
            kind: match.document.kind,
          })),
        },
      );
    }
    return { canonicalPath, target: dirtyMatches[0], matches };
  };

  agentWorkspaceProviderRef.current = {
    assertDiskMutationAllowed: async (options = {}) => {
      if ((!options.allowSceneDirty && sceneDirtyRef.current) || resourceDirtyRef.current) {
        throw new BridgeError(
          'CONFLICT',
          'Workspace has unsaved changes; run scene.save_all before changing project files',
        );
      }
      const remoteDirty = await queryRemoteDirtyPanels();
      if (remoteDirty.length) {
        throw new BridgeError(
          'CONFLICT',
          `Detached panels have unsaved changes: ${remoteDirty.join(', ')}`,
        );
      }
    },
    closeProject: closeWorkspaceProject,
    saveDocument: async (requestedPath: string) => {
      const { canonicalPath, target } = await resolveWorkspaceDocumentMutationTarget(
        requestedPath,
      );
      if (!target) {
        return { path: canonicalPath, saved: false, unchanged: true };
      }
      if (target.document.conflicted) {
        throw new BridgeError(
          'CONFLICT',
          `Document "${canonicalPath}" changed on disk after its draft was loaded`,
          {
            path: canonicalPath,
            allowedActions: [
              'workspace.discard_document',
              'workspace.reload_document',
              'workspace.close_document with dirtyAction=discard',
            ],
          },
        );
      }
      let result: SaveAllResult;
      if (target.peer) {
        const coordinator = remoteSaveCoordinator.current;
        if (!coordinator) {
          throw new BridgeError(
            'NOT_READY',
            'Workspace save channel is unavailable',
          );
        }
        result = await coordinator.request(
          [{ sender: target.peer.sender, panel: target.peer.panel }],
          [canonicalPath],
        );
      } else {
        result = await saveLocalResourceDocument(canonicalPath);
        if (
          result.failures.length === 0
          && !await waitForLocalResourceDocumentClean(canonicalPath)
        ) {
          result = {
            ...result,
            failures: [{
              label: canonicalPath,
              error: 'The requested document remains dirty after its save participant completed',
            }],
          };
        }
      }
      if (result.failures.length > 0) {
        throw new BridgeError(
          'IO_ERROR',
          `Could not save "${canonicalPath}": ${
            result.failures.map((failure) => failure.error).join('; ')
          }`,
          { failures: structuredClone(result.failures) },
        );
      }
      if (result.saved.length === 0) {
        throw new BridgeError(
          'NOT_READY',
          `No resource editor accepted the save request for "${canonicalPath}"`,
        );
      }
      postWorkspaceDirtyState();
      return { path: canonicalPath, saved: true, unchanged: false };
    },
    discardDocument: async (requestedPath: string) => {
      const { canonicalPath, target } = await resolveWorkspaceDocumentMutationTarget(
        requestedPath,
      );
      if (!target) {
        return { path: canonicalPath, discarded: false, unchanged: true };
      }
      let result: SaveAllResult;
      if (target.peer) {
        const coordinator = remoteSaveCoordinator.current;
        if (!coordinator) {
          throw new BridgeError(
            'NOT_READY',
            'Workspace document channel is unavailable',
          );
        }
        result = await coordinator.request(
          [{ sender: target.peer.sender, panel: target.peer.panel }],
          [canonicalPath],
          'discard',
        );
      } else {
        result = await discardLocalResourceDocument(canonicalPath);
        if (
          result.failures.length === 0
          && !await waitForLocalResourceDocumentDiscarded(canonicalPath)
        ) {
          result = {
            ...result,
            failures: [{
              label: canonicalPath,
              error: 'The requested document remains dirty after its discard participant completed',
            }],
          };
        }
      }
      if (result.failures.length > 0) {
        throw new BridgeError(
          'IO_ERROR',
          `Could not discard "${canonicalPath}": ${
            result.failures.map((failure) => failure.error).join('; ')
          }`,
          { failures: structuredClone(result.failures) },
        );
      }
      if (result.saved.length === 0) {
        throw new BridgeError(
          'NOT_READY',
          `No resource editor accepted the discard request for "${canonicalPath}"`,
        );
      }
      postWorkspaceDirtyState();
      return { path: canonicalPath, discarded: true, unchanged: false };
    },
    reloadDocument: async (requestedPath: string) => {
      const initial = await resolveWorkspaceDocumentMutationTarget(requestedPath);
      const canonicalPath = initial.canonicalPath;
      if (initial.matches.length > 1) {
        throw new BridgeError(
          'CONFLICT',
          `Multiple editor windows contain "${canonicalPath}"`,
          {
            hosts: initial.matches.map((match) => ({
              panel: match.panel,
              sender: match.host,
              kind: match.document.kind,
              dirty: match.document.dirty,
            })),
          },
        );
      }
      const [match] = initial.matches;
      const target: AgentResourceEditorTarget = {
        kind: match.document.kind,
        panel: match.document.panel,
        path: canonicalPath,
      };
      const discarded = match.document.dirty;
      if (discarded) {
        await agentWorkspaceProviderRef.current!.discardDocument(canonicalPath);
      }

      const remaining = await collectWorkspaceDocumentMutationTargets(canonicalPath);
      if (remaining.length > 1) {
        throw new BridgeError(
          'CONFLICT',
          `Multiple editor windows still contain "${canonicalPath}" after discard`,
          {
            hosts: remaining.map((candidate) => ({
              panel: candidate.panel,
              sender: candidate.host,
              kind: candidate.document.kind,
              dirty: candidate.document.dirty,
            })),
          },
        );
      }
      if (remaining.length === 1) {
        await agentWorkspaceProviderRef.current!.closeDocument(
          canonicalPath,
          'reject',
        );
      }
      await agentWorkspaceProviderRef.current!.openAsset(target);
      return { target, discarded };
    },
    closeDocument: async (
      requestedPath: string,
      dirtyAction: 'reject' | 'save' | 'discard' = 'reject',
    ) => {
      const initial = await resolveWorkspaceDocumentMutationTarget(requestedPath);
      const canonicalPath = initial.canonicalPath;
      const wasDirty = initial.target != null;
      let appliedDirtyAction: 'none' | 'save' | 'discard' = 'none';
      if (wasDirty) {
        if (dirtyAction === 'reject') {
          throw new BridgeError(
            'CONFLICT',
            `Document "${canonicalPath}" has unsaved changes`,
            {
              path: canonicalPath,
              allowedDirtyActions: ['save', 'discard'],
            },
          );
        }
        if (dirtyAction === 'save') {
          appliedDirtyAction = 'save';
          await agentWorkspaceProviderRef.current!.saveDocument(canonicalPath);
        } else {
          appliedDirtyAction = 'discard';
          await agentWorkspaceProviderRef.current!.discardDocument(canonicalPath);
        }
      }

      const matches = wasDirty
        ? await collectWorkspaceDocumentMutationTargets(canonicalPath)
        : initial.matches;
      if (matches.length === 0) {
        postWorkspaceDirtyState();
        return {
          path: canonicalPath,
          closed: true,
          dirtyAction: appliedDirtyAction,
        };
      }
      if (matches.length > 1) {
        throw new BridgeError(
          'CONFLICT',
          `Multiple editor windows contain "${canonicalPath}"`,
          {
            hosts: matches.map((match) => ({
              panel: match.panel,
              sender: match.host,
              kind: match.document.kind,
              dirty: match.document.dirty,
            })),
          },
        );
      }

      const [target] = matches;
      let result: SaveAllResult;
      if (target.peer) {
        const coordinator = remoteSaveCoordinator.current;
        if (!coordinator) {
          throw new BridgeError(
            'NOT_READY',
            'Workspace document channel is unavailable',
          );
        }
        result = await coordinator.request(
          [{ sender: target.peer.sender, panel: target.peer.panel }],
          [canonicalPath],
          'close',
        );
      } else {
        result = await closeLocalResourceDocument(canonicalPath);
        if (
          result.failures.length === 0
          && !await waitForLocalResourceDocumentClosed(canonicalPath)
        ) {
          result = {
            ...result,
            failures: [{
              label: canonicalPath,
              error: 'The requested document remains open after its close participant completed',
            }],
          };
        }
      }
      if (result.failures.length > 0) {
        throw new BridgeError(
          'IO_ERROR',
          `Could not close "${canonicalPath}": ${
            result.failures.map((failure) => failure.error).join('; ')
          }`,
          { failures: structuredClone(result.failures) },
        );
      }
      if (result.saved.length === 0) {
        throw new BridgeError(
          'NOT_READY',
          `No resource editor accepted the close request for "${canonicalPath}"`,
        );
      }
      postWorkspaceDirtyState();
      return {
        path: canonicalPath,
        closed: true,
        dirtyAction: appliedDirtyAction,
      };
    },
    listDocuments: async () => {
      const remotePeers = await queryRemoteWorkspacePeers();
      const remoteDirty = new Set(
        remotePeers.filter((peer) => peer.dirty).map((peer) => peer.panel),
      );
      const documents: AgentWorkspaceDocument[] = [
        {
          kind: 'scene',
          panel: 'scene',
          path: sceneNameRef.current
            ? `Assets/Scenes/${sceneFileName(sceneNameRef.current)}`
            : null,
          dirty: sceneDirtyRef.current,
        },
      ];
      const resourceDocuments = mergeWorkspaceResourceDocuments(
        localResourceDocumentsRef.current,
        ...remotePeers.map((peer) => peer.documents),
      );
      documents.push(...resourceDocuments);
      if (buildSettingsDirty || remoteDirty.has('build')) {
        documents.push({
          kind: 'build-settings',
          panel: 'build',
          path: null,
          dirty: true,
        });
      }
      if (projectSettingsDirty || remoteDirty.has('projectSettings')) {
        documents.push({
          kind: 'project-settings',
          panel: 'projectSettings',
          path: null,
          dirty: true,
        });
      }
      return documents;
    },
    openAsset: async (target: AgentResourceEditorTarget) => {
      const currentPath = (() => {
        switch (target.kind) {
          case 'animation':
            return timelineAssetPath == null ? animationAssetPath : null;
          case 'timeline':
            return timelineAssetPath;
          case 'animator':
          case 'avatar-mask':
            return animatorPath;
          case 'material':
          case 'material-instance':
            return materialPath;
          case 'shader':
            return shaderPath;
          case 'sprite':
            return spritePath;
          case 'sprite-atlas':
            return spriteAtlasPath;
        }
      })();
      const locallyDirty = (() => {
        switch (target.panel) {
          case 'timeline':
            return animationDirty || sequencerDirty;
          case 'animator':
            return animatorDirty;
          case 'material':
            return materialDirty;
          case 'shader':
            return shaderDirty;
          case 'spriteEditor':
            return spriteDirty;
          case 'spriteAtlas':
            return spriteAtlasDirty;
          default:
            return false;
        }
      })();
      if (!sameAssetPath(currentPath, target.path)) {
        const preservesDrafts = resourceEditorPreservesDrafts(target.kind);
        if (locallyDirty && !preservesDrafts) {
          throw new BridgeError(
            'CONFLICT',
            `${target.panel} has unsaved changes; save all before opening another asset`,
          );
        }
        const remoteDirty = await queryRemoteDirtyPanels();
        if (remoteDirty.includes(target.panel) && !preservesDrafts) {
          throw new BridgeError(
            'CONFLICT',
            `Detached ${target.panel} has unsaved changes; save all before opening another asset`,
          );
        }
      }
      switch (target.kind) {
        case 'animation':
          setAnimationAssetPath(target.path);
          setTimelineAssetPath(null);
          break;
        case 'timeline':
          setTimelineAssetPath(target.path);
          break;
        case 'animator':
        case 'avatar-mask':
          setAnimatorPath(target.path);
          break;
        case 'material':
        case 'material-instance':
          setMaterialPath(target.path);
          break;
        case 'shader':
          setShaderPath(target.path);
          break;
        case 'sprite':
          setSpritePath(target.path);
          break;
        case 'sprite-atlas':
          setSpriteAtlasPath(target.path);
          break;
      }
      window.dispatchEvent(new CustomEvent('mengine:focus-panel', {
        detail: { panel: target.panel, activateWindow: false },
      }));
    },
    createAsset: async (request: AgentCreateAssetRequest) => {
      switch (request.kind) {
        case 'animation': {
          const { createProjectAnimationClip } = await import('./panels/Timeline');
          const path = await createProjectAnimationClip('New Animation', false);
          return { primaryPath: path, createdPaths: [path] };
        }
        case 'animator': {
          const { createProjectAnimatorControllerDetailed } = await import('./panels/Animator');
          return createProjectAnimatorControllerDetailed(false);
        }
        case 'avatar-mask': {
          const { createProjectAvatarMask } = await import('./panels/AvatarMask');
          const path = await createProjectAvatarMask(false);
          return { primaryPath: path, createdPaths: [path] };
        }
        case 'material': {
          const { createProjectMaterial } = await import('./panels/Material');
          const path = await createProjectMaterial(false);
          return { primaryPath: path, createdPaths: [path] };
        }
        case 'material-instance': {
          const { createProjectMaterialInstanceDetailed } = await import('./panels/MaterialInstance');
          return createProjectMaterialInstanceDetailed(request.parentPath, false);
        }
        case 'shader': {
          const { createProjectSurfaceShader } = await import('./panels/SurfaceShader');
          const path = await createProjectSurfaceShader(false);
          return { primaryPath: path, createdPaths: [path] };
        }
        case 'sprite-atlas': {
          const { createProjectSpriteAtlas } = await import('./panels/SpriteAtlasEditor');
          const path = await createProjectSpriteAtlas(false);
          return { primaryPath: path, createdPaths: [path] };
        }
        case 'timeline': {
          const { createProjectTimeline } = await import('./panels/Sequencer');
          const path = await createProjectTimeline('New Timeline', false);
          return { primaryPath: path, createdPaths: [path] };
        }
      }
    },
    instantiateAsset: async (target: AgentInstantiableAssetTarget) => {
      switch (target.kind) {
        case 'prefab': {
          const entity = await instantiateProjectPrefab(store, target.path);
          log(`Instantiated ${target.path} from AgentBridge (entity ${entity})`);
          refresh();
          return entity;
        }
        case 'model': {
          const entity = store.spawnModel(target.path);
          if (entity == null) throw new Error('Models can only be created in Edit mode');
          log(`Instantiated model ${target.path} from AgentBridge (entity ${entity})`);
          refresh();
          return entity;
        }
        case 'sprite':
          return instantiateSpriteAsset(target.path);
      }
    },
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
      if (warning && !await confirmEditor(warning, {
        title: '关闭编辑器',
        confirmLabel: '关闭',
      })) {
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
      await alertEditor(`关闭编辑器失败：${message}`, { title: '关闭失败' });
    }
  };

  const requestProjectClose = async (): Promise<void> => {
    if (!ensureEditModeForFileAction('closing the project')) return;
    try {
      const dirtyPanels = await queryProjectDirtyPanels();
      if (
        dirtyPanels.length > 0
        && !await confirmEditor(
          `以下窗口有未保存的场景或资源修改：\n\n`
          + `${dirtyPanels.map((panel) => `• ${panel}`).join('\n')}`
          + '\n\n关闭工程将丢失这些修改，是否继续？',
          {
            title: '关闭工程',
            confirmLabel: '丢弃并关闭',
          },
        )
      ) {
        return;
      }
      await closeWorkspaceProject(dirtyPanels.length > 0);
      window.location.reload();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      await alertEditor(`关闭工程失败：${message}`, { title: '关闭失败' });
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

  const openSceneDialog = async () => {
    if (!ensureEditModeForFileAction('opening a scene')) return;
    const scenes = listScenes();
    if (!scenes.length) {
      log('还没有已保存的场景。先 File → New Scene 并命名。', 'warn');
      return;
    }
    const hint = scenes.map((s) => s.name).join(', ');
    const name = await askSceneName(`打开场景（已有: ${hint}）`, scenes[0].name);
    if (!name) return;
    await openSceneByName(name);
  };

  const applyEditorPrefs = (prefs: {
    gameResolution?: GameResolution | null;
    gameDisplay?: number;
    gameAspect?: string;
    gameOrientation?: string;
  }) => {
    const resolution = Object.prototype.hasOwnProperty.call(prefs, 'gameResolution')
      ? normalizeGameResolution(prefs.gameResolution)
      : legacyGameResolution(prefs.gameAspect, prefs.gameOrientation);
    store.setGameResolution(resolution);
    store.setGameDisplay(normalizeGameDisplay(prefs.gameDisplay));
  };

  const persistGameViewPrefs = () => {
    void setEditorPrefs({
      gameResolution: store.gameResolution,
      gameDisplay: store.gameDisplay,
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
            const shouldRestore = await confirmEditor(
              `检测到 ${sceneFileName(recovery.sceneName)} 的自动恢复点（${recordedAt}，${recovery.entityCount} 个节点）。\n\n`
              + '确定：恢复未保存修改；取消：丢弃该恢复点并继续打开磁盘版本。',
              {
                title: '场景自动恢复',
                confirmLabel: '恢复',
                cancelLabel: '丢弃',
              },
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
          if (await confirmEditor(
            '自动恢复文件已损坏或不兼容。是否删除它，避免下次启动再次提示？',
            {
              title: '恢复文件损坏',
              confirmLabel: '删除',
            },
          )) {
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
      if (!props.detachedPanel) agentBridge.markEditorBootReady(store);
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
        void newScene();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveScene();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openSceneDialog();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (store.duplicateSelection() != null) {
          log('Duplicate');
          refresh();
        }
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (store.copySelection()) log('Copy');
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        if (store.cutSelection()) log('Cut');
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (store.paste()) {
          log('Paste');
          refresh();
        }
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
        if (store.deleteSelection()) {
          log('Delete');
          refresh();
        }
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
  const sceneHiddenIds = store.sceneHiddenIds;
  const viewportEntities = viewTab === 'scene' && sceneHiddenIds.length
    ? snap.entities.filter((entity) => store.sceneVisible(entity.entity))
    : snap.entities;
  const viewportSelected = viewTab === 'scene'
    && selected != null
    && (!store.sceneVisible(selected) || !store.scenePickable(selected))
    ? null
    : selected;
  const viewportSelectedIds = viewTab === 'scene'
    ? selectedIds.filter((id) => store.sceneVisible(id) && store.scenePickable(id))
    : selectedIds;
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
        onCloseProject={() => void requestProjectClose()}
        onExit={() => void requestEditorClose('application')}
        onUndo={() => {
          store.undo();
          refresh();
        }}
        onRedo={() => {
          store.redo();
          refresh();
        }}
        onCut={() => {
          if (store.cutSelection()) log('Cut');
        }}
        onCopy={() => {
          if (store.copySelection()) log('Copy');
        }}
        onPaste={() => {
          if (!store.paste()) return;
          log('Paste');
          refresh();
        }}
        onDuplicate={() => {
          if (store.duplicateSelection() == null) return;
          log('Duplicate');
          refresh();
        }}
        onDelete={() => {
          if (!store.deleteSelection()) return;
          log('Delete');
          refresh();
        }}
        onSelectAll={() => {
          store.selectAllVisible();
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
        onPivotMode={(next) => {
          updateSceneViewPreferences({ pivotMode: next });
        }}
        onHandleOrientation={(next) => {
          updateSceneViewPreferences({ handleOrientation: next });
        }}
        onPlay={() => {
          if (store.mode !== 'edit') return;
          store.play();
          setViewTab('game');
          log('Entered Play Mode → Game');
          refresh();
        }}
        onPause={() => {
          if (store.mode === 'edit') return;
          store.pause();
          log(store.mode === 'pause' ? 'Paused' : 'Resumed');
          refresh();
        }}
        onStop={() => {
          if (store.mode === 'edit') return;
          store.stop();
          setViewTab('scene');
          log('Exited Play Mode → Scene');
          refresh();
        }}
        onStep={() => {
          if (!store.step(1 / 60)) return;
          log(`Advanced paused Play Mode to frame ${store.snapshot().frame}`);
          refresh();
        }}
      />

      <DockWorkspace
        detachedPanel={props.detachedPanel}
        dirtyPanels={dirtyPanels}
        onVisiblePanelsChange={updateVisiblePanels}
        onLayoutChange={updatePanelLayout}
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
                requestSpriteInstantiation(path, { parent });
              }}
            />
          ),
          viewport: (
            <Viewport
              tab={viewTab}
              clearColor={snap.clearColor}
              entities={viewportEntities}
              selected={viewportSelected}
              selectedIds={viewportSelectedIds}
              sceneHiddenIds={sceneHiddenIds}
              isPickable={(id) => store.scenePickable(id)}
              simulationTime={store.simulationTime}
              gizmo={gizmo}
              pivotMode={pivotMode}
              handleOrientation={handleOrientation}
              playing={mode !== 'edit'}
              sceneCamera={store.sceneCamera}
              gameResolution={gameResolution}
              gameDisplay={gameDisplay}
              timelineCameraPreview={store.timelineCameraPreview()}
              timelineParticlePreviews={store.timelineParticlePreviews()}
              activeInHierarchy={(id) => snapshotWorldTransforms.get(id)?.active === true}
              onPick={(id, modifiers) => {
                if (!store.scenePickable(id)) return;
                if (modifiers.toggle) store.selectMany([id], 'toggle', id);
                else if (modifiers.additive) store.selectMany([id], 'add', id);
                else store.select(id);
                refresh();
              }}
              onMarqueeSelect={(ids, selectionMode) => {
                const next = combineMarqueeSelection(
                  store.selectedIds,
                  ids.filter((id) => store.scenePickable(id)),
                  selectionMode,
                );
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
              onGizmoScaleUniform={(entity, pivot, factor) => {
                store.scaleSelectedTransformsUniform(entity, pivot, factor);
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
              onGameDisplay={(display) => {
                store.setGameDisplay(display);
                setGameDisplay(store.gameDisplay);
                persistGameViewPrefs();
                refresh();
              }}
              onFrame={() => {
                store.frameSelected();
                refresh();
              }}
              onInstantiatePrefab={(path, position) => {
                void instantiateProjectPrefab(store, path, null, position)
                  .then((entity) => {
                    log(`Instantiated ${path} in Scene View (entity ${entity})`);
                    refresh();
                  })
                  .catch((error) => log(`Prefab instantiate failed: ${String(error)}`, 'error'));
              }}
              onInstantiateModel={(path, position) => {
                const entity = store.spawnModel(path, position);
                if (entity == null) {
                  log('Models can only be created in Edit mode', 'error');
                  return;
                }
                log(`Instantiated model ${path} in Scene View (entity ${entity})`);
                refresh();
              }}
              onInstantiateSprite={(path, position) => {
                requestSpriteInstantiation(path, { position });
              }}
              onLog={log}
            />
          ),
          inspector: (
            <Inspector
              entity={authoredInspectorEntities.find((e) => e.entity === selected) ?? null}
              entities={authoredInspectorEntities}
              canvasSize={gameResolution ?? { width: 800, height: 600 }}
              previewNotice={timelinePreviewActive
                ? 'Timeline Preview is active. Inspector fields show and edit authored values.'
                : undefined}
              selectedIds={selectedIds}
              selectionCount={selectedIds.length}
              onPrefabApply={async (entity) => {
                try {
                  const path = await applySelectedPrefab(store, undefined, entity);
                  log(`Applied ${path}`);
                  refresh();
                } catch (error) {
                  log(`Prefab apply failed: ${String(error)}`, 'error');
                }
              }}
              onPrefabRevert={async (entity) => {
                try {
                  const path = await revertSelectedPrefab(store, undefined, entity);
                  log(`Reverted ${path}`);
                  refresh();
                } catch (error) {
                  log(`Prefab revert failed: ${String(error)}`, 'error');
                }
              }}
              onPrefabUnpack={async (entity) => {
                try {
                  const path = unpackSelectedPrefab(store, entity);
                  log(`Unpacked ${path}`);
                  refresh();
                } catch (error) {
                  log(`Prefab unpack failed: ${String(error)}`, 'error');
                }
              }}
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
              tagOptions={getTagOptions()}
              layerOptions={getGameLayerOptions()}
              onSetTag={(entity, tag) => {
                store.setTag(entity, tag);
                refresh();
              }}
              onSetLayer={(entity, layer) => {
                store.setLayer(entity, layer);
                refresh();
              }}
              onSetActives={(entities, active) => {
                store.setActives(entities, active);
                refresh();
              }}
              onSetTags={(entities, tag) => {
                store.setTags(entities, tag);
                refresh();
              }}
              onSetLayers={(entities, layer) => {
                store.setLayers(entities, layer);
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
              onAddComponents={(entities, type, value) => {
                const changed = store.addComponents(entities, type, value);
                if (changed > 0) {
                  log(`Added ${type} to ${changed} GameObjects`);
                  refresh();
                } else {
                  log(`Cannot add ${type} to the selection`, 'warn');
                }
              }}
              onRemoveComponent={(entity, type) => {
                if (store.removeComponent(entity, type)) {
                  log(`Removed ${type}`);
                  refresh();
                } else {
                  log(`Cannot remove ${type}; another component may require it`, 'warn');
                }
              }}
              onRemoveComponents={(entities, type) => {
                const changed = store.removeComponents(entities, type);
                if (changed > 0) {
                  log(`Removed ${type} from ${changed} GameObjects`);
                  refresh();
                } else {
                  log(`Cannot remove ${type} from the selection; another component may require it`, 'warn');
                }
              }}
              onSetComponent={(entity, type, value) => {
                if (type === 'MeshRenderer') {
                  const current = store.snapshot().entities
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
              onPatchComponents={(type, updates) => {
                store.patchComponents(type, updates);
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
              onCreatePrefabs={async (entityIds, folder) => {
                const paths = await createProjectPrefabsFromEntities(store, entityIds, folder);
                refresh();
                return paths;
              }}
              onCreateAsset={async (kind) => {
                const provider = agentWorkspaceProviderRef.current;
                if (!provider) throw new Error('Workspace asset service is not ready');
                return provider.createAsset({ kind });
              }}
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
              onInstantiateSprite={(path) => requestSpriteInstantiation(path)}
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
              onOpenEffekseer={(path) => {
                setEffekseerPreviewPath(path);
                window.dispatchEvent(new CustomEvent('mengine:focus-panel', {
                  detail: { panel: 'effekseer', activateWindow: true },
                }));
              }}
              onOpenGameplayData={(path) => openGameplayDataAsset(path)}
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
                    postSceneLibraryChanged();
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
                  postSceneLibraryChanged();
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
                  if (!await confirmEditor(
                    'This asset transaction changes project files on disk. Save the current scene and all resource documents before continuing?',
                    {
                      title: 'Save Before Asset Transaction',
                      confirmLabel: 'Save and Continue',
                    },
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
                  await alertEditor(
                    `Save or discard changes in the detached window(s) before changing project assets:\n\n${panels}`,
                    { title: 'Asset Transaction Blocked' },
                  );
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
                setGameplayDataPath(remap);
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
                setGameplayDataPath(closeDeleted);
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
                  onDocumentsChange={setAnimationDocuments}
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
                    const current = store.snapshot().entities
                      .find((entry) => entry.entity === entity)
                      ?.components.TimelineDirector;
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
                  onDocumentsChange={setSequencerDocuments}
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
              onCloseAsset={() => setAnimatorPath(null)}
              onAssignAnimator={(entity, path) => {
                const current = store.snapshot().entities
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
              onDocumentsChange={setAnimatorDocuments}
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
              onCloseAsset={() => setMaterialPath(null)}
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
              onDocumentsChange={setMaterialDocuments}
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
              onCloseAsset={() => setShaderPath(null)}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setShaderDirty}
              onDocumentsChange={setShaderDocuments}
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
              onCloseAsset={() => setSpritePath(null)}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setSpriteDirty}
              onLog={log}
            />
          ),
          spriteAtlas: (
            <SpriteAtlasEditor
              key={`sprite-atlas:${assetReloadEpoch.spriteAtlas}`}
              assetPath={spriteAtlasPath}
              onCloseAsset={() => setSpriteAtlasPath(null)}
              onAssetsChanged={bumpScenes}
              onDirtyChange={setSpriteAtlasDirty}
              onLog={log}
            />
          ),
          effekseer: (
            <EffekseerPreview
              selectedPath={effekseerPreviewPath}
              onSelectPath={setEffekseerPreviewPath}
            />
          ),
          gameplayData: (
            <GameplayDataEditor
              assetPath={gameplayDataPath}
              onDirtyChange={setGameplayDataDirty}
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
          console: (
            <Console
              lines={logs}
              onClear={() => {
                if (!props.detachedPanel) {
                  agentBridge.clearLogs();
                  return;
                }
                syncChannel.current?.postMessage({
                  type: 'request-clear-logs',
                  sender: syncSender.current,
                } satisfies WorkspaceSyncMessage);
              }}
            />
          ),
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
