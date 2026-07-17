import assert from 'node:assert/strict';
import test from 'node:test';
import { planToggleGroupChange } from '../src/ui/toggleGroup.ts';

const entity = (id, parent, components, active = true) => ({
  entity: id,
  parent,
  active,
  components,
});

test('turning on a Toggle atomically turns off its nearest-group peers', () => {
  const entities = [
    entity(1, null, { ToggleGroup: { allow_switch_off: false } }),
    entity(2, 1, { Toggle: { is_on: true } }),
    entity(3, 1, { Toggle: { is_on: false } }),
  ];
  assert.deepEqual(planToggleGroupChange(entities, 3, true), [
    { entity: 2, isOn: false },
    { entity: 3, isOn: true },
  ]);
  assert.deepEqual(planToggleGroupChange(entities, 2, false), []);
});

test('allow switch off and nested groups use independent membership', () => {
  const entities = [
    entity(1, null, { ToggleGroup: { allow_switch_off: true } }),
    entity(2, 1, { Toggle: { is_on: true } }),
    entity(3, 1, { ToggleGroup: { allow_switch_off: false } }),
    entity(4, 3, { Toggle: { is_on: true } }),
  ];
  assert.deepEqual(planToggleGroupChange(entities, 2, false), [{ entity: 2, isOn: false }]);
  assert.deepEqual(planToggleGroupChange(entities, 4, false), []);
  assert.deepEqual(planToggleGroupChange(entities, 2, true), []);
});

test('ungrouped toggles preserve ordinary switch behavior', () => {
  const entities = [entity(1, null, { Toggle: { is_on: false } })];
  assert.deepEqual(planToggleGroupChange(entities, 1, true), [{ entity: 1, isOn: true }]);
});
