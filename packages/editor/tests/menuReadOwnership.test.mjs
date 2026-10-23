// Author: MiYu. Menu availability reads hierarchy state without exposing editable Play rows.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';

const entity = (id, parent = null) => ({ entity: id, parent, name: `Node ${id}`, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } });

test('closed MenuBar reads no mutable rows and Select All retains hierarchy semantics in Edit and Play', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const savedWindow = globalThis.window; globalThis.window = {};
  let runtime, clearMocks;
  try {
    const { MenuBar } = await server.ssrLoadModule('/src/panels/MenuBar.tsx');
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { createNativePlayRuntime } = await server.ssrLoadModule('/src/playRuntime.ts');
    const mocks = await server.ssrLoadModule('@tauri-apps/api/mocks'); clearMocks = mocks.clearMocks;
    const store = createEditorStore();
    const callbacks = Object.fromEntries(['New','Save','SaveAll','SaveAs','Load','CloseProject','Exit','Undo','Redo','Cut','Copy','Paste','Duplicate','Delete','SelectAll','Refresh','Log'].map(key => [`on${key}`, () => {}]));
    const render = () => {
      const original = store.getVisibleFlat; store.getVisibleFlat = () => { throw new Error('Menu availability must not expose mutable rows'); };
      try { return renderToStaticMarkup(createElement(MenuBar, { ...callbacks, store, selectedIds: store.selectedIds })); }
      finally { store.getVisibleFlat = original; }
    };
    const disabled = html => /<button[^>]*disabled=""[^>]*>Select All/.test(html);
    const load = records => store.loadSceneJson(JSON.stringify({ version: 1, name: 'Menu', world: { entities: records } }));
    load([]); assert.equal(store.hasVisibleHierarchyRows, false); assert.equal(disabled(render()), true);
    load([entity(1, 2), entity(2, 1)]); assert.equal(store.getVisibleFlat().length, 0); assert.equal(disabled(render()), true);
    load([entity(1), entity(2, 1), entity(3, 2)]);
    store.collapseAll(); assert.equal(disabled(render()), false); store.selectAllVisible(); assert.deepEqual(store.selectedIds, [1]);
    store.expandAll(); store.selectAllVisible(); assert.deepEqual(store.selectedIds, [1, 2, 3]);
    let revision = 0, upload;
    mocks.mockIPC((cmd, args) => {
      if (cmd === 'start_editor_play') return { sessionId: 105, snapshot: { entities: args.snapshot.entities, frame: 0, sim_frame: 0, clear_color: args.snapshot.clearColor } };
      if (cmd === 'step_editor_play') { upload = args.snapshot; return { snapshot: { entities: [], frame: revision + 1, sim_frame: revision + 1, clear_color: [0,0,0,1] }, reset: false, baseRevision: revision, revision: ++revision }; }
    });
    runtime = createNativePlayRuntime(error => { throw error; }); store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
    const first = store.playRenderSnapshot();
    for (let i = 0; i < 3; i++) { assert.equal(disabled(render()), false); store.step(.1); await store.waitForPlayRuntime(); assert.equal(upload, undefined); }
    assert.equal(store.playRenderSnapshot().entities, first.entities);
    const alias = store.getTransform(1); alias.position[0] = 7;
    render(); assert.equal(store.nativePlaySessionId, undefined);
    store.step(.1); await store.waitForPlayRuntime(); assert.equal(upload.entities[0].components.Transform.position[0], 7);
    assert.equal(first.entities[0].components.Transform.position[0], 0);
    store.stop(); assert.equal(disabled(render()), false); store.setPlayRuntime(null); load([]); assert.equal(disabled(render()), true);
  } finally { runtime?.stop(); await new Promise(resolve => setImmediate(resolve)); clearMocks?.(); globalThis.window = savedWindow; await server.close(); }
});
