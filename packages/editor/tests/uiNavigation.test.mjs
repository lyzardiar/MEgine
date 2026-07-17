import assert from 'node:assert/strict';
import test from 'node:test';
import { nextUiSelectable, uiNavigationAction } from '../src/ui/uiNavigation.ts';

const item = (entity, control) => ({
  entity,
  rect: { x: 0, y: 0, w: 100, h: 30 },
  depth: entity,
  role: 'graphic',
  rotation: 0,
  pivot: [0.5, 0.5],
  opacity: 1,
  selected: false,
  ...control,
});

test('tab navigation wraps and skips non-interactable graphics', () => {
  const items = [
    item(1, { button: { interactable: true } }),
    item(2, { toggle: { interactable: false } }),
    item(3, { input: { interactable: true } }),
  ];
  assert.equal(nextUiSelectable(items, null), 1);
  assert.equal(nextUiSelectable(items, 1), 3);
  assert.equal(nextUiSelectable(items, 3), 1);
  assert.equal(nextUiSelectable(items, 1, true), 3);
});

test('keyboard activation and directional range changes are deterministic', () => {
  const toggle = item(1, {
    toggle: { interactable: true, isOn: false, onValueChanged: { method: 'changed' } },
  });
  assert.deepEqual(uiNavigationAction(toggle, ' '), {
    kind: 'value',
    component: 'Toggle',
    patch: { is_on: true },
    callback: { method: 'changed' },
  });

  const slider = item(2, {
    slider: {
      interactable: true,
      direction: 'RightToLeft',
      min: 0,
      max: 10,
      value: 5,
      wholeNumbers: false,
      onValueChanged: null,
    },
  });
  assert.equal(uiNavigationAction(slider, 'ArrowLeft')?.patch.value, 5.5);
  assert.equal(uiNavigationAction(slider, 'ArrowRight')?.patch.value, 4.5);
});

test('list and tab navigation clamp to available entries', () => {
  const list = item(1, {
    list: { interactable: true, items: ['A', 'B'], selectedIndex: 1, onValueChanged: null },
  });
  assert.equal(uiNavigationAction(list, 'ArrowDown')?.patch.selected_index, 1);
  const tabs = item(2, {
    tabs: { interactable: true, labels: ['A', 'B'], selectedIndex: 0, onValueChanged: null },
  });
  assert.equal(uiNavigationAction(tabs, 'ArrowRight')?.patch.selected_index, 1);
});
