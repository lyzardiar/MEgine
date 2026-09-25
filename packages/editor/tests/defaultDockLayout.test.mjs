// Author: MiYu
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('default Unity layout and Agent reset validation agree on all panels', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { defaultTree, describeDockNode, resizeDockSplit } = await server.ssrLoadModule('/src/panels/DockWorkspace.tsx');
    const { isDefaultPanelLayout } = await server.ssrLoadModule('/src/agent/AgentBridge.ts');
    const { CORE_PANEL_IDS } = await server.ssrLoadModule('/src/panels/detachedPanelWindow.ts');
    const tree = describeDockNode(defaultTree());
    const leaves = node => node.kind === 'tabs' ? [node] : [...leaves(node.first), ...leaves(node.second)];
    const groups = leaves(tree);
    const layout = { tree, dockedPanels: groups.flatMap(group => group.panels).sort(), activePanels: groups.map(group => group.active).sort(), detachedPanels: [] };
    assert.deepEqual(layout.dockedPanels, [...CORE_PANEL_IDS].sort());
    assert.equal(tree.direction, 'horizontal');
    assert.equal(tree.second.active, 'inspector');
    assert.equal(tree.first.second.active, 'project');
    assert.equal(isDefaultPanelLayout(layout), true);
    const incomplete = structuredClone(layout);
    incomplete.tree.first.second.panels = incomplete.tree.first.second.panels.filter(panel => panel !== 'effekseer');
    assert.equal(isDefaultPanelLayout(incomplete), false);
    assert.equal(isDefaultPanelLayout({ ...layout, detachedPanels: [{ kind: 'console', windowLabel: 'panel-console' }] }), false);
    const resized = structuredClone(layout);
    resized.tree.ratio = 0.5;
    assert.equal(isDefaultPanelLayout(resized), false);
    const original = defaultTree();
    let dragged = original;
    for (let index = 0; index < 10; index++) dragged = resizeDockSplit(dragged, original.id, -0.01);
    assert.ok(Math.abs(dragged.ratio - (original.ratio - 0.1)) < 1e-9);
    assert.equal(resizeDockSplit(dragged, original.id, 2).ratio, 0.85);
    assert.equal(resizeDockSplit(dragged, original.id, -2).ratio, 0.15);
    assert.equal(dragged.a, original.a);
    assert.equal(dragged.b, original.b);
  } finally {
    await server.close();
  }
});
