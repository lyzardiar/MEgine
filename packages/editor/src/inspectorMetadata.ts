/**
 * Inspector metadata for engine-owned components.
 *
 * Component defaults describe serialization; this table describes authoring UI.
 * Keeping the two concerns separate prevents string fields from silently falling
 * back to free-form inputs when they are really enums or object references.
 */

export type InspectorOption = { value: string; label: string };

export type InspectorFieldMeta = {
  label?: string;
  kind?:
    | 'enum'
    | 'sprite'
    | 'project-asset'
    | 'named-reference'
    | 'event'
    | 'string-list'
    | 'vector2-list'
    | 'multiline';
  options?: InspectorOption[];
  assetKinds?: Array<'spine-json' | 'spine-binary' | 'spine-atlas'>;
  referenceType?: string;
  allowNone?: boolean;
  noneValue?: string;
  min?: number;
  max?: number;
  step?: number;
  visibleWhen?: { field: string; equals: unknown };
};

const options = (...values: string[]): InspectorOption[] =>
  values.map((value) => ({
    value,
    label: value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
  }));

const direction = options('LeftToRight', 'RightToLeft', 'BottomToTop', 'TopToBottom');
const event: InspectorFieldMeta = { kind: 'event' };
const sprite: InspectorFieldMeta = {
  kind: 'sprite',
  allowNone: true,
  noneValue: 'white',
};

export const BUILTIN_INSPECTOR_FIELDS: Readonly<
  Record<string, Readonly<Record<string, InspectorFieldMeta>>>
> = {
  MeshRenderer: {
    mesh: {
      kind: 'named-reference',
      referenceType: 'Mesh',
      options: [{ value: 'cube', label: 'Cube' }],
    },
    material: {
      kind: 'named-reference',
      referenceType: 'Material',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'gold', label: 'Gold' },
        { value: 'chrome', label: 'Chrome' },
        { value: 'unlit', label: 'Unlit' },
      ],
    },
  },
  Camera3D: {
    projection: { kind: 'enum', options: options('perspective', 'orthographic') },
    fov_y_degrees: {
      label: 'Field of View',
      min: 1,
      max: 179,
      step: 1,
      visibleWhen: { field: 'projection', equals: 'perspective' },
    },
    orthographic_size: {
      label: 'Orthographic Size',
      min: 0.001,
      step: 0.1,
      visibleWhen: { field: 'projection', equals: 'orthographic' },
    },
    near: { min: 0.001, step: 0.01 },
    far: { min: 0.002, step: 1 },
    aspect: { min: 0.01, step: 0.01 },
  },
  Camera2D: {
    size: { label: 'Orthographic Size', min: 0.001, step: 0.1 },
  },
  DirectionalLight: { intensity: { min: 0, step: 0.1 } },
  PointLight: {
    intensity: { min: 0, step: 0.1 },
    range: { min: 0, step: 0.1 },
  },
  SpotLight: {
    intensity: { min: 0, step: 0.1 },
    range: { min: 0, step: 0.1 },
    inner_angle_degrees: { label: 'Inner Angle', min: 0, max: 179, step: 1 },
    outer_angle_degrees: { label: 'Outer Angle', min: 0, max: 179, step: 1 },
  },
  PbrMaterial: {
    metallic: { min: 0, max: 1, step: 0.01 },
    roughness: { min: 0, max: 1, step: 0.01 },
    emissive_strength: { min: 0, step: 0.1 },
  },
  SpriteRenderer: {
    sprite,
    flip_x: { label: 'Flip X' },
    flip_y: { label: 'Flip Y' },
  },
  AnimatedSprite2D: {
    frames: { kind: 'string-list' },
    fps: { min: 0, step: 0.1 },
    frame: { min: 0, step: 1 },
    flip_x: { label: 'Flip X' },
    flip_y: { label: 'Flip Y' },
  },
  Line2D: {
    points: { kind: 'vector2-list' },
    width: { min: 0, step: 0.01 },
  },
  Canvas: {
    render_mode: {
      kind: 'enum',
      options: [
        { value: 'ScreenSpaceOverlay', label: 'Screen Space - Overlay' },
        { value: 'ScreenSpaceCamera', label: 'Screen Space - Camera' },
      ],
    },
    plane_distance: { min: 0, step: 1 },
  },
  CanvasScaler: {
    ui_scale_mode: {
      kind: 'enum',
      options: [
        { value: 'ConstantPixelSize', label: 'Constant Pixel Size' },
        { value: 'ScaleWithScreenSize', label: 'Scale With Screen Size' },
      ],
    },
    match_width_or_height: { label: 'Match', min: 0, max: 1, step: 0.01 },
    scale_factor: { min: 0.0001, step: 0.1 },
  },
  AspectRatioFitter: {
    aspect_mode: {
      kind: 'enum',
      options: options(
        'None',
        'WidthControlsHeight',
        'HeightControlsWidth',
        'FitInParent',
        'EnvelopeParent',
      ),
    },
    aspect_ratio: { min: 0.0001, step: 0.01 },
  },
  ContentSizeFitter: {
    horizontal_fit: {
      kind: 'enum',
      options: options('Unconstrained', 'MinSize', 'PreferredSize'),
    },
    vertical_fit: {
      kind: 'enum',
      options: options('Unconstrained', 'MinSize', 'PreferredSize'),
    },
  },
  Image: {
    sprite,
    image_type: { kind: 'enum', options: options('Simple', 'Sliced') },
    border: { visibleWhen: { field: 'image_type', equals: 'Sliced' } },
    source_size: {
      label: 'Source Size',
      visibleWhen: { field: 'image_type', equals: 'Sliced' },
    },
  },
  RawImage: {
    texture: sprite,
    uv_rect: { label: 'UV Rect' },
  },
  Shadow: {
    effect_color: { label: 'Effect Color' },
    effect_distance: { label: 'Effect Distance' },
    use_graphic_alpha: { label: 'Use Graphic Alpha' },
  },
  Outline: {
    effect_color: { label: 'Effect Color' },
    effect_distance: { label: 'Effect Distance' },
    use_graphic_alpha: { label: 'Use Graphic Alpha' },
  },
  Button: {
    transition: {
      kind: 'enum',
      options: [
        { value: 'None', label: 'None' },
        { value: 'ColorTint', label: 'Color Tint' },
      ],
    },
    font_size: { min: 1, step: 1 },
    on_click: event,
  },
  ParticleEmitter2D: {
    duration: { min: 0, step: 0.1 },
    start_delay: { min: 0, step: 0.1 },
    rate_over_time: { min: 0, step: 1 },
    max_particles: { min: 0, step: 1 },
    lifetime_min: { min: 0, step: 0.1 },
    lifetime_max: { min: 0, step: 0.1 },
    shape: { kind: 'enum', options: options('point', 'circle', 'box') },
    simulation_space: { kind: 'enum', options: options('world', 'local') },
    blend_mode: { kind: 'enum', options: options('alpha', 'additive') },
    texture: { ...sprite, noneValue: '' },
  },
  ParticleEmitter3D: {
    duration: { min: 0, step: 0.1 },
    start_delay: { min: 0, step: 0.1 },
    rate_over_time: { min: 0, step: 1 },
    max_particles: { min: 0, step: 1 },
    lifetime_min: { min: 0, step: 0.1 },
    lifetime_max: { min: 0, step: 0.1 },
    shape: { kind: 'enum', options: options('point', 'sphere', 'box', 'cone') },
    simulation_space: { kind: 'enum', options: options('world', 'local') },
    blend_mode: { kind: 'enum', options: options('alpha', 'additive') },
    texture: { ...sprite, noneValue: '' },
  },
  SpineSkeleton: {
    skeleton: {
      kind: 'project-asset',
      assetKinds: ['spine-json', 'spine-binary'],
      referenceType: 'Spine SkeletonData',
      allowNone: true,
    },
    atlas: {
      kind: 'project-asset',
      assetKinds: ['spine-atlas'],
      referenceType: 'Spine TextureAtlas',
      allowNone: true,
    },
    time_scale: { min: 0, step: 0.1 },
    scale: { min: 0.0001, step: 0.1 },
  },
  Text: {
    text: { kind: 'multiline' },
    font_size: { min: 1, step: 1 },
    alignment: { kind: 'enum', options: options('Left', 'Center', 'Right') },
    vertical_align: { kind: 'enum', options: options('Top', 'Middle', 'Bottom') },
    outline_width: { label: 'Outline Width', min: 0, max: 16, step: 0.25 },
  },
  Toggle: {
    font_size: { min: 1, step: 1 },
    on_value_changed: event,
  },
  ToggleGroup: {
    allow_switch_off: { label: 'Allow Switch Off' },
  },
  Slider: {
    direction: { kind: 'enum', options: direction },
    on_value_changed: event,
  },
  Scrollbar: {
    value: { min: 0, max: 1, step: 0.01 },
    size: { min: 0, max: 1, step: 0.01 },
    number_of_steps: { min: 0, step: 1 },
    direction: { kind: 'enum', options: direction },
    on_value_changed: event,
  },
  Panel: { border_width: { min: 0, step: 0.25 } },
  CanvasGroup: { alpha: { min: 0, max: 1, step: 0.01 } },
  LayoutGroup: {
    direction: { kind: 'enum', options: options('Horizontal', 'Vertical', 'Grid') },
    constraint_count: { min: 1, step: 1 },
  },
  ProgressBar: {
    direction: { kind: 'enum', options: direction },
    font_size: { min: 1, step: 1 },
  },
  InputField: {
    text: { kind: 'multiline' },
    font_size: { min: 1, step: 1 },
    character_limit: { min: 0, step: 1 },
    on_value_changed: event,
    on_submit: event,
  },
  Dropdown: {
    options: { kind: 'string-list' },
    selected_index: { min: 0, step: 1 },
    font_size: { min: 1, step: 1 },
    on_value_changed: event,
  },
  ListView: {
    items: { kind: 'string-list' },
    selected_index: { min: -1, step: 1 },
    item_height: { min: 1, step: 1 },
    font_size: { min: 1, step: 1 },
    on_value_changed: event,
  },
  ScrollView: {
    scroll_sensitivity: { min: 0, step: 0.01 },
    on_value_changed: event,
  },
  TabView: {
    tabs: { kind: 'string-list' },
    selected_index: { min: 0, step: 1 },
    tab_height: { min: 1, step: 1 },
    font_size: { min: 1, step: 1 },
    on_value_changed: event,
  },
};

export function getBuiltinInspectorField(
  componentType: string | undefined,
  field: string,
): InspectorFieldMeta | undefined {
  return componentType ? BUILTIN_INSPECTOR_FIELDS[componentType]?.[field] : undefined;
}
