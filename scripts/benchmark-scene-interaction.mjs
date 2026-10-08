// Author: MiYu. Measure inherited Scene flags on the published Warcraft hierarchy with nonempty restrictions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(new URL('../packages/editor/package.json',import.meta.url)),{createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const repo=fileURLToPath(new URL('../',import.meta.url)),scene=repo+'samples/frostbound-realms/Assets/Scenes/Main.mscene',server=await createServer({root:repo+'packages/editor',server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
try {
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();store.loadSceneJson(fs.readFileSync(scene,'utf8'));
  const entities=store.authoredEntities(),ids=store.getVisibleFlat().map(n=>n.entity.entity),hidden=entities[0].entity,unpickable=entities.at(-1).entity;
  store.setSceneInteractionState([hidden],[unpickable]);
  const reference=new Map(),samples=[];
  for(let sample=0;sample<3;sample++) {
    let start=performance.now();for(const id of ids) { const flags=[store.sceneVisible(id),store.scenePickable(id)];if(sample===0)reference.set(id,flags);else assert.deepEqual(flags,reference.get(id)); }const beforeMs=performance.now()-start;
    start=performance.now();const q=store.sceneInteractionQuery();for(const id of ids)assert.deepEqual([q.sceneVisible(id),q.scenePickable(id)],reference.get(id));const afterMs=performance.now()-start;
    samples.push({beforeMs,afterMs});console.log(JSON.stringify(samples.at(-1)));
  }
  const median=values=>[...values].sort((a,b)=>a-b)[1];
  const report={author:'MiYu',entities:entities.length,visibleRows:ids.length,hiddenIds:[hidden],unpickableIds:[unpickable],samples,beforeMedianMs:median(samples.map(s=>s.beforeMs)),afterMedianMs:median(samples.map(s=>s.afterMs)),sceneSha256:sha(scene),storeSha256:sha(repo+'packages/editor/src/store.ts'),querySha256:sha(repo+'packages/editor/src/sceneInteractionQuery.ts'),scope:'Node source benchmark; two inherited flag reads per visible hierarchy row with one hidden and one unpickable root. Compares existing live scalar queries with a freshly constructed immutable batch including its index cost. Asserts identical results for every row. Excludes React rendering, native execution, IPC and physical input.'};
  fs.writeFileSync(repo+'docs/designs/frostbound-realms/scene-interaction-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await server.close();}
