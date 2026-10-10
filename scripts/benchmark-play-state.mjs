// Author: MiYu. Profile real large-scene Play state processing without native IPC or rendering.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),editor=path.join(root,'packages/editor'),require=createRequire(path.join(editor,'package.json'));
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href),server=await createServer({root:editor,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;};
const measure=fn=>{const start=performance.now(),value=fn();return {value,ms:performance.now()-start};};
try{
 const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),{applyPlayWorldUpdate,createPlayWorldUpdater}=await server.ssrLoadModule('/src/playRuntime.ts');
 const scene=fs.readFileSync(path.join(root,'samples/frostbound-realms/Assets/Scenes/Main.mscene'),'utf8'),store=createEditorStore();store.loadSceneJson(scene);
 const entityCount=store.authoredEntities().length,samples=[],fingerprints=[];let world;
 const stringify=JSON.stringify;JSON.stringify=function(value,...args){if(Array.isArray(value)&&value.length===2&&value[0]?.length===entityCount){const result=measure(()=>stringify(value,...args));fingerprints.push(result.ms);return result.value;}return stringify(value,...args);};
 try{
  store.setPlayRuntime({retainsWorld:true,sessionId:17,start:async snapshot=>{world=snapshot;return snapshot;},step:async snapshot=>{assert.equal(snapshot,undefined);return world;},stop(){},onError(error){throw error;}});
  store.play();await store.waitForPlayRuntime();
  for(let i=0;i<8;i++){const start=performance.now(),before=fingerprints.length;store.tick(.1);await store.waitForPlayRuntime();const stepMs=performance.now()-start,session=measure(()=>store.nativePlaySessionId);assert.equal(session.value,17);samples.push({stepMs,sessionLookupMs:session.ms,fingerprintMs:fingerprints.slice(before)});}
 }finally{JSON.stringify=stringify;store.stop();}
 const previous={...world,entities:world.entities},host={entities:[],frame:1,sim_frame:1,clear_color:world.clearColor},update={snapshot:host,entityOrder:world.entities.map(e=>e.entity),baseRevision:0,revision:1,reset:false};
 const deltas=Array.from({length:8},()=>measure(()=>applyPlayWorldUpdate(previous,0,update)).ms);
 const updater=createPlayWorldUpdater?.();let retained=previous;
 const retainedDeltas=updater?Array.from({length:8},(_,i)=>{const measured=measure(()=>updater(retained,i,{...update,baseRevision:i,revision:i+1}));retained=measured.value;return measured.ms;}):[];
 const files=['packages/editor/src/store.ts','packages/editor/src/playRuntime.ts','packages/editor/src/playWorldSync.ts','packages/behaviour/src/runner.ts','samples/frostbound-realms/Assets/Scenes/Main.mscene'];
 const report={author:'MiYu',at:new Date().toISOString(),scope:'Real Frostbound Main.mscene in real EditorStore, retained-runtime fixture and real applyPlayWorldUpdate; excludes native execution, IPC, React and rendering. No native FPS claim.',entityCount,samples,medianStepMs:median(samples.map(s=>s.stepMs)),medianSessionLookupMs:median(samples.map(s=>s.sessionLookupMs)),medianFingerprintMs:median(samples.flatMap(s=>s.fingerprintMs)),deltaSamplesMs:deltas,medianDeltaMs:median(deltas),retainedDeltaSamplesMs:retainedDeltas,medianRetainedDeltaMs:median(retainedDeltas.slice(1)),sourceHashes:Object.fromEntries(files.filter(p=>fs.existsSync(path.join(root,p))).map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]))};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await server.close();}
