import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { buildFigmaUiImportPlan } from '../src/ui/figmaImport.ts';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source() {
  return {
    schemaVersion: 1,
    fileKey: 'AbCdEf123456',
    fileName: 'HUD',
    version: '42',
    rootId: '1:1',
    rootName: 'Phone HUD',
    nodes: [
      {
        id: '1:1',
        parentId: null,
        name: 'Phone HUD',
        type: 'FRAME',
        bounds: { x: 100, y: 200, width: 400, height: 800 },
        fillColor: [0.05, 0.06, 0.08, 1],
        layout: {
          mode: 'VERTICAL',
          wrap: 'NO_WRAP',
          itemSpacing: 12,
          paddingLeft: 24,
          paddingRight: 28,
          paddingTop: 20,
          paddingBottom: 32,
          primaryAlign: 'MIN',
          counterAlign: 'CENTER',
          sizingHorizontal: 'FIXED',
          sizingVertical: 'FIXED',
        },
      },
      {
        id: '1:2',
        parentId: '1:1',
        name: 'Title',
        type: 'TEXT',
        bounds: { x: 124, y: 220, width: 352, height: 48 },
        fillColor: [1, 0.9, 0.6, 1],
        characters: 'Start Game',
        textStyle: {
          fontSize: 24,
          fontWeight: 700,
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER',
          lineHeightPx: 30,
        },
        constraints: { horizontal: 'LEFT_RIGHT', vertical: 'TOP' },
        layout: { mode: 'NONE', sizingHorizontal: 'FILL', sizingVertical: 'FIXED' },
      },
      {
        id: '1:3',
        parentId: '1:1',
        name: 'Primary Button',
        type: 'INSTANCE',
        componentId: '9:9',
        bounds: { x: 124, y: 292, width: 352, height: 56 },
        fillColor: [0.2, 0.5, 0.95, 1],
        layout: { mode: 'NONE', sizingHorizontal: 'FILL', sizingVertical: 'FIXED' },
      },
      {
        id: '1:4',
        parentId: '1:3',
        name: 'Button Label',
        type: 'TEXT',
        bounds: { x: 224, y: 308, width: 152, height: 24 },
        characters: 'Play',
        fillColor: [1, 1, 1, 1],
        textStyle: { fontSize: 18 },
        layout: { mode: 'NONE' },
      },
      {
        id: '1:5',
        parentId: '1:1',
        name: 'Hero Icon',
        type: 'VECTOR',
        bounds: { x: 252, y: 380, width: 96, height: 96 },
        requiresRasterization: true,
        rasterizeReason: 'Figma vector geometry',
        layout: { mode: 'NONE' },
      },
    ],
  };
}

test('Figma import maps auto layout, text, stable component ids, and raster assets', () => {
  const plan = buildFigmaUiImportPlan(source(), {
    componentMappings: { '9:9': 'button' },
  });

  assert.equal(plan.readyToImport, true);
  assert.match(plan.planRevision, /^figma-plan-v1-[0-9a-f]{16}$/u);
  assert.deepEqual(plan.nodes.map((node) => node.sourceNodeId), ['1:1', '1:2', '1:3', '1:5']);
  assert.deepEqual(plan.assets.map((asset) => asset.nodeId), ['1:5']);
  assert.ok(plan.diagnostics.some((entry) => entry.code === 'ASSET_REQUIRED'));

  const root = plan.nodes[0];
  assert.equal(root.components.LayoutGroup.direction, 'Vertical');
  assert.deepEqual(root.components.LayoutGroup.padding, [24, 20, 28, 32]);
  assert.deepEqual(root.components.RectTransform.size_delta, [400, 800]);

  const text = plan.nodes.find((node) => node.sourceNodeId === '1:2');
  assert.equal(text.components.Text.text, 'Start Game');
  assert.equal(text.components.Text.font_style, 'Bold');
  assert.equal(text.components.Text.alignment, 'Center');
  assert.deepEqual(text.components.RectTransform.anchor_min, [0, 1]);
  assert.deepEqual(text.components.RectTransform.anchor_max, [1, 1]);
  assert.equal(text.components.LayoutElement.flexible_width, 1);

  const button = plan.nodes.find((node) => node.sourceNodeId === '1:3');
  assert.equal(button.kind, 'button');
  assert.equal(button.components.Button.label, 'Play');
});

test('unmapped instances remain editable visual hierarchies and report the missing semantic mapping', () => {
  const plan = buildFigmaUiImportPlan(source());
  assert.ok(plan.nodes.some((node) => node.sourceNodeId === '1:4'));
  assert.ok(plan.diagnostics.some((entry) => (
    entry.code === 'UNMAPPED_COMPONENT' && entry.nodeId === '1:3'
  )));
});

test('landed asset paths remove preview-only requirements without changing the plan revision', () => {
  const preview = buildFigmaUiImportPlan(source(), { componentMappings: { '9:9': 'button' } });
  const landed = buildFigmaUiImportPlan(source(), {
    componentMappings: { '9:9': 'button' },
    assetPaths: { '1:5': 'Assets/Figma/HUD/1-5.png' },
  });
  assert.equal(landed.planRevision, preview.planRevision);
  assert.equal(landed.diagnostics.some((entry) => entry.code === 'ASSET_REQUIRED'), false);
  const icon = landed.nodes.find((node) => node.sourceNodeId === '1:5');
  assert.equal(icon.components.RawImage.texture, 'Assets/Figma/HUD/1-5.png');
});

test('node limits are deterministic and never exceed the requested cap', () => {
  const plan = buildFigmaUiImportPlan(source(), { maxNodes: 2 });
  assert.equal(plan.nodes.length, 2);
  assert.ok(plan.diagnostics.some((entry) => entry.code === 'TRUNCATED_NODE_LIMIT'));
});

test('store lands a complete Figma hierarchy and its implicit Canvas in one Undo step', async () => {
  const server = await createServer({
    root: editorRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const before = store.snapshot().entities.map((entity) => entity.entity);
    const plan = buildFigmaUiImportPlan(source(), {
      componentMappings: { '9:9': 'button' },
      assetPaths: { '1:5': 'Assets/Figma/HUD/1-5.png' },
    });
    const imported = store.importFigmaUiPlan(plan);
    assert.ok(imported);
    assert.equal(imported.created.length, plan.nodes.length);
    assert.equal(store.selected, imported.root);
    assert.equal(store.snapshot().entities.some((entity) => entity.components.Canvas), true);
    assert.equal(store.canUndo, true);

    store.undo();
    assert.deepEqual(store.snapshot().entities.map((entity) => entity.entity), before);
  } finally {
    await server.close();
  }
});
