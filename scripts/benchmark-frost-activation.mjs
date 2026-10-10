// Author: MiYu. Compare activation setup and queries for the real native-frame scene.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'packages/editor'),iterations=Number(process.argv[2]??30),baseline=process.argv[3]??'728b389';
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const oldSource=execFileSync('git',['show',`${baseline}:packages/editor/src/hierarchyActivation.ts`],{cwd:repo,encoding:'utf8'}),oldPath=path.join(repo,'tmp',`activation-before-${process.pid}.ts`);
fs.writeFileSync(oldPath,oldSource);let server;
try {
  server=await createServer({root,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  const before=await server.ssrLoadModule('/@fs/'+oldPath.replaceAll('\\','/')),after=await server.ssrLoadModule('/src/hierarchyActivation.ts');
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore(),source=fs.readFileSync(path.join(repo,'samples/frostbound-realms/Assets/Scenes/Main.mscene'),'utf8');
  store.loadSceneJson(source);const entities=store.snapshot().entities;
  const gameTypes=['Camera3D','Camera2D','EnvironmentLight','SpineSkeleton','Canvas','Button','Toggle','Slider','Scrollbar','InputField','Dropdown','ListView','ScrollView','TabView'];
  const queries={nativeGame:entities.filter(e=>gameTypes.some(t=>e.components[t])).map(e=>e.entity),nativeScene:entities.map(e=>e.entity)};
  const run=(impl,ids,passes,vector=false)=>{
    impl.viewportActiveLookup(entities,true,true,[],()=>true);
    const active=impl.createHierarchyActiveLookup(entities);let count=0;const values=vector?[]:undefined;
    for(let pass=0;pass<passes;pass++)for(const id of ids){const value=active(id);if(value)count++;values?.push(value);}
    return values??count;
  };
  const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)],medians={},samples={};
  for(const mode of ['nativeGame','nativeScene']){
    const ids=queries[mode],passes=mode==='nativeScene'?3:1,times={before:[],after:[]};let counts={};
    for(let i=0;i<iterations+2;i++)for(const name of i%2?['after','before']:['before','after']){const start=performance.now();counts[name]=run(name==='before'?before:after,ids,passes);if(i>=2)times[name].push(performance.now()-start);}
    assert.equal(counts.before,counts.after);const values=run(after,ids,passes,true);assert.deepEqual(values,run(before,ids,passes,true));
    medians[mode]={before:median(times.before),after:median(times.after),queriedIds:ids.length,passes,activeResults:counts.after,outputEqual:true,outputSha256:createHash('sha256').update(JSON.stringify(values)).digest('hex')};samples[mode]=times;
  }
  console.log(JSON.stringify({author:'MiYu',scope:'One unused requested-world activation lookup followed by displayed-world activation, matching native paint handoff. Game queries actual camera/environment/interactive candidates; Scene performs three all-entity query passes. Same Vite SSR server and real-store scene; CPU only, excluding transforms, drawing, GPU, IPC, scripts and native FPS.',baseline,baselineSourceSha256:createHash('sha256').update(oldSource).digest('hex'),sourceSceneSha256:createHash('sha256').update(source).digest('hex'),entities:entities.length,iterations,warmups:2,mediansMs:medians,samplesMs:samples}));
} finally {await server?.close();fs.rmSync(oldPath,{force:true});}
