import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import {
  GAME_UI_TEMPLATE_KINDS,
  createGameUiTemplate,
} from '../src/ui/gameUiTemplates.ts';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('game UI templates are deterministic, responsive hierarchies with bounded depth', () => {
  for (const kind of GAME_UI_TEMPLATE_KINDS) {
    const first = createGameUiTemplate(kind);
    const second = createGameUiTemplate(kind);
    assert.deepEqual(second, first);
    assert.equal(first.nodes[0].parent, null);
    assert.ok(first.nodes.length >= 15 && first.nodes.length <= 40);

    for (let index = 0; index < first.nodes.length; index += 1) {
      const node = first.nodes[index];
      if (node.parent != null) assert.ok(node.parent >= 0 && node.parent < index);
      const rt = node.components.RectTransform;
      assert.ok(rt, `${kind}/${node.name} needs RectTransform`);
      assert.deepEqual(rt.local_scale, [1, 1]);
    }

    const rootRect = first.nodes[0].components.RectTransform;
    assert.deepEqual(rootRect.anchor_min, [0.04, 0.06]);
    assert.deepEqual(rootRect.anchor_max, [0.96, 0.94]);
  }
});

test('templates exercise the layout components used by their authored screen', () => {
  const directions = (kind) => new Set(
    createGameUiTemplate(kind).nodes
      .map((node) => node.components.LayoutGroup?.direction)
      .filter(Boolean),
  );
  assert.deepEqual(directions('inventory'), new Set(['Vertical', 'Grid', 'Horizontal']));
  assert.deepEqual(directions('leaderboard'), new Set(['Horizontal', 'Vertical']));
  assert.deepEqual(directions('shop'), new Set(['Horizontal', 'Grid']));
});

test('store creates each game UI screen and its implicit Canvas in one Undo transaction', async () => {
  const server = await createServer({
    root: editorRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    for (const kind of GAME_UI_TEMPLATE_KINDS) {
      const store = createEditorStore();
      const before = store.snapshot().entities.map((entity) => entity.entity);
      const template = createGameUiTemplate(kind);
      const root = store.spawnGameUiTemplate(kind);
      assert.notEqual(root, null);
      assert.equal(store.selected, root);
      assert.equal(store.undoLabel, `Create ${template.label}`);
      assert.equal(
        store.authoredEntities().filter((entity) => entity.components.Canvas).length,
        1,
      );
      assert.equal(
        store.authoredEntities().filter((entity) => entity.entity === root)[0].name,
        template.label,
      );
      assert.equal(store.undo(), true);
      assert.deepEqual(store.snapshot().entities.map((entity) => entity.entity), before);
    }

    const nestedStore = createEditorStore();
    const button = nestedStore.spawnUiButton();
    const canvas = nestedStore.authoredEntities().find((entity) => entity.components.Canvas);
    assert.ok(canvas);
    assert.equal(nestedStore.selected, button);
    const root = nestedStore.spawnGameUiTemplate('inventory');
    assert.equal(
      nestedStore.authoredEntities().find((entity) => entity.entity === root).parent,
      canvas.entity,
      'full-screen templates should attach to the selected UI tree Canvas',
    );
  } finally {
    await server.close();
  }
});
