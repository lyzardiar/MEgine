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
import type { EditorStore } from '../store';
import { isDesktopEditor } from '../transport/editorTransport';
import {
  BridgeError,
  type EditorState,
  type EditorWindowInfo,
  type HierarchyNode,
  type ScreenshotResult,
  type SelectionInfo,
  type ViewportTab,
} from './protocol';
import { logService, type LogEntry, type LogQuery } from './LogService';
import { WRITE_COMMANDS, COMMAND_META, type CommandContext, type CommandResult, type CommandMeta } from './commands';
import { getComponentCatalog } from '../componentCatalog';

type CaptureFn = (
  format: 'image/png' | 'image/jpeg',
  quality?: number,
) => ScreenshotResult | null;

interface SceneMetaProviders {
  sceneName: () => string | null;
  dirty: () => boolean;
}

interface EntityView {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex?: number;
  active?: boolean;
  components: Record<string, unknown>;
}

class AgentBridge {
  private store: EditorStore | null = null;
  private sceneMeta: SceneMetaProviders | null = null;
  private captures = new Map<ViewportTab, CaptureFn>();
  private refreshProvider: (() => void) | null = null;

  /** Wire the bridge to the live editor store. Called once from App. */
  connect(store: EditorStore): void {
    this.store = store;
  }

  /** Provide scene name / dirty state, which live in React (App) not the store. */
  connectSceneMeta(providers: SceneMetaProviders): void {
    this.sceneMeta = providers;
  }

  /** Wire the UI refresh callback, invoked after every write command. */
  connectRefresh(refresh: () => void): void {
    this.refreshProvider = refresh;
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
   * Capture the ENTIRE editor window (menus, panels, chrome) via the OS — not
   * just the WebGL viewport. Backed by the Rust `capture_editor_window`
   * command (Windows GDI). Use this to inspect the editor UI itself.
   */
  async captureWindow(): Promise<ScreenshotResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Full-window capture requires the desktop editor');
    }
    return invoke<ScreenshotResult>('capture_editor_window');
  }

  getEditorState(): EditorState {
    const store = this.requireStore();
    return {
      mode: store.mode,
      gizmo: store.gizmo,
      canUndo: store.canUndo,
      canRedo: store.canRedo,
      undoLabel: store.undoLabel,
      redoLabel: store.redoLabel,
      sceneName: this.sceneMeta?.sceneName() ?? null,
      dirty: this.sceneMeta?.dirty() ?? false,
    };
  }

  getSelection(): SelectionInfo {
    const store = this.requireStore();
    return { selected: store.selected, selectedIds: store.selectedIds };
  }

  getSceneSnapshot(): unknown {
    return this.requireStore().snapshot();
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

  async listWindows(): Promise<EditorWindowInfo[]> {
    if (!isDesktopEditor()) return [];
    return invoke<EditorWindowInfo[]>('list_editor_windows');
  }

  getLogs(query: LogQuery = {}): LogEntry[] {
    return logService.getEntries(query);
  }

  clearLogs(): { ok: true } {
    logService.clear();
    return { ok: true };
  }

  // ── Discoverability ───────────────────────────────────────────────────

  listCommands(): CommandMeta[] {
    return COMMAND_META.map((meta) => ({ ...meta }));
  }

  getComponentSchema(type?: string): unknown {
    const catalog = getComponentCatalog();
    const build = (entry: { type: string; label: string; description: string; create: () => Record<string, unknown>; requires?: string[] }) => {
      let defaults: Record<string, unknown> = {};
      try {
        defaults = entry.create() ?? {};
      } catch {
        defaults = {};
      }
      return {
        type: entry.type,
        label: entry.label,
        description: entry.description,
        requires: entry.requires ?? [],
        fields: Object.entries(defaults).map(([name, value]) => ({
          name,
          type: inferFieldType(value),
          default: value,
        })),
      };
    };
    if (type) {
      const entry = catalog.find((e) => e.type === type);
      if (!entry) throw new BridgeError('COMPONENT_NOT_FOUND', `Unknown component type "${type}"`);
      return build(entry);
    }
    return catalog.map(build);
  }

  /** Open/focus a panel by kind via the editor's existing focus event. */
  focusPanel(kind: string): void {
    window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: kind }));
  }

  // ── Dispatcher (write commands) ───────────────────────────────────────

  async execute(
    commandId: string,
    args: Record<string, unknown> = {},
    options: { screenshot?: boolean } = {},
  ): Promise<CommandResult> {
    const handler = WRITE_COMMANDS[commandId];
    if (!handler) {
      throw new BridgeError('INVALID_ARGS', `Unknown command "${commandId}"`);
    }
    const ctx: CommandContext = { store: this.requireStore(), focusPanel: (kind) => this.focusPanel(kind) };
    const result = handler(ctx, args);
    this.refreshProvider?.();
    if (options.screenshot) {
      // Let the viewport redraw before capturing the visual result.
      await nextFrame();
      try {
        result.screenshot = this.captureViewport('scene');
      } catch {
        // Screenshot is best-effort; never fail the command over it.
      }
    }
    return result;
  }

  // ── Unified query entry (called by transports) ────────────────────────

  async query(queryId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (queryId) {
      case 'editor.state':
        return this.getEditorState();
      case 'selection.get':
        return this.getSelection();
      case 'scene.snapshot':
        return this.getSceneSnapshot();
      case 'scene.hierarchy':
        return this.getHierarchy();
      case 'entity.get':
        return this.getEntity(requireIdOrName(params));
      case 'view.screenshot':
        return this.captureViewport(
          (params.target as ViewportTab) ?? 'scene',
          (params.format as 'image/png' | 'image/jpeg') ?? 'image/png',
          params.quality as number | undefined,
        );
      case 'view.window_screenshot':
        return this.captureWindow();
      case 'window.list':
        return this.listWindows();
      case 'console.get_logs':
        return this.getLogs({
          level: params.level as LogQuery['level'],
          since: params.since as number | undefined,
          limit: params.limit as number | undefined,
        });
      case 'console.clear':
        return this.clearLogs();
      case 'commands.list':
        return this.listCommands();
      case 'schema.components':
        return this.getComponentSchema();
      case 'schema.component':
        return this.getComponentSchema(
          typeof params.type === 'string' ? params.type : undefined,
        );
      default:
        throw new BridgeError('INVALID_ARGS', `Unknown query "${queryId}"`);
    }
  }

  private requireStore(): EditorStore {
    if (!this.store) {
      throw new BridgeError('NOT_READY', 'AgentBridge is not connected to an editor store');
    }
    return this.store;
  }
}

function requireIdOrName(params: Record<string, unknown>): number | string {
  if (typeof params.id === 'number') return params.id;
  if (typeof params.name === 'string' && params.name) return params.name;
  throw new BridgeError('INVALID_ARGS', 'entity.get requires a numeric "id" or string "name"');
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

/** Infer a coarse field type from a component default value. */
function inferFieldType(value: unknown): string {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) {
    if (value.length >= 2 && value.length <= 4 && value.every((v) => typeof v === 'number')) {
      return `vec${value.length}`;
    }
    return 'array';
  }
  if (value === null || value === undefined) return 'null';
  return 'object';
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
