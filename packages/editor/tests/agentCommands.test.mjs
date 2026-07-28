import assert from 'node:assert/strict';
import test from 'node:test';
import { TEST_BEHAVIOUR_TYPE } from './testBehaviourFixture.mjs';
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
        [TEST_BEHAVIOUR_TYPE]: { axis: [0, 1, 0], angle: 10, speed: 2 },
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
    sceneCamera: { yaw: 35, pitch: 25, distance: 8, pivot: [0, 0.5, 0] },
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
      const [ids, parent, index] = args;
      for (const id of ids) {
        const entity = entities.find((candidate) => candidate.entity === id);
        if (entity) {
          entity.parent = parent;
          if (index !== undefined) entity.siblingIndex = index;
        }
      }
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
    invokeBehaviourMethod: (entity, type, method) => {
      calls.push(['invokeBehaviourMethod', entity, type, method]);
      if (type === TEST_BEHAVIOUR_TYPE && method === 'resetAngle') {
        entities[0].components[TEST_BEHAVIOUR_TYPE] = {
          axis: [0, 1, 0],
          angle: 90,
          speed: 1,
        };
      }
    },
    applyCommands: (commands) => {
      calls.push(['applyCommands', commands]);
      for (const command of commands) {
        if (command.op === 'spawn') {
          const entity = Math.max(0, ...entities.map((candidate) => candidate.entity)) + 1;
          entities.push({
            entity,
            name: command.name ?? 'GameObject',
            parent: null,
            siblingIndex: entities.filter((candidate) => candidate.parent == null).length,
            active: true,
            components: structuredClone(command.components),
          });
        } else if (command.op === 'despawn') {
          const remove = new Set([command.entity]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const candidate of entities) {
              if (candidate.parent != null && remove.has(candidate.parent) && !remove.has(candidate.entity)) {
                remove.add(candidate.entity);
                changed = true;
              }
            }
          }
          for (let index = entities.length - 1; index >= 0; index -= 1) {
            if (remove.has(entities[index].entity)) entities.splice(index, 1);
          }
        } else if (command.op === 'setComponent') {
          entities.find((candidate) => candidate.entity === command.entity)
            .components[command.component] = structuredClone(command.value);
        } else if (command.op === 'removeComponent') {
          delete entities.find((candidate) => candidate.entity === command.entity)
            .components[command.component];
        } else if (command.op === 'setParent') {
          entities.find((candidate) => candidate.entity === command.entity).parent =
            command.parent ?? null;
        }
      }
      return true;
    },
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
    setSceneCamera: (partial) => {
      calls.push(['setSceneCamera', partial]);
      store.sceneCamera = {
        ...store.sceneCamera,
        ...partial,
        pivot: partial.pivot ? [...partial.pivot] : store.sceneCamera.pivot,
      };
      store.sceneCamera.pitch = Math.max(-89, Math.min(89, store.sceneCamera.pitch));
      store.sceneCamera.distance = Math.max(0.5, Math.min(200, store.sceneCamera.distance));
    },
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

test('typed creation returns the selected authored object for composite spawns', () => {
  const { ctx, calls, entities } = createContext();
  ctx.store.spawnUiTabView = () => {
    entities.push(
      {
        entity: 3,
        name: 'Canvas',
        parent: null,
        siblingIndex: 2,
        active: true,
        components: { Canvas: {} },
      },
      {
        entity: 4,
        name: 'Tab View',
        parent: 3,
        siblingIndex: 0,
        active: true,
        components: { TabView: {} },
      },
    );
    ctx.store.selected = 4;
    ctx.store.selectedIds = [4];
  };
  ctx.store.select = (id) => {
    calls.push(['select', id]);
    ctx.store.selected = id;
    ctx.store.selectedIds = [id];
  };

  const result = run(ctx, 'entity.create_typed', { kind: 'ui_tab_view' });

  assert.deepEqual(result.data, { entity: 4, kind: 'ui_tab_view' });
  assert.deepEqual(calls, [['select', 4]]);
});

test('typed cube creation uses the root GameObject path instead of selected-child creation', () => {
  const { ctx, calls, entities } = createContext();
  ctx.store.spawnPrefab = (name) => {
    calls.push(['spawnPrefab', name]);
    entities.push({
      entity: 3,
      name,
      parent: null,
      siblingIndex: 2,
      active: true,
      components: { MeshRenderer: { mesh: 'cube' } },
    });
    ctx.store.selected = 3;
    ctx.store.selectedIds = [3];
  };
  ctx.store.select = (id) => {
    calls.push(['select', id]);
    ctx.store.selected = id;
    ctx.store.selectedIds = [id];
  };

  const result = run(ctx, 'entity.create_typed', { kind: 'cube' });

  assert.deepEqual(result.data, { entity: 3, kind: 'cube' });
  assert.deepEqual(calls, [['spawnPrefab', 'Cube'], ['select', 3]]);
  assert.equal(entities.at(-1).parent, null);
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

test('component add uses catalog defaults unless a custom value is explicit', () => {
  const { ctx, calls } = createContext();

  run(ctx, 'component.add', { entity: 1, type: 'Camera2D' });
  assert.deepEqual(calls, [[
    'addComponent',
    1,
    'Camera2D',
    {
      size: 5,
      primary: false,
      clear_flags: 'solid_color',
      background_color: [0.1, 0.1, 0.14, 1],
    },
  ]]);

  assertBridgeError(
    () => run(ctx, 'component.add', { entity: 1, type: 'CustomComponent' }),
    'COMPONENT_NOT_FOUND',
  );
  run(ctx, 'component.add', {
    entity: 1,
    type: 'CustomComponent',
    value: { enabled: true },
  });
  assert.deepEqual(calls.at(-1), [
    'addComponent',
    1,
    'CustomComponent',
    { enabled: true },
  ]);
});

test('component method invocation accepts only registered Behaviour methods', () => {
  const { ctx, calls } = createContext();

  assertBridgeError(
    () => run(ctx, 'component.invoke', {
      entity: 1,
      type: 'MeshRenderer',
      method: 'reset',
    }),
    'COMPONENT_NOT_FOUND',
  );
  assertBridgeError(
    () => run(ctx, 'component.invoke', {
      entity: 1,
      type: TEST_BEHAVIOUR_TYPE,
      method: 'missing',
    }),
    'INVALID_ARGS',
  );
  assert.deepEqual(calls, []);

  const result = run(ctx, 'component.invoke', {
    entity: 1,
    type: TEST_BEHAVIOUR_TYPE,
    method: 'resetAngle',
  });
  assert.deepEqual(calls, [
    ['invokeBehaviourMethod', 1, TEST_BEHAVIOUR_TYPE, 'resetAngle'],
  ]);
  assert.deepEqual(result.data, {
    entity: 1,
    component: TEST_BEHAVIOUR_TYPE,
    method: 'resetAngle',
    value: { axis: [0, 1, 0], angle: 90, speed: 1 },
  });
});

test('world command batches validate completely before one atomic store call', () => {
  const { ctx, calls, entities } = createContext();

  assertBridgeError(
    () => run(ctx, 'batch.apply', {
      commands: [
        { op: 'setParent', entity: 1, parent: 2 },
        { op: 'setParent', entity: 2, parent: 1 },
      ],
    }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'batch.apply', {
      commands: [
        { op: 'removeComponent', entity: 1, component: 'Transform' },
      ],
    }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'batch.apply', {
      commands: [
        { op: 'despawn', entity: 2 },
        { op: 'setComponent', entity: 2, component: 'Light', value: {} },
      ],
    }),
    'ENTITY_NOT_FOUND',
  );
  assert.deepEqual(calls, []);

  const result = run(ctx, 'batch.apply', {
    commands: [
      {
        op: 'setComponent',
        entity: 1,
        component: 'MeshRenderer',
        value: { mesh: 'sphere', material: 'default' },
      },
      { op: 'removeComponent', entity: 1, component: 'MeshRenderer' },
      { op: 'setParent', entity: 2, parent: 1 },
      {
        op: 'spawn',
        name: 'Batch Camera',
        components: {
          Transform: {
            position: [0, 2, 5],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
          Camera3D: { primary: false },
        },
      },
      { op: 'setClearColor', r: 0.1, g: 0.2, b: 0.3, a: 1 },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'applyCommands');
  assert.equal(calls[0][1].length, 5);
  assert.deepEqual(result.data, {
    commandCount: 5,
    entityCount: 3,
    created: [3],
    removed: [],
  });
  assert.equal(entities[1].parent, 1);
  assert.equal(entities[0].components.MeshRenderer, undefined);
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

test('relative translation, sibling reorder, and Scene camera control use native store paths', () => {
  const { ctx, calls, entities } = createContext();

  const translated = run(ctx, 'transform.translate', {
    entity: 1,
    delta: [2, -1, 4],
  });
  assert.deepEqual(translated.data.transform.position, [2, -1, 4]);
  assert.deepEqual(calls[0], [
    'setTransform',
    1,
    {
      position: [2, -1, 4],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
  ]);

  const reordered = run(ctx, 'entity.reorder', { id: 2, index: 0 });
  assert.equal(reordered.data.siblingIndex, 0);
  assert.equal(reordered.data.changed, true);
  assert.deepEqual(calls[1], ['setParent', [2], null, 0]);
  assert.equal(entities[1].siblingIndex, 0);

  const camera = run(ctx, 'view.set_camera', {
    yaw: 120,
    pitch: 100,
    distance: 0.1,
    pivot: [3, 2, 1],
  });
  assert.deepEqual(calls[2], [
    'setSceneCamera',
    { yaw: 120, pitch: 100, distance: 0.1, pivot: [3, 2, 1] },
  ]);
  assert.deepEqual(camera.data.sceneCamera, {
    yaw: 120,
    pitch: 89,
    distance: 0.5,
    pivot: [3, 2, 1],
  });

  assertBridgeError(
    () => run(ctx, 'view.set_camera', { yaw: Number.NaN }),
    'INVALID_ARGS',
  );
  assertBridgeError(
    () => run(ctx, 'transform.translate', { entity: 1, delta: [0, 1] }),
    'INVALID_ARGS',
  );
  assert.equal(calls.length, 3);
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
