import assert from 'node:assert/strict';
import test from 'node:test';
import { WRITE_COMMANDS } from '../src/agent/commands.ts';

function createContext() {
  const entities = [
    {
      entity: 1,
      name: 'Cube',
      parent: null,
      siblingIndex: 0,
      active: true,
      components: {
        Transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        MeshRenderer: { mesh: 'cube' },
      },
    },
    {
      entity: 2,
      name: 'Light',
      parent: null,
      siblingIndex: 1,
      active: true,
      components: { Transform: {} },
    },
  ];
  const calls = [];
  const store = {
    mode: 'edit',
    gizmo: 'translate',
    selected: 1,
    selectedIds: [1],
    snapshot: () => ({ entities }),
    selectMany: (...args) => calls.push(['selectMany', ...args]),
    revealEntity: (...args) => calls.push(['revealEntity', ...args]),
    createGameObject: (...args) => {
      calls.push(['createGameObject', ...args]);
      return 3;
    },
    deleteSelection: () => calls.push(['deleteSelection']),
    duplicateSelection: () => 3,
    rename: (...args) => calls.push(['rename', ...args]),
    setActive: (...args) => calls.push(['setActive', ...args]),
    setParent: (...args) => {
      calls.push(['setParent', ...args]);
      return true;
    },
    addComponent: (...args) => {
      calls.push(['addComponent', ...args]);
      return true;
    },
    removeComponent: (...args) => {
      calls.push(['removeComponent', ...args]);
      return true;
    },
    setComponent: (...args) => calls.push(['setComponent', ...args]),
    patchComponent: (...args) => calls.push(['patchComponent', ...args]),
    getTransform: (id) => entities.find((entity) => entity.entity === id)?.components.Transform ?? null,
    setTransform: (...args) => calls.push(['setTransform', ...args]),
    play: () => calls.push(['play']),
    pause: () => calls.push(['pause']),
    stop: () => calls.push(['stop']),
    step: (...args) => {
      calls.push(['step', ...args]);
      return true;
    },
    undo: () => calls.push(['undo']),
    redo: () => calls.push(['redo']),
    setGizmo: (...args) => calls.push(['setGizmo', ...args]),
    frameSelected: () => calls.push(['frameSelected']),
  };
  return {
    calls,
    entities,
    ctx: {
      store,
      focusPanel: (kind) => {
        calls.push(['focusPanel', kind]);
        return ['scene', 'game', 'console'].includes(kind);
      },
      resetPanelLayout: () => calls.push(['resetPanelLayout']),
    },
  };
}

function run(ctx, command, args = {}) {
  return WRITE_COMMANDS[command](ctx, args);
}

function assertBridgeError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.name, 'BridgeError');
    assert.equal(error?.code, code);
    return true;
  });
}

test('rejects invalid scalar values before they reach the store', () => {
  const { ctx, calls } = createContext();

  assertBridgeError(
    () => run(ctx, 'entity.set_active', { id: 1, active: 'false' }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'entity.rename', { id: Number.NaN, name: 'Renamed' }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'gizmo.set', { mode: 'move' }),
    'INVALID_ARGS',
  );
  assert.deepEqual(calls, []);
});

test('uses exact booleans and validates entity existence', () => {
  const { ctx, calls } = createContext();

  run(ctx, 'entity.set_active', { id: 1, active: false });
  assert.deepEqual(calls, [['setActive', 1, false]]);

  assertBridgeError(
    () => run(ctx, 'entity.rename', { id: 999, name: 'Ghost' }),
    'ENTITY_NOT_FOUND',
  );
  assert.equal(calls.length, 1);
});

test('accepts entity id zero when it exists in a loaded scene', () => {
  const { ctx, calls, entities } = createContext();
  entities.unshift({
    entity: 0,
    name: 'Legacy Root',
    parent: null,
    siblingIndex: 0,
    active: true,
    components: { Transform: {} },
  });

  run(ctx, 'entity.rename', { id: 0, name: 'Root Zero' });
  assert.deepEqual(calls, [['rename', 0, 'Root Zero']]);
});

test('component set and patch require an existing component and object payload', () => {
  const { ctx, calls } = createContext();

  assertBridgeError(
    () => run(ctx, 'component.set', { entity: 1, type: 'AudioSource', value: {} }),
    'COMPONENT_NOT_FOUND',
  );
  assertBridgeError(
    () => run(ctx, 'component.patch', { entity: 1, type: 'MeshRenderer', patch: [] }),
    'INVALID_ARGS',
  );
  assert.deepEqual(calls, []);

  run(ctx, 'component.patch', {
    entity: 1,
    type: 'MeshRenderer',
    patch: { material: 'default' },
  });
  assert.deepEqual(calls, [
    ['patchComponent', 1, 'MeshRenderer', { material: 'default' }],
  ]);
});

test('transform updates require finite tuples with exact dimensions', () => {
  const { ctx, calls } = createContext();

  assertBridgeError(
    () => run(ctx, 'transform.set', { entity: 1, position: [1, 2] }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'transform.set', { entity: 1, scale: [1, Infinity, 1] }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'transform.set', { entity: 1 }),
    'INVALID_ARGS',
  );
  assert.deepEqual(calls, []);

  run(ctx, 'transform.set', { entity: 1, position: [4, 5, 6] });
  assert.deepEqual(calls[0], [
    'setTransform',
    1,
    {
      position: [4, 5, 6],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
  ]);
});

test('invalid hierarchy operations fail instead of reporting false success', () => {
  const { ctx, calls } = createContext();
  ctx.store.setParent = (...args) => {
    calls.push(['setParent', ...args]);
    return false;
  };

  assertBridgeError(
    () => run(ctx, 'entity.reparent', { ids: [1], parent: 2, index: 0 }),
    'INVALID_ARGS',
  );
  assert.deepEqual(calls, [['setParent', [1], 2, 0]]);
});

test('panel commands reject unknown ids and expose background-safe activation', () => {
  const { ctx, calls } = createContext();

  assertBridgeError(
    () => run(ctx, 'panel.focus', { kind: 'not-a-panel' }),
    'INVALID_ARGS',
  );
  assert.deepEqual(calls, [['focusPanel', 'not-a-panel']]);

  const result = run(ctx, 'panel.focus', { kind: 'console' });
  assert.deepEqual(result.data, { panel: 'console', backgroundSafe: true });
  run(ctx, 'panel.reset_layout');
  assert.deepEqual(calls.slice(1), [
    ['focusPanel', 'console'],
    ['resetPanelLayout'],
  ]);
});

test('single-frame playback steps are bounded and require paused Play Mode', () => {
  const { ctx, calls } = createContext();

  assertBridgeError(
    () => run(ctx, 'playback.step'),
    'READONLY',
  );
  ctx.store.mode = 'pause';
  assertBridgeError(
    () => run(ctx, 'playback.step', { deltaTime: 2 }),
    'INVALID_ARGS',
  );
  const result = run(ctx, 'playback.step', { deltaTime: 1 / 30 });
  assert.deepEqual(calls, [['step', 1 / 30]]);
  assert.deepEqual(result.data, {
    mode: 'pause',
    frame: undefined,
    deltaTime: 1 / 30,
  });
});
