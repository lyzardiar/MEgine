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
}

export type ViewportTab = 'scene' | 'game';

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
  focused: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
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
  gizmo: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  sceneName: string | null;
  dirty: boolean;
}

export interface SelectionInfo {
  selected: number | null;
  selectedIds: number[];
}

/** Structured error codes shared across all transports. */
export type BridgeErrorCode =
  | 'STALE_REVISION'
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
