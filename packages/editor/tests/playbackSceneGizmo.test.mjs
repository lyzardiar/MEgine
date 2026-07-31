import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const transform = (position) => ({
  position,
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});

test('Play-mode multi-selection gizmos resolve roots from the live hierarchy', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { buildWorldTransforms } = await server.ssrLoadModule('/src/worldTransform.ts');
    const store = createEditorStore();
    const parent = store.createGameObject('Live Parent', {
      Transform: transform([10, 0, 0]),
    });
    const child = store.createGameObject('Live Child', {
      Transform: transform([1, 0, 0]),
    });
    assert.notEqual(parent, null);
    assert.notEqual(child, null);
    assert.equal(store.setParent([child], parent), true);
    store.selectMany([parent, child], 'replace', parent);
    store.play();

    assert.equal(store.setParent([child], null), true);
    const before = buildWorldTransforms(store.snapshot().entities);
    const parentBefore = before.get(parent).transform.position[0];
    const childBefore = before.get(child).transform.position[0];
    store.translateSelectedTransformsBy(parent, [3, 0, 0]);
    const after = buildWorldTransforms(store.snapshot().entities);
    assert.equal(after.get(parent).transform.position[0] - parentBefore, 3);
    assert.equal(after.get(child).transform.position[0] - childBefore, 3);

    const authored = buildWorldTransforms(store.authoredEntities());
    assert.equal(authored.get(parent).transform.position[0], 10);
    assert.equal(authored.get(child).transform.position[0], 1);
    store.stop();
    const restored = buildWorldTransforms(store.snapshot().entities);
    assert.equal(restored.get(parent).transform.position[0], 10);
    assert.equal(restored.get(child).transform.position[0], 1);
  } finally {
    await server.close();
  }
});

test('Play-mode RectTransform nudge and alignment affect only live roots', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const first = store.createGameObject('Live Rect A', {
      RectTransform: { anchored_position: [1, 2] },
    });
    const second = store.createGameObject('Live Rect B', {
      RectTransform: { anchored_position: [10, 20] },
    });
    assert.notEqual(first, null);
    assert.notEqual(second, null);
    store.selectMany([first, second], 'replace', first);
    store.play();

    assert.equal(store.nudgeSelectedRects(2, 3), true);
    assert.equal(store.applySelectedRectDeltas([
      { entity: first, dx: 5, dy: 0 },
      { entity: second, dx: -5, dy: 0 },
    ]), true);
    const live = store.snapshot().entities;
    assert.deepEqual(live.find((entity) => entity.entity === first)
      .components.RectTransform.anchored_position, [8, -1]);
    assert.deepEqual(live.find((entity) => entity.entity === second)
      .components.RectTransform.anchored_position, [7, 17]);
    assert.deepEqual(store.authoredEntities().find((entity) => entity.entity === first)
      .components.RectTransform.anchored_position, [1, 2]);

    store.stop();
    const restored = store.snapshot().entities;
    assert.deepEqual(restored.find((entity) => entity.entity === first)
      .components.RectTransform.anchored_position, [1, 2]);
    assert.deepEqual(restored.find((entity) => entity.entity === second)
      .components.RectTransform.anchored_position, [10, 20]);
  } finally {
    await server.close();
  }
});

test('Scene transform gizmos and RectTransform keyboard nudge remain available in Play', () => {
  const viewport = fs.readFileSync(
    path.join(root, 'src', 'panels', 'Viewport.tsx'),
    'utf8',
  );
  const gizmoBlock = viewport.slice(
    viewport.indexOf('// Transform gizmo'),
    viewport.indexOf('// Unity-style LineRenderer point handles'),
  );
  assert.match(gizmoBlock, /if \(!isGame && p\.selected != null\) \{/);
  assert.doesNotMatch(
    gizmoBlock,
    /p\.playing/,
  );
  const arrowHandler = viewport.slice(
    viewport.indexOf('if (isSceneCanvas && isArrow) {'),
    viewport.indexOf("if (ev.key === 'f'", viewport.indexOf('if (isSceneCanvas && isArrow) {')),
  );
  assert.doesNotMatch(arrowHandler, /playing/);
});
