import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createComponentDefaults,
  createUiButtonComponents,
} from '../src/componentCatalog.ts';
import {
  getBuiltinInspectorField,
  isInspectorFieldVisible,
} from '../src/inspectorMetadata.ts';
import {
  advanceButtonTint,
  buttonTargetTint,
  buttonVisualState,
  multiplyButtonTint,
  readButtonColorBlock,
} from '../src/ui/buttonColorTint.ts';

const UNITY_COLOR_BLOCK = {
  normal_color: [1, 1, 1, 1],
  highlighted_color: [0.9607843, 0.9607843, 0.9607843, 1],
  pressed_color: [0.7843137, 0.7843137, 0.7843137, 1],
  selected_color: [0.9607843, 0.9607843, 0.9607843, 1],
  disabled_color: [0.5215686, 0.5215686, 0.5215686, 0.5019608],
  color_multiplier: 1,
  fade_duration: 0.1,
};

test('Button catalog and Inspector expose the Unity ColorBlock contract', () => {
  assert.deepEqual(createComponentDefaults('Button'), {
    interactable: true,
    transition: 'ColorTint',
    ...UNITY_COLOR_BLOCK,
    label: 'Button',
    text_color: [1, 1, 1, 1],
    font_size: 16,
    on_click: { target: null, component: '', method: '' },
  });
  assert.deepEqual(createUiButtonComponents().Button, createComponentDefaults('Button'));
  assert.equal(getBuiltinInspectorField('Button', 'fade_duration')?.min, 0);
  assert.equal(isInspectorFieldVisible(
    getBuiltinInspectorField('Button', 'pressed_color'),
    { transition: 'ColorTint' },
  ), true);
  assert.equal(isInspectorFieldVisible(
    getBuiltinInspectorField('Button', 'pressed_color'),
    { transition: 'None' },
  ), false);
});

test('Button ColorBlock resolves Unity Selectable state priority and defaults', () => {
  const block = readButtonColorBlock({ color_multiplier: 1 });
  assert.equal(buttonVisualState(false, true, true, true), 'Disabled');
  assert.equal(buttonVisualState(true, true, true, true), 'Pressed');
  assert.equal(buttonVisualState(true, true, false, true), 'Highlighted');
  assert.equal(buttonVisualState(true, false, false, true), 'Selected');
  assert.equal(buttonVisualState(true, false, false, false), 'Normal');
  assert.deepEqual(buttonTargetTint(block, 'Pressed'), [0.7843137, 0.7843137, 0.7843137, 1]);
});

test('Button ColorTint cross-fades from the sampled current color without jumping', () => {
  const block = readButtonColorBlock({
    normal_color: [1, 1, 1, 1],
    pressed_color: [0.5, 0.5, 0.5, 1],
    highlighted_color: [0.8, 0.8, 0.8, 1],
    color_multiplier: 1,
    fade_duration: 0.1,
  });
  const normal = advanceButtonTint(undefined, 'Normal', block, 1);
  const pressed = advanceButtonTint(normal, 'Pressed', block, 1);
  const halfway = advanceButtonTint(pressed, 'Pressed', block, 1.05);
  assert.deepEqual(halfway.current.map((value) => Number(value.toFixed(3))), [0.75, 0.75, 0.75, 1]);
  const interrupted = advanceButtonTint(halfway, 'Highlighted', block, 1.05);
  assert.deepEqual(interrupted.start.map((value) => Number(value.toFixed(3))), [0.75, 0.75, 0.75, 1]);
  assert.deepEqual(multiplyButtonTint([0.25, 0.5, 1, 0.8], [2, 1, 0.5, 0.5]), [0.5, 0.5, 0.5, 0.4]);
});
