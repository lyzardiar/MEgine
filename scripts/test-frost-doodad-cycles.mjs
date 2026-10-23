// Author: MiYu. Replay source CPU clock traces and check sampled publication and rejection recovery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const client=fs.readFileSync(new URL('./frost-original-doodads-client.js',import.meta.url),'utf8');
const source=JSON.parse(fs.readFileSync(new URL('../tmp/docs-artifacts/warcraft-map-tests/doodad-runtime/cycle-cpu.json',import.meta.url),'utf8'));
assert.equal(source.binarySha256,'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a');
function start(initial=0,batch=true){
  const commands=[],batches=[],requests=[];
  const context=vm.createContext({engine:{findEntitiesByName(names){requests.push(names);return names.map((name,index)=>({name,entity:100+index}));},pushCommandJson(raw){commands.push(JSON.parse(raw));}}});
  if(batch)context.engine.pushCommandsJson=raw=>{const values=JSON.parse(raw);batches.push(values);commands.push(...values);return true;};
  const clips=[100,60].map((durationMs,clip)=>({durationMs,parts:[{mesh:'variant.glb',clip,moving:true,frames:3,states:[0,1,2].map(frame=>({material:clip+'.mmat',color:[clip,frame/2,1,1]}))}],effect:{effect:'variant.mfx',clip,playing:false,looping:false,speed:1,time_seconds:0}}));
  vm.runInContext('function onTick(){};var originalDoodadGroups=[];var originalDoodadDefinitions='+JSON.stringify([{clips,choices:[[0,100],[1,100]]}])+';var originalDoodadActors='+JSON.stringify([{definition:0,clip:initial,parts:['part'],effect:'effect'}])+';'+client+'\nvar choices=0;originalDoodadChoose=function(){choices++;return 1-originalDoodadActors[0].clip;};',context);
  return {context,commands,batches,requests};
}
let traced=0;
for(const initial of [0,1]){
  const {context,commands,requests}=start(initial);
  for(const expected of source.cases.filter(row=>row.initial===initial)){
    context.onTick(expected.deltaMs/1000);
    const actor=context.originalDoodadActors[0];
    assert.deepEqual([actor.clip,actor.timeMs||0,!actor.clockStarted,context.choices],[expected.clip,expected.time,expected.skip,expected.callbacks]);
    traced++;
  }
  assert.equal(requests.length,1);assert.ok(commands.some(c=>c.component==='SampledEffect'&&c.value.clip===1));
  assert.ok(commands.filter(c=>c.component==='SampledEffect').every(c=>!c.value.playing&&!c.value.looping));
}
const rejected=start();rejected.context.onTick(0);rejected.context.engine.pushCommandsJson=()=>false;
assert.throws(()=>rejected.context.onTick(.1),/Invalid doodad command batch/);
assert.equal(rejected.context.originalDoodadActors[0].lastClip,0);
rejected.context.engine.pushCommandsJson=raw=>{rejected.commands.push(...JSON.parse(raw));return true;};
rejected.context.onTick(0);
assert.equal(rejected.context.originalDoodadActors[0].lastClip,1);assert.equal(rejected.context.choices,1);
assert.ok(rejected.commands.some(c=>c.component==='MeshRenderer'&&c.value.mesh==='variant.glb#pose=1:0'));
const single=start(0,false),batched=start();
for(const dt of [0,.099,.001,.016,.06,.5,.016]){single.context.onTick(dt);batched.context.onTick(dt);}
assert.deepEqual(single.commands,batched.commands);

const fixed=start();
vm.runInContext('originalDoodadActors=[];originalDoodadGroups=[{names:["effect"],clip:0,frames:3,duration:.1,durationMs:100,restartOnEnd:true,effect:{effect:"fixed.mfx",clip:0,playing:false,looping:false,speed:1,time_seconds:0}}];',fixed.context);
for(const dt of [0,.099,.001,.016])fixed.context.onTick(dt);
assert.deepEqual(fixed.commands.map(c=>c.value.time_seconds),[.099,0]);
const same=start();same.context.originalDoodadChoose=()=>0;
for(const dt of [0,.099,.001,.016])same.context.onTick(dt);
assert.deepEqual(same.commands.filter(c=>c.component==='SampledEffect').map(c=>c.value.time_seconds),[.099,0]);
assert.equal(same.context.originalDoodadActors[0].timeMs,0,'Same clip restart also skips next delta');
const nonloop=start();
vm.runInContext('originalDoodadActors=[];originalDoodadGroups=[Object.assign({},originalDoodadDefinitions[0].clips[0].parts[0],{names:["part"],durationMs:100,duration:.1,loop:false,restartOnEnd:true})];',nonloop.context);
for(const dt of [0,.099,.001,.016,.099])nonloop.context.onTick(dt);
assert.deepEqual(nonloop.commands.filter(c=>c.component==='MeshRenderer').map(c=>c.value.mesh),['variant.glb#pose=0:1','variant.glb#pose=0:0','variant.glb#pose=0:1']);
const random=vm.createContext({onTick(){}});vm.runInContext('var originalDoodadGroups=[];'+client,random);
assert.equal(random.originalDoodadChoose({choices:[[7,0]]}),7);assert.equal(random.originalDoodadRandomState,1);
assert.equal(random.originalDoodadChoose({choices:[[3,0],[4,0]]}),0);assert.equal(random.originalDoodadRandomState,1);
assert.equal(random.originalDoodadChoose({choices:[[3,0],[4,1]]}),4);assert.equal(random.originalDoodadRandomState,1);
console.log('PASS doodad cycles:',traced,'source trace steps, mesh/effect reset, same-clip restart, fixed nonloop restart, zero/unit weights, single/batch equivalence and rejected-batch retry');
