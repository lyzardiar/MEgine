/** Built-in component classes — use as keys: ctx.get(Transform). */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Color4 = [number, number, number, number];

/** Constructor token with scene JSON type name (for autocomplete on ctx.get/set). */
export type ComponentType<T = unknown> = {
  readonly typeName: string;
  new (...args: never[]): T;
};

export function componentTypeName(key: string | ComponentType): string {
  if (typeof key === 'string') return key;
  return key.typeName || key.name;
}

export class Transform {
  static readonly typeName = 'Transform' as const;
  position!: Vec3;
  rotation!: Quat;
  scale!: Vec3;
}

/** Alias for editor call sites. */
export type TransformData = Transform;

export class Camera3D {
  static readonly typeName = 'Camera3D' as const;
  fov_y_degrees!: number;
  near!: number;
  far!: number;
  primary!: boolean;
  projection?: 'perspective' | 'orthographic' | string;
  orthographic_size?: number;
  aspect?: number;
}

export type Camera3DData = Camera3D;

export class Camera2D {
  static readonly typeName = 'Camera2D' as const;
  size!: number;
  primary!: boolean;
}

export type Camera2DData = Camera2D;

export class MeshRenderer {
  static readonly typeName = 'MeshRenderer' as const;
  mesh!: string;
  material!: string;
}

export class DirectionalLight {
  static readonly typeName = 'DirectionalLight' as const;
  color!: Color4;
  intensity!: number;
}

export class Transform2D {
  static readonly typeName = 'Transform2D' as const;
  position!: [number, number];
  rotation!: number;
  scale!: [number, number];
}

export class SpriteRenderer {
  static readonly typeName = 'SpriteRenderer' as const;
  sprite!: string;
  color!: Color4;
  size?: [number, number];
  sorting_order?: number;
}

export class Canvas {
  static readonly typeName = 'Canvas' as const;
  render_mode!: string;
  sorting_order!: number;
  plane_distance!: number;
}

export class CanvasScaler {
  static readonly typeName = 'CanvasScaler' as const;
  ui_scale_mode!: string;
  reference_resolution!: [number, number];
  match_width_or_height!: number;
  scale_factor!: number;
}

export class RectTransform {
  static readonly typeName = 'RectTransform' as const;
  anchor_min!: [number, number];
  anchor_max!: [number, number];
  pivot!: [number, number];
  anchored_position!: [number, number];
  size_delta!: [number, number];
  local_rotation!: number;
  local_scale!: [number, number];
}

export class Image {
  static readonly typeName = 'Image' as const;
  sprite!: string;
  color!: Color4;
  image_type!: string;
  border!: Color4;
  source_size!: [number, number];
  raycast_target!: boolean;
}

export class RawImage {
  static readonly typeName = 'RawImage' as const;
  texture!: string;
  color!: Color4;
  uv_rect!: Color4;
  raycast_target!: boolean;
}

export class AspectRatioFitter {
  static readonly typeName = 'AspectRatioFitter' as const;
  aspect_mode!: string;
  aspect_ratio!: number;
}

/** UI Button component (not the @Button decorator). */
export class UIButton {
  static readonly typeName = 'Button' as const;
  interactable!: boolean;
  transition!: string;
  /** UnityEvent persistent call, or legacy method name string. */
  on_click!:
    | string
    | { target: number | null; component: string; method: string };
}

export type BuiltinComponents = {
  Transform: Transform;
  Camera3D: Camera3D;
  Camera2D: Camera2D;
  MeshRenderer: MeshRenderer;
  DirectionalLight: DirectionalLight;
  Transform2D: Transform2D;
  SpriteRenderer: SpriteRenderer;
  Canvas: Canvas;
  CanvasScaler: CanvasScaler;
  RectTransform: RectTransform;
  AspectRatioFitter: AspectRatioFitter;
  Image: Image;
  RawImage: RawImage;
  Button: UIButton;
};

export type BuiltinComponentName = keyof BuiltinComponents;
