/**
 * AgentBridge protocol types.
 *
 * These types define the transport-agnostic contract between the MEngine
 * editor and any AI agent / external client (MCP, WebSocket, HTTP, CLI).
 * The bridge always speaks camelCase outward; any snake_case used by the
 * scene JSON or the Rust host is translated at the boundary.
 */

/** A captured image, returned as a data URL so any client can consume it. */
export interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
  mime: string;
  /** Present for whole-window captures. */
  windowLabel?: string;
  /** Native implementation used for the capture. */
  captureMethod?: string;
  /** True when capture neither activates the editor nor reads foreground pixels. */
  backgroundSafe?: boolean;
}

export type ViewportTab = 'scene' | 'game';

export interface EditorUiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One visible, semantically meaningful DOM element in an editor webview. */
export interface EditorUiElement {
  id: string;
  /** May refer to an element on another semantic snapshot page. */
  parentId: string | null;
  selector: string;
  tag: string;
  role: string | null;
  name: string | null;
  text: string | null;
  value: string | null;
  description: string | null;
  state: Record<string, boolean | string>;
  /** Present when this UI action requires foreground-only user input. */
  agentInteraction: {
    blocked: true;
    alternative: string | null;
  } | null;
  actions: Array<'click' | 'doubleClick' | 'contextClick' | 'setValue' | 'scroll'>;
  scroll: {
    left: number;
    top: number;
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
  } | null;
  rect: EditorUiRect;
}

/** Background-safe semantic snapshot used instead of OCR for UI inspection. */
export interface EditorUiSnapshot {
  version: number;
  windowLabel: string;
  title: string;
  url: string;
  capturedAt: number;
  captureMethod: string;
  backgroundSafe: boolean;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    scrollX: number;
    scrollY: number;
  };
  activeElementSelector: string | null;
  totalDomElements: number;
  totalSemanticElements: number;
  /** Zero-based semantic element offset requested for this page. */
  offset: number;
  /** Number of semantic elements returned on this page. */
  count: number;
  /** Cursor for the next page, or null once all semantic content is reachable. */
  nextOffset: number | null;
  hasMore: boolean;
  truncated: boolean;
  elements: EditorUiElement[];
}

/** One exact, paged text/value read from an editor UI element. */
export interface EditorUiContentPage {
  version: number;
  windowLabel: string;
  captureMethod: string;
  backgroundSafe: boolean;
  selector: string;
  field: 'text' | 'value';
  offset: number;
  count: number;
  totalLength: number;
  nextOffset: number | null;
  content: string;
}

export interface EditorUiActionResult {
  ok: boolean;
  error?: string;
  agentBlocked?: boolean;
  agentAlternative?: string | null;
  action?: 'click' | 'doubleClick' | 'contextClick' | 'setValue' | 'scroll';
  selector?: string;
  tag?: string;
  role?: string | null;
  name?: string | null;
  value?: string | null;
  scrollLeft?: number;
  scrollTop?: number;
  scrollWidth?: number;
  scrollHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
}

/** One open editor window (main, detached panel, or floating editor window). */
export interface EditorWindowInfo {
  label: string;
  title: string;
  kind: 'main' | 'panel' | 'editor' | 'other';
  /** For `panel-*` windows, the panel id (e.g. "hierarchy"). */
  panelKind: string | null;
  /** For `editor-*` windows, the registered editor window typeId. */
  editorType: string | null;
  url: string;
  visible: boolean;
  focused: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export type DockLayoutNode =
  | {
      kind: 'tabs';
      id: string;
      panels: string[];
      active: string | null;
    }
  | {
      kind: 'split';
      id: string;
      direction: 'horizontal' | 'vertical';
      ratio: number;
      first: DockLayoutNode;
      second: DockLayoutNode;
    };

/** Exact in-memory dock state; detached panels expose their native window label. */
export interface PanelLayoutSnapshot {
  tree: DockLayoutNode;
  dockedPanels: string[];
  detachedPanels: Array<{ kind: string; windowLabel: string }>;
  activePanels: string[];
}

/** Serializable menu metadata with the live validation result. */
export interface EditorMenuItemInfo {
  path: string;
  root: string;
  label: string;
  segments: string[];
  priority: number;
  shortcut: string | null;
  separatorBefore: boolean;
  enabled: boolean;
  agentInvokable: boolean;
  agentAlternative: string | null;
}

/** Compact hierarchy node — full tree, independent of UI expansion state. */
export interface HierarchyNode {
  id: number;
  name: string;
  active: boolean;
  /** Component type names present on the entity (compact for token efficiency). */
  components: string[];
  children: HierarchyNode[];
}

/** Global editor state an agent needs to orient itself. */
export interface EditorState {
  mode: 'edit' | 'play' | 'pause';
  frame: number;
  /** Seconds elapsed on the deterministic Play Mode simulation clock. */
  simulationTime: number;
  gizmo: string;
  sceneCamera: {
    yaw: number;
    pitch: number;
    distance: number;
    pivot: [number, number, number];
  };
  /** Current project Game-view resolution, or free aspect when null. */
  gameResolution: {
    width: number;
    height: number;
  } | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  sceneName: string | null;
  dirty: boolean;
  /** Monotonic in-memory scene revision used by scene.diff. */
  sceneRevision: number;
  /** Latest event cursor used by events.get. */
  eventSequence: number;
}

export interface SelectionInfo {
  selected: number | null;
  selectedIds: number[];
}

/** Structured error codes shared across all transports. */
export type BridgeErrorCode =
  | 'STALE_REVISION'
  | 'CONFLICT'
  | 'ENTITY_NOT_FOUND'
  | 'COMPONENT_NOT_FOUND'
  | 'INVALID_ARGS'
  | 'READONLY'
  | 'PERMISSION_DENIED'
  | 'NOT_READY'
  | 'PROJECT_NOT_OPEN'
  | 'IO_ERROR'
  | 'INTERNAL';

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly data?: unknown;

  constructor(code: BridgeErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.data = data;
  }
}
