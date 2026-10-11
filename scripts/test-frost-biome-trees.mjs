// Author: MiYu. Tilesets choose original Warcraft tree variants without changing resource rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);globalThis.Frost=require('../samples/frostbound-realms/game/simulation.js');globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/model-catalog.json',import.meta.url),'utf8'));
const V=require('../samples/frostbound-realms/game/visuals.js'),r={kind:'tree',x:-18,z:17,amount:2500},original=structuredClone(r);
for(const [tileset,prefix] of ['ClassicWinterTree','ClassicOak','ClassicBarrensTree'].entries()){
  const keys=Array.from({length:6},(_,i)=>prefix+(i||'')),near=V.resource(r,12,tileset),far=V.resource(r,27,tileset);assert.ok(keys.includes(near.key));assert.equal(near.asset.classic,true);assert.match(near.mesh,/#pose=\d+:0@30$/);assert.deepEqual(far,near);assert.deepEqual(r,original);
  assert.equal(near.parts.length,near.asset.parts.length);const pose=near.mesh.slice(near.mesh.indexOf('#pose='));for(let i=0;i<near.parts.length;i++){assert.equal(near.parts[i].mesh,near.asset.parts[i].mesh+pose);assert.deepEqual(near.parts[i].pivot,near.asset.parts[i].pivot);assert.equal(far.parts[i].material,near.parts[i].material);}
  for(const edge of [false,true])for(let i=0;i<20;i++){const art=V.scenery(i,edge,12,tileset);if(edge?i%4!==0:i%5===0)assert.ok(keys.includes(art.key));assert.ok(Number.isFinite(art.scale)&&art.scale>0);}
  for(const kind of ['mine','camp'])assert.deepEqual(V.resource({...r,kind},12,tileset),V.resource({...r,kind},12,0));
  const map=Frost.defaultMap();map.tileset=tileset;const state=Frost.create('skirmish',{map,ai:[false,false]}),tree=state.resources.find(r=>r.kind==='tree'),worker=Frost.spawn(state,'worker',0,tree.x,tree.z);Frost.command(state,0,{type:'gather',ids:[worker.id],resource:state.resources.indexOf(tree)});const amount=tree.amount;for(let i=0;i<60;i++)Frost.tick(state);assert.ok(tree.amount<amount);assert.equal(Frost.restore(state).map.tileset,tileset);
}
assert.deepEqual(V.resource(r),V.resource(r,27,0));console.log('PASS: original Warcraft resource/scenery variants, zoom-stable sampled meshes, authored pivots/scales, unchanged mine/camp, three lumber rules and save restore');
