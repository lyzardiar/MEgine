export type GizmoMode = 'translate' | 'rotate' | 'scale' | 'rect';
export type TransformGizmoMode = Exclude<GizmoMode, 'rect'>;
export type ToolPivotMode = 'pivot' | 'center';
export type ToolHandleOrientation = 'local' | 'global';

/** Rect Tool has no 3D representation yet; on Transform objects it behaves as Move. */
export function transformGizmoMode(mode: GizmoMode): TransformGizmoMode {
  return mode === 'rect' ? 'translate' : mode;
}

export function isRectMoveMode(mode: GizmoMode): boolean {
  return mode === 'translate' || mode === 'rect';
}

/** Unity keeps Scale handles aligned to the selected Transform's local axes. */
export function usesLocalHandleAxes(
  mode: GizmoMode,
  orientation: ToolHandleOrientation,
): boolean {
  return mode === 'scale' || orientation === 'local';
}
