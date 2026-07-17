export type GizmoMode = 'translate' | 'rotate' | 'scale' | 'rect';
export type TransformGizmoMode = Exclude<GizmoMode, 'rect'>;

/** Rect Tool has no 3D representation yet; on Transform objects it behaves as Move. */
export function transformGizmoMode(mode: GizmoMode): TransformGizmoMode {
  return mode === 'rect' ? 'translate' : mode;
}

export function isRectMoveMode(mode: GizmoMode): boolean {
  return mode === 'translate' || mode === 'rect';
}
