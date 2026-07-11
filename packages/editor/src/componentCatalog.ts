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
      on_click: { target: null, component: '', method: '' },
    }),
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
      on_click: { target: null, component: '', method: '' },
    },
  };
}
