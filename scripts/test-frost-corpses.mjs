// Author: MiYu. Corpse lifecycle, restoration, visibility and non-looping native pose selection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;globalThis.FrostArt={...JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/model-catalog.json',import.meta.url))),...JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/druid-models.json',import.meta.url))),...JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/dryad-models.json',import.meta.url)))};const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(mode='skirmish'){const map=S.defaultMap(mode);map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create(mode,{map});s.units=[];return s;}
function kill(s,kind='soldier',extra={}){const u=S.spawn(s,'rifleman',0,0,0,{damage:100000,range:12}),v=S.spawn(s,kind,1,0,1,{hp:1,damage:0,speed:0,yaw:1.1,...extra});u.order={type:'attack',target:v.id};S.visibility(s);S.tick(s);assert.equal(v.hp,0);u.damage=0;u.order={type:'hold'};return {u,v,c:s.corpses.find(c=>c.id===v.id)};}
{
 const s=arena(),{v,c}=kill(s);assert.ok(c);assert.equal(c.yaw,1.1);assert.equal(c.age,0);assert.ok(!s.units.some(u=>u.id===v.id));assert.equal(S.population(s,1).used,0);const body=S.clone(c);S.command(s,1,{type:'move',ids:[v.id],x:5,z:5});assert.deepEqual(c,body);
 assert.equal(S.command(s,0,{type:'move',ids:[s.units[0].id],x:0,z:1}),null);step(s,5);assert.ok(S.distance(s.units[0],c)<.5,'corpse is not a movement obstacle');
 const copy=S.restore(s);step(s,10);step(copy,10);assert.deepEqual(copy.corpses,s.corpses,'saved death timing continues exactly');const aged=S.clone(s.corpses[0]);aged.age=19;const final=V.corpse(s,aged);assert.ok(final.y<0);assert.equal(Number(final.mesh.split(':').at(-1)),Math.ceil(final.asset.animations[final.sample.clip].duration*12),'death holds the exact original terminal pose');
 const early=V.corpse(s,{...aged,age:0}),settled=V.corpse(s,{...aged,age:3}),later=V.corpse(s,{...aged,age:12});assert.notEqual(early.mesh,settled.mesh);assert.equal(settled.mesh,later.mesh,'death pose never loops');
 s.winner=0;const frame=s.frame;step(s,200);assert.equal(s.corpses.length,0);assert.equal(s.frame,frame,'post-victory decay leaves battle time unchanged');
 const legacy=S.clone(copy);delete legacy.corpses;for(const u of legacy.units)delete u.yaw;assert.deepEqual(S.restore(legacy).corpses,[]);
 for(const patch of [{id:0},{age:-1},{age:20},{yaw:NaN},{yaw:4},{x:33},{y:Infinity},{kind:'hall'},{team:8},{heroClass:9},{boss:1},{large:null}]){const invalid=S.clone(copy);Object.assign(invalid.corpses[0],patch);assert.throws(()=>S.restore(invalid),/corpse/);}
 const duplicate=S.clone(copy);duplicate.corpses.push(S.clone(duplicate.corpses[0]));assert.throws(()=>S.restore(duplicate),/corpse/);
 const oversize=S.clone(copy);oversize.corpses=Array(65).fill(copy.corpses[0]);assert.throws(()=>S.restore(oversize),/corpses/);
 const alive=S.clone(copy);alive.corpses[0].id=alive.units[0].id;assert.throws(()=>S.restore(alive),/corpse/);
 const facing=S.clone(copy);facing.units[0].yaw=Infinity;assert.throws(()=>S.restore(facing),/facing/);
}
{
 const s=arena();for(let i=0;i<S.CORPSE_LIMIT+3;i++){kill(s);s.units=[];}
 assert.equal(s.corpses.length,S.CORPSE_LIMIT);assert.equal(new Set(s.corpses.map(c=>c.id)).size,S.CORPSE_LIMIT);assert.ok(s.corpses[0].id<s.corpses.at(-1).id);S.restore(s);
 s.visible[0].fill(0);s.explored[0].fill(1);assert.equal(S.publicState(s,0).corpses.length,0,'explored fog cannot expose enemy corpses');assert.equal(S.publicState(s,1).corpses.length,S.CORPSE_LIMIT,'own corpse stays known without granting vision');
 s.visible[0][S.index(0,1)]=1;s.corpses[0].inventory=[0];const view=S.publicState(s,0);assert.equal(view.corpses.length,S.CORPSE_LIMIT);assert.equal(view.corpses[0].inventory,undefined);view.corpses[0].age=19;assert.notEqual(view.corpses[0].age,s.corpses[0].age);
}
{
 const s=arena('moba'),{v,c}=kill(s,'hero');assert.ok(!c&&v.respawn>0);const copy=S.restore(s);step(copy,141);assert.ok(copy.units.find(u=>u.id===v.id).hp>0);assert.ok(!copy.corpses.some(c=>c.id===v.id),'reviving hero removes old body');
}
for(const kind of Object.keys(S.types).filter(k=>S.types[k].speed&&!S.types[k].mechanical&&S.types[k].attack!=='siege'&&k!=='hero')){
 for(const heroClass of kind==='hero'?[0,1,2,3]:[0]){const s=arena(),{c}=kill(s,kind,{heroClass});assert.ok(c,kind);for(let faction=0;faction<4;faction++){s.teams[1].faction=faction;assert.ok(V.corpse(s,c),kind+' faction '+faction+' has an authored death clip');}S.restore(s);if(S.types[kind].flying)assert.ok(V.corpse(s,{...c,age:4}).y<=.01,'flying body reaches ground');}
}
for(const kind of ['ballista','catapult','trebuchet','ram','critter']){const s=arena();assert.equal(kill(s,kind).c,undefined,'mechanical unit does not create a biological corpse');}
{const s=arena();assert.equal(kill(s,'soldier',{summoned:true}).c,undefined,'summoned units leave no persistent body');}
{
 const s=arena(),hero=S.spawn(s,'hero',0,0,0),target=S.spawn(s,'soldier',1,0,1,{hp:1});S.visibility(s);assert.equal(S.command(s,0,{type:'learn',ids:[hero.id],slot:0}),null);assert.equal(S.command(s,0,{type:'spell',ids:[hero.id],slot:0,x:0,z:1}),null);assert.equal(target.hp,0);assert.ok(s.units.includes(target));assert.equal(S.restore(s).corpses.length,1,'immediate spell death saves before the next cleanup tick');
}
console.log('PASS: authored death clips for every mobile biological roster, one-shot death, decay/capacity, movement/population/selection, hero revival, exact saves, legacy/malformed saves, fog privacy and post-victory cleanup');
