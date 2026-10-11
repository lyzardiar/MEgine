// Author: MiYu. Measure compact scene opening with real editor Store and identical visible authored content.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const editor=process.env.MENGINE_EDITOR_SOURCE;assert.ok(editor,'MENGINE_EDITOR_SOURCE must point to the editor package');
const baseline=process.argv[2]||'c0159f6',before=execFileSync('git',['show',baseline+':samples/frostbound-realms/Assets/Scenes/Main.mscene'],{maxBuffer:256*1024*1024,encoding:'utf8'}),after=fs.readFileSync('samples/frostbound-realms/Assets/Scenes/Main.mscene','utf8');
const {createServer}=await import(pathToFileURL(editor+'/node_modules/vite/dist/node/index.js'));
const server=await createServer({root:editor,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
try{
 const {createEditorStore}=await server.ssrLoadModule('/src/store.ts');
 const counts={},visible={},times={before:[],after:[]};
 for(let i=0;i<22;i++)for(const [name,source] of Object.entries({before,after})){
  const start=performance.now(),store=createEditorStore();store.loadSceneJson(source);const elapsed=performance.now()-start,snapshot=store.snapshot();
  if(i>=2)times[name].push(elapsed);counts[name]=snapshot.entities.length;visible[name]=snapshot.entities.filter(e=>e.active!==false).map(e=>({name:e.name,components:e.components}));
 }
 assert.deepEqual(visible.before,visible.after);
 const median=values=>[...values].sort((a,b)=>a-b)[10];
 console.log(JSON.stringify({author:'MiYu',baseline,iterations:20,warmups:2,scope:'Same real editor Store: scene JSON parsing and ingestion; excludes native project asset scanning, React, IPC and GPU',entities:counts,visibleOutputEqual:true,medianMs:{before:median(times.before),after:median(times.after)},samplesMs:times}));
}finally{await server.close();}
