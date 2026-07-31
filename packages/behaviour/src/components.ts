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
  target_display!: number;
  projection?: 'perspective' | 'orthographic' | string;
  orthographic_size?: number;
  aspect?: number;
  clear_flags?: 'scene' | 'skybox' | 'solid_color' | string;
  background_color?: Color4;
}

export type Camera3DData = Camera3D;

export class Camera2D {
  static readonly typeName = 'Camera2D' as const;
  size!: number;
  primary!: boolean;
  target_display!: number;
  clear_flags?: 'scene' | 'skybox' | 'solid_color' | string;
  background_color?: Color4;
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

export class Light2D {
  static readonly typeName = 'Light2D' as const;
  light_type!: 'global' | 'point' | string;
  color!: Color4;
  intensity!: number;
  radius!: number;
  inner_radius!: number;
  falloff!: number;
  sorting_layers!: string[];
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
  pivot?: [number, number];
  flip_x?: boolean;
  flip_y?: boolean;
  sorting_order?: number;
}

export class Canvas {
  static readonly typeName = 'Canvas' as const;
  enabled!: boolean;
  render_mode!: string;
  render_camera!: string;
  pixel_perfect!: boolean;
  override_pixel_perfect!: boolean;
  override_sorting!: boolean;
  sorting_layer!: string;
  sorting_order!: number;
  target_display!: number;
  plane_distance!: number;
}

export class GraphicRaycaster {
  static readonly typeName = 'GraphicRaycaster' as const;
  enabled!: boolean;
  ignore_reversed_graphics!: boolean;
  blocking_objects!: string;
  blocking_mask!: number;
}

export class CanvasScaler {
  static readonly typeName = 'CanvasScaler' as const;
  ui_scale_mode!: string;
  reference_pixels_per_unit!: number;
  scale_factor!: number;
  reference_resolution!: [number, number];
  screen_match_mode!: string;
  match_width_or_height!: number;
  physical_unit!: string;
  fallback_screen_dpi!: number;
  default_sprite_dpi!: number;
  dynamic_pixels_per_unit!: number;
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
  preserve_aspect!: boolean;
  fill_center!: boolean;
  fill_method!: string;
  fill_amount!: number;
  fill_clockwise!: boolean;
  fill_origin!: number;
  border!: Color4;
  source_size!: [number, number];
  raycast_target!: boolean;
}

export class AnimatedSprite2D {
  static readonly typeName = 'AnimatedSprite2D' as const;
  frames!: string[];
  fps!: number;
  playing!: boolean;
  looped!: boolean;
  frame!: number;
  color!: Color4;
  size!: [number, number];
  pivot!: [number, number];
  flip_x!: boolean;
  flip_y!: boolean;
  sorting_order!: number;
}

export class Line2D {
  static readonly typeName = 'Line2D' as const;
  points!: [number, number][];
  width!: number;
  color!: Color4;
  closed!: boolean;
  sorting_order!: number;
}

export class AnimationPlayer {
  static readonly typeName = 'AnimationPlayer' as const;
  clip!: string;
  play_on_awake!: boolean;
  playing!: boolean;
  speed!: number;
  time!: number;
}

export class Animator {
  static readonly typeName = 'Animator' as const;
  controller!: string;
  play_on_awake!: boolean;
  playing!: boolean;
  speed!: number;
  current_state!: string;
  parameters_json!: string;
  layer_weights_json!: string;
  layers_json!: string;
}

export class AudioListener {
  static readonly typeName = 'AudioListener' as const;
  primary!: boolean;
}

export class AudioSource {
  static readonly typeName = 'AudioSource' as const;
  clip!: string;
  play_on_awake!: boolean;
  playing!: boolean;
  looped!: boolean;
  volume!: number;
  pitch!: number;
  pan!: number;
  spatial_blend!: number;
  min_distance!: number;
  max_distance!: number;
  bus!: string;
  mute!: boolean;
}

export class AudioMixer {
  static readonly typeName = 'AudioMixer' as const;
  master_volume!: number;
  music_volume!: number;
  sfx_volume!: number;
  ui_volume!: number;
  ambience_volume!: number;
  muted!: boolean;
}

export class RawImage {
  static readonly typeName = 'RawImage' as const;
  texture!: string;
  color!: Color4;
  uv_rect!: Color4;
  raycast_target!: boolean;
}

export class Shadow {
  static readonly typeName = 'Shadow' as const;
  effect_color!: Color4;
  effect_distance!: [number, number];
  use_graphic_alpha!: boolean;
}

export class Outline {
  static readonly typeName = 'Outline' as const;
  effect_color!: Color4;
  effect_distance!: [number, number];
  use_graphic_alpha!: boolean;
}

export class AspectRatioFitter {
  static readonly typeName = 'AspectRatioFitter' as const;
  aspect_mode!: string;
  aspect_ratio!: number;
}

export class ContentSizeFitter {
  static readonly typeName = 'ContentSizeFitter' as const;
  horizontal_fit!: string;
  vertical_fit!: string;
}

export class Mask {
  static readonly typeName = 'Mask' as const;
  enabled!: boolean;
  show_mask_graphic!: boolean;
}

export class RectMask2D {
  static readonly typeName = 'RectMask2D' as const;
  enabled!: boolean;
  padding!: Color4;
  softness!: [number, number];
}

/** UI Button component (not the @Button decorator). */
export class UIButton {
  static readonly typeName = 'Button' as const;
  interactable!: boolean;
  transition!: string;
  normal_color!: Color4;
  highlighted_color!: Color4;
  pressed_color!: Color4;
  selected_color!: Color4;
  disabled_color!: Color4;
  color_multiplier!: number;
  fade_duration!: number;
  highlighted_sprite!: string;
  pressed_sprite!: string;
  selected_sprite!: string;
  disabled_sprite!: string;
  label!: string;
  text_color!: Color4;
  font_size!: number;
  /** UnityEvent persistent call, or legacy method name string. */
  on_click!:
    | string
    | { target: number | null; component: string; method: string };
}

export class ToggleGroup {
  static readonly typeName = 'ToggleGroup' as const;
  allow_switch_off!: boolean;
}

export type BuiltinComponents = {
  Transform: Transform;
  Camera3D: Camera3D;
  Camera2D: Camera2D;
  MeshRenderer: MeshRenderer;
  DirectionalLight: DirectionalLight;
  Light2D: Light2D;
  Transform2D: Transform2D;
  SpriteRenderer: SpriteRenderer;
  AnimatedSprite2D: AnimatedSprite2D;
  Line2D: Line2D;
  AnimationPlayer: AnimationPlayer;
  Animator: Animator;
  AudioListener: AudioListener;
  AudioSource: AudioSource;
  AudioMixer: AudioMixer;
  Canvas: Canvas;
  CanvasScaler: CanvasScaler;
  GraphicRaycaster: GraphicRaycaster;
  RectTransform: RectTransform;
  AspectRatioFitter: AspectRatioFitter;
  ContentSizeFitter: ContentSizeFitter;
  RectMask2D: RectMask2D;
  Mask: Mask;
  Image: Image;
  RawImage: RawImage;
  Shadow: Shadow;
  Outline: Outline;
  Button: UIButton;
  ToggleGroup: ToggleGroup;
};

export type BuiltinComponentName = keyof BuiltinComponents;
