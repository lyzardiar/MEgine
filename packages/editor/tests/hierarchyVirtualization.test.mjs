// Author: MiYu. Real store imports and rendered Hierarchy stay bounded with 90k nodes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('large imports collapse, reveal selection, preserve remote folds and bound row DOM', async () => {
  const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createEditorStore} = await server.ssrLoadModule('/src/store.ts');
    const {Hierarchy} = await server.ssrLoadModule('/src/panels/Hierarchy.tsx');
    const store = createEditorStore();
    const entities = Array.from({length:90000},(_,i)=>({entity:i+1,name:`Node ${i+1}`,active:true,parent:i?1:null,siblingIndex:i,components:{}}));
    const scene = JSON.stringify({version:1,world:{entities}});
    store.loadSceneJson(scene); assert.equal(store.getVisibleFlat().length,1);
    store.revealEntity(90000); assert.equal(store.getVisibleFlat().length,90000);
    const noop=()=>{};
    const markup=renderToStaticMarkup(createElement(Hierarchy,{store,nodes:store.getVisibleFlat(),selectedIds:[90000],filter:'',pendingRenameId:null,onFilter:noop,onPendingRenameConsumed:noop,onRefresh:noop,onLog:noop,onFrame:noop}));
    assert.ok((markup.match(/role="treeitem"/g)||[]).length<40);
    store.loadRemoteSceneJson(scene, 'edit'); assert.equal(store.isExpanded(1),true);
    store.collapse(1); store.loadRemoteSceneJson(JSON.stringify({version:1,world:{entities,selectedIds:[90000]}}),'edit'); assert.equal(store.isExpanded(1),false);
    store.loadSceneJson(JSON.stringify({version:1,world:{entities,selectedIds:[90000]}}));
    assert.equal(store.isExpanded(1),true); assert.equal(store.selected,90000);
  } finally {await server.close();}
});
