import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { buildEffekseerCompositionPlan } from '../src/effekseerComposition.ts';

const lightning = 'Assets/Effects/ef_lightning01.efkefc';
const hit = 'Assets/Effects/ef_parts_hit01.efkefc';
const assets = new Set([lightning, hit]);
const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Effekseer composition creates bounded world component layers', () => {
  const plan = buildEffekseerCompositionPlan({
    name: 'Thunder Column',
    mode: 'world',
    layers: [
      { effect: lightning, position: [1, 2, 3], scale: [2, 3, 2], speed: 0.8, prewarm: true },
      { effect: hit, startFrame: 3, sortingOrder: 4 },
    ],
  }, assets);
  assert.equal(plan.mode, 'world');
  assert.equal(plan.layers.length, 2);
  assert.deepEqual(plan.layers[0].components.Transform.position, [1, 2, 3]);
  assert.deepEqual(plan.layers[0].components.Transform.scale, [2, 3, 2]);
  assert.equal(plan.layers[0].components.EffekseerEffect.effect, lightning);
  assert.equal(plan.layers[0].components.EffekseerEffect.prewarm, true);
});

test('Effekseer screen composition uses RectTransform instead of scale transforms', () => {
  const plan = buildEffekseerCompositionPlan({
    name: 'UI Hit',
    mode: 'screen',
    layers: [{
      effect: hit,
      anchoredPosition: [120, -40],
      size: [280, 220],
      screenScale: 0.4,
      sortingOrder: 20,
    }],
  }, assets);
  assert.ok(plan.rootComponents.RectTransform);
  assert.equal(plan.layers[0].components.Transform, undefined);
  assert.deepEqual(plan.layers[0].components.RectTransform.anchored_position, [120, -40]);
  assert.deepEqual(plan.layers[0].components.RectTransform.size_delta, [280, 220]);
  assert.equal(plan.layers[0].components.EffekseerEffect.render_mode, 'screen');
});

test('Effekseer composition refuses missing binary assets', () => {
  assert.throws(() => buildEffekseerCompositionPlan({
    name: 'Bad',
    mode: 'world',
    layers: [{ effect: 'Assets/Effects/missing.efkefc' }],
  }, assets), /not an indexed Effekseer asset/);
});

test('store lands a Canvas Effekseer composition as one Undo transaction', async () => {
  const server = await createServer({
    root: editorRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const beforeCount = store.authoredEntities().length;
    const plan = buildEffekseerCompositionPlan({
      name: 'Agent UI Hit',
      mode: 'screen',
      layers: [{ effect: hit }, { effect: lightning, anchoredPosition: [30, 0] }],
    }, assets);
    const result = store.composeEffekseer(plan);
    assert.equal(result.created.length, 3);
    const entities = store.authoredEntities();
    const root = entities.find((entity) => entity.entity === result.root);
    const canvas = entities.find((entity) => entity.entity === root.parent);
    const children = entities.filter((entity) => entity.parent === root.entity);
    assert.ok(canvas.components.Canvas);
    assert.equal(children.length, 2);
    assert.equal(store.undoLabel, 'Compose Effekseer: Agent UI Hit');
    assert.equal(store.undo(), true);
    assert.equal(store.authoredEntities().length, beforeCount);
  } finally {
    await server.close();
  }
});
