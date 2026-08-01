import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRENT_SCENE_VERSION,
  migrateSceneDocument,
} from '../src/sceneMigration.ts';

const scene = (version, components) => ({
  version,
  name: 'Canvas',
  world: {
    entities: [{ entity: 1, components }],
  },
});

test('scene v1 migration preserves legacy Canvas input through an explicit GraphicRaycaster', () => {
  const document = migrateSceneDocument(scene(1, {
    Canvas: {},
    RectMask2D: { padding: [1, 2, 3, 4] },
  }));
  assert.equal(document.version, CURRENT_SCENE_VERSION);
  assert.deepEqual(document.world.entities[0].components.GraphicRaycaster, {
    enabled: true,
    ignore_reversed_graphics: true,
    blocking_objects: 'None',
    blocking_mask: -1,
  });
  assert.deepEqual(document.world.entities[0].components.RectMask2D.padding, [1, 4, 3, 2]);
});

test('scene v2 preserves raycaster intent while migrating RectMask2D padding', () => {
  const removed = migrateSceneDocument(scene(2, {
    Canvas: {},
    RectMask2D: { padding: [10, 20, 30, 40] },
  }));
  assert.equal(removed.world.entities[0].components.GraphicRaycaster, undefined);
  assert.deepEqual(removed.world.entities[0].components.RectMask2D.padding, [10, 40, 30, 20]);

  const disabled = migrateSceneDocument(scene(2, {
    Canvas: {},
    GraphicRaycaster: { enabled: false },
  }));
  assert.deepEqual(disabled.world.entities[0].components.GraphicRaycaster, { enabled: false });
});

test('scene v3 preserves Unity-order RectMask2D padding without remigrating it', () => {
  const document = migrateSceneDocument(scene(3, {
    RectMask2D: { padding: [1, 2, 3, 4] },
  }));
  assert.deepEqual(document.world.entities[0].components.RectMask2D.padding, [1, 2, 3, 4]);
});

test('scene migration rejects versions newer than the editor understands', () => {
  assert.throws(() => migrateSceneDocument(scene(4, {})), /Unsupported scene version 4/);
});
