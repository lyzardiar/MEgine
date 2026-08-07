import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import {
  PARTICLE_2D_PRESET_KINDS,
  createParticleEmitter2DPreset,
} from '../src/particles/particlePresets.ts';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('2D particle presets cover common effects with valid bounded defaults', () => {
  assert.deepEqual(PARTICLE_2D_PRESET_KINDS, [
    'fire', 'smoke', 'spark_burst', 'magic_aura', 'snow',
  ]);
  for (const kind of PARTICLE_2D_PRESET_KINDS) {
    const first = createParticleEmitter2DPreset(kind);
    assert.deepEqual(createParticleEmitter2DPreset(kind), first);
    assert.ok(first.name.length > 0);
    assert.equal(first.component.playing, true);
    assert.equal(first.component.sorting_layer, 'default');
    assert.ok(first.component.max_particles <= 1000);
    assert.ok(first.component.lifetime_min <= first.component.lifetime_max);
    assert.ok(first.component.speed_min <= first.component.speed_max);
  }
  assert.equal(createParticleEmitter2DPreset('spark_burst').component.rate_over_time, 0);
  assert.equal(createParticleEmitter2DPreset('spark_burst').component.burst_count, 32);
  assert.equal(createParticleEmitter2DPreset('magic_aura').component.simulation_space, 'local');
  assert.equal(createParticleEmitter2DPreset('snow').component.shape, 'box');
});

test('store creates particle presets and trails as one Undo operation', async () => {
  const server = await createServer({
    root: editorRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    for (const kind of PARTICLE_2D_PRESET_KINDS) {
      const store = createEditorStore();
      const before = store.authoredEntities().map((entity) => entity.entity);
      const entity = store.spawnParticleEmitter2DPreset(kind);
      assert.equal(store.selected, entity);
      assert.equal(store.authoredEntities().length, before.length + 1);
      assert.ok(store.authoredEntities().find((item) => item.entity === entity).components.ParticleEmitter2D);
      assert.equal(store.undo(), true);
      assert.deepEqual(store.authoredEntities().map((item) => item.entity), before);
    }

    const store = createEditorStore();
    const before = store.authoredEntities().map((entity) => entity.entity);
    const trailEntity = store.spawnTrailRenderer2D();
    assert.equal(store.selected, trailEntity);
    assert.ok(store.authoredEntities().find((item) => item.entity === trailEntity).components.TrailRenderer2D);
    assert.equal(store.undo(), true);
    assert.deepEqual(store.authoredEntities().map((item) => item.entity), before);
  } finally {
    await server.close();
  }
});
