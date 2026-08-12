// Author: MiYu

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

test('Figma import preserves responsive layout, text, stable component ids, and raster assets', () => {
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
  assert.equal(root.components.ContentSizeFitter, undefined);
  assert.deepEqual(root.components.RectTransform.size_delta, [400, 800]);

  const text = plan.nodes.find((node) => node.sourceNodeId === '1:2');
  assert.equal(text.components.Text.text, 'Start Game');
  assert.equal(text.components.Text.font_style, 'Bold');
  assert.equal(text.components.Text.alignment, 'Center');
  assert.deepEqual(text.components.RectTransform.anchor_min, [0, 1]);
  assert.deepEqual(text.components.RectTransform.anchor_max, [1, 1]);
  assert.equal(text.components.LayoutElement.flexible_width, 1);
  assert.equal(text.components.LayoutElement.preferred_height, 48);

  const button = plan.nodes.find((node) => node.sourceNodeId === '1:3');
  assert.equal(button.kind, 'button');
  assert.equal(button.components.Button.label, 'Play');
});

test('legacy raster flags do not turn editable Figma text into PNG assets', () => {
  const input = source();
  input.nodes[1].requiresRasterization = true;
  input.nodes[1].rasterizeReason = 'Figma text rendering';
  const plan = buildFigmaUiImportPlan(input, {
    assetPaths: { '1:2': 'Assets/Figma/HUD/1-2.png', '1:5': 'Assets/Figma/HUD/1-5.png' },
  });
  const text = plan.nodes.find((node) => node.sourceNodeId === '1:2');
  assert.equal(text.kind, 'text');
  assert.equal(text.components.Text.text, 'Start Game');
  assert.equal(text.components.RawImage, undefined);
  assert.deepEqual(plan.assets.map((asset) => asset.nodeId), ['1:5']);
});

test('Figma wrap, distribution, baseline, absolute children, and grid stay native', () => {
  const input = source();
  input.nodes[0].layout = {
    ...input.nodes[0].layout,
    wrap: 'WRAP',
    primaryAlign: 'SPACE_BETWEEN',
    counterAlign: 'BASELINE',
    counterAlignContent: 'SPACE_BETWEEN',
    counterAxisSpacing: 18,
    sizingVertical: 'HUG',
    itemReverseZIndex: true,
    strokesIncluded: true,
  };
  input.nodes[0].strokeWeight = 2;
  input.nodes[1].layout = {
    ...input.nodes[1].layout,
    positioning: 'ABSOLUTE',
    minWidth: 120,
    maxWidth: 360,
  };
  input.nodes[2].layout = {
    ...input.nodes[2].layout,
    sizingHorizontal: 'FIXED',
    sizingVertical: 'FIXED',
    grow: 1,
    align: 'MAX',
  };
  input.nodes.push(
    {
      id: '1:6',
      parentId: '1:1',
      name: 'Inventory Grid',
      type: 'FRAME',
      bounds: { x: 124, y: 500, width: 352, height: 220 },
      layout: {
        mode: 'GRID',
        sizingHorizontal: 'FILL',
        sizingVertical: 'FIXED',
        gridColumnCount: 3,
        gridRowCount: 2,
        gridColumnGap: 8,
        gridRowGap: 12,
      },
    },
    {
      id: '1:7',
      parentId: '1:6',
      name: 'Spanning Cell',
      type: 'RECTANGLE',
      bounds: { x: 124, y: 500, width: 232, height: 104 },
      fillColor: [0.2, 0.3, 0.4, 1],
      layout: {
        mode: 'NONE',
        gridColumn: 0,
        gridRow: 0,
        gridColumnSpan: 2,
        gridRowSpan: 1,
        gridChildHorizontalAlign: 'MAX',
        gridChildVerticalAlign: 'CENTER',
      },
    },
  );

  const plan = buildFigmaUiImportPlan(input, { componentMappings: { '9:9': 'button' } });
  const root = plan.nodes.find((node) => node.sourceNodeId === '1:1');
  assert.equal(root.components.LayoutGroup.wrap, true);
  assert.equal(root.components.LayoutGroup.main_axis_distribution, 'SpaceBetween');
  assert.equal(root.components.LayoutGroup.counter_axis_distribution, 'SpaceBetween');
  assert.equal(root.components.LayoutGroup.counter_axis_alignment, 'Baseline');
  assert.equal(root.components.LayoutGroup.counter_spacing, 18);
  assert.equal(root.components.LayoutGroup.reverse_z_order, true);
  assert.deepEqual(root.components.LayoutGroup.padding, [26, 22, 30, 34]);
  assert.equal(root.components.ContentSizeFitter.vertical_fit, 'PreferredSize');

  const absolute = plan.nodes.find((node) => node.sourceNodeId === '1:2');
  assert.equal(absolute.components.LayoutElement.ignore_layout, true);
  assert.equal(absolute.components.LayoutElement.min_width, 120);
  assert.equal(absolute.components.LayoutElement.max_width, 360);

  const growing = plan.nodes.find((node) => node.sourceNodeId === '1:3');
  assert.equal(growing.components.LayoutElement.flexible_width, -1);
  assert.equal(growing.components.LayoutElement.flexible_height, 1);
  assert.equal(growing.components.LayoutElement.horizontal_align, 'Max');
  assert.equal(growing.components.LayoutElement.vertical_align, 'Auto');

  const grid = plan.nodes.find((node) => node.sourceNodeId === '1:6');
  assert.equal(grid.components.LayoutGroup.direction, 'Grid');
  assert.deepEqual(grid.components.LayoutGroup.spacing, [8, 12]);
  assert.equal(grid.components.LayoutGroup.grid_columns, 3);
  assert.equal(grid.components.LayoutGroup.grid_rows, 2);
  assert.equal(grid.components.LayoutGroup.grid_fit_width, true);
  assert.equal(grid.components.LayoutGroup.grid_fit_height, true);

  const spanning = plan.nodes.find((node) => node.sourceNodeId === '1:7');
  assert.equal(spanning.components.LayoutElement.grid_column, 0);
  assert.equal(spanning.components.LayoutElement.grid_row, 0);
  assert.equal(spanning.components.LayoutElement.grid_column_span, 2);
  assert.equal(spanning.components.LayoutElement.grid_horizontal_align, 'Max');
  assert.equal(spanning.components.LayoutElement.grid_vertical_align, 'Center');
  assert.equal(plan.diagnostics.some((entry) => entry.code.startsWith('UNSUPPORTED_')), false);
});

test('unmapped instances remain editable visual hierarchies and report the missing semantic mapping', () => {
  const plan = buildFigmaUiImportPlan(source());
  assert.ok(plan.nodes.some((node) => node.sourceNodeId === '1:4'));
  assert.ok(plan.diagnostics.some((entry) => (
    entry.code === 'UNMAPPED_COMPONENT' && entry.nodeId === '1:3'
  )));
});

test('zero-sized Figma nodes keep their native RectTransform and child hierarchy', () => {
  const input = source();
  input.nodes.push(
    {
      id: '1:6',
      parentId: '1:1',
      name: 'Zero-sized container',
      type: 'GROUP',
      bounds: { x: 200, y: 300, width: 0, height: 0 },
      layout: { mode: 'NONE' },
    },
    {
      id: '1:7',
      parentId: '1:6',
      name: 'Visible child',
      type: 'RECTANGLE',
      bounds: { x: 200, y: 300, width: 32, height: 24 },
      layout: { mode: 'NONE' },
    },
  );

  const plan = buildFigmaUiImportPlan(input);
  const container = plan.nodes.find((node) => node.sourceNodeId === '1:6');
  const child = plan.nodes.find((node) => node.sourceNodeId === '1:7');
  assert.equal(plan.readyToImport, true);
  assert.deepEqual(container.components.RectTransform.size_delta, [0, 0]);
  assert.equal(child.parentSourceNodeId, '1:6');
  assert.equal(plan.diagnostics.some((entry) => entry.code === 'MISSING_BOUNDS'), false);
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
