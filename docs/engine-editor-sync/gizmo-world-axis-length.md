# Equal world-space transform axes

Author: MiYu

Move and scale gizmos use one world-space length for all three axes. Perspective depth and field of view, or orthographic size, determine a shared handle scale. Axis endpoints and the four plane-handle corners are then projected into the Scene view. Camera rotation therefore produces natural foreshortening while the three world-space lengths remain equal.

Drawing and picking use the same projected geometry. End-on axes shorter than the usable shaft/cap threshold are neither drawn nor picked, and collapsed plane handles are excluded. Rotation rings keep their existing behavior. The corner orientation compass already uses equal 3D radii and has an additional regression check.

Validation: 17 focused gizmo/orientation tests pass, covering inverse-projected world lengths, perspective and orthographic cameras, local rotations, projected plane corners, picking, zoom and end-on rotation rings. The full editor TypeScript/Vite build passes.
