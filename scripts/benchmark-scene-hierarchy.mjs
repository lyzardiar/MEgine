// Author: MiYu. Compare unrestricted Scene flags on the published hierarchy; excludes browser rendering and IPC.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../packages/editor/package.json',import.meta.url)),{createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const repo=fileURLToPath(new URL('../',import.meta.url)),scene=repo+'samples/frostbound-realms/Assets/Scenes/Main.mscene',server=await createServer({root:repo+'packages/editor',server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
try{
 const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();store.loadSceneJson(fs.readFileSync(scene,'utf8'));
 const entities=store.authoredEntities(),ids=store.getVisibleFlat().map(n=>n.entity.entity),samples=[];
 // The previous implementation walked parents with an array search even when its restriction set was empty.
 const previous=id=>{let current=id;const visited=new Set();while(current!=null&&!visited.has(current)){visited.add(current);current=entities.find(e=>e.entity===current)?.parent??null;}return true;};
 const run=(visible,pickable=visible)=>{const start=performance.now();for(const id of ids){assert.equal(visible(id),true);assert.equal(pickable(id),true);}return performance.now()-start;};
 for(let i=0;i<3;i++){const beforeMs=run(previous),afterMs=run(id=>store.sceneVisible(id),id=>store.scenePickable(id));samples.push({beforeMs,afterMs});}
 const median=values=>[...values].sort((a,b)=>a-b)[1],report={author:'MiYu',entities:entities.length,visibleRows:ids.length,restrictionCount:0,sceneSha256:createHash('sha256').update(fs.readFileSync(scene)).digest('hex'),storeSha256:createHash('sha256').update(fs.readFileSync(repo+'packages/editor/src/store.ts')).digest('hex'),samples,beforeMedianMs:median(samples.map(s=>s.beforeMs)),afterMedianMs:median(samples.map(s=>s.afterMs)),scope:'Node source benchmark: two Scene flag reads per visible row, empty restrictions. Previous array/ancestor algorithm versus current flags. Excludes React rendering, native execution and IPC; not an end-to-end speedup.'};
 fs.writeFileSync(repo+'docs/designs/frostbound-realms/scene-hierarchy-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await server.close();}
