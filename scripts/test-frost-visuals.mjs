// Author: MiYu. Faction model selection, tier changes and derived asset/source integrity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),root=new URL('../samples/frostbound-realms/',import.meta.url);
globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('model-catalog.json',root)));const V=require('../samples/frostbound-realms/game/visuals.js');
const halls=new Set();
for(let f=0;f<4;f++){
  const s=S.create('skirmish',{factions:[f,0],ai:[false,false]}),hall=s.units.find(u=>u.team===0&&u.kind==='hall');
  for(const kind of Object.keys(S.types)){const visual=V.model(s,{kind,team:0});assert.ok(visual.asset,kind);assert.ok(Number.isFinite(visual.scale)&&visual.scale>0,kind);assert.ok(V.name(s,{kind,team:0}));}
  const original=V.model(s,hall);halls.add(original.key);assert.equal(original.key,S.factions[f]+'Hall');
  s.teams[0].gold=2000;s.teams[0].wood=2000;
  for(const tier of [2,3]){assert.equal(S.command(s,0,{type:'tech',ids:[hall.id]}),null);for(let i=0;i<(tier-1)*200+2;i++)S.tick(s);assert.equal(s.teams[0].tier,tier);assert.equal(V.model(s,hall).key,S.factions[f]+'Hall'+tier);}
  assert.equal(V.model(S.restore(s),hall).key,S.factions[f]+'Hall3');s.visible[1].fill(1);const view=S.publicState(s,1),seen=view.units.find(u=>u.id===hall.id);assert.equal(V.model(view,seen).key,S.factions[f]+'Hall3');assert.equal(V.name(view,seen),V.name(s,hall));assert.equal(view.teams[0].tier,undefined,'global enemy tech stays private');s.visible[1].fill(0);assert.ok(!S.publicState(s,1).units.some(u=>u.id===hall.id));
  for(const kind of ['hall','barracks','farm','tower','altar','workshop']){const {asset,scale}=V.model(s,{kind,team:0});assert.ok(Math.max(asset.size[0],asset.size[2])*scale<=S.types[kind].radius*2,'art stays inside gameplay footprint');}
}
assert.equal(halls.size,4);
const verify=entry=>{const data=fs.readFileSync(new URL(entry.file,root));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256,entry.file);};
const buildings=JSON.parse(fs.readFileSync(new URL('faction-sources.json',root)));buildings.sources.forEach(verify);buildings.generated.forEach(verify);
const monsters=JSON.parse(fs.readFileSync(new URL('monster-sources.json',root)));monsters.forEach(m=>{verify(m);m.generated.forEach(verify);assert.ok(m.animations.length>=8);});
const icons=JSON.parse(fs.readFileSync(new URL('faction-icons.json',root))),slices=JSON.parse(fs.readFileSync(new URL(icons.file+'.sprite.json',root))).slices;verify(icons);assert.equal(slices.length,32);assert.deepEqual(slices.map(s=>s.name).sort(),Object.keys(buildings.models).sort());
assert.equal(Object.keys(buildings.models).length,32);assert.equal(monsters.length,5);
const skeletons=JSON.parse(fs.readFileSync(new URL('skeleton-sources.json',root)));assert.equal(skeletons.license,'CC0-1.0');skeletons.sources.forEach(verify);skeletons.generated.forEach(verify);
const portraits=JSON.parse(fs.readFileSync(new URL('unit-icons.json',root)));verify(portraits);const unitSlices=JSON.parse(fs.readFileSync(new URL(portraits.file+'.sprite.json',root))).slices,portraitKeys=new Set(unitSlices.map(s=>s.name));assert.equal(portraitKeys.size,18);
for(let faction=0;faction<4;faction++){const state=S.create('skirmish',{factions:[faction,0]});for(const kind of Object.keys(S.types))if(S.types[kind].speed)assert.ok(portraitKeys.has(V.model(state,{kind,team:0}).key),kind);}
for(const [kind,key] of [['bonearcher','Skeleton_Rogue'],['necromancer','Skeleton_Mage']]){
 const unit={kind,team:0,cd:0},visual=V.model(S.create(),unit);assert.equal(visual.key,key);assert.match(V.pose(unit,visual.asset,false,.5),/#pose=0:6$/);assert.match(V.pose(unit,visual.asset,true,.5),/#pose=1:6$/);unit.cd=1;assert.match(V.pose(unit,visual.asset,false,.5),/#pose=2:6$/);
 const bytes=fs.readFileSync(new URL(visual.asset.parts[0].mesh,root)),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());const socket=doc.nodes.find(n=>n.name==='handslot.r'),weapon=skeletons.models[key].weapon;assert.ok(socket.children.some(i=>doc.nodes[i].name===weapon&&Number.isInteger(doc.nodes[i].mesh)),'weapon follows the hand hierarchy');assert.deepEqual(doc.animations.map(a=>a.name),skeletons.models[key].clips);
}
{
 const state=S.create(),unit=S.spawn(state,'bonearcher',0,0,0),target=S.spawn(state,'soldier',1,8,0),old={x:0,z:-1,yaw:0};unit.cd=1;unit.order={type:'attack',target:target.id};state.events=[{type:'hit',team:0,fromX:0,fromZ:0,x:8,z:0}];assert.equal(V.heading(state,unit,old),Math.PI/2,'attack turns from the old marching direction toward the actual hit');
 state.events=[];assert.equal(V.heading(state,unit,{x:0,z:0,yaw:0}),Math.PI/2,'stationary explicit attacks continue tracking their target');unit.order=null;unit.cd=0;assert.equal(V.heading(state,unit,{x:-1,z:0,yaw:0}),Math.PI/2,'marching turns with movement');assert.equal(V.heading(state,{kind:'tower',team:0,x:0,z:0,cd:1},old),0,'buildings retain their authored orientation');
}
console.log('PASS: four faction rosters, 32 building meshes, real tier upgrades/save restore, footprints, five animated monsters, two armed skeletons, 18 native unit portraits and pinned source/derived hashes');
