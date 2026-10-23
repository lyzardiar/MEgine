// Author: MiYu. Water frame publication uses runtime entity IDs and skips unchanged frames.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

assert.ok(process.argv[2],'Provide a generated original terrain project');
const project=path.resolve(process.argv[2]),source=fs.readFileSync(path.join(project,'Assets/Scripts/Main.js'),'utf8');
const scene=JSON.parse(fs.readFileSync(path.join(project,'Assets/Scenes/Main.mscene'),'utf8'));
const water=scene.world.entities.filter(e=>e.name.startsWith('Water-')).map((e,i)=>({...e,entity:4294967296+i+9000}));
assert.ok(water.length);
function start(){
  const commands=[];let lookups=0;
  const engine={findEntitiesByName:names=>{lookups++;assert.deepEqual([...names].sort(),water.map(e=>e.name).sort());return water;},pushCommandJson:raw=>commands.push(JSON.parse(raw))};
  const context=vm.createContext({engine});vm.runInContext(source,context);return {context,commands,lookups:()=>lookups};
}
const run=start();run.context.onTick(0);
assert.deepEqual(run.commands.map(c=>c.entity),water.map(e=>e.entity));
assert.ok(run.commands.every(c=>c.op==='setComponent'&&c.component==='MaterialPropertyBlock'&&c.value.custom_parameter_values[0][0]===0));
const first=structuredClone(run.commands);run.commands.length=0;
for(let i=0;i<3;i++)run.context.onTick(1/60);
assert.equal(run.commands.length,0,'Repeated frame 0 creates no component commands');
for(let i=0;i<5;i++)run.context.onTick(1/60);
assert.equal(run.commands.length,water.length*2);assert.ok(run.commands.slice(-water.length).every(c=>c.value.custom_parameter_values[0][0]===2));
const before=run.commands.length;for(let i=0;i<30;i++)run.context.onTick(0);run.context.onTick(-1);
assert.equal(run.commands.length,before,'Paused and negative deltas preserve frame');assert.equal(run.lookups(),1,'Runtime names resolve once per script instance');
const restarted=start();restarted.context.onTick(0);assert.deepEqual(restarted.commands,first);
console.log('PASS original terrain client: runtime IDs, 15 FPS publication, unchanged-frame suppression, pause and restart');
