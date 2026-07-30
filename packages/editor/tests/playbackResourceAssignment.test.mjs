import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runtime-only Animator and TimelineDirector bindings can switch assets', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const entity = store.createGameObject('Runtime Resource Bindings', {
      Transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    });
    assert.notEqual(entity, null);
    store.play();

    assert.equal(store.addComponent(entity, 'Animator', {
      controller: 'Assets/Animators/First.controller',
      playing: true,
    }), true);
    assert.equal(store.addComponent(entity, 'TimelineDirector', {
      asset: 'Assets/Timelines/First.timeline',
      bindings_json: '{"old":1}',
      playing: true,
    }), true);

    const active = store.snapshot().entities
      .find((candidate) => candidate.entity === entity);
    assert.notEqual(active.components.Animator, undefined);
    assert.notEqual(active.components.TimelineDirector, undefined);
    store.patchComponent(entity, 'Animator', {
      controller: 'Assets/Animators/Second.controller',
    });
    store.patchComponent(entity, 'TimelineDirector', {
      asset: 'Assets/Timelines/Second.timeline',
      bindings_json: '{}',
    });

    const switched = store.snapshot().entities
      .find((candidate) => candidate.entity === entity);
    assert.equal(
      switched.components.Animator.controller,
      'Assets/Animators/Second.controller',
    );
    assert.equal(
      switched.components.TimelineDirector.asset,
      'Assets/Timelines/Second.timeline',
    );
    assert.equal(switched.components.TimelineDirector.bindings_json, '{}');
    assert.deepEqual(
      store.authoredEntities().find((candidate) => candidate.entity === entity).components,
      {
        Transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    );

    store.stop();
    assert.deepEqual(
      store.snapshot().entities.find((candidate) => candidate.entity === entity).components,
      {
        Transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    );
  } finally {
    await server.close();
  }
});

test('resource assignment callbacks inspect active rather than authored components', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  for (const [callback, nextCallback] of [
    ['onAssignDirector', 'onPatchDirector'],
    ['onAssignAnimator', 'onPatchAnimator'],
  ]) {
    const start = app.indexOf(`${callback}={(entity, path) => {`);
    const end = app.indexOf(`${nextCallback}=`, start);
    assert.notEqual(start, -1, callback);
    assert.notEqual(end, -1, nextCallback);
    const handler = app.slice(start, end);
    assert.match(handler, /store\.snapshot\(\)\.entities/, callback);
    assert.doesNotMatch(handler, /store\.authoredEntities\(\)/, callback);
  }
});
