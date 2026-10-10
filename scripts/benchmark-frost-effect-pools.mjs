// Author: MiYu. Compare unchanged Play state work for full and compact real-store scenes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('../',import.meta.url)),baseline=process.argv[2]??'728b389',iterations=Number(process.argv[3]??20);
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const before=execFileSync('git',['show',baseline+':samples/frostbound-realms/Assets/Scenes/Main.mscene'],{cwd:repo,maxBuffer:256*1024*1024,encoding:'utf8'}),after=fs.readFileSync(repo+'samples/frostbound-realms/Assets/Scenes/Main.mscene','utf8');
const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url)),server=await createServer({root:repo+'packages/editor',appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
try{
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),{createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),{createHierarchyActiveLookup}=await server.ssrLoadModule('/src/hierarchyActivation.ts');
  const states={},visible={},times={};
  for(const [name,source] of Object.entries({before,after})){
    const store=createEditorStore();store.loadSceneJson(source);const snapshot=store.snapshot(),sync=createPlayWorldSync();sync.capture(snapshot.entities,snapshot.clearColor);states[name]={snapshot,sync};times[name]={matches:[],capture:[],activation:[]};
    const active=createHierarchyActiveLookup(snapshot.entities);visible[name]=snapshot.entities.filter(e=>active(e.entity)).map(e=>({name:e.name,components:e.components}));
  }
  assert.deepEqual(visible.after,visible.before);
  for(let i=0;i<iterations+2;i++)for(const operation of ['matches','capture','activation'])for(const name of i%2?['after','before']:['before','after']){
    const {snapshot,sync}=states[name],start=performance.now();
    if(operation==='matches')assert.equal(sync.matches(snapshot.entities,snapshot.clearColor),true);
    else if(operation==='capture')sync.capture(snapshot.entities,snapshot.clearColor);
    else{const active=createHierarchyActiveLookup(snapshot.entities);for(const e of snapshot.entities)active(e.entity);}
    if(i>=2)times[name][operation].push(performance.now()-start);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],medians={};for(const op of ['matches','capture','activation'])medians[op]={before:median(times.before[op]),after:median(times.after[op])};
  console.log(JSON.stringify({author:'MiYu',baseline,iterations,warmups:2,scope:'Same current implementations and Vite SSR server, two real-store authored worlds. Visible authored node components match; removed invisible pools are intentionally absent. CPU only, excluding gameplay, React, transforms, GPU, IPC and native FPS.',beforeEntities:states.before.snapshot.entities.length,afterEntities:states.after.snapshot.entities.length,visibleNodes:visible.after.length,visibleAuthoredOutputEqual:true,beforeSceneSha256:createHash('sha256').update(before).digest('hex'),afterSceneSha256:createHash('sha256').update(after).digest('hex'),mediansMs:medians,samplesMs:times}));
}finally{await server.close();}
