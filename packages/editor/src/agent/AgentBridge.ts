/**
 * AgentBridge Core — the transport-agnostic heart of the editor's AI-agent
 * integration. It exposes a unified observation surface (`query`) over the
 * live editor store, the viewport canvas, and Tauri window commands.
 *
 * Transports (MCP / WebSocket / HTTP / CLI) are thin adapters that translate
 * their protocol into `query()` / `execute()` calls on the singleton
 * `agentBridge`. This module deliberately has no transport or React dependency
 * so it can be wired once from `App.tsx` and reused everywhere.
 *
 * Phase 1 implements the read-only Observer. The write Dispatcher lands in
 * Phase 2 and will route through the same `EditorStore` methods the UI uses.
 */
import { invoke } from '@tauri-apps/api/core';
import { INTENT_DEFINITIONS } from '@mengine/agent';
import type { EditorStore } from '../store';
import {
  isDesktopEditor,
  type ProjectSnapshot,
  type RecentProjectInfo,
} from '../transport/editorTransport';
import { normalizeSceneName, sceneFileName } from '../sceneLibrary';
import {
  BridgeError,
  type EditorMenuItemInfo,
  type EditorState,
  type EditorUiActionResult,
  type EditorUiContentPage,
  type EditorUiSnapshot,
  type EditorWindowInfo,
  type HierarchyNode,
  type PanelLayoutSnapshot,
  type ScreenshotResult,
  type SelectionInfo,
  type ViewportTab,
} from './protocol';
import {
  logService,
  type LogChange,
  type LogEntry,
  type LogQuery,
} from './LogService';
import {
  WRITE_COMMANDS,
  COMMAND_META,
  type CommandContext,
  type CommandMeta,
  type CommandResult,
  type CommandSummary,
} from './commands';
import {
  instantiableAssetTarget,
  isAgentCreatableAssetKind,
  resourceEditorTarget,
  type AgentCreateAssetRequest,
  type AgentCreateAssetResult,
  type AgentInstantiableAssetTarget,
  type AgentResourceEditorKind,
  type AgentResourceEditorTarget,
} from './resourceTargets';
import {
  COMMAND_EXECUTION_OPTIONS_SCHEMA,
  COMMAND_PARAMS_SCHEMAS,
} from './commandSchemas';
import {
  QUERY_META,
  QUERY_PARAMS_SCHEMAS,
  type QueryMeta,
  type QuerySummary,
} from './querySchemas';
import { validateAgentJsonSchema } from './jsonSchemaValidation';
import {
  buildAgentComponentSchema,
  listAgentComponentSchemas,
} from './componentSchema';
import { validateAgentSceneJson } from './sceneJsonValidation';
import {
  createRegisteredEditorWindow,
  findMenuItem,
  listAllMenuItems,
  listRegisteredEditorWindowTypes,
  type MenuItemContext,
} from '../editorWindow/registry';
import { openNativeEditorWindow } from '../editorWindow/nativeEditorWindow';
import {
  CORE_PANEL_IDS,
  detachPanelWindow,
  requestPanelDock,
} from '../panels/detachedPanelWindow';
import {
  importExternalProjectAsset,
  listProjectFiles,
  isProjectTextAssetPath,
  normalizeProjectAssetPath,
  readProjectAssetBytesWithRevision,
  refreshProjectFiles,
  writeProjectAssetText,
  type ProjectAssetChange,
  type ProjectFileAsset,
} from '../projectAssets';
import { findProjectAssetReferences } from '../assetReferences';
import { validateImportedAssetName } from '../assetImportModel';
import { refreshSprites } from '../spriteLibrary';
import { setEditorPrefs } from '../sceneLibrary';
import type { GameResolution } from '../gameResolution';
import {
  applySelectedPrefab,
  createProjectPrefabFromSelection,
  revertSelectedPrefab,
  unpackSelectedPrefab,
} from '../prefabWorkflow';
import {
  PROJECT_ASSETS_CHANGED_EVENT,
  PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT,
  broadcastProjectAssetsChanged,
} from '../assetEditorEvents';
import {
  getEditorDialogForWindow,
  respondToEditorDialogInWindow,
} from '../editorDialog';
import {
  clearEditorProfilerSamples,
  readEditorProfilerSamples,
  summarizeEditorProfilerSamples,
  type EditorProfilerSource,
} from '../editorProfiler';
import {
  buildPcPlayer,
  cancelPcBuild,
  comparePcBuildHistory,
  createPcBuildHistoryPatch,
  getProjectBuildSettings,
  listenToPcBuildProgress,
  listPcBuildHistory,
  listPcBuildPatches,
  restorePcBuildHistory,
  saveProjectBuildAssetSettings,
  saveProjectBuildSettings,
  verifyPcBuildPatch,
  verifyPcPlayer,
  type BuildPlayerProfile,
  type BuildPlayerResult,
  type BuildProgressEvent,
  type ProjectBuildSettings,
  type VerifyPlayerResult,
} from '../transport/editorTransport';
import {
  broadcastProjectBuildArtifactsChanged,
  broadcastProjectBuildSettingsChanged,
} from '../buildEditorEvents';
import type { AgentAssetOperations } from './assetOperations';
import {
  AGENT_EVENT_TOPICS,
  AgentEventJournal,
  SceneChangeTracker,
  type AgentEvent,
  type AgentEventPage,
  type AgentEventTopic,
  type AgentEventWaitPage,
  type SceneDiff,
  type SceneEntityView,
} from './eventJournal';
import { paginateAgentItems } from './pagination';
import {
  loadSortingLayersSnapshot,
  persistSortingLayersGuarded,
  persistTagsAndLayersGuarded,
} from '../sortingLayers';
import {
  validateTagsAndLayers,
  validateSortingLayers,
  type GameObjectLayer,
  type SortingLayer,
} from '../sortingLayerModel';

type CaptureFn = (
  format: 'image/png' | 'image/jpeg',
  quality?: number,
) => ScreenshotResult | null;

interface SceneMetaProviders {
  sceneName: () => string | null;
  dirty: () => boolean;
}

export interface AgentSceneProvider {
  list: () => {
    ready: boolean;
    activeScene: string | null;
    dirty: boolean;
    scenes: Array<{ name: string; updatedAt: number }>;
  };
  create: (options: {
    name: string;
    overwrite: boolean;
    discardDirty: boolean;
  }) => Promise<{ name: string }>;
  open: (options: {
    name: string;
    discardDirty: boolean;
  }) => Promise<{ name: string }>;
  save: (options: {
    name?: string;
    overwrite: boolean;
  }) => Promise<{ name: string }>;
  saveAll: (options: {
    unnamedScene?: string;
    overwrite: boolean;
  }) => Promise<{ sceneName: string | null }>;
  rename: (options: {
    oldName: string;
    newName: string;
  }) => Promise<{ oldName: string; name: string; activeScene: string | null }>;
  delete: (options: {
    name: string;
    expectedRevision: string;
  }) => Promise<{ name: string }>;
}

export type AgentSceneDeletePreview = {
  operation: 'delete';
  previewToken: string;
  name: string;
  path: string;
  revision: string;
  activeScene: string | null;
  includedInBuildSettings: boolean;
  blockers: string[];
  permanent: true;
};

export interface AgentWorkspaceProvider {
  assertDiskMutationAllowed: (options?: { allowSceneDirty?: boolean }) => Promise<void>;
  closeProject: (discardDirty: boolean) => Promise<{
    closedWindows: string[];
    discardedUnsavedChanges: boolean;
  }>;
  listDocuments: () => Promise<AgentWorkspaceDocument[]>;
  openAsset: (target: AgentResourceEditorTarget) => Promise<void>;
  createAsset: (request: AgentCreateAssetRequest) => Promise<AgentCreateAssetResult>;
  instantiateAsset: (target: AgentInstantiableAssetTarget) => Promise<number>;
}

export type {
  AgentCreateAssetRequest,
  AgentCreateAssetResult,
  AgentCreatableAssetKind,
  AgentInstantiableAssetTarget,
  AgentResourceEditorKind,
  AgentResourceEditorTarget,
} from './resourceTargets';

export type AgentWorkspaceDocument = {
  kind: 'scene' | AgentResourceEditorKind | 'build-settings' | 'project-settings';
  panel: string;
  path: string | null;
  dirty: boolean;
};

export type AgentProjectSummary = {
  id: string;
  name: string;
  root: string;
  scenePath: string | null;
  revision: number;
};

export type AgentProjectLifecycleState = {
  phase: 'welcome' | 'attaching' | 'opening' | 'creating' | 'ready' | 'error';
  ready: boolean;
  busy: boolean;
  operation: 'attach' | 'open' | 'create' | null;
  error: string | null;
  project: AgentProjectSummary | null;
  recentCount: number;
  recentLimit: number;
};

export interface AgentProjectLifecycleProvider {
  getState: () => AgentProjectLifecycleState;
  listRecent: () => Promise<RecentProjectInfo[]>;
  forgetRecent: (path: string) => Promise<RecentProjectInfo[]>;
  open: (root: string) => Promise<ProjectSnapshot>;
  create: (parent: string, name: string) => Promise<ProjectSnapshot>;
}

type AgentBuildJob = {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  profile: BuildPlayerProfile;
  clean: boolean;
  startedAt: number;
  finishedAt: number | null;
  progress: BuildProgressEvent | null;
  result: BuildPlayerResult | null;
  verification: VerifyPlayerResult | null;
  error: string | null;
};

type AgentBuildArtifactJob = {
  id: string;
  operation: 'history-patch' | 'history-restore' | 'patch-verify';
  status: 'running' | 'succeeded' | 'failed';
  cancellable: false;
  input: Record<string, string>;
  startedAt: number;
  finishedAt: number | null;
  result: unknown;
  error: string | null;
};

interface EntityView {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex?: number;
  active?: boolean;
  tag?: string;
  layer?: number;
  components: Record<string, unknown>;
}

type ObservedEditorState = {
  mode: EditorState['mode'];
  sceneName: string | null;
  dirty: boolean;
  selectedIds: number[];
  panelSignature: string | null;
  viewSignature: string;
};

class AgentBridge {
  private store: EditorStore | null = null;
  private sceneMeta: SceneMetaProviders | null = null;
  private captures = new Map<ViewportTab, CaptureFn>();
  private refreshProvider: (() => void) | null = null;
  private logProvider: ((message: string) => void) | null = null;
  private panelLayoutProvider: (() => PanelLayoutSnapshot | null) | null = null;
  private sceneProvider: (() => AgentSceneProvider | null) | null = null;
  private workspaceProvider: (() => AgentWorkspaceProvider | null) | null = null;
  private buildJob: AgentBuildJob | null = null;
  private buildArtifactJob: AgentBuildArtifactJob | null = null;
  private stopBuildProgress: (() => void) | null = null;
  private assetOperations: AgentAssetOperations | null = null;
  private clearLogProvider: (() => void) | null = null;
  private readonly events = new AgentEventJournal();
  private readonly sceneChanges = new SceneChangeTracker();
  private observedState: ObservedEditorState | null = null;
  private lastPlaySceneObservationAt = 0;
  private eventSourceConnections = 0;
  private stopLogEvents: (() => void) | null = null;
  private stopAssetEvents: (() => void) | null = null;
  private lastAssetEvent: { signature: string; time: number } | null = null;
  private projectLifecycleProvider:
    | (() => AgentProjectLifecycleProvider | null)
    | null = null;
  private observedProjectSignature: string | null = null;
  private editorBootReady = false;
  private editorBootGeneration = 0;

  /** Wire the bridge to the live editor store. Called once from App. */
  connect(store: EditorStore): void {
    if (this.store !== store) {
      this.sceneChanges.reset();
      this.observedState = null;
      this.lastPlaySceneObservationAt = 0;
      this.editorBootReady = false;
    }
    this.store = store;
    this.observeProject();
  }

  /** Declare that the connected store has finished loading its project scene and settings. */
  markEditorBootReady(store: EditorStore): void {
    if (this.store !== store || this.editorBootReady) return;
    this.editorBootReady = true;
    this.editorBootGeneration += 1;
    this.observeProject();
  }

  private async waitForEditorBootAfter(generation: number): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (
      !this.editorBootReady
      || this.editorBootGeneration <= generation
    ) {
      if (Date.now() >= deadline) {
        throw new BridgeError(
          'NOT_READY',
          'The project opened, but the editor store did not finish loading within 15 seconds',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /** Provide scene name / dirty state, which live in React (App) not the store. */
  connectSceneMeta(providers: SceneMetaProviders): void {
    this.sceneMeta = providers;
  }

  /** Wire the UI refresh callback, invoked after every write command. */
  connectRefresh(refresh: () => void): void {
    this.refreshProvider = refresh;
  }

  connectLog(log: (message: string) => void, clear?: () => void): void {
    this.logProvider = log;
    this.clearLogProvider = clear ?? null;
  }

  connectPanelLayout(provider: () => PanelLayoutSnapshot | null): void {
    this.panelLayoutProvider = provider;
  }

  connectSceneCommands(provider: () => AgentSceneProvider | null): void {
    this.sceneProvider = provider;
  }

  connectWorkspace(provider: () => AgentWorkspaceProvider | null): void {
    this.workspaceProvider = provider;
  }

  connectProjectLifecycle(
    provider: () => AgentProjectLifecycleProvider | null,
  ): () => void {
    this.projectLifecycleProvider = provider;
    this.observeProject();
    return () => {
      if (this.projectLifecycleProvider !== provider) return;
      this.projectLifecycleProvider = null;
    };
  }

  /** Record project-hub transitions even before the editor store is mounted. */
  observeProject(): void {
    const provider = this.projectLifecycleProvider?.() ?? null;
    if (!provider) return;
    const state = {
      ...provider.getState(),
      editorReady: this.store != null && this.editorBootReady,
    };
    const signature = JSON.stringify(state);
    if (signature === this.observedProjectSignature) return;
    this.observedProjectSignature = signature;
    this.appendEvent('project.changed', state);
  }

  /**
   * Attach process-local log and asset sources to the event journal. The main
   * editor window owns these sources; detached webviews intentionally do not.
   */
  connectEventSources(): () => void {
    this.eventSourceConnections += 1;
    if (this.eventSourceConnections === 1) {
      this.stopLogEvents = logService.subscribe((change) => this.recordLogEvent(change));
      const onAssetChanged = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail ?? { action: 'changed' };
        let signature: string;
        try {
          signature = JSON.stringify(detail);
        } catch {
          signature = String(detail);
        }
        const time = Date.now();
        if (
          this.lastAssetEvent?.signature === signature
          && time - this.lastAssetEvent.time < 100
        ) return;
        this.lastAssetEvent = { signature, time };
        this.appendEvent('asset.changed', detail, time);
      };
      window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, onAssetChanged);
      this.stopAssetEvents = () => {
        window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, onAssetChanged);
      };
    }
    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      this.eventSourceConnections = Math.max(0, this.eventSourceConnections - 1);
      if (this.eventSourceConnections !== 0) return;
      this.stopLogEvents?.();
      this.stopLogEvents = null;
      this.stopAssetEvents?.();
      this.stopAssetEvents = null;
      this.lastAssetEvent = null;
    };
  }

  /**
   * Register a viewport capture function for a tab. Returns an unregister
   * cleanup. Called by the Viewport component on mount.
   */
  registerViewportCapture(tab: ViewportTab, fn: CaptureFn): () => void {
    this.captures.set(tab, fn);
    return () => {
      if (this.captures.get(tab) === fn) this.captures.delete(tab);
    };
  }

  // ── Observer ──────────────────────────────────────────────────────────

  captureViewport(
    tab: ViewportTab = 'scene',
    format: 'image/png' | 'image/jpeg' = 'image/png',
    quality?: number,
  ): ScreenshotResult {
    const fn = this.captures.get(tab);
    if (!fn) {
      throw new BridgeError('NOT_READY', `No viewport capture registered for "${tab}"`);
    }
    const result = fn(format, quality);
    if (!result) {
      throw new BridgeError('NOT_READY', `Viewport "${tab}" canvas is not available yet`);
    }
    return result;
  }

  /**
   * Capture an editor webview (menus, panels, and rendered content) without
   * activating the window. Pass a label from `window.list` to inspect a
   * detached panel/editor window; the main window is the default.
   */
  async captureWindow(windowLabel = 'main'): Promise<ScreenshotResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Full-window capture requires the desktop editor');
    }
    return invoke<ScreenshotResult>('capture_editor_window', { windowLabel });
  }

  /** Read text, roles, values, bounds and stable selectors without OCR. */
  async inspectWindow(
    windowLabel = 'main',
    maxElements = 2_000,
    offset = 0,
    expectedSnapshotRevision?: string,
  ): Promise<EditorUiSnapshot> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Window UI inspection requires the desktop editor');
    }
    const boundedMaxElements = Number.isFinite(maxElements)
      ? Math.min(5_000, Math.max(50, Math.trunc(maxElements)))
      : 2_000;
    const boundedOffset = Number.isFinite(offset)
      ? Math.min(1_000_000, Math.max(0, Math.trunc(offset)))
      : 0;
    const expectedRevision = expectedSnapshotRevision?.trim();
    if (
      expectedSnapshotRevision !== undefined
      && !/^ui-v\d+-\d+-[0-9a-f]{16}$/.test(expectedRevision ?? '')
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"expectedSnapshotRevision" must be a snapshotRevision returned by window.ui_snapshot',
      );
    }
    if (boundedOffset > 0 && !expectedRevision) {
      throw new BridgeError(
        'INVALID_ARGS',
        'Continuation pages require "expectedSnapshotRevision" from the first page',
      );
    }
    const snapshot = await invoke<EditorUiSnapshot>('inspect_editor_window', {
      windowLabel,
      maxElements: boundedMaxElements,
      offset: boundedOffset,
    });
    if (expectedRevision && snapshot.snapshotRevision !== expectedRevision) {
      throw new BridgeError(
        'STALE_REVISION',
        'Editor window semantic content changed while paging; restart from offset 0',
        {
          windowLabel,
          expectedSnapshotRevision: expectedRevision,
          actualSnapshotRevision: snapshot.snapshotRevision,
          restartOffset: 0,
        },
      );
    }
    return snapshot;
  }

  /** Read exact, unnormalized UI text/value in bounded pages. */
  async readWindowContent(
    selector: string,
    field: 'text' | 'value',
    windowLabel = 'main',
    offset = 0,
    maxChars = 10_000,
    expectedContentRevision?: string,
  ): Promise<EditorUiContentPage> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Window UI content reads require the desktop editor');
    }
    if (!selector) {
      throw new BridgeError('INVALID_ARGS', 'Window UI content reads require a selector');
    }
    const boundedOffset = Number.isFinite(offset)
      ? Math.min(10_000_000, Math.max(0, Math.trunc(offset)))
      : 0;
    const boundedMaxChars = Number.isFinite(maxChars)
      ? Math.min(100_000, Math.max(1, Math.trunc(maxChars)))
      : 10_000;
    const expectedRevision = expectedContentRevision?.trim();
    if (
      expectedContentRevision !== undefined
      && !/^content-v\d+-\d+-[0-9a-f]{16}$/.test(expectedRevision ?? '')
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"expectedContentRevision" must be a contentRevision returned by window.ui_content',
      );
    }
    if (boundedOffset > 0 && !expectedRevision) {
      throw new BridgeError(
        'INVALID_ARGS',
        'Continuation pages require "expectedContentRevision" from the first content page',
      );
    }
    const result = await invoke<EditorUiContentPage & { ok?: boolean; error?: string }>(
      'read_editor_ui_content',
      {
        windowLabel,
        selector,
        field,
        offset: boundedOffset,
        maxChars: boundedMaxChars,
      },
    );
    if (result.ok === false) {
      throw new BridgeError('INVALID_ARGS', result.error ?? 'Editor UI content read failed');
    }
    if (expectedRevision && result.contentRevision !== expectedRevision) {
      throw new BridgeError(
        'STALE_REVISION',
        'Editor UI exact content changed while paging; restart from offset 0',
        {
          windowLabel,
          selector,
          field,
          expectedContentRevision: expectedRevision,
          actualContentRevision: result.contentRevision,
          restartOffset: 0,
        },
      );
    }
    return result;
  }

  /** Execute one allow-listed DOM action without activating the OS window. */
  async interactWindow(
    action: 'click' | 'doubleClick' | 'contextClick' | 'setValue' | 'scroll' | 'keyPress',
    selector: string,
    windowLabel = 'main',
    value?: string,
    deltaX?: number,
    deltaY?: number,
    key?: string,
  ): Promise<EditorUiActionResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Window UI interaction requires the desktop editor');
    }
    if (!selector) {
      throw new BridgeError('INVALID_ARGS', 'Window UI interaction requires a selector');
    }
    const result = await invoke<EditorUiActionResult>('interact_editor_window', {
      windowLabel,
      selector,
      action,
      value,
      deltaX,
      deltaY,
      key,
    });
    if (!result.ok) {
      throw new BridgeError('INVALID_ARGS', result.error ?? 'Editor UI interaction failed');
    }
    return result;
  }

  getEditorState(): EditorState {
    this.observe();
    const store = this.requireStore();
    const snapshot = store.snapshot();
    return {
      mode: store.mode,
      frame: snapshot.frame,
      simulationTime: snapshot.simulationTime,
      gizmo: store.gizmo,
      sceneCamera: store.sceneCamera,
      gameResolution: store.gameResolution,
      canUndo: store.canUndo,
      canRedo: store.canRedo,
      undoLabel: store.undoLabel,
      redoLabel: store.redoLabel,
      sceneName: this.sceneMeta?.sceneName() ?? null,
      dirty: this.sceneMeta?.dirty() ?? false,
      sceneRevision: this.sceneChanges.revision,
      eventSequence: this.events.currentSequence,
    };
  }

  getSelection(): SelectionInfo {
    const store = this.requireStore();
    return { selected: store.selected, selectedIds: store.selectedIds };
  }

  getProjectState(): AgentProjectLifecycleState & {
    editorReady: boolean;
    eventSequence: number;
  } {
    const provider = this.requireProjectLifecycleProvider();
    this.observeProject();
    return {
      ...structuredClone(provider.getState()),
      editorReady: this.store != null && this.editorBootReady,
      eventSequence: this.events.currentSequence,
    };
  }

  async getRecentProjects(): Promise<{
    projects: RecentProjectInfo[];
    count: number;
    limit: number;
  }> {
    try {
      const projects = await this.requireProjectLifecycleProvider().listRecent();
      this.observeProject();
      return {
        projects: structuredClone(projects),
        count: projects.length,
        limit: 12,
      };
    } catch (error) {
      throw projectBridgeError(error);
    }
  }

  async getProjectSettings(): Promise<{
    sortingLayers: Awaited<ReturnType<typeof loadSortingLayersSnapshot>>;
    settings: Awaited<ReturnType<typeof loadSortingLayersSnapshot>>['settings'];
    revision: string | null;
  }> {
    const sortingLayers = await bridgeIo(
      'Failed to read Project Settings',
      () => loadSortingLayersSnapshot(),
    );
    return {
      sortingLayers: structuredClone(sortingLayers),
      settings: structuredClone(sortingLayers.settings),
      revision: sortingLayers.revision,
    };
  }

  getSceneSnapshot(): unknown {
    this.observe(true);
    return {
      ...this.requireStore().snapshot(),
      revision: this.sceneChanges.revision,
    };
  }

  getHierarchy(): HierarchyNode[] {
    const store = this.requireStore();
    const entities = store.snapshot().entities as unknown as EntityView[];
    return buildHierarchy(entities);
  }

  getEntity(idOrName: number | string): EntityView {
    const store = this.requireStore();
    const entities = store.snapshot().entities as unknown as EntityView[];
    const found = typeof idOrName === 'number'
      ? entities.find((e) => e.entity === idOrName)
      : entities.find((e) => (e.name ?? '') === idOrName);
    if (!found) {
      throw new BridgeError('ENTITY_NOT_FOUND', `No entity matches "${String(idOrName)}"`);
    }
    return found;
  }

  async getPrefabInstanceInfo(entityId: number): Promise<{
    entity: number;
    root: number;
    source: string;
    instance: string;
    asset: ProjectFileAsset;
  }> {
    this.getEntity(entityId);
    const instance = this.requireStore().getPrefabInstance(entityId);
    if (!instance) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Entity ${entityId} is not part of a prefab instance`,
      );
    }
    const asset = findAsset(await refreshProjectFiles(), instance.source);
    if (!asset) {
      throw new BridgeError(
        'IO_ERROR',
        `Prefab asset is missing: ${instance.source}`,
      );
    }
    if (asset.kind !== 'prefab' || asset.metaStatus !== 'ready' || !asset.guid) {
      throw new BridgeError(
        'CONFLICT',
        `Prefab asset is not healthy: ${asset.relPath} (${asset.metaStatus})`,
      );
    }
    return {
      entity: entityId,
      ...instance,
      asset: structuredClone(asset),
    };
  }

  findEntities(params: Record<string, unknown>): {
    sceneRevision: number;
    total: number;
    offset: number;
    count: number;
    nextOffset: number | null;
    hasMore: boolean;
    truncated: boolean;
    entities: Array<{
      id: number;
      name: string;
      parent: number | null;
      active: boolean;
      components: string[];
    }>;
  } {
    const rawName = params.name;
    const rawComponent = params.component;
    const rawActive = params.active;
    const rawLimit = params.limit ?? 100;
    const rawOffset = params.offset ?? 0;
    const rawExpectedSceneRevision = params.expectedSceneRevision;
    if (rawName !== undefined && (typeof rawName !== 'string' || !rawName.trim())) {
      throw new BridgeError('INVALID_ARGS', '"name" must be a non-empty string');
    }
    if (
      rawComponent !== undefined
      && (typeof rawComponent !== 'string' || !rawComponent.trim())
    ) {
      throw new BridgeError('INVALID_ARGS', '"component" must be a non-empty string');
    }
    if (rawActive !== undefined && typeof rawActive !== 'boolean') {
      throw new BridgeError('INVALID_ARGS', '"active" must be a boolean');
    }
    if (
      typeof rawLimit !== 'number'
      || !Number.isSafeInteger(rawLimit)
      || rawLimit < 1
      || rawLimit > 1_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"limit" must be an integer from 1 to 1000');
    }
    if (
      typeof rawOffset !== 'number'
      || !Number.isSafeInteger(rawOffset)
      || rawOffset < 0
      || rawOffset > 1_000_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"offset" must be an integer from 0 to 1000000');
    }
    if (
      rawExpectedSceneRevision !== undefined
      && (
        typeof rawExpectedSceneRevision !== 'number'
        || !Number.isSafeInteger(rawExpectedSceneRevision)
        || rawExpectedSceneRevision < 0
      )
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"expectedSceneRevision" must be a non-negative safe integer',
      );
    }
    if (rawOffset > 0 && rawExpectedSceneRevision === undefined) {
      throw new BridgeError(
        'INVALID_ARGS',
        'Continuation pages require "expectedSceneRevision" from the first entity page',
      );
    }
    const store = this.requireStore();
    const sceneRevision = this.sceneChanges.revision;
    if (
      rawExpectedSceneRevision !== undefined
      && rawExpectedSceneRevision !== sceneRevision
    ) {
      throw new BridgeError(
        'STALE_REVISION',
        'Scene changed while paging entity matches; restart from offset 0',
        {
          expectedSceneRevision: rawExpectedSceneRevision,
          currentSceneRevision: sceneRevision,
          restartOffset: 0,
        },
      );
    }
    const name = typeof rawName === 'string' ? rawName.trim().toLocaleLowerCase() : null;
    const component = typeof rawComponent === 'string' ? rawComponent.trim() : null;
    const entities = (
      store.snapshot().entities as unknown as EntityView[]
    ).filter((entity) => (
      (name == null || (entity.name ?? '').toLocaleLowerCase().includes(name))
      && (
        component == null
        || Object.prototype.hasOwnProperty.call(entity.components ?? {}, component)
      )
      && (rawActive === undefined || (entity.active ?? true) === rawActive)
    ));
    const page = paginateAgentItems(entities, rawOffset, rawLimit);
    return {
      sceneRevision,
      total: page.total,
      offset: page.offset,
      count: page.count,
      nextOffset: page.nextOffset,
      hasMore: page.hasMore,
      truncated: page.truncated,
      entities: page.items.map((entity) => ({
        id: entity.entity,
        name: entity.name ?? `Entity ${entity.entity}`,
        parent: entity.parent ?? null,
        active: entity.active ?? true,
        components: Object.keys(entity.components ?? {}),
      })),
    };
  }

  getEntityComponent(entityId: number, type: string): {
    entity: number;
    component: string;
    value: unknown;
  } {
    const entity = this.getEntity(entityId);
    if (!Object.prototype.hasOwnProperty.call(entity.components ?? {}, type)) {
      throw new BridgeError(
        'COMPONENT_NOT_FOUND',
        `Entity ${entityId} has no component "${type}"`,
      );
    }
    return {
      entity: entityId,
      component: type,
      value: structuredClone(entity.components[type]),
    };
  }

  async listWindows(): Promise<EditorWindowInfo[]> {
    if (!isDesktopEditor()) return [];
    return invoke<EditorWindowInfo[]>('list_editor_windows');
  }

  async closeRegisteredEditorWindow(windowLabel: string): Promise<{
    windowLabel: string;
    closed: boolean;
  }> {
    const target = (await this.listWindows()).find(
      (window) => window.label === windowLabel,
    );
    if (!target) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Editor window "${windowLabel}" was not found; query window.list for current labels`,
      );
    }
    if (target.kind === 'main') {
      throw new BridgeError(
        'READONLY',
        'The main editor window cannot be closed by window.close; use project.close to return to the project hub',
        { windowLabel, agentAlternative: 'close_project' },
      );
    }
    if (target.kind === 'panel') {
      throw new BridgeError(
        'READONLY',
        `Detached panel "${target.panelKind ?? windowLabel}" must use panel.dock so its dock layout stays consistent`,
        {
          windowLabel,
          panelKind: target.panelKind,
          agentAlternative: 'dock_panel',
        },
      );
    }
    if (target.kind !== 'editor') {
      throw new BridgeError(
        'READONLY',
        `Window "${windowLabel}" is not a registered auxiliary editor window`,
        { windowLabel, kind: target.kind },
      );
    }
    return bridgeIo(
      `Failed to close editor window "${windowLabel}"`,
      () => invoke<{ windowLabel: string; closed: boolean }>(
        'close_editor_window',
        { windowLabel },
      ),
    );
  }

  listRegisteredWindowTypes(): Array<{
    typeId: string;
    title: string;
    width: number;
    height: number;
    requiresProject: true;
  }> {
    return listRegisteredEditorWindowTypes().map((entry) => ({
      ...entry,
      requiresProject: true,
    }));
  }

  async openRegisteredEditorWindow(typeId: string): Promise<{
    typeId: string;
    title: string;
    windowLabel: string;
    created: boolean;
    visible: boolean;
    focused: boolean;
    backgroundSafe: true;
  }> {
    if (!isDesktopEditor()) {
      throw new BridgeError(
        'NOT_READY',
        'Background registered editor windows require the desktop editor',
      );
    }
    if (!this.store || !this.editorBootReady) {
      throw new BridgeError(
        'NOT_READY',
        'Registered editor windows require an active project; open or create a project first',
      );
    }
    const normalizedTypeId = typeId.trim();
    if (!normalizedTypeId || normalizedTypeId.length > 256) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"typeId" must contain 1 to 256 characters',
      );
    }
    const definition = createRegisteredEditorWindow(normalizedTypeId);
    if (!definition) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Unknown editor window type "${normalizedTypeId}"; query window.types for registered types`,
      );
    }
    const existing = (await this.listWindows()).find(
      (window) => window.editorType === normalizedTypeId,
    );
    const opened = await openNativeEditorWindow({
      typeId: normalizedTypeId,
      title: definition.title,
      width: definition.width,
      height: definition.height,
      activateWindow: false,
    });
    if (!opened) {
      throw new BridgeError(
        'IO_ERROR',
        `Failed to open editor window type "${normalizedTypeId}"`,
      );
    }
    let target: EditorWindowInfo | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      target = (await this.listWindows()).find(
        (window) => window.editorType === normalizedTypeId,
      );
      if (target) break;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    if (!target) {
      throw new BridgeError(
        'IO_ERROR',
        `Editor window type "${normalizedTypeId}" opened without a discoverable native window`,
      );
    }
    return {
      typeId: normalizedTypeId,
      title: target.title,
      windowLabel: target.label,
      created: existing === undefined,
      visible: target.visible,
      focused: target.focused,
      backgroundSafe: true,
    };
  }

  async getWorkspaceDocuments(): Promise<{
    documents: Array<AgentWorkspaceDocument & {
      active: boolean;
      detached: boolean;
      windowLabel: string;
    }>;
  }> {
    const documents = await this.requireWorkspaceProvider().listDocuments();
    const layout = this.panelLayoutProvider?.() ?? null;
    const detachedPanels = new Map(
      (layout?.detachedPanels ?? []).map((entry) => [entry.kind, entry.windowLabel]),
    );
    const activePanels = new Set(layout?.activePanels ?? []);
    return {
      documents: documents.map((document) => {
        const detachedWindow = detachedPanels.get(document.panel);
        return {
          ...structuredClone(document),
          active: detachedWindow !== undefined || activePanels.has(document.panel),
          detached: detachedWindow !== undefined,
          windowLabel: detachedWindow ?? 'main',
        };
      }),
    };
  }

  getLogs(query: LogQuery = {}): LogEntry[] {
    return logService.getEntries(query);
  }

  clearLogs(): { ok: true } {
    logService.clear();
    this.clearLogProvider?.();
    return { ok: true };
  }

  /**
   * Compare the live editor with the most recently observed state. App calls
   * this after its normal refresh path, so UI and AgentBridge share one source
   * of truth without polling the foreground window.
   */
  observe(forceScene = false): void {
    const store = this.store;
    if (!store) return;
    const sceneName = this.sceneMeta?.sceneName() ?? null;
    const dirty = this.sceneMeta?.dirty() ?? false;
    const snapshot = store.snapshot();
    const now = Date.now();
    const shouldObserveScene = (
      forceScene
      || store.mode !== 'play'
      || this.sceneChanges.revision === 0
      || now - this.lastPlaySceneObservationAt >= 100
    );
    const sceneDelta = shouldObserveScene
      ? this.sceneChanges.observe(
        sceneName,
        snapshot.entities as unknown as SceneEntityView[],
        { clearColor: snapshot.clearColor },
      )
      : null;
    if (shouldObserveScene && store.mode === 'play') {
      this.lastPlaySceneObservationAt = now;
    }

    let panelLayout: PanelLayoutSnapshot | null = null;
    try {
      panelLayout = this.panelLayoutProvider?.() ?? null;
    } catch {
      panelLayout = null;
    }
    const panelSignature = panelLayout ? JSON.stringify(panelLayout) : null;
    const view = {
      gizmo: store.gizmo,
      gameResolution: store.gameResolution,
    };
    const current: ObservedEditorState = {
      mode: store.mode,
      sceneName,
      dirty,
      selectedIds: [...store.selectedIds],
      panelSignature,
      viewSignature: JSON.stringify(view),
    };
    const previous = this.observedState;

    if (
      sceneDelta
      || !previous
      || previous.sceneName !== current.sceneName
      || previous.dirty !== current.dirty
    ) {
      this.appendEvent('scene.changed', {
        revision: this.sceneChanges.revision,
        sceneName,
        dirty,
        delta: sceneDelta,
      }, now);
    }
    if (!previous || previous.mode !== current.mode) {
      this.appendEvent('mode.changed', {
        previous: previous?.mode ?? null,
        mode: current.mode,
      }, now);
    }
    if (
      !previous
      || !sameNumberArray(previous.selectedIds, current.selectedIds)
    ) {
      this.appendEvent('selection.changed', {
        selected: store.selected,
        selectedIds: current.selectedIds,
      }, now);
    }
    if (
      panelLayout
      && (!previous || previous.panelSignature !== current.panelSignature)
    ) {
      this.appendEvent('panel.changed', panelLayout, now);
    }
    if (!previous || previous.viewSignature !== current.viewSignature) {
      this.appendEvent('view.changed', view, now);
    }
    this.observedState = current;
  }

  getEvents(params: Record<string, unknown>): AgentEventPage {
    this.observe();
    return this.events.list(this.eventQueryOptions(params));
  }

  async waitForEvents(
    params: Record<string, unknown>,
  ): Promise<AgentEventWaitPage> {
    this.observe();
    const options = this.eventQueryOptions(params);
    const timeoutMs = params.timeoutMs ?? 15_000;
    if (
      typeof timeoutMs !== 'number'
      || !Number.isSafeInteger(timeoutMs)
      || timeoutMs < 0
      || timeoutMs > 15_000
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"timeoutMs" must be an integer from 0 to 15000',
      );
    }
    try {
      return await this.events.wait(options, timeoutMs);
    } catch (error) {
      if (
        error instanceof Error
        && error.message === 'Agent event wait limit reached'
      ) {
        throw new BridgeError(
          'CONFLICT',
          'Too many concurrent editor event waits; retry after an existing wait completes',
        );
      }
      throw error;
    }
  }

  private eventQueryOptions(params: Record<string, unknown>): {
    afterSequence: number;
    limit: number;
    topics?: AgentEventTopic[];
  } {
    const afterSequence = params.afterSequence ?? 0;
    const limit = params.limit ?? 100;
    const rawTopics = params.topics;
    if (
      typeof afterSequence !== 'number'
      || !Number.isSafeInteger(afterSequence)
      || afterSequence < 0
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"afterSequence" must be a non-negative safe integer',
      );
    }
    if (afterSequence > this.events.currentSequence) {
      throw new BridgeError(
        'INVALID_ARGS',
        `"afterSequence" cannot exceed the current event sequence ${this.events.currentSequence}`,
      );
    }
    if (
      typeof limit !== 'number'
      || !Number.isSafeInteger(limit)
      || limit < 1
      || limit > 1_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"limit" must be an integer from 1 to 1000');
    }
    let topics: AgentEventTopic[] | undefined;
    if (rawTopics !== undefined) {
      if (
        !Array.isArray(rawTopics)
        || rawTopics.some((topic) => (
          typeof topic !== 'string'
          || !AGENT_EVENT_TOPICS.includes(topic as AgentEventTopic)
        ))
      ) {
        throw new BridgeError(
          'INVALID_ARGS',
          `"topics" must contain only: ${AGENT_EVENT_TOPICS.join(', ')}`,
        );
      }
      topics = [...new Set(rawTopics as AgentEventTopic[])];
    }
    return { afterSequence, limit, topics };
  }

  getSceneDiff(fromRevision: number): SceneDiff & {
    sceneName: string | null;
    dirty: boolean;
  } {
    this.observe(true);
    if (
      !Number.isSafeInteger(fromRevision)
      || fromRevision < 0
      || fromRevision > this.sceneChanges.revision
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        `"fromRevision" must be an integer from 0 to ${this.sceneChanges.revision}`,
      );
    }
    const snapshot = this.requireStore().snapshot();
    return {
      ...this.sceneChanges.diff(
        fromRevision,
        snapshot.entities as unknown as SceneEntityView[],
        { clearColor: snapshot.clearColor },
      ),
      sceneName: this.sceneMeta?.sceneName() ?? null,
      dirty: this.sceneMeta?.dirty() ?? false,
    };
  }

  private recordLogEvent(change: LogChange): void {
    if (change.type === 'added') {
      this.appendEvent('log.added', change.entry);
    } else {
      this.appendEvent('log.cleared', {});
    }
  }

  private appendEvent(
    topic: AgentEventTopic,
    data: unknown,
    time = Date.now(),
  ): AgentEvent {
    const event = this.events.append(topic, data, time);
    if (isDesktopEditor()) {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: event,
      });
      void invoke('agent_bridge_broadcast', { payload }).catch(() => {
        // The cursor-backed journal remains authoritative if no raw WS client
        // is connected or the native broadcast channel is shutting down.
      });
    }
    return event;
  }

  // ── Discoverability ───────────────────────────────────────────────────

  listCommands(): CommandSummary[] {
    return COMMAND_META.map(({ paramsSchema: _paramsSchema, ...summary }) => ({ ...summary }));
  }

  listIntents(): unknown {
    return structuredClone({
      intents: INTENT_DEFINITIONS,
    });
  }

  describeCommand(id: string): CommandMeta & { executionOptionsSchema: unknown } {
    const command = COMMAND_META.find((candidate) => candidate.id === id);
    if (!command) {
      throw new BridgeError('INVALID_ARGS', `Unknown command "${id}"`);
    }
    return structuredClone({
      ...command,
      executionOptionsSchema: COMMAND_EXECUTION_OPTIONS_SCHEMA,
    });
  }

  listQueries(): QuerySummary[] {
    return QUERY_META.map(({ paramsSchema: _paramsSchema, ...summary }) => ({ ...summary }));
  }

  describeQuery(id: string): QueryMeta {
    const query = QUERY_META.find((candidate) => candidate.id === id);
    if (!query) {
      throw new BridgeError('INVALID_ARGS', `Unknown query "${id}"`);
    }
    return structuredClone(query);
  }

  getPanelLayout(): PanelLayoutSnapshot {
    const layout = this.panelLayoutProvider?.() ?? null;
    if (!layout) {
      throw new BridgeError('NOT_READY', 'The main dock workspace is not ready');
    }
    return structuredClone(layout);
  }

  listMenus(root?: string): EditorMenuItemInfo[] {
    const context = this.menuContext();
    const normalizedRoot = root?.trim();
    return listAllMenuItems()
      .filter((entry) => !normalizedRoot || entry.root === normalizedRoot)
      .map((entry) => {
        let enabled = true;
        try {
          enabled = entry.validate?.(context) ?? true;
        } catch {
          enabled = false;
        }
        return {
          path: entry.path,
          root: entry.root,
          label: entry.label,
          segments: [...entry.segments],
          priority: entry.priority,
          shortcut: entry.shortcut ?? null,
          separatorBefore: entry.separatorBefore,
          enabled,
          agentInvokable: entry.agentInvokable,
          agentAlternative: entry.agentAlternative ?? null,
        };
      });
  }

  getScenes(): ReturnType<AgentSceneProvider['list']> {
    return structuredClone(this.requireSceneProvider().list());
  }

  async previewSceneDelete(rawName: string): Promise<AgentSceneDeletePreview> {
    const state = this.requireSceneProvider().list();
    if (!state.ready) {
      throw new BridgeError('NOT_READY', 'Scene library is still loading');
    }
    const requestedName = normalizeSceneName(rawName);
    if (!requestedName) throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
    const scene = state.scenes.find(
      (candidate) => candidate.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase(),
    );
    if (!scene) {
      throw new BridgeError('INVALID_ARGS', `Scene not found: ${sceneFileName(requestedName)}`);
    }

    const path = sceneAssetPath(scene.name);
    const files = await refreshProjectFiles();
    const asset = findAsset(files, path);
    if (!asset || asset.kind !== 'scene') {
      throw new BridgeError('IO_ERROR', `Scene asset index is missing ${path}`);
    }
    const buildSettings = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    const includedInBuildSettings = buildSettings.scenes.some(
      (candidate) => candidate.toLocaleLowerCase() === path.toLocaleLowerCase(),
    );
    const active = state.activeScene?.toLocaleLowerCase() === scene.name.toLocaleLowerCase();
    const blockers = [
      ...(active ? ['The active scene cannot be deleted; open another scene first'] : []),
      ...(includedInBuildSettings
        ? ['The scene is included in Build Settings; remove it before deleting']
        : []),
    ];
    const tokenPlan = {
      operation: 'delete',
      name: scene.name,
      path,
      revision: asset.revision,
      activeScene: state.activeScene,
      buildScenes: buildSettings.scenes,
    };
    return {
      operation: 'delete',
      previewToken: await previewPlanToken(tokenPlan),
      name: scene.name,
      path,
      revision: asset.revision,
      activeScene: state.activeScene,
      includedInBuildSettings,
      blockers,
      permanent: true,
    };
  }

  async listAssets(params: Record<string, unknown> = {}): Promise<{
    total: number;
    offset: number;
    count: number;
    nextOffset: number | null;
    hasMore: boolean;
    truncated: boolean;
    assets: ProjectFileAsset[];
  }> {
    const files = await refreshProjectFiles();
    const search = typeof params.search === 'string'
      ? params.search.trim().toLocaleLowerCase()
      : '';
    const kind = typeof params.kind === 'string' ? params.kind.trim() : '';
    const folder = typeof params.folder === 'string' && params.folder.trim()
      ? normalizeAssetPath(params.folder)
      : '';
    const limit = params.limit ?? 1_000;
    const offset = params.offset ?? 0;
    if (
      typeof limit !== 'number'
      || !Number.isSafeInteger(limit)
      || limit < 1
      || limit > 5_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"limit" must be an integer from 1 to 5000');
    }
    if (
      typeof offset !== 'number'
      || !Number.isSafeInteger(offset)
      || offset < 0
      || offset > 1_000_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"offset" must be an integer from 0 to 1000000');
    }
    const filtered = files
      .filter((asset) => !kind || asset.kind === kind)
      .filter((asset) => !folder || (
        asset.relPath === folder
        || asset.relPath.startsWith(`${folder}/`)
      ))
      .filter((asset) => !search || (
        asset.relPath.toLocaleLowerCase().includes(search)
        || asset.name.toLocaleLowerCase().includes(search)
      ))
      .sort((left, right) => left.relPath.localeCompare(right.relPath));
    const page = paginateAgentItems(filtered, offset, limit);
    return {
      total: page.total,
      offset: page.offset,
      count: page.count,
      nextOffset: page.nextOffset,
      hasMore: page.hasMore,
      truncated: page.truncated,
      assets: structuredClone(page.items),
    };
  }

  async readAssetText(path: string, maxBytes = 1_048_576): Promise<{
    path: string;
    revision: string;
    size: number;
    contents: string;
  }> {
    const normalized = normalizeAssetPath(path);
    const boundedMaxBytes = Number.isFinite(maxBytes)
      ? Math.min(8 * 1024 * 1024, Math.max(1, Math.trunc(maxBytes)))
      : 1_048_576;
    const files = await refreshProjectFiles();
    const asset = findAsset(files, normalized);
    if (!asset) throw new BridgeError('IO_ERROR', `Asset not found: ${normalized}`);
    if (!isProjectTextAssetPath(asset.relPath)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Asset is not a supported text format: ${asset.relPath}`,
      );
    }
    if (asset.size > boundedMaxBytes) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Asset is ${asset.size} bytes, above maxBytes=${boundedMaxBytes}`,
      );
    }
    const read = await bridgeIo(
      `Failed to read ${normalized}`,
      () => readProjectAssetBytesWithRevision(normalized),
    );
    const bytes = read.contents;
    let contents: string;
    try {
      contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new BridgeError('INVALID_ARGS', `Asset is not valid UTF-8 text: ${normalized}`);
    }
    return {
      path: asset.relPath,
      revision: read.revision,
      size: bytes.byteLength,
      contents,
    };
  }

  async findAssetReferences(path: string): Promise<unknown> {
    const normalized = normalizeAssetPath(path);
    return bridgeIo(
      `Failed to scan references for ${normalized}`,
      () => findProjectAssetReferences(normalized),
    );
  }

  async importAssetFile(
    sourcePath: string,
    destinationPath: string,
  ): Promise<unknown> {
    const normalized = normalizeAssetPath(destinationPath);
    const leaf = normalized.split('/').pop() ?? '';
    let safeLeaf: string;
    try {
      safeLeaf = validateImportedAssetName(leaf);
    } catch (error) {
      throw new BridgeError(
        'INVALID_ARGS',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (safeLeaf !== leaf) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Import destination file name is unsafe; use "${safeLeaf}"`,
      );
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const beforeFiles = await refreshProjectFiles();
    if (findAsset(beforeFiles, normalized)) {
      throw new BridgeError(
        'CONFLICT',
        `Import destination already exists: ${normalized}`,
      );
    }
    const imported = await bridgeIo(
      `Failed to import ${sourcePath}`,
      () => importExternalProjectAsset(sourcePath, normalized),
    );
    const [afterFiles] = await Promise.all([
      refreshProjectFiles(),
      refreshSprites(),
    ]);
    const after = findAsset(afterFiles, imported.destinationPath);
    if (!after || after.metaStatus !== 'ready' || !after.guid) {
      throw new BridgeError(
        'IO_ERROR',
        `Import completed but the indexed asset is unhealthy: ${imported.destinationPath}`,
      );
    }
    const change: ProjectAssetChange = {
      type: 'added',
      relPath: after.relPath,
      previous: null,
      current: after,
    };
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
      detail: { changes: [change], source: 'agent' },
    }));
    broadcastProjectAssetsChanged({
      action: 'created',
      destinationPath: after.relPath,
    });
    this.logProvider?.(
      `Imported ${imported.sourcePath} to ${after.relPath} from AgentBridge with GUID ${after.guid}`,
    );
    return {
      sourcePath: imported.sourcePath,
      sourceRevision: imported.sourceRevision,
      destinationPath: after.relPath,
      asset: structuredClone(after),
    };
  }

  async writeAssetText(
    path: string,
    contents: string,
    expectedRevision: string | null,
  ): Promise<{ created: boolean; asset: ProjectFileAsset }> {
    const normalized = normalizeAssetPath(path);
    if (!isProjectTextAssetPath(normalized)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Asset is not a supported text format: ${normalized}`,
      );
    }
    const byteLength = new TextEncoder().encode(contents).byteLength;
    if (byteLength > 8 * 1024 * 1024) {
      throw new BridgeError('INVALID_ARGS', 'Text asset exceeds the 8 MiB agent write limit');
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const beforeFiles = await refreshProjectFiles();
    const before = findAsset(beforeFiles, normalized);
    if (before) {
      if (expectedRevision !== before.revision) {
        throw new BridgeError(
          'STALE_REVISION',
          `Asset revision changed: expected ${String(expectedRevision)}, current ${before.revision}`,
          { path: before.relPath, expectedRevision, currentRevision: before.revision },
        );
      }
    } else if (expectedRevision !== null) {
      throw new BridgeError(
        'STALE_REVISION',
        `Asset does not exist; expectedRevision must be null when creating ${normalized}`,
      );
    }

    try {
      await writeProjectAssetText(normalized, contents, expectedRevision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('asset changed on disk since it was loaded')) {
        const current = findAsset(await refreshProjectFiles(), normalized);
        throw new BridgeError(
          'STALE_REVISION',
          `Asset revision changed while writing ${normalized}`,
          {
            path: current?.relPath ?? normalized,
            expectedRevision,
            currentRevision: current?.revision ?? null,
          },
        );
      }
      throw new BridgeError(
        'IO_ERROR',
        message,
      );
    }
    const afterFiles = await refreshProjectFiles();
    const after = findAsset(afterFiles, normalized);
    if (!after) {
      throw new BridgeError('IO_ERROR', `Asset write completed but index is missing ${normalized}`);
    }
    const change: ProjectAssetChange = before
      ? {
          type: 'modified',
          relPath: after.relPath,
          previous: before,
          current: after,
        }
      : {
          type: 'added',
          relPath: after.relPath,
          previous: null,
          current: after,
        };
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
      detail: { changes: [change], source: 'agent' },
    }));
    broadcastProjectAssetsChanged(before
      ? { action: 'modified', sourcePath: after.relPath }
      : { action: 'created', destinationPath: after.relPath });
    this.logProvider?.(`${before ? 'Updated' : 'Created'} ${after.relPath} from AgentBridge`);
    return { created: before == null, asset: structuredClone(after) };
  }

  async createPrefab(entityId: number): Promise<unknown> {
    const store = this.requireStore();
    if (store.mode !== 'edit') {
      throw new BridgeError('READONLY', 'prefab.create is only available in Edit Mode');
    }
    this.getEntity(entityId);
    await this.requireWorkspaceProvider().assertDiskMutationAllowed({
      allowSceneDirty: true,
    });
    this.getEntity(entityId);
    const beforePaths = new Set(
      (await refreshProjectFiles()).map((asset) => asset.relPath.toLocaleLowerCase()),
    );
    this.getEntity(entityId);
    store.select(entityId);
    let path: string;
    try {
      path = await createProjectPrefabFromSelection(store);
    } catch (error) {
      throw prefabBridgeError(error);
    }
    const asset = findAsset(await refreshProjectFiles(), path);
    if (
      !asset
      || beforePaths.has(asset.relPath.toLocaleLowerCase())
      || asset.kind !== 'prefab'
      || asset.metaStatus !== 'ready'
      || !asset.guid
    ) {
      throw new BridgeError(
        'IO_ERROR',
        `Prefab creation completed but the indexed asset is unhealthy: ${path}`,
      );
    }
    const instance = store.getPrefabInstance(entityId);
    if (!instance || instance.source !== asset.relPath) {
      throw new BridgeError(
        'INTERNAL',
        `Prefab asset was created but entity ${entityId} was not linked`,
      );
    }
    const change: ProjectAssetChange = {
      type: 'added',
      relPath: asset.relPath,
      previous: null,
      current: asset,
    };
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
      detail: { changes: [change], source: 'agent' },
    }));
    broadcastProjectAssetsChanged({
      action: 'created',
      destinationPath: asset.relPath,
    });
    this.logProvider?.(
      `Created ${asset.relPath} from entity ${entityId} and linked its first instance`,
    );
    return {
      path: asset.relPath,
      asset: structuredClone(asset),
      instance: structuredClone(instance),
      entity: this.getEntity(instance.root),
    };
  }

  async applyPrefab(entityId: number, expectedRevision: string): Promise<unknown> {
    const store = this.requireStore();
    if (store.mode !== 'edit') {
      throw new BridgeError('READONLY', 'prefab.apply is only available in Edit Mode');
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed({
      allowSceneDirty: true,
    });
    const target = await this.getPrefabInstanceInfo(entityId);
    if (target.asset.revision !== expectedRevision) {
      throw stalePrefabRevision(target.asset, expectedRevision);
    }
    store.select(entityId);
    try {
      await applySelectedPrefab(store, expectedRevision);
    } catch (error) {
      if (isStaleAssetError(error)) {
        const current = findAsset(await refreshProjectFiles(), target.source);
        throw stalePrefabRevision(current, expectedRevision, target.source);
      }
      throw prefabBridgeError(error);
    }
    const after = findAsset(await refreshProjectFiles(), target.source);
    if (
      !after
      || after.revision === target.asset.revision
      || after.kind !== 'prefab'
      || after.metaStatus !== 'ready'
      || !after.guid
    ) {
      throw new BridgeError(
        'IO_ERROR',
        `Prefab apply completed but the indexed revision did not advance: ${target.source}`,
      );
    }
    const instance = store.getPrefabInstance(target.root);
    if (!instance) {
      throw new BridgeError('INTERNAL', `Prefab instance link was lost: ${target.source}`);
    }
    const change: ProjectAssetChange = {
      type: 'modified',
      relPath: after.relPath,
      previous: target.asset,
      current: after,
    };
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
      detail: { changes: [change], source: 'agent' },
    }));
    broadcastProjectAssetsChanged({ action: 'modified', sourcePath: after.relPath });
    this.logProvider?.(
      `Applied entity ${entityId} to ${after.relPath} at revision ${after.revision}`,
    );
    return {
      path: after.relPath,
      asset: structuredClone(after),
      instance: structuredClone(instance),
      entity: this.getEntity(instance.root),
    };
  }

  async revertPrefab(entityId: number, expectedRevision: string): Promise<unknown> {
    const store = this.requireStore();
    if (store.mode !== 'edit') {
      throw new BridgeError('READONLY', 'prefab.revert is only available in Edit Mode');
    }
    const target = await this.getPrefabInstanceInfo(entityId);
    if (target.asset.revision !== expectedRevision) {
      throw stalePrefabRevision(target.asset, expectedRevision);
    }
    store.select(entityId);
    try {
      await revertSelectedPrefab(store, expectedRevision);
    } catch (error) {
      if (isStaleAssetError(error)) {
        const current = findAsset(await refreshProjectFiles(), target.source);
        throw stalePrefabRevision(current, expectedRevision, target.source);
      }
      throw prefabBridgeError(error);
    }
    const root = store.selected;
    const instance = root == null ? null : store.getPrefabInstance(root);
    if (!instance) {
      throw new BridgeError(
        'INTERNAL',
        `Prefab revert completed but the replacement instance was not linked: ${target.source}`,
      );
    }
    this.logProvider?.(
      `Reverted entity ${entityId} from ${target.source} at revision ${expectedRevision}`,
    );
    return {
      path: target.source,
      revision: expectedRevision,
      instance: structuredClone(instance),
      entity: this.getEntity(instance.root),
    };
  }

  async unpackPrefab(entityId: number): Promise<unknown> {
    const store = this.requireStore();
    if (store.mode !== 'edit') {
      throw new BridgeError('READONLY', 'prefab.unpack is only available in Edit Mode');
    }
    const target = await this.getPrefabInstanceInfo(entityId);
    store.select(entityId);
    let path: string;
    try {
      path = unpackSelectedPrefab(store);
    } catch (error) {
      throw prefabBridgeError(error);
    }
    if (store.getPrefabInstance(target.root)) {
      throw new BridgeError(
        'INTERNAL',
        `Prefab unpack completed but linkage remains: ${target.source}`,
      );
    }
    this.logProvider?.(`Unpacked prefab instance ${target.instance} from ${path}`);
    return {
      path,
      previousInstance: {
        root: target.root,
        source: target.source,
        instance: target.instance,
      },
      entity: this.getEntity(target.root),
    };
  }

  async getBuildSettings(): Promise<unknown> {
    return bridgeIo('Failed to read Build Settings', () => getProjectBuildSettings());
  }

  async setBuildScenes(
    requestedScenes: string[],
    expectedRevision: string,
  ): Promise<ProjectBuildSettings> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Build Settings require the desktop editor');
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed({
      allowSceneDirty: true,
    });
    const current = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    if (current.revision !== expectedRevision) {
      throw staleBuildSettingsRevision(current.revision, expectedRevision);
    }
    const availableByKey = new Map(
      current.availableScenes.map((scene) => [scene.toLocaleLowerCase(), scene]),
    );
    const scenes = requestedScenes.map((scene) => {
      const available = availableByKey.get(scene.toLocaleLowerCase());
      if (!available) {
        throw new BridgeError(
          'INVALID_ARGS',
          `Build scene "${scene}" is not available. Query build.settings for availableScenes.`,
          { scene, availableScenes: current.availableScenes },
        );
      }
      return available;
    });
    let result: ProjectBuildSettings;
    try {
      result = await saveProjectBuildSettings(scenes, expectedRevision);
    } catch (error) {
      if (isStaleBuildSettingsError(error)) {
        const latest = await bridgeIo(
          'Failed to reload Build Settings',
          () => getProjectBuildSettings(),
        );
        throw staleBuildSettingsRevision(latest.revision, expectedRevision);
      }
      throw new BridgeError(
        'IO_ERROR',
        error instanceof Error ? error.message : String(error),
      );
    }
    broadcastProjectBuildSettingsChanged(result);
    this.appendEvent('build.settings', result);
    this.logProvider?.(
      `Agent updated Build Settings: ${result.scenes.length} scene(s), entry ${result.mainScene}`,
    );
    return result;
  }

  async setBuildAssetPolicy(
    assetMode: 'all' | 'referenced',
    alwaysInclude: string[],
    shaderVariantLimit: number,
    expectedRevision: string,
  ): Promise<ProjectBuildSettings> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Build Settings require the desktop editor');
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed({
      allowSceneDirty: true,
    });
    const current = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    if (current.revision !== expectedRevision) {
      throw staleBuildSettingsRevision(current.revision, expectedRevision);
    }
    let result: ProjectBuildSettings;
    try {
      result = await saveProjectBuildAssetSettings(
        assetMode,
        alwaysInclude,
        shaderVariantLimit,
        expectedRevision,
      );
    } catch (error) {
      if (isStaleBuildSettingsError(error)) {
        const latest = await bridgeIo(
          'Failed to reload Build Settings',
          () => getProjectBuildSettings(),
        );
        throw staleBuildSettingsRevision(latest.revision, expectedRevision);
      }
      throw new BridgeError(
        'IO_ERROR',
        error instanceof Error ? error.message : String(error),
      );
    }
    broadcastProjectBuildSettingsChanged(result);
    this.appendEvent('build.settings', result);
    this.logProvider?.(
      `Agent updated Build content policy: ${result.assetMode}, ${result.alwaysInclude.length} always-included path(s), ${result.shaderVariantLimit} shader variants`,
    );
    return result;
  }

  async setSortingLayers(
    layers: SortingLayer[],
    expectedRevision: string | null,
  ): Promise<unknown> {
    await this.requireWorkspaceProvider().assertDiskMutationAllowed({
      allowSceneDirty: true,
    });
    const current = await bridgeIo(
      'Failed to read Project Settings',
      () => loadSortingLayersSnapshot(),
    );
    if (current.revision !== expectedRevision) {
      throw staleSortingLayerRevision(current.revision, expectedRevision);
    }
    let saved: Awaited<ReturnType<typeof persistSortingLayersGuarded>>;
    try {
      saved = await persistSortingLayersGuarded(layers, expectedRevision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('sorting layers changed on disk since they were loaded')) {
        const latest = await bridgeIo(
          'Failed to reload Project Settings',
          () => loadSortingLayersSnapshot(),
        );
        throw staleSortingLayerRevision(latest.revision, expectedRevision);
      }
      throw new BridgeError('IO_ERROR', message);
    }
    this.appendEvent('project.settings', {
      section: 'sortingLayers',
      revision: saved.revision,
      layers: saved.settings.layers,
    });
    this.logProvider?.(
      `Agent saved ${saved.settings.layers.length} project sorting layer(s) at revision ${saved.revision}`,
    );
    return {
      projectSettings: structuredClone(saved),
      sortingLayers: structuredClone(saved),
    };
  }

  async setTagsAndLayers(
    tags: string[],
    gameLayers: GameObjectLayer[],
    expectedRevision: string | null,
  ): Promise<unknown> {
    await this.requireWorkspaceProvider().assertDiskMutationAllowed({
      allowSceneDirty: true,
    });
    const current = await bridgeIo(
      'Failed to read Project Settings',
      () => loadSortingLayersSnapshot(),
    );
    if (current.revision !== expectedRevision) {
      throw staleSortingLayerRevision(current.revision, expectedRevision);
    }
    let saved: Awaited<ReturnType<typeof persistTagsAndLayersGuarded>>;
    try {
      saved = await persistTagsAndLayersGuarded(tags, gameLayers, expectedRevision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('sorting layers changed on disk since they were loaded')) {
        const latest = await bridgeIo(
          'Failed to reload Project Settings',
          () => loadSortingLayersSnapshot(),
        );
        throw staleSortingLayerRevision(latest.revision, expectedRevision);
      }
      throw new BridgeError('IO_ERROR', message);
    }
    this.appendEvent('project.settings', {
      section: 'tagsAndLayers',
      revision: saved.revision,
      tags: saved.settings.tags,
      gameLayers: saved.settings.gameLayers,
    });
    this.logProvider?.(
      `Agent saved ${saved.settings.tags.length} tag(s) and ${saved.settings.gameLayers.length} GameObject layer(s) at revision ${saved.revision}`,
    );
    return { projectSettings: structuredClone(saved) };
  }

  async getBuildHistory(limit = 20): Promise<unknown> {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 20;
    const history = await bridgeIo(
      'Failed to read build history',
      () => listPcBuildHistory(),
    );
    return {
      ...history,
      total: history.entries.length,
      entries: history.entries.slice(0, boundedLimit),
      truncated: history.entries.length > boundedLimit,
    };
  }

  async getBuildPatches(limit = 50): Promise<unknown> {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 50;
    const inventory = await bridgeIo(
      'Failed to read build patch inventory',
      () => listPcBuildPatches(),
    );
    return {
      ...inventory,
      total: inventory.entries.length,
      entries: inventory.entries.slice(0, boundedLimit),
      truncated: inventory.entries.length > boundedLimit,
    };
  }

  async compareBuildHistory(previousId: string, currentId: string): Promise<unknown> {
    if (previousId === currentId) {
      throw new BridgeError('INVALID_ARGS', 'Build history comparison requires two different ids');
    }
    return bridgeIo(
      'Failed to compare build history',
      () => comparePcBuildHistory(previousId, currentId),
    );
  }

  async createBuildHistoryPatch(previousId: string, currentId: string): Promise<unknown> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Historical patch generation requires the desktop editor');
    }
    if (previousId === currentId) {
      throw new BridgeError('INVALID_ARGS', 'Historical patch generation requires two different ids');
    }
    const result = await bridgeIo(
      'Historical patch generation failed',
      () => createPcBuildHistoryPatch(previousId, currentId),
    );
    this.notifyBuildArtifactsChanged('history-patch-created', result);
    this.logProvider?.(`Agent created signed historical patch: ${result.outputDir}`);
    return result;
  }

  async restoreBuildHistory(historyId: string, publicKeyPath: string): Promise<unknown> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Build history restore requires the desktop editor');
    }
    const result = await bridgeIo(
      'Historical build restore failed',
      () => restorePcBuildHistory(historyId, publicKeyPath),
    );
    this.notifyBuildArtifactsChanged('history-restored', result);
    this.logProvider?.(`Agent restored trusted build history ${result.historyId}: ${result.outputDir}`);
    return result;
  }

  async verifyBuildPatch(patchId: string, publicKeyPath: string): Promise<unknown> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Build patch verification requires the desktop editor');
    }
    const result = await bridgeIo(
      'Build patch verification failed',
      () => verifyPcBuildPatch(patchId, publicKeyPath),
    );
    this.appendEvent('build.progress', {
      status: 'patch-verified',
      result,
    });
    this.logProvider?.(`Agent verified signed build patch ${result.patchId}`);
    return result;
  }

  getBuildArtifactStatus(): { status: 'idle' } | AgentBuildArtifactJob {
    return this.buildArtifactJob
      ? structuredClone(this.buildArtifactJob)
      : { status: 'idle' };
  }

  startBuildHistoryPatch(previousId: string, currentId: string): AgentBuildArtifactJob {
    if (previousId === currentId) {
      throw new BridgeError('INVALID_ARGS', 'Historical patch generation requires two different ids');
    }
    return this.startBuildArtifactJob(
      'history-patch',
      { previousId, currentId },
      () => this.createBuildHistoryPatch(previousId, currentId),
    );
  }

  startBuildHistoryRestore(
    historyId: string,
    publicKeyPath: string,
  ): AgentBuildArtifactJob {
    return this.startBuildArtifactJob(
      'history-restore',
      { historyId, publicKeyPath },
      () => this.restoreBuildHistory(historyId, publicKeyPath),
    );
  }

  startBuildPatchVerification(
    patchId: string,
    publicKeyPath: string,
  ): AgentBuildArtifactJob {
    return this.startBuildArtifactJob(
      'patch-verify',
      { patchId, publicKeyPath },
      () => this.verifyBuildPatch(patchId, publicKeyPath),
    );
  }

  private startBuildArtifactJob(
    operation: AgentBuildArtifactJob['operation'],
    input: Record<string, string>,
    run: () => Promise<unknown>,
  ): AgentBuildArtifactJob {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Build artifact jobs require the desktop editor');
    }
    if (this.buildArtifactJob?.status === 'running') {
      throw new BridgeError(
        'CONFLICT',
        `Build artifact job ${this.buildArtifactJob.id} is already running`,
      );
    }
    if (this.buildJob?.status === 'running') {
      throw new BridgeError('CONFLICT', `Build ${this.buildJob.id} is already running`);
    }
    const job: AgentBuildArtifactJob = {
      id: crypto.randomUUID(),
      operation,
      status: 'running',
      cancellable: false,
      input: structuredClone(input),
      startedAt: Date.now(),
      finishedAt: null,
      result: null,
      error: null,
    };
    this.buildArtifactJob = job;
    this.appendEvent('build.progress', {
      jobId: job.id,
      operation,
      status: 'running',
      cancellable: false,
    }, job.startedAt);
    void run()
      .then((result) => {
        if (this.buildArtifactJob?.id !== job.id) return;
        this.buildArtifactJob.status = 'succeeded';
        this.buildArtifactJob.result = result;
        this.buildArtifactJob.finishedAt = Date.now();
        this.appendEvent('build.progress', {
          jobId: job.id,
          operation,
          status: 'succeeded',
          result,
        }, this.buildArtifactJob.finishedAt);
      })
      .catch((error) => {
        if (this.buildArtifactJob?.id !== job.id) return;
        const message = error instanceof Error ? error.message : String(error);
        this.buildArtifactJob.status = 'failed';
        this.buildArtifactJob.error = message;
        this.buildArtifactJob.finishedAt = Date.now();
        this.appendEvent('build.progress', {
          jobId: job.id,
          operation,
          status: 'failed',
          error: message,
        }, this.buildArtifactJob.finishedAt);
        this.logProvider?.(`Agent build artifact ${operation} failed: ${message}`);
      });
    return structuredClone(job);
  }

  private notifyBuildArtifactsChanged(status: string, result: unknown): void {
    broadcastProjectBuildArtifactsChanged({ status, result });
    this.appendEvent('build.progress', { status, result });
  }

  getBuildStatus(): { status: 'idle' } | AgentBuildJob {
    return this.buildJob ? structuredClone(this.buildJob) : { status: 'idle' };
  }

  async startBuild(profile: BuildPlayerProfile, clean: boolean): Promise<AgentBuildJob> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Player builds require the desktop editor');
    }
    if (this.buildJob?.status === 'running') {
      throw new BridgeError('CONFLICT', `Build ${this.buildJob.id} is already running`);
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const settings = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    if (!settings.scenes.length) {
      throw new BridgeError('INVALID_ARGS', 'Build Settings has no enabled scenes');
    }

    this.stopBuildProgress?.();
    this.stopBuildProgress = null;
    const job: AgentBuildJob = {
      id: crypto.randomUUID(),
      status: 'running',
      profile,
      clean,
      startedAt: Date.now(),
      finishedAt: null,
      progress: null,
      result: null,
      verification: null,
      error: null,
    };
    this.buildJob = job;
    this.appendEvent('build.progress', {
      jobId: job.id,
      status: job.status,
      profile: job.profile,
      clean: job.clean,
    }, job.startedAt);
    try {
      this.stopBuildProgress = await listenToPcBuildProgress((progress) => {
        if (this.buildJob?.id === job.id && this.buildJob.status === 'running') {
          this.buildJob.progress = { ...progress };
          this.appendEvent('build.progress', {
            jobId: job.id,
            status: 'running',
            progress,
          });
        }
      });
    } catch (error) {
      this.logProvider?.(`Build progress listener failed: ${String(error)}`);
    }
    void buildPcPlayer(profile, clean)
      .then((result) => {
        if (this.buildJob?.id !== job.id) return;
        this.buildJob.status = 'succeeded';
        this.buildJob.result = result;
        this.buildJob.finishedAt = Date.now();
        this.appendEvent('build.progress', {
          jobId: job.id,
          status: 'succeeded',
          result,
        }, this.buildJob.finishedAt);
        this.logProvider?.(`Agent build succeeded: ${result.outputDir}`);
      })
      .catch((error) => {
        if (this.buildJob?.id !== job.id) return;
        const message = error instanceof Error ? error.message : String(error);
        this.buildJob.status = message.toLocaleLowerCase().includes('cancel')
          ? 'cancelled'
          : 'failed';
        this.buildJob.error = message;
        this.buildJob.finishedAt = Date.now();
        this.appendEvent('build.progress', {
          jobId: job.id,
          status: this.buildJob.status,
          error: message,
        }, this.buildJob.finishedAt);
        this.logProvider?.(`Agent build ${this.buildJob.status}: ${message}`);
      })
      .finally(() => {
        if (this.buildJob?.id !== job.id) return;
        this.stopBuildProgress?.();
        this.stopBuildProgress = null;
      });
    return structuredClone(job);
  }

  async cancelBuild(): Promise<{ requested: boolean; jobId: string }> {
    if (!this.buildJob || this.buildJob.status !== 'running') {
      throw new BridgeError('CONFLICT', 'No AgentBridge build is currently running');
    }
    const requested = await bridgeIo(
      'Failed to cancel Player build',
      () => cancelPcBuild(),
    );
    if (!requested) {
      throw new BridgeError('CONFLICT', 'The active build did not accept cancellation');
    }
    this.appendEvent('build.progress', {
      jobId: this.buildJob.id,
      status: 'cancellation-requested',
    });
    return { requested: true, jobId: this.buildJob.id };
  }

  async verifyBuild(
    executable: string,
    expectedContentHash: string,
  ): Promise<VerifyPlayerResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Published build verification requires the desktop editor');
    }
    if (this.buildJob?.status === 'running') {
      throw new BridgeError(
        'CONFLICT',
        `Build ${this.buildJob.id} is still running; verify it after completion`,
      );
    }
    const verification = await bridgeIo(
      'Published Player verification failed',
      () => verifyPcPlayer(executable, expectedContentHash),
    );
    const job = this.buildJob;
    if (job?.result?.contentHash === verification.contentHash) {
      job.verification = verification;
    }
    this.appendEvent('build.progress', {
      jobId: job?.id ?? null,
      status: 'verified',
      verification,
    });
    this.logProvider?.(
      `Agent verified published Player: ${verification.fileCount} file(s), ${verification.contentHash}`,
    );
    return verification;
  }

  async setGameResolution(
    resolution: GameResolution | null,
  ): Promise<EditorState> {
    const store = this.requireStore();
    await bridgeIo(
      'Failed to persist Game View resolution',
      () => setEditorPrefs({ gameResolution: resolution }),
    );
    store.setGameResolution(resolution);
    this.refreshProvider?.();
    this.observe();
    this.logProvider?.(
      `Agent set Game View resolution to ${
        resolution ? `${resolution.width} x ${resolution.height}` : 'Free Aspect'
      }`,
    );
    return this.getEditorState();
  }

  getComponentSchema(type?: string): unknown {
    if (type) {
      const schema = buildAgentComponentSchema(type);
      if (!schema) {
        throw new BridgeError('COMPONENT_NOT_FOUND', `Unknown component type "${type}"`);
      }
      return schema;
    }
    return listAgentComponentSchemas();
  }

  /** Activate a docked panel without raising or focusing any native window. */
  focusPanel(kind: string): boolean {
    if (!CORE_PANEL_IDS.includes(kind as (typeof CORE_PANEL_IDS)[number])) return false;
    window.dispatchEvent(new CustomEvent('mengine:focus-panel', {
      detail: { panel: kind, activateWindow: false },
    }));
    return true;
  }

  resetPanelLayout(): void {
    window.dispatchEvent(new CustomEvent('mengine:reset-dock-layout'));
  }

  private async waitForPanelDetached(
    panel: string,
    expected: boolean,
  ): Promise<PanelLayoutSnapshot> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const layout = this.panelLayoutProvider?.() ?? null;
      const detached = (layout?.detachedPanels ?? []).some((entry) => entry.kind === panel);
      if (layout && detached === expected) return layout;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new BridgeError(
      'IO_ERROR',
      `Panel "${panel}" did not become ${expected ? 'detached' : 'docked'} within 2 seconds`,
    );
  }

  async invokeMenu(path: string): Promise<CommandResult> {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      throw new BridgeError('INVALID_ARGS', '"path" must be a non-empty string');
    }
    const entry = findMenuItem(normalizedPath);
    if (!entry) {
      throw new BridgeError('INVALID_ARGS', `Unknown menu item "${normalizedPath}"`);
    }
    if (!entry.agentInvokable) {
      const alternative = entry.agentAlternative
        ? ` Use the ${entry.agentAlternative} domain tool instead.`
        : '';
      throw new BridgeError(
        'READONLY',
        `Menu item "${entry.path}" requires foreground-only user input.${alternative}`,
        {
          path: entry.path,
          agentAlternative: entry.agentAlternative ?? null,
        },
      );
    }
    const context = this.menuContext();
    let enabled = true;
    try {
      enabled = entry.validate?.(context) ?? true;
    } catch {
      enabled = false;
    }
    if (!enabled) {
      throw new BridgeError('READONLY', `Menu item "${entry.path}" is currently disabled`);
    }
    await entry.action(context);
    this.refreshProvider?.();
    return { ok: true, data: { path: entry.path } };
  }

  // ── Dispatcher (write commands) ───────────────────────────────────────

  private assertExpectedSceneRevision(expected: number | undefined): void {
    if (expected === undefined) return;
    if (!Number.isSafeInteger(expected) || expected < 0) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"expectedSceneRevision" must be a non-negative safe integer',
      );
    }
    this.observe(true);
    const current = this.sceneChanges.revision;
    if (expected !== current) {
      throw new BridgeError(
        'STALE_REVISION',
        `Scene revision changed: expected ${expected}, current ${current}`,
        { expectedSceneRevision: expected, currentSceneRevision: current },
      );
    }
  }

  async execute(
    commandId: string,
    args: Record<string, unknown> = {},
    options: { screenshot?: boolean; expectedSceneRevision?: number } = {},
  ): Promise<CommandResult> {
    const paramsSchema = COMMAND_PARAMS_SCHEMAS[commandId];
    if (!paramsSchema) {
      throw new BridgeError('INVALID_ARGS', `Unknown command "${commandId}"`);
    }
    const argumentIssues = validateAgentJsonSchema(args, paramsSchema);
    if (argumentIssues.length > 0) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Invalid arguments for command "${commandId}"`,
        { command: commandId, issues: argumentIssues },
      );
    }
    this.assertExpectedSceneRevision(options.expectedSceneRevision);
    if (commandId === 'console.clear') {
      return this.finishAsyncCommand(
        { ok: true, data: this.clearLogs() },
        options,
        true,
      );
    }
    if (commandId === 'profiler.clear') {
      clearEditorProfilerSamples();
      return this.finishAsyncCommand(
        { ok: true, data: { cleared: true } },
        options,
        true,
      );
    }
    if (commandId === 'window.close') {
      const result = await this.closeRegisteredEditorWindow(
        requiredString(args, 'windowLabel'),
      );
      return this.finishAsyncCommand(
        { ok: true, data: result },
        options,
        true,
      );
    }
    if (commandId === 'window.open_editor') {
      const result = await this.openRegisteredEditorWindow(
        requiredString(args, 'typeId'),
      );
      return this.finishAsyncCommand(
        { ok: true, data: result },
        options,
        result.windowLabel,
      );
    }
    if (commandId === 'dialog.respond') {
      const dialogId = requiredString(args, 'dialogId');
      const windowLabel = typeof args.windowLabel === 'string' && args.windowLabel.trim()
        ? args.windowLabel
        : 'main';
      const rawAction = requiredString(args, 'action');
      if (rawAction !== 'accept' && rawAction !== 'cancel') {
        throw new BridgeError('INVALID_ARGS', '"action" must be "accept" or "cancel"');
      }
      const activeDialog = getEditorDialogForWindow(windowLabel);
      if (!activeDialog || activeDialog.id !== dialogId) {
        throw new BridgeError(
          'CONFLICT',
          'The editor dialog changed; read get_active_dialog and respond to its current id',
          { activeDialog },
        );
      }
      const result = await respondToEditorDialogInWindow(
        windowLabel,
        dialogId,
        rawAction,
        typeof args.value === 'string' ? args.value : undefined,
      );
      if (!result) {
        throw new BridgeError('CONFLICT', 'The editor dialog was resolved concurrently');
      }
      return this.finishAsyncCommand({
        ok: true,
        data: {
          ...result,
          windowLabel,
          nextDialog: getEditorDialogForWindow(windowLabel),
        },
      }, options, windowLabel);
    }
    if (commandId === 'project.open') {
      const provider = this.requireAvailableProjectLifecycle();
      const editorBootGeneration = this.editorBootGeneration;
      try {
        const operation = provider.open(requiredString(args, 'root'));
        this.observeProject();
        const snapshot = await operation;
        await this.waitForEditorBootAfter(editorBootGeneration);
        this.observeProject();
        return this.finishAsyncCommand(
          { ok: true, data: projectSummary(snapshot) },
          options,
          true,
        );
      } catch (error) {
        this.observeProject();
        throw projectBridgeError(error);
      }
    }
    if (commandId === 'project.create') {
      const provider = this.requireAvailableProjectLifecycle();
      const editorBootGeneration = this.editorBootGeneration;
      try {
        const operation = provider.create(
          requiredString(args, 'parent'),
          requiredString(args, 'name'),
        );
        this.observeProject();
        const snapshot = await operation;
        await this.waitForEditorBootAfter(editorBootGeneration);
        this.observeProject();
        return this.finishAsyncCommand(
          { ok: true, data: projectSummary(snapshot) },
          options,
          true,
        );
      } catch (error) {
        this.observeProject();
        throw projectBridgeError(error);
      }
    }
    if (commandId === 'project.close') {
      const result = await this.requireWorkspaceProvider().closeProject(
        optionalBoolean(args, 'discardDirty', false),
      );
      const response = await this.finishAsyncCommand(
        { ok: true, data: result },
        options,
        true,
      );
      window.setTimeout(() => window.location.reload(), 250);
      return response;
    }
    if (commandId === 'project.forget_recent') {
      const provider = this.requireProjectLifecycleProvider();
      const state = provider.getState();
      if (state.busy) {
        throw new BridgeError(
          'CONFLICT',
          `Project lifecycle is busy${state.operation ? ` (${state.operation})` : ''}`,
        );
      }
      try {
        const projects = await provider.forgetRecent(
          requiredString(args, 'path'),
        );
        this.observeProject();
        return this.finishAsyncCommand({
          ok: true,
          data: {
            removedPath: requiredString(args, 'path'),
            projects: structuredClone(projects),
          },
        }, options, true);
      } catch (error) {
        this.observeProject();
        throw projectBridgeError(error);
      }
    }
    if (commandId === 'project.settings.set_sorting_layers') {
      const layers = requiredSortingLayers(args);
      const validation = validateSortingLayers(layers);
      if (validation) throw new BridgeError('INVALID_ARGS', validation);
      const result = await this.setSortingLayers(
        layers,
        requiredNullableRevision(args, 'expectedRevision'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'project.settings.set_tags_and_layers') {
      const tags = requiredTags(args);
      const gameLayers = requiredGameLayers(args);
      const validation = validateTagsAndLayers(tags, gameLayers);
      if (validation) throw new BridgeError('INVALID_ARGS', validation);
      const result = await this.setTagsAndLayers(
        tags,
        gameLayers,
        requiredNullableRevision(args, 'expectedRevision'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'scene.new') {
      const result = await this.requireSceneProvider().create({
        name: requiredString(args, 'name'),
        overwrite: optionalBoolean(args, 'overwrite', false),
        discardDirty: optionalBoolean(args, 'discardDirty', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.open') {
      const result = await this.requireSceneProvider().open({
        name: requiredString(args, 'name'),
        discardDirty: optionalBoolean(args, 'discardDirty', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.save') {
      const result = await this.requireSceneProvider().save({
        name: optionalString(args, 'name'),
        overwrite: optionalBoolean(args, 'overwrite', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.save_all') {
      const result = await this.requireSceneProvider().saveAll({
        unnamedScene: optionalString(args, 'name'),
        overwrite: optionalBoolean(args, 'overwrite', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.load_json') {
      const store = this.requireStore();
      if (store.mode !== 'edit') {
        throw new BridgeError(
          'READONLY',
          'scene.load_json is only available in Edit Mode',
        );
      }
      const json = requiredString(args, 'json', true);
      const summary = validateAgentSceneJson(json);
      store.replaceSceneWorldJson(json);
      this.logProvider?.(
        `Agent replaced current scene world: ${summary.entityCount} entities, ${summary.componentCount} components`,
      );
      return this.finishAsyncCommand({ ok: true, data: summary }, options);
    }
    if (commandId === 'scene.rename') {
      await this.requireWorkspaceProvider().assertDiskMutationAllowed();
      let result: Awaited<ReturnType<AgentSceneProvider['rename']>>;
      try {
        result = await this.requireSceneProvider().rename({
          oldName: requiredString(args, 'oldName'),
          newName: requiredString(args, 'newName'),
        });
      } catch (error) {
        throw sceneLifecycleBridgeError(error);
      }
      this.appendEvent('asset.changed', {
        action: 'sceneRenamed',
        sourcePath: sceneAssetPath(result.oldName),
        destinationPath: sceneAssetPath(result.name),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'scene.delete') {
      await this.requireWorkspaceProvider().assertDiskMutationAllowed();
      const expectedPreviewToken = requiredString(args, 'previewToken');
      const preview = await this.previewSceneDelete(requiredString(args, 'name'));
      if (preview.previewToken !== expectedPreviewToken) {
        throw new BridgeError(
          'STALE_REVISION',
          'Scene deletion preview is stale; preview the operation again',
          {
            expectedPreviewToken,
            currentPreviewToken: preview.previewToken,
          },
        );
      }
      if (preview.blockers.length > 0) {
        throw new BridgeError(
          'CONFLICT',
          preview.blockers.join('; '),
          { blockers: preview.blockers },
        );
      }
      let result: Awaited<ReturnType<AgentSceneProvider['delete']>>;
      try {
        result = await this.requireSceneProvider().delete({
          name: preview.name,
          expectedRevision: preview.revision,
        });
      } catch (error) {
        throw sceneLifecycleBridgeError(error);
      }
      this.appendEvent('asset.changed', {
        action: 'sceneDeleted',
        sourcePath: sceneAssetPath(result.name),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.import_file') {
      const result = await this.importAssetFile(
        requiredString(args, 'sourcePath'),
        requiredString(args, 'destinationPath'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.create') {
      const kind = requiredString(args, 'kind');
      if (!isAgentCreatableAssetKind(kind)) {
        throw new BridgeError('INVALID_ARGS', `Unsupported creatable asset kind "${kind}"`);
      }
      const requestedParentPath = optionalString(args, 'parentPath');
      if (kind !== 'material-instance' && requestedParentPath != null) {
        throw new BridgeError(
          'INVALID_ARGS',
          '"parentPath" is only valid when creating a material-instance',
        );
      }
      await this.requireWorkspaceProvider().assertDiskMutationAllowed();
      const beforeFiles = await refreshProjectFiles();
      let parentPath: string | undefined;
      if (requestedParentPath != null) {
        parentPath = normalizeAssetPath(requestedParentPath);
        const parent = findAsset(beforeFiles, parentPath);
        if (
          !parent
          || parent.kind !== 'material'
          || !/\.(?:mmat|mat|minst)$/i.test(parent.relPath)
        ) {
          throw new BridgeError(
            'INVALID_ARGS',
            `Material parent not found: ${parentPath}`,
          );
        }
        if (parent.metaStatus !== 'ready') {
          throw new BridgeError(
            'CONFLICT',
            `Asset metadata is not healthy: ${parent.relPath} (${parent.metaStatus})`,
          );
        }
        parentPath = parent.relPath;
      }
      const beforePaths = new Set(
        beforeFiles.map((asset) => asset.relPath.toLocaleLowerCase()),
      );
      const creation = await bridgeIo(
        `Failed to create ${kind}`,
        () => this.requireWorkspaceProvider().createAsset({ kind, parentPath }),
      );
      const afterFiles = await refreshProjectFiles();
      const primaryPath = normalizeAssetPath(creation.primaryPath);
      const createdPaths = [...new Set(
        creation.createdPaths.map((path) => normalizeAssetPath(path).toLocaleLowerCase()),
      )];
      const primary = findAsset(afterFiles, primaryPath);
      const created = createdPaths.map((path) => findAsset(afterFiles, path));
      if (
        !primary
        || !createdPaths.includes(primary.relPath.toLocaleLowerCase())
        || created.some((asset) => asset == null)
        || createdPaths.some((path) => beforePaths.has(path))
      ) {
        throw new BridgeError(
          'IO_ERROR',
          `Asset creation completed but its exact new asset set was not indexed: ${primaryPath}`,
        );
      }
      const indexedCreated = created as ProjectFileAsset[];
      const unhealthy = indexedCreated.find(
        (asset) => asset.metaStatus !== 'ready' || !asset.guid,
      );
      if (unhealthy) {
        throw new BridgeError(
          'IO_ERROR',
          `Asset creation completed but metadata is unhealthy: ${unhealthy.relPath} (${unhealthy.metaStatus})`,
        );
      }
      const changes: ProjectAssetChange[] = indexedCreated.map((asset) => ({
        type: 'added',
        relPath: asset.relPath,
        previous: null,
        current: asset,
      }));
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
        detail: { changes, source: 'agent' },
      }));
      this.logProvider?.(
        `Created ${primary.relPath} from AgentBridge (${indexedCreated.length} asset${indexedCreated.length === 1 ? '' : 's'})`,
      );
      return this.finishAsyncCommand({
        ok: true,
        data: {
          kind,
          primary: structuredClone(primary),
          created: structuredClone(indexedCreated),
        },
      }, options, true);
    }
    if (commandId === 'asset.instantiate') {
      const store = this.requireStore();
      if (store.mode !== 'edit') {
        throw new BridgeError(
          'READONLY',
          'asset.instantiate is only available in Edit Mode',
        );
      }
      const normalized = normalizeAssetPath(requiredString(args, 'path'));
      const asset = findAsset(await refreshProjectFiles(), normalized);
      if (!asset) throw new BridgeError('IO_ERROR', `Asset not found: ${normalized}`);
      if (asset.metaStatus !== 'ready') {
        throw new BridgeError(
          'CONFLICT',
          `Asset metadata is not healthy: ${asset.relPath} (${asset.metaStatus})`,
        );
      }
      const target = instantiableAssetTarget(asset);
      if (!target) {
        throw new BridgeError(
          'INVALID_ARGS',
          `Asset type "${asset.kind}" cannot be instantiated as a scene entity`,
        );
      }
      const entityId = await bridgeIo(
        `Failed to instantiate ${asset.relPath}`,
        () => this.requireWorkspaceProvider().instantiateAsset(target),
      );
      return this.finishAsyncCommand({
        ok: true,
        data: {
          kind: target.kind,
          path: target.path,
          entity: this.getEntity(entityId),
        },
      }, options);
    }
    if (commandId === 'prefab.create') {
      const result = await this.createPrefab(requiredNonNegativeInteger(args, 'entity'));
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'prefab.apply') {
      const result = await this.applyPrefab(
        requiredNonNegativeInteger(args, 'entity'),
        requiredString(args, 'expectedRevision'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'prefab.revert') {
      const result = await this.revertPrefab(
        requiredNonNegativeInteger(args, 'entity'),
        requiredString(args, 'expectedRevision'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'prefab.unpack') {
      const result = await this.unpackPrefab(requiredNonNegativeInteger(args, 'entity'));
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'asset.open') {
      const normalized = normalizeAssetPath(requiredString(args, 'path'));
      const asset = findAsset(await refreshProjectFiles(), normalized);
      if (!asset) throw new BridgeError('IO_ERROR', `Asset not found: ${normalized}`);
      if (asset.metaStatus !== 'ready') {
        throw new BridgeError(
          'CONFLICT',
          `Asset metadata is not healthy: ${asset.relPath} (${asset.metaStatus})`,
        );
      }
      const target = resourceEditorTarget(asset);
      if (!target) {
        throw new BridgeError(
          'INVALID_ARGS',
          `Asset type "${asset.kind}" has no docked resource editor; use the matching scene, entity, or text-asset command`,
        );
      }
      await this.requireWorkspaceProvider().openAsset(target);
      await nextFrame();
      await nextFrame();
      const documents = await this.getWorkspaceDocuments();
      const document = documents.documents.find(
        (candidate) => (
          candidate.panel === target.panel
          && candidate.path?.toLocaleLowerCase() === target.path.toLocaleLowerCase()
        ),
      );
      return this.finishAsyncCommand({
        ok: true,
        data: document ?? { ...target, active: true, detached: false, windowLabel: 'main' },
      }, options, document?.windowLabel ?? 'main');
    }
    if (commandId === 'panel.detach' || commandId === 'panel.dock') {
      const kind = requiredString(args, 'kind');
      if (!CORE_PANEL_IDS.includes(kind as (typeof CORE_PANEL_IDS)[number])) {
        throw new BridgeError('INVALID_ARGS', `Unknown panel kind "${kind}"`);
      }
      const panel = kind as (typeof CORE_PANEL_IDS)[number];
      const workspace = await this.getWorkspaceDocuments();
      const dirtyDocument = workspace.documents.find(
        (document) => document.panel === panel && document.kind !== 'scene' && document.dirty,
      );
      if (dirtyDocument) {
        throw new BridgeError(
          'CONFLICT',
          `${panel} has unsaved resource changes; save all before changing its window`,
        );
      }
      const detachedWindowExists = (await this.listWindows()).some(
        (window) => window.label === `panel-${panel}`,
      );
      const detached = detachedWindowExists || workspace.documents.some(
        (document) => document.panel === panel && document.detached,
      ) || (this.panelLayoutProvider?.()?.detachedPanels ?? []).some(
        (entry) => entry.kind === panel,
      );
      if (commandId === 'panel.detach') {
        if (!detachedWindowExists && !await detachPanelWindow(panel, undefined, false)) {
          throw new BridgeError('IO_ERROR', `Failed to detach panel "${panel}"`);
        }
        await this.waitForPanelDetached(panel, true);
        return this.finishAsyncCommand({
          ok: true,
          data: {
            panel,
            detached: true,
            windowLabel: `panel-${panel}`,
            backgroundSafe: true,
          },
        }, options, `panel-${panel}`);
      }
      if (detached) {
        requestPanelDock(panel);
        await this.waitForPanelDetached(panel, false);
      }
      return this.finishAsyncCommand({
        ok: true,
        data: {
          panel,
          detached: false,
          windowLabel: 'main',
          backgroundSafe: true,
        },
      }, options, 'main');
    }
    if (commandId === 'asset.write_text') {
      const expectedRevision = args.expectedRevision;
      if (expectedRevision !== null && typeof expectedRevision !== 'string') {
        throw new BridgeError(
          'INVALID_ARGS',
          '"expectedRevision" must be the current revision string, or null when creating',
        );
      }
      const result = await this.writeAssetText(
        requiredString(args, 'path'),
        requiredString(args, 'contents', true),
        expectedRevision,
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.rename') {
      const result = await (await this.getAssetOperations()).rename({
        sourcePath: requiredString(args, 'sourcePath'),
        destinationPath: requiredString(args, 'destinationPath'),
        previewToken: requiredString(args, 'previewToken'),
        allowManualReferences: optionalBoolean(args, 'allowManualReferences', false),
        allowSkippedFiles: optionalBoolean(args, 'allowSkippedFiles', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.duplicate') {
      const result = await (await this.getAssetOperations()).duplicate({
        sourcePath: requiredString(args, 'sourcePath'),
        destinationPath: requiredString(args, 'destinationPath'),
        previewToken: requiredString(args, 'previewToken'),
        allowManualReferences: optionalBoolean(args, 'allowManualReferences', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.trash') {
      const result = await (await this.getAssetOperations()).trash({
        sourcePath: requiredString(args, 'sourcePath'),
        previewToken: requiredString(args, 'previewToken'),
        allowSkippedFiles: optionalBoolean(args, 'allowSkippedFiles', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.restore') {
      const result = await (await this.getAssetOperations()).restore({
        trashId: requiredString(args, 'trashId'),
        expectedRecordRevision: requiredString(args, 'expectedRecordRevision'),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.settings.set_scenes') {
      const result = await this.setBuildScenes(
        requiredStringArray(args, 'scenes', { nonEmpty: true, unique: true }),
        requiredString(args, 'expectedRevision'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.settings.set_asset_policy') {
      const shaderVariantLimit = args.shaderVariantLimit;
      const alwaysInclude = requiredStringArray(args, 'alwaysInclude', { unique: true });
      if (alwaysInclude.length > 256) {
        throw new BridgeError(
          'INVALID_ARGS',
          '"alwaysInclude" must contain at most 256 paths',
        );
      }
      if (
        typeof shaderVariantLimit !== 'number'
        || !Number.isSafeInteger(shaderVariantLimit)
        || shaderVariantLimit < 1
        || shaderVariantLimit > 65_536
      ) {
        throw new BridgeError(
          'INVALID_ARGS',
          '"shaderVariantLimit" must be an integer from 1 to 65536',
        );
      }
      const result = await this.setBuildAssetPolicy(
        requiredEnum(args, 'assetMode', ['all', 'referenced'] as const),
        alwaysInclude,
        shaderVariantLimit,
        requiredString(args, 'expectedRevision'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.start') {
      const profile = optionalEnum(
        args,
        'profile',
        ['debug', 'release'] as const,
        'debug',
      );
      const result = await this.startBuild(
        profile,
        optionalBoolean(args, 'clean', true),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.cancel') {
      return this.finishAsyncCommand(
        { ok: true, data: await this.cancelBuild() },
        options,
        true,
      );
    }
    if (commandId === 'build.verify') {
      const result = await this.verifyBuild(
        requiredString(args, 'executable'),
        requiredString(args, 'expectedContentHash'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.history.create_patch') {
      const result = this.startBuildHistoryPatch(
        requiredString(args, 'previousId'),
        requiredString(args, 'currentId'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.history.restore') {
      const result = this.startBuildHistoryRestore(
        requiredString(args, 'historyId'),
        requiredAbsolutePath(args, 'publicKeyPath'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.patch.verify') {
      const result = this.startBuildPatchVerification(
        requiredString(args, 'patchId'),
        requiredAbsolutePath(args, 'publicKeyPath'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'view.set_game_resolution') {
      const result = await this.setGameResolution(requiredGameResolution(args));
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'menu.invoke') {
      const path = typeof args.path === 'string' ? args.path : '';
      const result = await this.invokeMenu(path);
      return this.finishAsyncCommand(result, options, true);
    }
    if (
      commandId === 'window.ui_click'
      || commandId === 'window.ui_double_click'
      || commandId === 'window.ui_context_click'
      || commandId === 'window.ui_set_value'
      || commandId === 'window.ui_scroll'
      || commandId === 'window.ui_press_key'
    ) {
      const action = commandId === 'window.ui_click'
        ? 'click'
        : commandId === 'window.ui_double_click'
          ? 'doubleClick'
          : commandId === 'window.ui_context_click'
            ? 'contextClick'
            : commandId === 'window.ui_set_value'
              ? 'setValue'
              : commandId === 'window.ui_scroll'
                ? 'scroll'
                : 'keyPress';
      const selector = typeof args.selector === 'string' ? args.selector : '';
      const windowLabel =
        typeof args.windowLabel === 'string' && args.windowLabel ? args.windowLabel : 'main';
      const value = typeof args.value === 'string' ? args.value : undefined;
      const deltaX = optionalBoundedUiDelta(args, 'deltaX', 0);
      const deltaY = commandId === 'window.ui_scroll'
        ? requiredBoundedUiDelta(args, 'deltaY')
        : undefined;
      const key = commandId === 'window.ui_press_key'
        ? requiredString(args, 'key')
        : undefined;
      const result: CommandResult = {
        ok: true,
        data: await this.interactWindow(
          action,
          selector,
          windowLabel,
          value,
          deltaX,
          deltaY,
          key,
        ),
      };
      return this.finishAsyncCommand(result, options, windowLabel);
    }
    const handler = WRITE_COMMANDS[commandId];
    if (!handler) {
      throw new BridgeError('INVALID_ARGS', `Unknown command "${commandId}"`);
    }
    const ctx: CommandContext = {
      store: this.requireStore(),
      focusPanel: (kind) => this.focusPanel(kind),
      resetPanelLayout: () => this.resetPanelLayout(),
    };
    const result = handler(ctx, args);
    return this.finishAsyncCommand(result, options);
  }

  // ── Unified query entry (called by transports) ────────────────────────

  async query(queryId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const paramsSchema = QUERY_PARAMS_SCHEMAS[queryId];
    if (!paramsSchema) {
      throw new BridgeError('INVALID_ARGS', `Unknown query "${queryId}"`);
    }
    const parameterIssues = validateAgentJsonSchema(params, paramsSchema);
    if (parameterIssues.length > 0) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Invalid parameters for query "${queryId}"`,
        { query: queryId, issues: parameterIssues },
      );
    }
    switch (queryId) {
      case 'editor.state':
        return this.getEditorState();
      case 'project.state':
        return this.getProjectState();
      case 'project.recent':
        return this.getRecentProjects();
      case 'dialog.state':
        return getEditorDialogForWindow(
          typeof params.windowLabel === 'string' && params.windowLabel.trim()
            ? params.windowLabel
            : 'main',
        );
      case 'project.settings':
        return this.getProjectSettings();
      case 'selection.get':
        return this.getSelection();
      case 'scene.snapshot':
        return this.getSceneSnapshot();
      case 'scene.diff':
        return this.getSceneDiff(requiredNonNegativeInteger(params, 'fromRevision'));
      case 'scene.hierarchy':
        return this.getHierarchy();
      case 'prefab.instance':
        return this.getPrefabInstanceInfo(requiredNonNegativeInteger(params, 'entity'));
      case 'scene.list':
        return this.getScenes();
      case 'scene.delete_preview':
        return this.previewSceneDelete(requiredString(params, 'name'));
      case 'entity.get':
        return this.getEntity(requireIdOrName(params));
      case 'entity.find':
        return this.findEntities(params);
      case 'entity.get_component':
        return this.getEntityComponent(
          requiredNonNegativeInteger(params, 'id'),
          requiredString(params, 'component'),
        );
      case 'view.screenshot':
        return this.captureViewport(
          (params.target as ViewportTab) ?? 'scene',
          (params.format as 'image/png' | 'image/jpeg') ?? 'image/png',
          params.quality as number | undefined,
        );
      case 'view.window_screenshot':
        return this.captureWindow(
          typeof params.windowLabel === 'string' && params.windowLabel
            ? params.windowLabel
            : 'main',
        );
      case 'window.list':
        return this.listWindows();
      case 'window.types':
        return this.listRegisteredWindowTypes();
      case 'workspace.documents':
        return this.getWorkspaceDocuments();
      case 'window.ui_snapshot':
        return this.inspectWindow(
          typeof params.windowLabel === 'string' && params.windowLabel
            ? params.windowLabel
            : 'main',
          typeof params.maxElements === 'number' ? params.maxElements : 2_000,
          typeof params.offset === 'number' ? params.offset : 0,
          typeof params.expectedSnapshotRevision === 'string'
            ? params.expectedSnapshotRevision
            : undefined,
        );
      case 'window.ui_content':
        return this.readWindowContent(
          requiredString(params, 'selector'),
          requiredUiContentField(params),
          typeof params.windowLabel === 'string' && params.windowLabel
            ? params.windowLabel
            : 'main',
          typeof params.offset === 'number' ? params.offset : 0,
          typeof params.maxChars === 'number' ? params.maxChars : 10_000,
          typeof params.expectedContentRevision === 'string'
            ? params.expectedContentRevision
            : undefined,
        );
      case 'panel.get_layout':
        return this.getPanelLayout();
      case 'menu.list':
        return this.listMenus(
          typeof params.root === 'string' && params.root.trim()
            ? params.root
            : undefined,
        );
      case 'asset.list':
        return this.listAssets(params);
      case 'asset.read_text':
        return this.readAssetText(
          requiredString(params, 'path'),
          typeof params.maxBytes === 'number' ? params.maxBytes : 1_048_576,
        );
      case 'asset.find_references':
        return this.findAssetReferences(requiredString(params, 'path'));
      case 'asset.rename_preview':
        return (await this.getAssetOperations()).previewRename(
          requiredString(params, 'sourcePath'),
          requiredString(params, 'destinationPath'),
        );
      case 'asset.duplicate_preview':
        return (await this.getAssetOperations()).previewDuplicate(
          requiredString(params, 'sourcePath'),
          requiredString(params, 'destinationPath'),
        );
      case 'asset.trash_preview':
        return (await this.getAssetOperations()).previewTrash(
          requiredString(params, 'sourcePath'),
        );
      case 'asset.trash_list':
        return (await this.getAssetOperations()).listTrash();
      case 'build.settings':
        return this.getBuildSettings();
      case 'build.status':
        return this.getBuildStatus();
      case 'build.artifact_status':
        return this.getBuildArtifactStatus();
      case 'build.history':
        return this.getBuildHistory(
          typeof params.limit === 'number' ? params.limit : 20,
        );
      case 'build.patches':
        return this.getBuildPatches(
          typeof params.limit === 'number' ? params.limit : 50,
        );
      case 'build.history.compare':
        return this.compareBuildHistory(
          requiredString(params, 'previousId'),
          requiredString(params, 'currentId'),
        );
      case 'console.get_logs':
        return this.getLogs({
          level: params.level as LogQuery['level'],
          since: params.since as number | undefined,
          limit: params.limit as number | undefined,
        });
      case 'profiler.get_samples': {
        const source = params.source ?? 'game';
        if (source !== 'scene' && source !== 'game') {
          throw new BridgeError(
            'INVALID_ARGS',
            '"source" must be "scene" or "game"',
          );
        }
        const limit = params.limit ?? 120;
        if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 480) {
          throw new BridgeError(
            'INVALID_ARGS',
            '"limit" must be an integer from 1 to 480',
          );
        }
        const allSamples = readEditorProfilerSamples(source as EditorProfilerSource);
        const samples = allSamples.slice(-Number(limit));
        return {
          source,
          scope: 'editor-canvas-preview',
          note: 'Editor Canvas preview CPU samples; not native Player GPU timing, memory, or draw-call capture.',
          summary: summarizeEditorProfilerSamples(allSamples),
          totalSamples: allSamples.length,
          returnedSamples: samples.length,
          truncated: samples.length < allSamples.length,
          samples,
        };
      }
      case 'events.get':
        return this.getEvents(params);
      case 'events.wait':
        return this.waitForEvents(params);
      case 'commands.list':
        return this.listCommands();
      case 'commands.describe':
        return this.describeCommand(requiredString(params, 'id'));
      case 'intents.list':
        return this.listIntents();
      case 'schema.components':
        return this.getComponentSchema();
      case 'schema.component':
        return this.getComponentSchema(
          typeof params.type === 'string' ? params.type : undefined,
        );
      case 'queries.list':
        return this.listQueries();
      case 'queries.describe':
        return this.describeQuery(requiredString(params, 'id'));
      default:
        throw new BridgeError('INVALID_ARGS', `Unknown query "${queryId}"`);
    }
  }

  private requireStore(): EditorStore {
    if (!this.store || !this.editorBootReady) {
      throw new BridgeError(
        'NOT_READY',
        'AgentBridge editor workspace is still loading',
      );
    }
    return this.store;
  }

  private requireSceneProvider(): AgentSceneProvider {
    const provider = this.sceneProvider?.() ?? null;
    if (!provider) throw new BridgeError('NOT_READY', 'Scene services are not ready');
    return provider;
  }

  private requireWorkspaceProvider(): AgentWorkspaceProvider {
    const provider = this.workspaceProvider?.() ?? null;
    if (!provider) throw new BridgeError('NOT_READY', 'Workspace services are not ready');
    return provider;
  }

  private requireProjectLifecycleProvider(): AgentProjectLifecycleProvider {
    const provider = this.projectLifecycleProvider?.() ?? null;
    if (!provider) {
      throw new BridgeError('NOT_READY', 'Project lifecycle services are not ready');
    }
    return provider;
  }

  private requireAvailableProjectLifecycle(): AgentProjectLifecycleProvider {
    const provider = this.requireProjectLifecycleProvider();
    const state = provider.getState();
    if (state.busy) {
      throw new BridgeError(
        'CONFLICT',
        `Project lifecycle is busy${state.operation ? ` (${state.operation})` : ''}`,
      );
    }
    if (state.ready || state.project) {
      throw new BridgeError(
        'CONFLICT',
        'A project is already open; call close_project before opening another project',
        { project: state.project },
      );
    }
    return provider;
  }

  private async getAssetOperations(): Promise<AgentAssetOperations> {
    if (!this.assetOperations) {
      const { AgentAssetOperations } = await import('./assetOperations');
      this.assetOperations = new AgentAssetOperations(
        () => this.requireWorkspaceProvider().assertDiskMutationAllowed(),
        (message) => this.logProvider?.(message),
      );
    }
    return this.assetOperations;
  }

  private async finishAsyncCommand(
    result: CommandResult,
    options: { screenshot?: boolean; expectedSceneRevision?: number },
    wholeWindow: boolean | string = false,
  ): Promise<CommandResult> {
    this.refreshProvider?.();
    if (this.store && this.editorBootReady) {
      this.observe(true);
      result.sceneRevision = this.sceneChanges.revision;
    } else {
      this.observeProject();
    }
    result.eventSequence = this.events.currentSequence;
    if (!options.screenshot) return result;
    await nextFrame();
    try {
      result.screenshot = wholeWindow
        ? await this.captureWindow(typeof wholeWindow === 'string' ? wholeWindow : 'main')
        : this.captureViewport('scene');
    } catch {
      // Screenshot is best-effort; never fail a completed command.
    }
    return result;
  }

  private menuContext(): MenuItemContext {
    const store = this.requireStore();
    return {
      source: 'agent',
      store,
      selectedIds: store.selectedIds,
      contextEntity: store.selected,
      refresh: () => this.refreshProvider?.(),
      log: (message) => {
        if (this.logProvider) this.logProvider(message);
        else logService.log(message, 'info', 'agent-menu');
      },
    };
  }
}

function requiredString(
  args: Record<string, unknown>,
  key: string,
  allowEmpty = false,
): string {
  const value = args[key];
  if (
    typeof value !== 'string'
    || (!allowEmpty && !value.trim())
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be ${allowEmpty ? 'a string' : 'a non-empty string'}`,
    );
  }
  return allowEmpty ? value : value.trim();
}

function requiredAbsolutePath(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = requiredString(args, key);
  const windowsDrive = /^[a-zA-Z]:[\\/]/.test(value);
  const windowsUnc = value.startsWith('\\\\');
  const posixRoot = value.startsWith('/');
  if (!windowsDrive && !windowsUnc && !posixRoot) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be an absolute path`);
  }
  return value;
}

function requiredBoundedUiDelta(
  args: Record<string, unknown>,
  key: string,
): number {
  const value = args[key];
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || Math.abs(value) > 1_000_000
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be a finite number from -1000000 to 1000000`,
    );
  }
  return value;
}

function requiredUiContentField(
  args: Record<string, unknown>,
): 'text' | 'value' {
  const value = args.field;
  if (value !== 'text' && value !== 'value') {
    throw new BridgeError('INVALID_ARGS', '"field" must be "text" or "value"');
  }
  return value;
}

function optionalBoundedUiDelta(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return args[key] === undefined ? fallback : requiredBoundedUiDelta(args, key);
}

function requiredStringArray(
  args: Record<string, unknown>,
  key: string,
  options: { nonEmpty?: boolean; unique?: boolean } = {},
): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be an array of non-empty strings`,
    );
  }
  const normalized = value.map((item) => (item as string).trim());
  if (options.nonEmpty && normalized.length === 0) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must contain at least one value`);
  }
  if (options.unique) {
    const keys = normalized.map((item) => item.toLocaleLowerCase());
    if (new Set(keys).size !== keys.length) {
      throw new BridgeError('INVALID_ARGS', `"${key}" must not contain duplicates`);
    }
  }
  return normalized;
}

function projectSummary(snapshot: ProjectSnapshot): AgentProjectSummary {
  return {
    id: snapshot.projectId,
    name: snapshot.projectName,
    root: snapshot.projectRoot,
    scenePath: snapshot.scenePath ?? null,
    revision: snapshot.revision,
  };
}

function projectBridgeError(reason: unknown): BridgeError {
  if (reason instanceof BridgeError) return reason;
  const failure = (
    reason
    && typeof reason === 'object'
    && 'code' in reason
    && 'message' in reason
  )
    ? reason as { code: unknown; message: unknown }
    : null;
  const nativeCode = typeof failure?.code === 'string' ? failure.code : '';
  const message = failure
    ? String(failure.message)
    : reason instanceof Error
      ? reason.message
      : String(reason);
  const code = nativeCode === 'noProject'
    ? 'PROJECT_NOT_OPEN'
    : ['invalidProject', 'invalidProjectName', 'invalidPath', 'json', 'scene']
        .includes(nativeCode)
      ? 'INVALID_ARGS'
      : [
          'projectAlreadyExists',
          'projectAlreadyOpen',
          'projectBuildActive',
          'staleRevision',
          'projectMismatch',
          'externalSceneModification',
        ].includes(nativeCode)
        ? 'CONFLICT'
        : nativeCode === 'io'
          ? 'IO_ERROR'
          : 'INTERNAL';
  return new BridgeError(code, message, failure ?? undefined);
}

function sceneLifecycleBridgeError(reason: unknown): BridgeError {
  if (reason instanceof BridgeError) return reason;
  const converted = projectBridgeError(reason);
  if (converted.code === 'INVALID_ARGS' && (
    /active scene/i.test(converted.message)
    || /Build Settings/i.test(converted.message)
    || /already exists/i.test(converted.message)
  )) {
    return new BridgeError('CONFLICT', converted.message, converted.data);
  }
  if (converted.code === 'INTERNAL') {
    return new BridgeError('IO_ERROR', converted.message, converted.data);
  }
  return converted;
}

function isStaleAssetError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.includes('asset changed on disk since it was loaded');
}

function stalePrefabRevision(
  asset: ProjectFileAsset | null | undefined,
  expectedRevision: string,
  fallbackPath?: string,
): BridgeError {
  return new BridgeError(
    'STALE_REVISION',
    `Prefab revision changed: expected ${expectedRevision}, current ${asset?.revision ?? 'missing'}`,
    {
      path: asset?.relPath ?? fallbackPath ?? null,
      expectedRevision,
      currentRevision: asset?.revision ?? null,
    },
  );
}

function staleSortingLayerRevision(
  currentRevision: string | null,
  expectedRevision: string | null,
): BridgeError {
  return new BridgeError(
    'STALE_REVISION',
    `Project Settings revision changed: expected ${expectedRevision ?? 'missing'}, current ${currentRevision ?? 'missing'}`,
    {
      path: 'ProjectSettings/sorting-layers.json',
      expectedRevision,
      currentRevision,
    },
  );
}

function isStaleBuildSettingsError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.includes('build settings changed on disk since they were loaded');
}

function staleBuildSettingsRevision(
  currentRevision: string,
  expectedRevision: string,
): BridgeError {
  return new BridgeError(
    'STALE_REVISION',
    `Build Settings revision changed: expected ${expectedRevision}, current ${currentRevision}`,
    {
      path: 'project.json',
      expectedRevision,
      currentRevision,
    },
  );
}

function prefabBridgeError(reason: unknown): BridgeError {
  if (reason instanceof BridgeError) return reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  return new BridgeError('IO_ERROR', message);
}

function requiredNonNegativeInteger(
  args: Record<string, unknown>,
  key: string,
): number {
  const value = args[key];
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be a non-negative safe integer`,
    );
  }
  return value;
}

function requiredNullableRevision(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const value = args[key];
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be a non-empty revision string or null`,
    );
  }
  return value.trim();
}

function requiredGameResolution(
  args: Record<string, unknown>,
): GameResolution | null {
  const value = args.resolution;
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeError(
      'INVALID_ARGS',
      '"resolution" must be { width, height } or null for Free Aspect',
    );
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).filter(
    (key) => key !== 'width' && key !== 'height',
  );
  if (unexpected.length) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"resolution" has unsupported fields: ${unexpected.join(', ')}`,
    );
  }
  if (
    typeof record.width !== 'number'
    || !Number.isSafeInteger(record.width)
    || record.width < 1
    || record.width > 16_384
    || typeof record.height !== 'number'
    || !Number.isSafeInteger(record.height)
    || record.height < 1
    || record.height > 16_384
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      '"resolution.width" and "resolution.height" must be integers from 1 to 16384',
    );
  }
  return {
    width: record.width,
    height: record.height,
  };
}

function requiredSortingLayers(args: Record<string, unknown>): SortingLayer[] {
  const value = args.layers;
  if (!Array.isArray(value)) {
    throw new BridgeError('INVALID_ARGS', '"layers" must be an array');
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BridgeError('INVALID_ARGS', `layers[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const unexpected = Object.keys(record).filter((key) => key !== 'id' && key !== 'name');
    if (unexpected.length) {
      throw new BridgeError(
        'INVALID_ARGS',
        `layers[${index}] has unsupported fields: ${unexpected.join(', ')}`,
      );
    }
    if (typeof record.id !== 'string' || typeof record.name !== 'string') {
      throw new BridgeError(
        'INVALID_ARGS',
        `layers[${index}] must contain string "id" and "name" fields`,
      );
    }
    return { id: record.id, name: record.name };
  });
}

function requiredTags(args: Record<string, unknown>): string[] {
  const value = args.tags;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new BridgeError('INVALID_ARGS', '"tags" must be an array of strings');
  }
  return value.map((entry) => (entry as string).trim());
}

function requiredGameLayers(args: Record<string, unknown>): GameObjectLayer[] {
  const value = args.gameLayers;
  if (!Array.isArray(value)) {
    throw new BridgeError('INVALID_ARGS', '"gameLayers" must be an array');
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BridgeError('INVALID_ARGS', `gameLayers[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const unexpected = Object.keys(record).filter((key) => key !== 'index' && key !== 'name');
    if (unexpected.length) {
      throw new BridgeError(
        'INVALID_ARGS',
        `gameLayers[${index}] has unsupported fields: ${unexpected.join(', ')}`,
      );
    }
    if (
      typeof record.index !== 'number'
      || !Number.isInteger(record.index)
      || typeof record.name !== 'string'
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        `gameLayers[${index}] must contain integer "index" and string "name" fields`,
      );
    }
    return { index: record.index, name: record.name };
  });
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  if (args[key] === undefined) return undefined;
  return requiredString(args, key);
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = args[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a boolean`);
  }
  return value;
}

function requiredEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T {
  const value = args[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be one of: ${values.join(', ')}`,
    );
  }
  return value as T;
}

function optionalEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = args[key] ?? fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be one of: ${values.join(', ')}`,
    );
  }
  return value as T;
}

function normalizeAssetPath(path: string): string {
  try {
    return normalizeProjectAssetPath(path);
  } catch (error) {
    throw new BridgeError(
      'INVALID_ARGS',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function sceneAssetPath(name: string): string {
  return `Assets/Scenes/${sceneFileName(name)}`;
}

async function previewPlanToken(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function findAsset(
  files: readonly ProjectFileAsset[],
  normalizedPath: string,
): ProjectFileAsset | null {
  const key = normalizedPath.toLocaleLowerCase();
  return files.find((asset) => asset.relPath.toLocaleLowerCase() === key) ?? null;
}

async function bridgeIo<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new BridgeError('IO_ERROR', `${label}: ${detail}`);
  }
}

function requireIdOrName(params: Record<string, unknown>): number | string {
  if (params.id !== undefined) {
    if (
      typeof params.id === 'number'
      && Number.isSafeInteger(params.id)
      && params.id >= 0
    ) {
      return params.id;
    }
    throw new BridgeError(
      'INVALID_ARGS',
      'entity.get "id" must be a non-negative safe integer',
    );
  }
  if (typeof params.name === 'string' && params.name.trim()) return params.name.trim();
  throw new BridgeError(
    'INVALID_ARGS',
    'entity.get requires a non-negative integer "id" or non-empty string "name"',
  );
}

/** Build a full hierarchy tree from flat entities, sorted by siblingIndex. */
function buildHierarchy(entities: EntityView[]): HierarchyNode[] {
  const childrenByParent = new Map<number | null, EntityView[]>();
  for (const entity of entities) {
    const parent = entity.parent ?? null;
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(entity);
    else childrenByParent.set(parent, [entity]);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => (a.siblingIndex ?? 0) - (b.siblingIndex ?? 0));
  }
  const toNode = (entity: EntityView): HierarchyNode => ({
    id: entity.entity,
    name: entity.name ?? `Entity ${entity.entity}`,
    active: entity.active ?? true,
    components: Object.keys(entity.components ?? {}),
    children: (childrenByParent.get(entity.entity) ?? []).map(toNode),
  });
  return (childrenByParent.get(null) ?? []).map(toNode);
}

function sameNumberArray(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length
    && left.every((value, index) => value === right[index])
  );
}

/** Resolve on the next animation frame (so the viewport can redraw). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** The process-wide bridge singleton, wired up by App.tsx. */
export const agentBridge = new AgentBridge();
