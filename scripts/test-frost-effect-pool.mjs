// Author: MiYu. Exercise deferred effect creation, hierarchy acknowledgement and dropped-command recovery.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const Pool=createRequire(import.meta.url)('../samples/frostbound-realms/game/effect-pool.js');
const identity={position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
function fixture(kind='spell'){
  const world=new Map(),entities={},authored={},commands=[];let id=1,queries=0;
  const add=(name,components,parent=null)=>{const e={entity:id++,name,components,active:true,parent};world.set(name,e);entities[name]=structuredClone(e);authored[name]=structuredClone(components);return e;};
  const base=add('Scene / Effects/Classic '+kind,{Transform:identity}),group=add(base.name+'/Slots 0-31',{Transform:identity},base.entity);
  const template='Classic '+kind+' 0 sample';add(template,{Transform:{...identity,position:[0,-100,0]},SampledEffect:{effect:'sample.mfx'}},group.entity);
  for(let i=0;i<2;i++)add(template+' mesh '+i,{Transform:identity,MeshRenderer:{mesh:'mesh'+i,material:'mat',cast_shadows:false}},world.get(template).entity);
  const engine={pushCommandJson:raw=>commands.push(JSON.parse(raw))},register=names=>{queries++;for(const name of names){const e=world.get(name);if(e){entities[name]=structuredClone(e);authored[name]=structuredClone(e.components);}}};
  const pool=Pool.create(engine,entities,authored,register);
  const commit=(drop=false)=>{for(const c of commands.splice(0)){if(drop)continue;if(c.op==='spawn'){assert.ok(!world.has(c.name),'no duplicate names');world.set(c.name,{entity:id++,name:c.name,components:c.components,active:c.active,parent:c.parent});}else if(c.op==='setParent'){const e=[...world.values()].find(e=>e.entity===c.entity);e.parent=c.parent;}}};
  const tick=(drop=false)=>{commit(drop);pool.beginFrame();};
  return {pool,world,entities,authored,commands,tick,commit,queries:()=>queries};
}
test('unused pool does not query or spawn; legacy names pass through',()=>{
  const f=fixture();for(let i=0;i<10;i++)f.pool.beginFrame();assert.equal(f.queries(),0);assert.equal(f.commands.length,0);assert.equal(f.pool.ensure('Classic Flame Strike 1 flame',2),true);
});
test('new roots and meshes stay inactive until every parent is acknowledged',()=>{
  const f=fixture(),name='Classic spell 7 sample';assert.equal(f.pool.ensure(name,2),false);assert.equal(f.commands.filter(c=>c.op==='spawn').length,3);
  assert.equal(f.pool.ensure(name,2),false);assert.equal(f.commands.length,3);f.tick();assert.equal(f.pool.ensure(name,2),false);
  for(const e of f.world.values())if(e.name.startsWith(name))assert.equal(e.active,false);
  f.tick();assert.equal(f.pool.ensure(name,2),true);assert.equal(f.world.get(name+' mesh 0').parent,f.world.get(name).entity);assert.deepEqual(f.world.get(name+' mesh 0').components.Transform,identity);
  const queries=f.queries();f.pool.beginFrame();assert.equal(f.queries(),queries);assert.equal(f.pool.ensure(name,1),true);assert.equal(f.commands.length,0);
});
test('attachments grow without a fixed slot or part limit and share one registration batch',()=>{
  const f=fixture('attachment'),a='Classic attachment 201 sample',b='Classic attachment 202 sample';f.pool.ensure(a,1);f.pool.ensure(b,0);f.tick();f.tick();f.tick();assert.equal(f.pool.ensure(a,1),true);assert.equal(f.pool.ensure(b,0),true);
  assert.equal(f.world.get('Scene / Effects/Classic attachment/Slots 192-223').active,true);
  assert.equal(f.pool.ensure(a,4),false);f.tick();assert.equal(f.pool.ensure(a,4),true);assert.equal(f.world.get(a+' mesh 3').parent,f.world.get(a).entity);
});
test('dropped spawn and dropped parenting commands recover without duplicate entities',()=>{
  const f=fixture(),name='Classic spell 4 sample';f.pool.ensure(name,1);f.tick(true);f.tick();f.tick();f.tick();assert.ok(f.world.has(name));f.tick(true);assert.equal(f.pool.ensure(name,1),false);f.tick();assert.equal(f.pool.ensure(name,1),true);
});
test('root-only status and actors require no mesh template',()=>{
  const f=fixture('status'),name='Classic status 9 sample';assert.equal(f.pool.ensure(name,0),false);f.tick();assert.equal(f.pool.ensure(name,0),true);assert.equal([...f.world.keys()].filter(n=>n.startsWith(name+' mesh')).length,0);
});
