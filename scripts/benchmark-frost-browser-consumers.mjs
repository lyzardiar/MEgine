// Author: MiYu. Compare four browser consumer scans with owned-record classification on preserved scene inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));
const server=await createServer({root:fileURLToPath(new URL('../packages/editor',import.meta.url)),appType:'custom',logLevel:'silent',server:{middlewareMode:true}});

const iterations=Number(process.argv[2]??120),warmups=20;
assert.ok(Number.isSafeInteger(iterations)&&iterations>=10&&iterations<=1000);
const reference=entities=>({lights:entities.filter(e=>e.components.Light2D),emitters:entities.filter(e=>e.components.ParticleEmitter2D||e.components.ParticleEmitter3D),trails:entities.filter(e=>e.components.TrailRenderer2D),spines:entities.filter(e=>e.components.SpineSkeleton)});
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],results=[];
try {
const {createOwnedViewportBrowserConsumerReader}=await server.ssrLoadModule('/src/viewportBrowserConsumers.ts');
for(const file of ['samples/frostbound-realms/Assets/Scenes/Main.mscene','samples/frostbound-realms/Assets/Maps/amazonia/Scenes/Main.mscene']) {
  const bytes=fs.readFileSync(file),original=JSON.parse(bytes).world.entities;
  for(const workload of ['static','sparse','dense']) {
    const read=createOwnedViewportBrowserConsumerReader(),samples={before:[],after:[]};let state=original,compared=0;
    for(let frame=0;frame<iterations+warmups;frame++) {
      state=state.map((e,index)=>workload==='dense'||workload==='sparse'&&index%100===frame%100?{...e,components:{...e.components}}:e);
      const output={};
      for(const mode of frame%2?['after','before']:['before','after']) {
        const started=performance.now();output[mode]=mode==='after'?read(state):reference(state);const elapsed=performance.now()-started;
        if(frame>=warmups)samples[mode].push(elapsed);
      }
      for(const key of Object.keys(output.before)) {assert.deepEqual(output.after[key],output.before[key]);output.after[key].forEach((e,index)=>assert.equal(e,output.before[key][index]));}compared++;
    }
    results.push({file,sourceSha256:createHash('sha256').update(bytes).digest('hex'),entities:original.length,workload,replacedRecordFraction:workload==='dense'?1:workload==='sparse'?.01:0,fullComparisons:compared,mediansMs:{before:median(samples.before),after:median(samples.after)},samplesMs:samples});
  }
}
console.log(JSON.stringify({scope:'Node four membership scans versus one owned browser-consumer classification, one cold collection per displayed revision; static, 1% replaced and all-replaced records. Excludes React, activation, transforms, animation simulation, IPC, GPU and native editor FPS.',iterations,warmups,results}));
} finally { await server.close(); }
