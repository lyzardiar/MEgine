import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createComponentDefaults,
  createUiCanvasComponents,
} from '../src/componentCatalog.ts';
import { getBuiltinInspectorField } from '../src/inspectorMetadata.ts';

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
  assert.equal(getBuiltinInspectorField('Canvas', 'override_sorting')?.visibleWhen, undefined);
});

test('CanvasScaler catalog and new Canvas use Unity defaults', () => {
  assert.deepEqual(createComponentDefaults('CanvasScaler'), UNITY_DEFAULTS);
  assert.deepEqual(createUiCanvasComponents().CanvasScaler, UNITY_DEFAULTS);
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
    { field: 'ui_scale_mode', equals: 'ScaleWithScreenSize' },
    { field: 'screen_match_mode', equals: 'MatchWidthOrHeight' },
  ]);
});
