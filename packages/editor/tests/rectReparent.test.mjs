// Author: MiYu
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nearRect = (actual, expected) => {
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-7, `${key}: ${actual[key]} != ${expected[key]}`);
};

test('UI reparent preserves screen rects, stretched anchors, descendants, and undo in a scaled Canvas', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { defaultRectTransform } = await server.ssrLoadModule('/src/ui/rectLayout.ts');
    const { layoutUiOverlay } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
    for (const stretched of [false, true]) {
      const store = createEditorStore();
      const canvas = store.createGameObject('Canvas', {
        Canvas: { render_mode: 'ScreenSpaceOverlay' }, CanvasScaler: { ui_scale_mode: 'ConstantPixelSize', scale_factor: 2 },
        RectTransform: defaultRectTransform({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
      });
      const a = store.createGameObject('A', { RectTransform: defaultRectTransform({ anchored_position: [-100, 60], size_delta: [200, 160] }) }, canvas);
      const b = store.createGameObject('B', { RectTransform: defaultRectTransform({ anchored_position: [200, -80], size_delta: [400, 250], local_scale: [1.3, 0.8] }) }, canvas);
      const childRect = defaultRectTransform({
        anchor_min: stretched ? [0.1, 0.2] : [0.5, 0.5], anchor_max: stretched ? [0.9, 0.8] : [0.5, 0.5],
        anchored_position: [10, -20], size_delta: [60, 40], pivot: [0.2, 0.8], local_scale: [-0.5, 2], local_rotation: 25,
      });
      const child = store.createGameObject('Child', { RectTransform: childRect }, a);
      const descendant = store.createGameObject('Descendant', { RectTransform: defaultRectTransform({ anchored_position: [7, 9] }) }, child);
      const ids = new Set([child, descendant]);
      const layout = () => new Map(layoutUiOverlay(store.snapshot().entities, { x: 0, y: 0, w: 1920, h: 1080 }, ids).filter(item => ids.has(item.entity)).map(item => [item.entity, item.rect]));
      const before = layout();
      assert.equal(before.size, 2);
      assert.equal(store.setParent([child, descendant], b), true);
      for (const id of ids) nearRect(layout().get(id), before.get(id));
      const moved = store.snapshot().entities.find(entity => entity.entity === child);
      assert.equal(moved.parent, b);
      assert.deepEqual(moved.components.RectTransform.anchor_min, childRect.anchor_min);
      assert.deepEqual(moved.components.RectTransform.local_scale, childRect.local_scale);
      assert.equal(moved.components.RectTransform.local_rotation, 25);
      assert.equal(store.undo(), true);
      assert.equal(store.snapshot().entities.find(entity => entity.entity === child).parent, a);
      for (const id of ids) nearRect(layout().get(id), before.get(id));
      assert.equal(store.redo(), true);
      for (const id of ids) nearRect(layout().get(id), before.get(id));
      const authored = structuredClone(store.authoredEntities());
      store.play();
      assert.equal(store.setParent([child], a), true);
      for (const id of ids) nearRect(layout().get(id), before.get(id));
      store.stop();
      assert.deepEqual(store.snapshot().entities, authored);
    }
  } finally {
    await server.close();
  }
});

test('LayoutGroup owns participating children while ignored children retain their visual rectangle', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { defaultRectTransform } = await server.ssrLoadModule('/src/ui/rectLayout.ts');
    const { layoutUiOverlay } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
    const store = createEditorStore();
    const canvas = store.createGameObject('Canvas', { Canvas: {}, RectTransform: defaultRectTransform({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }) });
    const free = store.createGameObject('Free', { RectTransform: defaultRectTransform({ anchored_position: [-300, 0], size_delta: [200, 200] }) }, canvas);
    const group = store.createGameObject('Layout', { RectTransform: defaultRectTransform({ size_delta: [400, 200] }), LayoutGroup: { direction: 'Horizontal', child_control_width: true, child_control_height: true } }, canvas);
    const first = store.createGameObject('First', { RectTransform: defaultRectTransform() }, group);
    const child = store.createGameObject('Child', { RectTransform: defaultRectTransform({ anchored_position: [17, 31] }) }, free);
    const ignored = store.createGameObject('Ignored', { RectTransform: defaultRectTransform({ anchored_position: [27, 41] }), LayoutElement: { ignore_layout: true } }, free);
    const authored = structuredClone(store.snapshot().entities.find(entity => entity.entity === child).components.RectTransform);
    const rect = id => layoutUiOverlay(store.snapshot().entities, { x: 0, y: 0, w: 1920, h: 1080 }, new Set([id])).find(item => item.entity === id).rect;
    const ignoredBefore = rect(ignored);
    assert.equal(store.setParent([child, ignored], group, 0), true);
    assert.deepEqual(store.snapshot().entities.find(entity => entity.entity === child).components.RectTransform, authored);
    assert.ok(rect(child).x < rect(first).x);
    nearRect(rect(ignored), ignoredBefore);
    const drivenBefore = rect(child);
    assert.equal(store.setParent([child], free), true);
    nearRect(rect(child), drivenBefore);
  } finally {
    await server.close();
  }
});
