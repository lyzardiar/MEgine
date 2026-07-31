import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import {
  componentRequirements,
  createComponentDefaults,
  createUiCanvasComponents,
  createUiTextComponents,
} from '../src/componentCatalog.ts';
import {
  getBuiltinInspectorField,
  isInspectorFieldVisible,
} from '../src/inspectorMetadata.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const UNITY_DEFAULTS = {
  ui_scale_mode: 'ConstantPixelSize',
  reference_pixels_per_unit: 100,
  scale_factor: 1,
  reference_resolution: [800, 600],
  screen_match_mode: 'MatchWidthOrHeight',
  match_width_or_height: 0,
  physical_unit: 'Points',
  fallback_screen_dpi: 96,
  default_sprite_dpi: 96,
  dynamic_pixels_per_unit: 1,
};

const UNITY_CANVAS_DEFAULTS = {
  render_mode: 'ScreenSpaceOverlay',
  render_camera: '',
  pixel_perfect: false,
  override_pixel_perfect: false,
  override_sorting: false,
  sorting_layer: 'default',
  sorting_order: 0,
  plane_distance: 100,
};

test('Canvas catalog exposes all render modes and camera-aware defaults', () => {
  assert.deepEqual(createComponentDefaults('Canvas'), UNITY_CANVAS_DEFAULTS);
  assert.deepEqual(createUiCanvasComponents().Canvas, UNITY_CANVAS_DEFAULTS);
  assert.deepEqual(
    getBuiltinInspectorField('Canvas', 'render_mode')?.options?.map(({ value }) => value),
    ['ScreenSpaceOverlay', 'ScreenSpaceCamera', 'WorldSpace'],
  );
  assert.deepEqual(getBuiltinInspectorField('Canvas', 'render_camera')?.visibleWhen, {
    field: 'render_mode',
    equals: ['ScreenSpaceCamera', 'WorldSpace'],
  });
  assert.deepEqual(getBuiltinInspectorField('Canvas', 'plane_distance')?.visibleWhen, {
    field: 'render_mode',
    equals: 'ScreenSpaceCamera',
  });
  assert.deepEqual(getBuiltinInspectorField('Canvas', 'override_pixel_perfect')?.visibleWhen, {
    field: 'render_mode',
    equals: ['ScreenSpaceOverlay', 'ScreenSpaceCamera'],
  });
  assert.equal(getBuiltinInspectorField('Canvas', 'override_sorting')?.visibleWhen, undefined);
});

test('CanvasScaler catalog and new Canvas use Unity defaults', () => {
  assert.deepEqual(createComponentDefaults('CanvasScaler'), UNITY_DEFAULTS);
  assert.deepEqual(createUiCanvasComponents().CanvasScaler, UNITY_DEFAULTS);
  assert.deepEqual(componentRequirements('CanvasScaler'), ['Canvas']);
});

test('CanvasGroup exposes Unity parent-group override defaults', () => {
  assert.deepEqual(createComponentDefaults('CanvasGroup'), {
    alpha: 1,
    interactable: true,
    blocks_raycasts: true,
    ignore_parent_groups: false,
  });
});

test('Text Graphic defaults to a Unity raycast target', () => {
  assert.equal(createComponentDefaults('Text').raycast_target, true);
  assert.equal(createUiTextComponents().Text.raycast_target, true);
});

test('CanvasScaler Inspector exposes all Unity scale and match modes', () => {
  assert.deepEqual(
    getBuiltinInspectorField('CanvasScaler', 'ui_scale_mode')?.options?.map(({ value }) => value),
    ['ConstantPixelSize', 'ScaleWithScreenSize', 'ConstantPhysicalSize'],
  );
  assert.deepEqual(
    getBuiltinInspectorField('CanvasScaler', 'screen_match_mode')?.options?.map(({ value }) => value),
    ['MatchWidthOrHeight', 'Expand', 'Shrink'],
  );
  assert.deepEqual(
    getBuiltinInspectorField('CanvasScaler', 'physical_unit')?.options?.map(({ value }) => value),
    ['Centimeters', 'Millimeters', 'Inches', 'Points', 'Picas'],
  );
});

test('CanvasScaler Match is visible only for Scale With Screen Size match mode', () => {
  assert.deepEqual(getBuiltinInspectorField('CanvasScaler', 'match_width_or_height')?.visibleWhen, [
    {
      component: 'Canvas',
      field: 'render_mode',
      equals: ['ScreenSpaceOverlay', 'ScreenSpaceCamera'],
    },
    { field: 'ui_scale_mode', equals: 'ScaleWithScreenSize' },
    { field: 'screen_match_mode', equals: 'MatchWidthOrHeight' },
  ]);
});

test('CanvasScaler Inspector exposes only settings used by the current Canvas mode', () => {
  const scaler = { ...UNITY_DEFAULTS, ui_scale_mode: 'ScaleWithScreenSize' };
  const visible = (field, renderMode) => isInspectorFieldVisible(
    getBuiltinInspectorField('CanvasScaler', field),
    scaler,
    { Canvas: { render_mode: renderMode } },
  );
  assert.equal(visible('ui_scale_mode', 'ScreenSpaceOverlay'), true);
  assert.equal(visible('reference_resolution', 'ScreenSpaceCamera'), true);
  assert.equal(visible('dynamic_pixels_per_unit', 'ScreenSpaceOverlay'), false);
  assert.equal(visible('ui_scale_mode', 'WorldSpace'), false);
  assert.equal(visible('reference_resolution', 'WorldSpace'), false);
  assert.equal(visible('dynamic_pixels_per_unit', 'WorldSpace'), true);
  assert.equal(visible('reference_pixels_per_unit', 'WorldSpace'), true);
});

test('adding CanvasScaler resolves the complete Canvas dependency chain in one undo step', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const entity = store.createGameObject('Scaler Host', {
      Transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    });
    assert.notEqual(entity, null);
    assert.equal(
      store.addComponent(entity, 'CanvasScaler', createComponentDefaults('CanvasScaler')),
      true,
    );
    const authored = store.authoredEntities().find((candidate) => candidate.entity === entity);
    assert.ok(authored.components.Transform);
    assert.ok(authored.components.RectTransform);
    assert.ok(authored.components.Canvas);
    assert.ok(authored.components.CanvasScaler);
    assert.equal(store.removeComponent(entity, 'Canvas'), false);
    assert.equal(store.removeComponent(entity, 'RectTransform'), false);
    assert.equal(store.undoLabel, 'Add CanvasScaler');
    assert.equal(store.undo(), true);
    const restored = store.authoredEntities().find((candidate) => candidate.entity === entity);
    assert.ok(restored.components.Transform);
    assert.equal(restored.components.RectTransform, undefined);
    assert.equal(restored.components.Canvas, undefined);
    assert.equal(restored.components.CanvasScaler, undefined);
  } finally {
    await server.close();
  }
});
