// Author: MiYu. Selection reads preserve native ownership while public records remain editable.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const entity = (id, parent = null, siblingIndex = 0) => ({ entity: id, parent, siblingIndex, name: `Node ${id}`, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } });

test('hierarchy selection and navigation preserve order without exposing editable native records', async () => {
  let exposures = 0, instrumented = false;
  const hook = '__hierarchyOwnershipExposure';
  const previous = globalThis[hook]; globalThis[hook] = () => exposures++;
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{ name: 'observe-record-exposure', enforce: 'pre', transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/store.ts')) return;
    const marker = 'exposedPlayRecords.add(entity);'; assert.ok(code.includes(marker)); instrumented = true;
    return code.replace(marker, `${marker} globalThis.${hook}();`);
  } }] });
  const savedWindow = globalThis.window; globalThis.window = {};
  let runtime, clearMocks;
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { createNativePlayRuntime } = await server.ssrLoadModule('/src/playRuntime.ts');
    const mocks = await server.ssrLoadModule('@tauri-apps/api/mocks'); clearMocks = mocks.clearMocks;
    const store = createEditorStore(), records = [entity(9, null, 1), entity(4, 1, 1), entity(1), entity(3, 1), entity(2, 1), entity(5, 2)];
    store.loadSceneJson(JSON.stringify({ version: 1, name: 'Selection', world: { entities: records } }));
    const choose = id => store.selectClick(id, { ctrl: false, shift: false });
    const expect = ids => assert.deepEqual(store.selectedIds, ids);
    const exercise = () => {
      store.collapseAll(); store.selectAllVisible(); expect([1, 9]);
      choose(1); store.navigateHorizontal(1); expect([1]); store.navigateHorizontal(1); expect([2]);
      store.navigateHorizontal(-1); expect([1]); store.selectChildren(); expect([2, 3, 4]);
      store.expandAll(); choose(5); store.selectClick(9, { ctrl: false, shift: true }); expect([5, 3, 4, 9]);
      choose(9); store.selectClick(5, { ctrl: false, shift: true }); expect([5, 3, 4, 9]);
      store.navigateVisible(1); expect([9]); store.navigateVisible(-1); expect([4]);
      store.selectAllVisible(); expect([1, 2, 5, 3, 4, 9]);
      choose(1); store.navigateHorizontal(-1); store.selectAllVisible(); expect([1, 9]);
      choose(999); store.navigateHorizontal(1); expect([999]);
      store.selectClick(3, { ctrl: false, shift: true }); expect([3]);
    };
    exercise();
    let revision = 0, upload;
    mocks.mockIPC((cmd, args) => {
      if (cmd === 'start_editor_play') return { sessionId: 106, snapshot: { entities: args.snapshot.entities, frame: 0, sim_frame: 0, clear_color: args.snapshot.clearColor } };
      if (cmd === 'step_editor_play') { upload = args.snapshot; return { snapshot: { entities: [], frame: revision + 1, sim_frame: revision + 1, clear_color: [0,0,0,1] }, reset: false, baseRevision: revision, revision: ++revision }; }
    });
    runtime = createNativePlayRuntime(error => { throw error; }); store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
    assert.ok(instrumented); const initial = store.playRenderSnapshot(); exposures = 0;
    for (let i = 0; i < 3; i++) { exercise(); assert.equal(exposures, 0); assert.equal(store.nativePlaySessionId, 106); store.step(.1); await store.waitForPlayRuntime(); assert.equal(upload, undefined); }
    assert.equal(store.playRenderSnapshot().entities, initial.entities);
    const alias = store.getVisibleFlat()[0].entity; assert.ok(exposures > 0); alias.components.Transform.position[0] = 7;
    assert.equal(store.nativePlaySessionId, undefined); store.step(.1); await store.waitForPlayRuntime();
    assert.equal(upload.entities.find(e => e.entity === alias.entity).components.Transform.position[0], 7);
    assert.equal(initial.entities.find(e => e.entity === alias.entity).components.Transform.position[0], 0);
    store.stop(); store.setPlayRuntime(null); exercise();
    store.loadSceneJson(JSON.stringify({ version: 1, name: 'Empty', world: { entities: [] } }));
    store.selectAllVisible(); store.navigateVisible(1); store.navigateHorizontal(1); store.selectChildren(); expect([]);
  } finally { runtime?.stop(); await new Promise(resolve => setImmediate(resolve)); clearMocks?.(); globalThis.window = savedWindow; if (previous === undefined) delete globalThis[hook]; else globalThis[hook] = previous; await server.close(); }
});
