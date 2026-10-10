// Author: MiYu. Compare Behaviour scheduling over the real sparse world and a live script component.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'packages/editor'),iterations=Number(process.argv[2]??30),baseline=process.argv[3]??'fc021ee';
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const oldSource=execFileSync('git',['show',`${baseline}:packages/behaviour/src/runner.ts`],{cwd:repo,encoding:'utf8'}),oldPath=path.join(repo,'packages/behaviour/src',`runner-before-${process.pid}.ts`);
fs.writeFileSync(oldPath,oldSource);let server;
try {
  server=await createServer({root,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  const load=p=>server.ssrLoadModule('/@fs/'+p.replaceAll('\\','/'));
  const {createBehaviourRunner:before}=await load(oldPath),{createBehaviourRunner:after}=await load(path.join(repo,'packages/behaviour/src/runner.ts'));
  const registry=await load(path.join(repo,'packages/behaviour/src/registry.ts'));
  await server.ssrLoadModule('/src/behaviours/index.ts');await server.ssrLoadModule('/src/editorWindow/windows/DecoratorShowcase.ts');
  const browserRegistry=await server.ssrLoadModule('@mengine/behaviour');for(const entry of browserRegistry.listBehaviours())registry.registerBehaviourEntry(entry);
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore(),source=fs.readFileSync(path.join(repo,'samples/frostbound-realms/Assets/Scenes/Main.mscene'),'utf8');
  store.loadSceneJson(source);const entities=store.snapshot().entities;assert.equal(entities.filter(e=>Object.keys(e.components).some(t=>registry.getBehaviour(t))).length,0);
  const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)],results={},samples={};
  class Probe {count=0;onEnable(){this.count++;}onUpdate(){this.count++;}onDisable(){} }
  for(const mode of ['sparse','oneBehaviour']){
    if(mode==='oneBehaviour')registry.registerBehaviourEntry({type:'FrostBenchmarkProbe',label:'Probe',description:'',ctor:Probe,fields:[{key:'count',serialize:true,type:'number'}],methods:[],defaults:()=>({count:0}),requires:[],disallowMultiple:false});
    const worlds={before:structuredClone(entities),after:structuredClone(entities)},runners={before:before(),after:after()},times={before:[],after:[]};
    if(mode==='oneBehaviour')for(const name of ['before','after'])worlds[name].find(e=>e.components.Transform).components.FrostBenchmarkProbe={count:0};
    for(const name of ['before','after'])runners[name].mount(worlds[name]);
    for(let i=0;i<iterations+2;i++)for(const name of i%2?['after','before']:['before','after']){const start=performance.now();runners[name].tick(worlds[name],1/60);if(i>=2)times[name].push(performance.now()-start);}
    assert.deepEqual(worlds.after,worlds.before);
    if(mode==='oneBehaviour')assert.equal(worlds.after.find(e=>e.components.FrostBenchmarkProbe).components.FrostBenchmarkProbe.count,iterations+3);
    results[mode]={before:median(times.before),after:median(times.after),outputSha256:createHash('sha256').update(JSON.stringify(worlds.after)).digest('hex'),outputEqual:true};samples[mode]=times;
    for(const name of ['before','after'])runners[name].unmount();
  }
  console.log(JSON.stringify({author:'MiYu',scope:'Identical real-store world, two implementations through one Vite SSR server, alternating tick timings; browser built-in registrations plus one serialized live script. CPU only, excluding React, native JS simulation, GPU, IPC and native FPS.',baseline,baselineSourceSha256:createHash('sha256').update(oldSource).digest('hex'),sourceSceneSha256:createHash('sha256').update(source).digest('hex'),entities:entities.length,registeredBrowserTypes:browserRegistry.listBehaviours().map(e=>e.type),iterations,warmups:2,mediansMs:results,samplesMs:samples}));
} finally {await server?.close();fs.rmSync(oldPath,{force:true});}
