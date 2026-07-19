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
  hidden?: boolean;
  kind?:
    | 'enum'
    | 'sprite'
    | 'texture'
    | 'project-asset'
    | 'named-reference'
    | 'event'
    | 'string-list'
    | 'sprite-list'
    | 'vector2-list'
    | 'multiline';
  options?: InspectorOption[];
  assetKinds?: Array<
    | 'animation'
    | 'animator-controller'
    | 'avatar-mask'
    | 'timeline'
    | 'audio'
    | 'material'
    | 'model'
    | 'prefab'
    | 'texture'
    | 'spine-json'
    | 'spine-binary'
    | 'spine-atlas'
  >;
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
      kind: 'project-asset',
      referenceType: 'Mesh',
      assetKinds: ['model'],
      allowNone: true,
      noneValue: 'cube',
    },
    material: {
      kind: 'project-asset',
      referenceType: 'Material',
      assetKinds: ['material'],
      allowNone: true,
      noneValue: 'default',
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
    clear_flags: {
      label: 'Clear Flags',
      kind: 'enum',
      options: options('scene', 'skybox', 'solid_color'),
    },
    background_color: {
      label: 'Background',
      visibleWhen: { field: 'clear_flags', equals: 'solid_color' },
    },
  },
  Camera2D: {
    size: { label: 'Orthographic Size', min: 0.001, step: 0.1 },
    clear_flags: {
      label: 'Clear Flags',
      kind: 'enum',
      options: options('scene', 'skybox', 'solid_color'),
    },
    background_color: {
      label: 'Background',
      visibleWhen: { field: 'clear_flags', equals: 'solid_color' },
    },
  },
  DirectionalLight: {
    intensity: { min: 0, step: 0.1 },
    shadow_strength: {
      label: 'Shadow Strength', min: 0, max: 1, step: 0.01,
      visibleWhen: { field: 'cast_shadows', equals: true },
    },
    shadow_bias: {
      label: 'Shadow Bias', min: 0, max: 0.05, step: 0.0001,
      visibleWhen: { field: 'cast_shadows', equals: true },
    },
    shadow_normal_bias: {
      label: 'Normal Bias', min: 0, max: 2, step: 0.001,
      visibleWhen: { field: 'cast_shadows', equals: true },
    },
    shadow_distance: {
      label: 'Shadow Distance', min: 1, max: 500, step: 1,
      visibleWhen: { field: 'cast_shadows', equals: true },
    },
  },
  EnvironmentLight: {
    diffuse_intensity: { label: 'Diffuse Intensity', min: 0, step: 0.05 },
    specular_intensity: { label: 'Specular Intensity', min: 0, step: 0.05 },
    texture: {
      kind: 'project-asset',
      label: 'Environment Texture',
      referenceType: 'Environment Texture',
      assetKinds: ['texture'],
      allowNone: true,
      noneValue: '',
    },
    rotation_degrees: { label: 'Rotation', step: 1 },
    background_enabled: { label: 'Background' },
    background_intensity: {
      label: 'Background Intensity',
      min: 0,
      step: 0.05,
      visibleWhen: { field: 'background_enabled', equals: true },
    },
    exposure: { label: 'Exposure (EV)', min: -16, max: 16, step: 0.1 },
  },
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
  Light2D: {
    light_type: { label: 'Light Type', kind: 'enum', options: options('global', 'point') },
    intensity: { min: 0, step: 0.05 },
    radius: {
      min: 0.001,
      step: 0.1,
      visibleWhen: { field: 'light_type', equals: 'point' },
    },
    inner_radius: {
      label: 'Inner Radius',
      min: 0,
      step: 0.1,
      visibleWhen: { field: 'light_type', equals: 'point' },
    },
    falloff: {
      min: 0.01,
      max: 8,
      step: 0.05,
      visibleWhen: { field: 'light_type', equals: 'point' },
    },
    sorting_layers: { label: 'Target Sorting Layers', kind: 'string-list' },
  },
  PbrMaterial: {
    metallic: { min: 0, max: 1, step: 0.01 },
    roughness: { min: 0, max: 1, step: 0.01 },
    ior: { label: 'Index Of Refraction', min: 1, max: 2.5, step: 0.01 },
    emissive_strength: { min: 0, step: 0.1 },
  },
  MaterialPropertyBlock: {
    override_base_color: { label: 'Override Base Color' },
    base_color: { label: 'Base Color', visibleWhen: { field: 'override_base_color', equals: true } },
    override_metallic: { label: 'Override Metallic' },
    metallic: {
      min: 0,
      max: 1,
      step: 0.01,
      visibleWhen: { field: 'override_metallic', equals: true },
    },
    override_roughness: { label: 'Override Roughness' },
    roughness: {
      min: 0.04,
      max: 1,
      step: 0.01,
      visibleWhen: { field: 'override_roughness', equals: true },
    },
    override_ior: { label: 'Override IOR' },
    ior: {
      label: 'Index Of Refraction',
      min: 1,
      max: 2.5,
      step: 0.01,
      visibleWhen: { field: 'override_ior', equals: true },
    },
    override_clearcoat: { label: 'Override Clear Coat' },
    clearcoat: {
      label: 'Clear Coat',
      min: 0,
      max: 1,
      step: 0.01,
      visibleWhen: { field: 'override_clearcoat', equals: true },
    },
    override_clearcoat_roughness: { label: 'Override Coat Roughness' },
    clearcoat_roughness: {
      label: 'Coat Roughness',
      min: 0.04,
      max: 1,
      step: 0.01,
      visibleWhen: { field: 'override_clearcoat_roughness', equals: true },
    },
    override_emissive: { label: 'Override Emissive' },
    emissive: { visibleWhen: { field: 'override_emissive', equals: true } },
    override_emissive_strength: { label: 'Override Emissive Strength' },
    emissive_strength: {
      label: 'Emissive Strength',
      min: 0,
      step: 0.1,
      visibleWhen: { field: 'override_emissive_strength', equals: true },
    },
  },
  RigidBody3D: {
    body_type: { kind: 'enum', options: options('dynamic', 'fixed', 'kinematic') },
    mass: { min: 0.001, step: 0.1 },
    gravity_scale: { step: 0.1 },
    linear_damping: { min: 0, step: 0.01 },
    angular_damping: { min: 0, step: 0.01 },
  },
  BoxCollider3D: {
    friction: { min: 0, step: 0.01 },
    restitution: { min: 0, max: 1, step: 0.01 },
  },
  SphereCollider3D: {
    radius: { min: 0.001, step: 0.01 },
    friction: { min: 0, step: 0.01 },
    restitution: { min: 0, max: 1, step: 0.01 },
  },
  Rigidbody2D: {
    body_type: { kind: 'enum', options: options('dynamic', 'fixed', 'kinematic') },
    mass: { min: 0.001, step: 0.1 },
    gravity_scale: { step: 0.1 },
    linear_damping: { min: 0, step: 0.01 },
    angular_damping: { min: 0, step: 0.01 },
    angular_velocity: { label: 'Angular Velocity (deg/s)', step: 1 },
    freeze_rotation: { label: 'Freeze Rotation' },
    ccd: { label: 'Continuous Collision Detection' },
  },
  BoxCollider2D: {
    friction: { min: 0, step: 0.01 },
    bounciness: { min: 0, max: 1, step: 0.01 },
  },
  CircleCollider2D: {
    radius: { min: 0.001, step: 0.01 },
    friction: { min: 0, step: 0.01 },
    bounciness: { min: 0, max: 1, step: 0.01 },
  },
  SpriteRenderer: {
    sprite,
    pivot: { min: 0, max: 1, step: 0.01 },
    flip_x: { label: 'Flip X' },
    flip_y: { label: 'Flip Y' },
    sorting_layer: { label: 'Sorting Layer', kind: 'enum' },
  },
  AnimatedSprite2D: {
    frames: { kind: 'sprite-list' },
    pivot: { min: 0, max: 1, step: 0.01 },
    fps: { min: 0, step: 0.1 },
    frame: { min: 0, step: 1 },
    sorting_layer: { label: 'Sorting Layer', kind: 'enum' },
    flip_x: { label: 'Flip X' },
    flip_y: { label: 'Flip Y' },
  },
  Line2D: {
    points: { kind: 'vector2-list' },
    width: { min: 0, step: 0.01 },
    sorting_layer: { label: 'Sorting Layer', kind: 'enum' },
  },
  Grid: {
    cell_size: { label: 'Cell Size', min: 0.0001, step: 0.1 },
    cell_gap: { label: 'Cell Gap', step: 0.1 },
    cell_layout: { label: 'Cell Layout', kind: 'enum', options: options('Rectangle') },
  },
  Tilemap: {
    cells: { kind: 'vector2-list' },
    sprites: { kind: 'string-list' },
    tile_anchor: { label: 'Tile Anchor', min: 0, max: 1, step: 0.01 },
    sorting_layer: { label: 'Sorting Layer', kind: 'enum' },
  },
  AnimationPlayer: {
    clip: {
      kind: 'project-asset',
      assetKinds: ['animation'],
      referenceType: 'Animation Clip',
      allowNone: true,
    },
    speed: { step: 0.1 },
    time: { min: 0, step: 0.01 },
  },
  Animator: {
    controller: {
      kind: 'project-asset',
      assetKinds: ['animator-controller'],
      referenceType: 'Animator Controller',
      allowNone: true,
    },
    speed: { step: 0.1 },
    current_state: { label: 'Current State' },
    parameters_json: { label: 'Parameter Overrides (JSON)', kind: 'multiline' },
    layer_weights_json: { label: 'Layer Weight Overrides (JSON)', kind: 'multiline' },
    layers_json: { hidden: true },
    state_time: { hidden: true },
    normalized_time: { hidden: true },
    transition_to: { hidden: true },
    transition_progress: { hidden: true },
  },
  TimelineDirector: {
    asset: {
      kind: 'project-asset',
      assetKinds: ['timeline'],
      referenceType: 'Timeline Asset',
      allowNone: true,
    },
    bindings_json: { hidden: true },
    speed: { step: 0.1 },
    time: { min: 0, step: 0.01 },
    wrap_mode: {
      label: 'Wrap Mode',
      kind: 'enum',
      options: options('Hold', 'Loop'),
    },
  },
  AudioSource: {
    clip: {
      kind: 'project-asset',
      assetKinds: ['audio'],
      referenceType: 'Audio Clip',
      allowNone: true,
    },
    time: { min: 0, step: 0.01 },
    volume: { min: 0, max: 4, step: 0.01 },
    pitch: { min: 0.05, max: 4, step: 0.01 },
    pan: { min: -1, max: 1, step: 0.01 },
    spatial_blend: { label: 'Spatial Blend', min: 0, max: 1, step: 0.01 },
    min_distance: { min: 0.01, step: 0.1 },
    max_distance: { min: 0.02, step: 1 },
    bus: { kind: 'enum', options: options('Music', 'SFX', 'UI', 'Ambience') },
  },
  AudioMixer: {
    master_volume: { min: 0, max: 1, step: 0.01 },
    music_volume: { min: 0, max: 1, step: 0.01 },
    sfx_volume: { min: 0, max: 1, step: 0.01 },
    ui_volume: { min: 0, max: 1, step: 0.01 },
    ambience_volume: { min: 0, max: 1, step: 0.01 },
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
    sorting_layer: { label: 'Sorting Layer', kind: 'enum' },
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
    sorting_layer: { label: 'Sorting Layer', kind: 'enum' },
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
