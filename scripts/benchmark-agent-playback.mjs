// Author: MiYu. Measure bridge input cost with a reproducible large paused scene.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../packages/editor/',import.meta.url)),require=createRequire(path.join(root,'package.json'));
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const server=await createServer({root,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
try {
 const {createEditorStore}=await server.ssrLoadModule('/src/store.ts');
 const {agentBridge:bridge}=await server.ssrLoadModule('/src/agent/AgentBridge.ts');
 const entityCount=42479,store=createEditorStore();
 store.loadSceneJson(JSON.stringify({version:1,name:'Bridge input benchmark',world:{entities:Array.from({length:entityCount},(_,i)=>({entity:i+1,name:`Tile ${i}`,components:{Transform:{position:[i%256,0,Math.floor(i/256)],rotation:[0,0,0,1],scale:[1,1,1]},MeshRenderer:{mesh:'cube'}}}))}}));
 store.play();store.pause();bridge.store=store;bridge.editorBootReady=true;
 bridge.connectRefresh(()=>bridge.observe(false,store.snapshot()));bridge.observe(true);
 let snapshots=0;const snapshot=store.snapshot;store.snapshot=()=>{snapshots++;return snapshot();};
 await bridge.execute('playback.input',{keys:[]});snapshots=0;
 const samples=[];
 for(let i=0;i<8;i++){const start=performance.now();await bridge.execute('playback.input',{keys:i%2?[]:['KeyB'],pointer:[i,10]});samples.push(performance.now()-start);}
 const sorted=[...samples].sort((a,b)=>a-b),files=['src/agent/AgentBridge.ts','src/agent/commands.ts','src/store.ts'];
 const result={scope:'Paused bridge and real EditorStore; refresh mirrors App scene observation. Excludes React rendering, native execution, IPC and external command queue.',entityCount,samplesMs:samples,medianMs:(sorted[3]+sorted[4])/2,snapshotCalls:snapshots,snapshotsPerInput:snapshots/samples.length,node:process.version,sourceHashes:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]))};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
} finally {await server.close();}
