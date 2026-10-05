// Author: MiYu. Construction lifecycle, economy, saved occupants and expansion regression checks.
import assert from 'node:assert/strict';
import {battleFixture,setTechnology} from './frost-battle-fixture.mjs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function setup(faction=0){const s=battleFixture(S,'skirmish',{factions:[faction,0],ai:[false,false]},['hero','barracks','farm','guard','harvest']);s.map.terrain.fill(0);s.map.heights.fill(0);s.map.relief.fill(0);s.map.ramps.fill(0);s.teams[0].gold=3000;s.teams[0].wood=3000;for(const u of s.units)u.order=null;const w=s.units.find(u=>u.kind==='worker');w.x=-14;w.z=20;return {s,w};}
function build(s,w,kind='barracks'){assert.equal(S.command(s,0,{type:'build',ids:[w.id],kind,x:-10,z:20}),null);return s.units.at(-1);}
for(let f=0;f<4;f++){
  let {s,w}=setup(f);const b=build(s,w),id=w.id;assert.equal(b.hp,b.maxHp*.1);S.tick(s);assert.equal(b.built,.01,'foundation waits for worker arrival');step(s,30);assert.ok(b.built>.01);assert.equal(!!w.inside,f===1||f===2);assert.equal(S.isVisible(s,0,w),!w.inside);assert.ok(S.publicState(s,0).units.some(u=>u.id===id),'own occupant retained for food');s.visible[1].fill(1);const enemy=S.publicState(s,1);assert.equal(enemy.units.find(u=>u.id===b.id).construction,undefined);if(w.inside){assert.ok(!enemy.units.some(u=>u.id===id));assert.ok(!S.canAttack({kind:'archer'},w));assert.ok(S.command(s,0,{type:'build',ids:[id],kind:'farm',x:0,z:0}));}
  const saved=S.restore(s);step(saved,200);assert.equal(saved.units.find(u=>u.id===b.id).built,1);assert.equal(saved.units.some(u=>u.id===id),f!==2,'living building consumes worker');if(f!==2)assert.ok(!saved.units.find(u=>u.id===id).inside);
  const money=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(S.command(s,0,{type:'cancelBuild',ids:[b.id]}),null);assert.equal(s.teams[0].gold,money+135);assert.equal(s.teams[0].wood,wood+60);assert.ok(S.command(s,0,{type:'cancelBuild',ids:[b.id]}));step(s,1);assert.ok(s.units.some(u=>u.id===id&&u.hp>0&&!u.inside));assert.ok(!s.units.some(u=>u.id===b.id));assert.doesNotThrow(()=>S.restore(s));
}
{
  const {s,w}=setup(),b=build(s,w);step(s,25);assert.equal(S.command(s,0,{type:'stop',ids:[w.id]}),null);const paused=b.built;step(s,20);assert.equal(b.built,paused);const w2=s.units.find(u=>u.kind==='worker'&&u.id!==w.id);w2.x=-12;w2.z=20;assert.equal(S.command(s,0,{type:'construct',ids:[w.id,w2.id],target:b.id}),null);const g=s.teams[0].gold;step(s,10);assert.ok(b.built-paused>1/9);assert.ok(s.teams[0].gold<g,'assistance consumes resources');step(s,100);assert.equal(b.built,1);
  b.hp-=200;const hp=b.hp,gold=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(S.command(s,0,{type:'repair',ids:[w.id],target:b.id}),null);step(s,10);assert.ok(b.hp>hp);assert.ok(s.teams[0].gold<gold&&s.teams[0].wood<wood);S.command(s,0,{type:'stop',ids:[w.id]});const stopped=b.hp;step(s,10);assert.equal(b.hp,stopped);assert.ok(S.command(s,1,{type:'repair',ids:[w.id],target:b.id}));s.teams[0].gold=0;S.command(s,0,{type:'repair',ids:[w.id],target:b.id});step(s,10);assert.equal(b.hp,stopped);
}
for(const f of [1,2]){
  const {s,w}=setup(f),b=build(s,w);step(s,25);assert.ok(w.inside);const attacker=S.spawn(s,'hero',1,b.x+1,b.z,{damage:10000});attacker.order={type:'attack',target:b.id};S.visibility(s);step(s,2);assert.equal(b.hp,0);assert.equal(w.hp>0,f===1);assert.ok(!w.inside);assert.ok(!w.order);assert.doesNotThrow(()=>S.restore(s));
}
{
  const {s,w}=setup(3);w.x=0;w.z=10;assert.match(S.command(s,0,{type:'build',ids:[w.id],kind:'farm',x:5,z:10}),/territory/);assert.equal(S.command(s,0,{type:'build',ids:[w.id],kind:'hall',x:5,z:10}),null);step(s,1100);const expansion=s.units.at(-1);assert.equal(expansion.built,1);const home=s.units.find(u=>u.kind==='hall'&&u.id!==expansion.id&&u.team===0),foe=S.spawn(s,'hero',1,home.x+1,home.z,{damage:10000,order:{type:'attack',target:home.id}});S.visibility(s);step(s,2);assert.equal(home.hp,0);assert.equal(s.winner,null,'remaining hall preserves skirmish');foe.x=expansion.x+1;foe.z=expansion.z;foe.cd=0;foe.order={type:'attack',target:expansion.id};S.visibility(s);step(s,2);assert.equal(s.winner,1);
}
{
  const {s,w}=setup();w.x=0;w.z=10;w.cargo=20;w.cargoKind='mine';w.order={type:'gather',resource:s.resources.findIndex(r=>r.kind==='mine')};const near=S.spawn(s,'hall',0,5,10,{built:.5}),far=S.spawn(s,'hall',0,0,17);const gold=s.teams[0].gold;step(s,1);assert.deepEqual(w.dest,[far.x,far.z],'return to nearest completed base');step(s,40);assert.ok(s.teams[0].gold>=gold+20);assert.equal(near.built,.5);assert.equal(far.hp,far.maxHp);
}
{
  const {s,w}=setup(1),b=build(s,w);step(s,25);const invalid=S.clone(s);invalid.units.find(u=>u.id===w.id).inside=9999;assert.throws(()=>S.restore(invalid));const invalidCost=S.clone(s);invalidCost.units.find(u=>u.id===b.id).construction.paidGold=1e6;assert.throws(()=>S.restore(invalidCost));
  const legacy=setup().s,old=S.spawn(legacy,'farm',0,-10,20,{built:.2});const restored=S.restore(legacy);step(restored,70);assert.equal(restored.units.find(u=>u.id===old.id).built,1,'legacy construction keeps progressing');
}
{
  const {s,w}=setup(2);build(s,w);step(s,25);s.units=s.units.filter(u=>u.id!==w.id);assert.throws(()=>S.restore(s),'living building must retain its consumed worker until completed');
}
for(let f=0;f<4;f++){
  const {s}=setup(f);setTechnology(S,s,0,3);s.teams[0].ai=true;const firstId=s.serial;step(s,800);assert.ok(s.units.some(u=>u.id>firstId&&u.kind==='workshop'&&u.built===1),'AI finishes workshop for faction '+f);assert.ok(s.units.some(u=>u.team===0&&u.kind==='worker'&&!u.inside&&u.order?.type==='gather'),'AI retains economy for faction '+f);
}
{
  const {s,w}=setup();const b=build(s,w,'hall');for(const u of s.units)if(u.team===0&&u.kind==='hall'&&u.id!==b.id)u.hp=0;assert.equal(S.command(s,0,{type:'cancelBuild',ids:[b.id]}),null);assert.equal(s.winner,1,'cancelling last surviving hall also ends skirmish');
}
{
  const {s,w}=setup(),b=build(s,w,'hall'),h=s.units.find(u=>u.team===0&&u.kind==='hero');h.x=b.x;h.z=b.z;h.hp-=100;const hp=h.hp;assert.match(S.command(s,0,{type:'buy',ids:[h.id],item:0}),/Visit/);step(s,5);assert.equal(h.hp,hp,'unfinished base cannot heal heroes');
}
console.log('PASS: four construction styles, arrival/pause/assist, repair costs, cancel/refund, occupants, expansion defeat, nearest completed base and save migration');
