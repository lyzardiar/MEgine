import assert from 'node:assert/strict';
import test from 'node:test';
import { rectComponentSceneScale } from '../src/rectSceneScale.ts';
import {
  canvasDisplayScaleFactor,
  canvasReferenceSize,
  canvasScaleFactor,
  canvasSpritePixelScale,
} from '../src/ui/rectLayout.ts';

test('Scene RectTransform units include the CanvasScaler factor', () => {
  assert.equal(rectComponentSceneScale(2, 0.5), 1);
  assert.equal(rectComponentSceneScale(2, 1.5), 3);
});

test('Constant Pixel Size uses its configured scale factor', () => {
  assert.equal(rectComponentSceneScale(0.5, 1.75), 0.875);
});

test('invalid scale values have safe fallbacks', () => {
  assert.equal(rectComponentSceneScale(0, Number.NaN), 1);
});

test('CanvasScaler defaults match Unity Constant Pixel Size semantics', () => {
  assert.equal(canvasScaleFactor(undefined, 1920, 1080), 1);
  assert.deepEqual(canvasReferenceSize(undefined), { w: 800, h: 600 });
  assert.equal(canvasScaleFactor({ ui_scale_mode: 'ConstantPixelSize', scale_factor: 2 }, 1, 1), 2);
  assert.equal(canvasScaleFactor({ ui_scale_mode: 'ConstantPixelSize', scale_factor: -5 }, 1, 1), 1);
});

test('Scale With Screen Size supports Unity Match Width Or Height', () => {
  const base = {
    ui_scale_mode: 'ScaleWithScreenSize',
    reference_resolution: [800, 600],
    screen_match_mode: 'MatchWidthOrHeight',
  };
  assert.equal(canvasScaleFactor({ ...base, match_width_or_height: 0 }, 1600, 600), 2);
  assert.equal(canvasScaleFactor({ ...base, match_width_or_height: 1 }, 1600, 600), 1);
  assert.ok(Math.abs(canvasScaleFactor({ ...base, match_width_or_height: 0.5 }, 1600, 600) - Math.sqrt(2)) < 1e-12);
  assert.equal(canvasScaleFactor({ ...base, match_width_or_height: -1 }, 1600, 600), 2);
  assert.equal(canvasScaleFactor({ ...base, match_width_or_height: 2 }, 1600, 600), 1);
});

test('Scale With Screen Size supports Unity Expand and Shrink', () => {
  const base = {
    ui_scale_mode: 'ScaleWithScreenSize',
    reference_resolution: [800, 600],
  };
  assert.equal(canvasScaleFactor({ ...base, screen_match_mode: 'Expand' }, 1600, 600), 1);
  assert.equal(canvasScaleFactor({ ...base, screen_match_mode: 'Shrink' }, 1600, 600), 2);
});

test('Constant Physical Size supports every Unity unit and fallback DPI', () => {
  const base = { ui_scale_mode: 'ConstantPhysicalSize', fallback_screen_dpi: 120 };
  assert.equal(canvasScaleFactor({ ...base, physical_unit: 'Inches' }, 1, 1), 120);
  assert.equal(canvasScaleFactor({ ...base, physical_unit: 'Centimeters' }, 1, 1), 120 / 2.54);
  assert.equal(canvasScaleFactor({ ...base, physical_unit: 'Millimeters' }, 1, 1), 120 / 25.4);
  assert.equal(canvasScaleFactor({ ...base, physical_unit: 'Points' }, 1, 1), 120 / 72);
  assert.equal(canvasScaleFactor({ ...base, physical_unit: 'Picas' }, 1, 1), 20);
  assert.equal(canvasScaleFactor({ ...base, physical_unit: 'Points' }, 1, 1, 144), 2);
});

test('fixed-resolution Game fit applies after Unity Canvas scaling', () => {
  const logical = { width: 1600, height: 600 };
  const view = { width: 800, height: 300 };
  assert.equal(canvasDisplayScaleFactor(
    { ui_scale_mode: 'ConstantPixelSize', scale_factor: 1 },
    view.width,
    view.height,
    logical.width,
    logical.height,
  ), 0.5);
  assert.equal(canvasDisplayScaleFactor({
    ui_scale_mode: 'ScaleWithScreenSize',
    reference_resolution: [800, 600],
    screen_match_mode: 'MatchWidthOrHeight',
    match_width_or_height: 0,
  }, view.width, view.height, logical.width, logical.height), 1);
  assert.equal(canvasDisplayScaleFactor({
    ui_scale_mode: 'ConstantPhysicalSize',
    physical_unit: 'Points',
    fallback_screen_dpi: 96,
  }, view.width, view.height, logical.width, logical.height), 2 / 3);
});

test('Constant Physical Size applies Default Sprite DPI to sliced sprite pixels', () => {
  const scaler = {
    ui_scale_mode: 'ConstantPhysicalSize',
    physical_unit: 'Points',
    fallback_screen_dpi: 120,
    default_sprite_dpi: 96,
  };
  const layoutScale = canvasScaleFactor(scaler, 1, 1);
  assert.equal(layoutScale, 120 / 72);
  assert.equal(canvasSpritePixelScale(scaler, layoutScale), 120 / 96);
  assert.equal(canvasSpritePixelScale({ ui_scale_mode: 'ConstantPixelSize' }, 2), 2);
});
