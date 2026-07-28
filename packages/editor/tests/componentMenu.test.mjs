import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/editorWindow/componentMenuItems.ts';
import { findMenuItem, listMenuItems } from '../src/editorWindow/registry.ts';

function createContext() {
  const entity = {
    entity: 7,
    name: 'Camera Rig',
    components: {
      Transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    },
  };
  const calls = [];
  const store = {
    mode: 'edit',
    selected: entity.entity,
    selectedIds: [entity.entity],
    snapshot: () => ({ entities: [entity] }),
    addComponent: (...args) => {
      calls.push(args);
      entity.components[args[1]] = args[2];
      return true;
    },
  };
  return {
    calls,
    context: {
      source: 'agent',
      store,
      selectedIds: store.selectedIds,
      contextEntity: store.selected,
      refresh: () => calls.push(['refresh']),
      log: (message) => calls.push(['log', message]),
    },
  };
}

test('Component menu exposes catalog entries and adds their real defaults', () => {
  const { context, calls } = createContext();
  const entry = findMenuItem('Component/Camera/Camera 2D');

  assert.ok(listMenuItems('Component').length > 10);
  assert.ok(entry);
  assert.equal(entry.validate(context), true);
  entry.action(context);

  assert.deepEqual(calls[0], [
    7,
    'Camera2D',
    {
      size: 5,
      primary: false,
      clear_flags: 'solid_color',
      background_color: [0.1, 0.1, 0.14, 1],
    },
  ]);
  assert.equal(entry.validate(context), false);
  assert.deepEqual(calls.slice(1), [['log', 'Added Camera2D'], ['refresh']]);
});

test('Component menu is disabled without an editable selection', () => {
  const { context } = createContext();
  const entry = findMenuItem('Component/Camera/Camera 2D');

  context.store.mode = 'play';
  assert.equal(entry.validate(context), false);
  context.store.mode = 'edit';
  context.contextEntity = null;
  context.store.selected = null;
  assert.equal(entry.validate(context), false);
});
