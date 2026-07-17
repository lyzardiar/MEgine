import { getBehaviour, listBehaviours } from '@mengine/behaviour';
import { defaultRectTransform, stretchRectTransform } from './ui/rectLayout';

/** Built-in (non-Behaviour) components for Add Component menu. */
export type ComponentCatalogEntry = {
  type: string;
  label: string;
  description: string;
  create: () => Record<string, unknown>;
};

const BUILTIN_CATALOG: ComponentCatalogEntry[] = [
  {
    type: 'MeshRenderer',
    label: 'Mesh Renderer',
    description: '渲染网格',
    create: () => ({ mesh: 'cube', material: 'default' }),
  },
  {
    type: 'Camera3D',
    label: 'Camera 3D',
    description: '透视 / 正交相机 + 视锥体',
    create: () => ({
      fov_y_degrees: 60,
      near: 0.3,
      far: 50,
      primary: false,
      projection: 'perspective',
      orthographic_size: 5,
      aspect: 16 / 9,
    }),
  },
  {
    type: 'DirectionalLight',
    label: 'Directional Light',
    description: '平行光（沿本地 -Z 照射）',
    create: () => ({ color: [1, 1, 0.95, 1], intensity: 1 }),
  },
  {
    type: 'PointLight',
    label: 'Point Light',
    description: 'Omnidirectional local light with intensity and range',
    create: () => ({ color: [1, 1, 1, 1], intensity: 8, range: 10 }),
  },
  {
    type: 'SpotLight',
    label: 'Spot Light',
    description: 'Local cone light with soft inner and outer angles',
    create: () => ({
      color: [1, 1, 1, 1],
      intensity: 12,
      range: 12,
      inner_angle_degrees: 25,
      outer_angle_degrees: 40,
    }),
  },
  {
    type: 'PbrMaterial',
    label: 'PBR Material',
    description: 'Base color, metallic, roughness and emissive surface parameters',
    create: () => ({
      base_color: [0.8, 0.8, 0.8, 1],
      metallic: 0,
      roughness: 0.5,
      emissive: [0, 0, 0],
      emissive_strength: 1,
      unlit: false,
      double_sided: false,
    }),
  },
  {
    type: 'SpriteRenderer',
    label: 'Sprite Renderer',
    description: '世界空间贴图面片（非 UI）',
    create: () => ({
      sprite: 'white',
      color: [1, 1, 1, 1],
      size: [1, 1],
      sorting_order: 0,
    }),
  },
  {
    type: 'Canvas',
    label: 'Canvas',
    description: 'UI 画布（Screen Space Overlay）',
    create: () => ({
      render_mode: 'ScreenSpaceOverlay',
      sorting_order: 0,
      plane_distance: 100,
    }),
  },
  {
    type: 'CanvasScaler',
    label: 'Canvas Scaler',
    description: 'UI 分辨率缩放',
    create: () => ({
      ui_scale_mode: 'ScaleWithScreenSize',
      reference_resolution: [1920, 1080],
      match_width_or_height: 0.5,
      scale_factor: 1,
    }),
  },
  {
    type: 'RectTransform',
    label: 'Rect Transform',
    description: 'UI 矩形布局',
    create: () => defaultRectTransform(),
  },
  {
    type: 'Image',
    label: 'Image',
    description: 'UI 图形',
    create: () => ({
      sprite: 'white',
      color: [1, 1, 1, 1],
      image_type: 'Simple',
      raycast_target: true,
    }),
  },
  {
    type: 'Button',
    label: 'Button',
    description: '可点击 UI 按钮',
    create: () => ({
      interactable: true,
      transition: 'ColorTint',
      label: 'Button',
      text_color: [1, 1, 1, 1],
      font_size: 16,
      on_click: { target: null, component: '', method: '' },
    }),
  },
  {
    type: 'ParticleEmitter2D',
    label: 'Particle Emitter 2D',
    description: 'Deterministic world-space XY particle emitter',
    create: () => createParticleEmitter2D(),
  },
  {
    type: 'ParticleEmitter3D',
    label: 'Particle Emitter 3D',
    description: 'Deterministic 3D billboard particle emitter',
    create: () => createParticleEmitter3D(),
  },
  {
    type: 'SpineSkeleton',
    label: 'Spine Skeleton 4.3',
    description: 'Official Spine 4.3 skeleton, atlas, skin and animation player',
    create: () => createSpineSkeleton(),
  },
  {
    type: 'Text',
    label: 'Text',
    description: 'UI 文本标签',
    create: () => ({
      text: 'Text',
      color: [1, 1, 1, 1],
      font_size: 16,
      outline_color: [0, 0, 0, 1],
      outline_width: 0,
      alignment: 'Center',
      vertical_align: 'Middle',
      raycast_target: false,
    }),
  },
  {
    type: 'Toggle',
    label: 'Toggle',
    description: '布尔开关控件',
    create: () => ({
      is_on: false,
      interactable: true,
      label: 'Toggle',
      color: [0.2, 0.45, 0.85, 1],
      text_color: [1, 1, 1, 1],
      font_size: 16,
      on_value_changed: { target: null, component: '', method: '' },
    }),
  },
  {
    type: 'Slider',
    label: 'Slider',
    description: '数值滑动控件',
    create: () => ({
      min_value: 0,
      max_value: 1,
      value: 0.5,
      whole_numbers: false,
      interactable: true,
      direction: 'LeftToRight',
      fill_color: [0.2, 0.55, 1, 1],
      background_color: [0.15, 0.17, 0.2, 1],
      handle_color: [0.9, 0.92, 0.95, 1],
      on_value_changed: { target: null, component: '', method: '' },
    }),
  },
  {
    type: 'Panel',
    label: 'Panel',
    description: 'Colored UI container with an optional border',
    create: () => createUiPanelComponents().Panel,
  },
  {
    type: 'CanvasGroup',
    label: 'Canvas Group',
    description: 'Inherited opacity, interaction and raycast state',
    create: () => ({ alpha: 1, interactable: true, blocks_raycasts: true }),
  },
  {
    type: 'LayoutGroup',
    label: 'Layout Group',
    description: 'Horizontal, vertical or grid automatic child layout',
    create: () => createUiLayoutGroupComponents().LayoutGroup,
  },
  {
    type: 'RectMask2D',
    label: 'Rect Mask 2D',
    description: 'Rectangular clipping for child graphics and controls',
    create: () => ({ enabled: true, padding: [0, 0, 0, 0] }),
  },
  {
    type: 'ProgressBar',
    label: 'Progress Bar',
    description: 'Read-only directional range display',
    create: () => createUiProgressBarComponents().ProgressBar,
  },
  {
    type: 'InputField',
    label: 'Input Field',
    description: 'Single-line or multiline editable text control',
    create: () => createUiInputFieldComponents().InputField,
  },
  {
    type: 'Dropdown',
    label: 'Dropdown',
    description: 'Selectable popup option list',
    create: () => createUiDropdownComponents().Dropdown,
  },
  {
    type: 'ListView',
    label: 'List View',
    description: 'Scrollable selectable item list',
    create: () => createUiListViewComponents().ListView,
  },
  {
    type: 'ScrollView',
    label: 'Scroll View',
    description: 'Clipped scrollable child viewport',
    create: () => createUiScrollViewComponents().ScrollView,
  },
  {
    type: 'TabView',
    label: 'Tab View',
    description: 'Tabbed container showing one child page at a time',
    create: () => createUiTabViewComponents().TabView,
  },
];

/** Built-ins + registered Behaviours (import behaviours before calling). */
export function getComponentCatalog(): ComponentCatalogEntry[] {
  const behaviours: ComponentCatalogEntry[] = listBehaviours()
    .filter((b) => !b.type.startsWith('__'))
    .map((b) => ({
      type: b.type,
      label: b.label,
      description: b.description,
      create: () => b.defaults(),
    }));
  return [...behaviours, ...BUILTIN_CATALOG];
}

export function createComponentDefaults(type: string): Record<string, unknown> | null {
  if (type === 'Transform') {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    };
  }
  const behaviour = getBehaviour(type);
  if (behaviour) return behaviour.defaults();
  const builtin = BUILTIN_CATALOG.find((c) => c.type === type);
  return builtin ? builtin.create() : null;
}

export function createUiCanvasComponents(): Record<string, unknown> {
  return {
    RectTransform: stretchRectTransform(),
    Canvas: {
      render_mode: 'ScreenSpaceOverlay',
      sorting_order: 0,
      plane_distance: 100,
    },
    CanvasScaler: {
      ui_scale_mode: 'ScaleWithScreenSize',
      reference_resolution: [1920, 1080],
      match_width_or_height: 0.5,
      scale_factor: 1,
    },
  };
}

export function createUiImageComponents(color: [number, number, number, number] = [1, 1, 1, 1]) {
  return {
    RectTransform: defaultRectTransform({ size_delta: [160, 40] }),
    Image: {
      sprite: 'white',
      color,
      image_type: 'Simple',
      raycast_target: true,
    },
  };
}

export function createUiButtonComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [160, 40] }),
    Image: {
      sprite: 'white',
      color: [0.25, 0.45, 0.85, 1],
      image_type: 'Simple',
      raycast_target: true,
    },
    Button: {
      interactable: true,
      transition: 'ColorTint',
      label: 'Button',
      text_color: [1, 1, 1, 1],
      font_size: 16,
      on_click: { target: null, component: '', method: '' },
    },
  };
}

export function createParticleEmitter2D(): Record<string, unknown> {
  return {
    playing: true,
    looping: true,
    duration: 5,
    start_delay: 0,
    rate_over_time: 20,
    max_particles: 1000,
    lifetime_min: 0.8,
    lifetime_max: 1.6,
    speed_min: 0.5,
    speed_max: 2,
    size_start: 0.18,
    size_end: 0,
    color_start: [1, 0.75, 0.2, 1],
    color_end: [1, 0.15, 0.02, 0],
    gravity: [0, -0.8],
    shape: 'circle',
    shape_radius: 0.2,
    shape_size: [1, 1],
    direction: [0, 1],
    spread_degrees: 35,
    simulation_space: 'world',
    blend_mode: 'additive',
    texture: '',
    sorting_order: 0,
    seed: 1,
  };
}

export function createParticleEmitter3D(): Record<string, unknown> {
  return {
    playing: true,
    looping: true,
    duration: 5,
    start_delay: 0,
    rate_over_time: 30,
    max_particles: 2000,
    lifetime_min: 1,
    lifetime_max: 2,
    speed_min: 0.8,
    speed_max: 3,
    size_start: 0.16,
    size_end: 0.02,
    color_start: [0.35, 0.75, 1, 1],
    color_end: [0.05, 0.2, 1, 0],
    gravity: [0, -0.6, 0],
    shape: 'cone',
    shape_radius: 0.25,
    shape_size: [1, 1, 1],
    direction: [0, 1, 0],
    spread_degrees: 25,
    simulation_space: 'world',
    blend_mode: 'additive',
    texture: '',
    billboard: true,
    seed: 1,
  };
}

export function createSpineSkeleton(): Record<string, unknown> {
  return {
    skeleton: '',
    atlas: '',
    animation: '',
    skin: 'default',
    loop_animation: true,
    playing: true,
    time_scale: 1,
    scale: 1,
    color: [1, 1, 1, 1],
    premultiplied_alpha: true,
    sorting_order: 0,
  };
}

export function createUiTextComponents(text = 'Text') {
  return {
    RectTransform: defaultRectTransform({ size_delta: [200, 36] }),
    Text: {
      text,
      color: [1, 1, 1, 1],
      font_size: 16,
      outline_color: [0, 0, 0, 1],
      outline_width: 0,
      alignment: 'Center',
      vertical_align: 'Middle',
      raycast_target: false,
    },
  };
}

export function createUiToggleComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [180, 36] }),
    Toggle: {
      is_on: false,
      interactable: true,
      label: 'Toggle',
      color: [0.2, 0.45, 0.85, 1],
      text_color: [1, 1, 1, 1],
      font_size: 16,
      on_value_changed: { target: null, component: '', method: '' },
    },
  };
}

export function createUiSliderComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [220, 30] }),
    Slider: {
      min_value: 0,
      max_value: 1,
      value: 0.5,
      whole_numbers: false,
      interactable: true,
      direction: 'LeftToRight',
      fill_color: [0.2, 0.55, 1, 1],
      background_color: [0.15, 0.17, 0.2, 1],
      handle_color: [0.9, 0.92, 0.95, 1],
      on_value_changed: { target: null, component: '', method: '' },
    },
  };
}

const callback = () => ({ target: null, component: '', method: '' });

export function createUiPanelComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [320, 240] }),
    Panel: {
      color: [0.12, 0.14, 0.18, 0.96],
      border_color: [0.32, 0.36, 0.44, 1],
      border_width: 1,
      raycast_target: false,
    },
  };
}

export function createUiLayoutGroupComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [360, 200] }),
    Panel: {
      color: [0.08, 0.09, 0.12, 0.9],
      border_color: [0.3, 0.34, 0.42, 1],
      border_width: 1,
      raycast_target: false,
    },
    LayoutGroup: {
      direction: 'Vertical',
      padding: [8, 8, 8, 8],
      spacing: [6, 6],
      cell_size: [160, 36],
      constraint_count: 1,
      child_force_expand: true,
    },
  };
}

export function createUiProgressBarComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [220, 28] }),
    ProgressBar: {
      min_value: 0,
      max_value: 1,
      value: 0.5,
      direction: 'LeftToRight',
      background_color: [0.12, 0.14, 0.18, 1],
      fill_color: [0.2, 0.65, 0.95, 1],
      text_color: [1, 1, 1, 1],
      show_label: true,
      font_size: 14,
    },
  };
}

export function createUiInputFieldComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [240, 38] }),
    InputField: {
      text: '',
      placeholder: 'Enter text...',
      text_color: [0.94, 0.95, 0.98, 1],
      placeholder_color: [0.55, 0.58, 0.64, 1],
      background_color: [0.08, 0.09, 0.12, 1],
      caret_color: [0.3, 0.7, 1, 1],
      font_size: 16,
      interactable: true,
      multiline: false,
      character_limit: 0,
      on_value_changed: callback(),
      on_submit: callback(),
    },
  };
}

export function createUiDropdownComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [240, 38] }),
    Dropdown: {
      options: ['Option A', 'Option B', 'Option C'],
      selected_index: 0,
      expanded: false,
      interactable: true,
      background_color: [0.13, 0.15, 0.19, 1],
      item_color: [0.16, 0.18, 0.23, 1],
      selected_color: [0.2, 0.48, 0.85, 1],
      text_color: [1, 1, 1, 1],
      font_size: 16,
      on_value_changed: callback(),
    },
  };
}

export function createUiListViewComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [260, 220] }),
    ListView: {
      items: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
      selected_index: -1,
      item_height: 32,
      spacing: 2,
      scroll_offset: 0,
      interactable: true,
      background_color: [0.08, 0.09, 0.12, 1],
      item_color: [0.14, 0.16, 0.2, 1],
      selected_color: [0.2, 0.48, 0.85, 1],
      text_color: [1, 1, 1, 1],
      font_size: 15,
      on_value_changed: callback(),
    },
  };
}

export function createUiScrollViewComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [300, 220] }),
    ScrollView: {
      horizontal: false,
      vertical: true,
      normalized_position: [0, 0],
      scroll_sensitivity: 0.08,
      viewport_color: [0.05, 0.06, 0.08, 0.72],
      show_scrollbar: true,
      on_value_changed: callback(),
    },
    RectMask2D: { enabled: true, padding: [0, 0, 0, 0] },
  };
}

export function createUiTabViewComponents() {
  return {
    RectTransform: defaultRectTransform({ size_delta: [360, 240] }),
    TabView: {
      tabs: ['General', 'Graphics', 'Audio'],
      selected_index: 0,
      tab_height: 32,
      interactable: true,
      background_color: [0.09, 0.1, 0.13, 1],
      tab_color: [0.15, 0.17, 0.21, 1],
      selected_color: [0.2, 0.48, 0.85, 1],
      text_color: [1, 1, 1, 1],
      font_size: 15,
      on_value_changed: callback(),
    },
  };
}
