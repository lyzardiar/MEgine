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
  const document = migrateSceneDocument(scene(1, { Canvas: {} }));
  assert.equal(document.version, CURRENT_SCENE_VERSION);
  assert.deepEqual(document.world.entities[0].components.GraphicRaycaster, {
    enabled: true,
    ignore_reversed_graphics: true,
    blocking_objects: 'None',
    blocking_mask: -1,
  });
});

test('scene v2 preserves intentional GraphicRaycaster removal and disablement', () => {
  const removed = migrateSceneDocument(scene(2, { Canvas: {} }));
  assert.equal(removed.world.entities[0].components.GraphicRaycaster, undefined);

  const disabled = migrateSceneDocument(scene(2, {
    Canvas: {},
    GraphicRaycaster: { enabled: false },
  }));
  assert.deepEqual(disabled.world.entities[0].components.GraphicRaycaster, { enabled: false });
});

test('scene migration rejects versions newer than the editor understands', () => {
  assert.throws(() => migrateSceneDocument(scene(3, {})), /Unsupported scene version 3/);
});
