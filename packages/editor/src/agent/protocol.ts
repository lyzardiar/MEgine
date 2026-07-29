/**
 * AgentBridge protocol types.
 *
 * These types define the transport-agnostic contract between the MEngine
 * editor and any AI agent / external client (MCP, WebSocket, HTTP, CLI).
 * The bridge always speaks camelCase outward; any snake_case used by the
 * scene JSON or the Rust host is translated at the boundary.
 */

import type { SceneViewPreferences } from '../sceneViewPreferences';
import type { TimelineEditorPreferences } from '../timelineEditorPreferences';

/** A captured image, returned as a data URL so any client can consume it. */
export interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
  mime: string;
  /** Unscaled capture width before maxSize was applied. */
  sourceWidth: number;
  /** Unscaled capture height before maxSize was applied. */
  sourceHeight: number;
  /** Output-to-source scale, never greater than 1. */
  scale: number;
  /** Unix epoch milliseconds recorded when encoding completed. */
  capturedAt: number;
  /** Present for whole-window captures. */
  windowLabel?: string;
  /** Native implementation used for the capture. */
  captureMethod?: string;
  /** True when capture neither activates the editor nor reads foreground pixels. */
  backgroundSafe?: boolean;
  /** CSS-pixel clip relative to the captured WebView viewport. */
  region?: EditorUiRect;
  /** Semantic selector used for a revision-guarded element capture. */
  selector?: string;
  /** UI snapshot revision that authorized an element capture. */
  snapshotRevision?: string;
  /** Complete element bounds before clipping to the visible viewport. */
  elementRect?: EditorUiRect;
  /** True when only the visible intersection of the element was captured. */
  clipped?: boolean;
}

export type ViewportTab = 'scene' | 'game';

export interface EditorUiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorUiControlMetadata {
  kind:
    | 'input'
    | 'textarea'
    | 'select'
    | 'contenteditable'
    | 'progress'
    | 'meter'
    | 'output';
  inputType?: string;
  required?: boolean;
  multiple?: boolean;
  size?: number;
  min?: string;
  max?: string;
  step?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  accept?: string;
  low?: string;
  high?: string;
  optimum?: string;
  indeterminate?: boolean;
  optionCount?: number;
  /** Changes whenever option values, labels, groups, disabled state, or selection changes. */
  optionsRevision?: string;
}

export type EditorUiAction =
  | 'click'
  | 'doubleClick'
  | 'contextClick'
  | 'setValue'
  | 'scroll'
  | 'keyPress'
  | 'dragTo'
  | 'dragBy'
  | 'hover';

/** One visible, semantically meaningful DOM element in an editor webview. */
export interface EditorUiElement {
  id: string;
  /** May refer to an element on another semantic snapshot page. */
  parentId: string | null;
  selector: string;
  tag: string;
  role: string | null;
  /** Original accessible name exposed by the control. */
  name: string | null;
  /** Nearest stable panel, dialog, menu, or editor-window scope. */
  scope: string | null;
  /** Scope-qualified name for unambiguous whole-window search. */
  qualifiedName: string | null;
  text: string | null;
  value: string | null;
  /** Native form-control constraints and a bounded fingerprint for exact option discovery. */
  control: EditorUiControlMetadata | null;
  description: string | null;
  /** ARIA/native state; numeric entries include observable text selection offsets. */
  state: Record<string, boolean | string | number>;
  /** Present when one or more UI actions require foreground-only user input. */
  agentInteraction: {
    blocked: true;
    /** Null means every action is blocked. */
    blockedActions: EditorUiAction[] | null;
    alternative: string | null;
  } | null;
  actions: EditorUiAction[];
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
  /**
   * Fingerprint of the full semantic element identity and order. Pass this
   * back as expectedSnapshotRevision when reading a continuation page.
   */
  snapshotRevision: string;
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

/** One exact, paged semantic or authored content read from an editor UI element. */
export interface EditorUiContentPage {
  version: number;
  /** Fingerprint of the complete exact content used for this page. */
  contentRevision: string;
  windowLabel: string;
  captureMethod: string;
  backgroundSafe: boolean;
  selector: string;
  field: 'text' | 'name' | 'description' | 'value' | 'options';
  offset: number;
  count: number;
  totalLength: number;
  nextOffset: number | null;
  content: string;
}

export interface EditorUiModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface EditorUiActionResult {
  ok: boolean;
  error?: string;
  staleSnapshot?: boolean;
  expectedSnapshotRevision?: string;
  actualSnapshotRevision?: string;
  restartOffset?: number;
  settledFrames?: number;
  elementConnected?: boolean;
  postObservationConfirmed?: boolean;
  postObservationError?: string;
  postSnapshotRevision?: string;
  postSemanticElementCount?: number;
  snapshotChanged?: boolean;
  modifiers?: EditorUiModifiers;
  agentBlocked?: boolean;
  agentAlternative?: string | null;
  modalBlocked?: boolean;
  activeModalName?: string | null;
  constraintViolation?: boolean;
  validityIssues?: string[];
  selectorNotExposed?: boolean;
  targetSelectorNotExposed?: boolean;
  actionNotExposed?: boolean;
  requiredAction?: EditorUiAction;
  allowedActions?: EditorUiAction[];
  action?: EditorUiAction;
  selector?: string;
  targetSelector?: string | null;
  targetName?: string | null;
  deltaX?: number | null;
  deltaY?: number | null;
  tag?: string;
  role?: string | null;
  name?: string | null;
  value?: string | null;
  checked?: boolean | null;
  key?: string | null;
  scrollLeft?: number | null;
  scrollTop?: number | null;
  scrollWidth?: number | null;
  scrollHeight?: number | null;
  clientWidth?: number | null;
  clientHeight?: number | null;
}

/** One open editor window (main, detached panel, or floating editor window). */
export interface EditorWindowInfo {
  label: string;
  title: string;
  kind: 'main' | 'panel' | 'editor' | 'other';
  /** For `panel-*` windows, the panel id (e.g. "hierarchy"). */
  panelKind: string | null;
  /** Canonical registered window typeId for `editor-*` windows. */
  typeId: string | null;
  /** Backward-compatible alias for existing Agent clients. */
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

/** Flat panel inventory derived from one live dock and native-window snapshot. */
export interface EditorPanelInfo {
  kind: string;
  title: string;
  /** Selected dock tab, or the sole content of a detached panel window. */
  active: boolean;
  /** Panel content is currently shown in its host; independent of OS window visibility. */
  visible: boolean;
  docked: boolean;
  detached: boolean;
  dockPath: string | null;
  tabIndex: number | null;
  windowLabel: string;
  nativeWindowAvailable: boolean;
  /** Actual native host-window state; null in the browser-only editor. */
  windowVisible: boolean | null;
  windowFocused: boolean | null;
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
  /** Persistent Scene-view editing switches shared by all project windows. */
  sceneView: SceneViewPreferences;
  /** Persistent Animation Timeline and Sequencer editing switches. */
  timelinePreferences: TimelineEditorPreferences;
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

export interface SpriteImportSettingsInfo {
  texturePath: string;
  importPath: string;
  textureSize: [number, number];
  /** Exact sidecar revision, or null while compatible Single defaults are implicit. */
  revision: string | null;
  settings: {
    mode: 'single' | 'multiple';
    pixelsPerUnit: number;
    slices: Array<{
      name: string;
      rect: [number, number, number, number];
      pivot: [number, number];
    }>;
  };
}

/** Structured error codes shared across all transports. */
export type BridgeErrorCode =
  | 'STALE_REVISION'
  | 'RATE_LIMITED'
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
