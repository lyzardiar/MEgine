// Author: MiYu. Cannibalize research, corpse ownership, healing, interruption and exact saved continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function arena(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map,factions:[3,0]});s.units=[];s.corpses=[];const crypt=S.spawn(s,'barracks',0,-12,-10),h=S.spawn(s,'ghoul',0,0,0,{hp:10,damage:0,order:{type:'hold'}}),a=S.spawn(s,'abomination',0,0,5,{hp:100,damage:0,order:{type:'hold'}});S.visibility(s);return {s,crypt,h,a};}
function corpse(s,x,z){const c={id:++s.serial,kind:'soldier',heroClass:0,team:1,x,y:0,z,yaw:0,age:0,boss:false,large:false};s.corpses.push(c);return c;}
const eat=(s,...units)=>S.command(s,0,{type:'cannibalize',ids:units.map(u=>u.id)});
{
 const {s,crypt,h}=arena(),other=S.spawn(s,'barracks',0,-18,-10);corpse(s,1,0);assert.ok(eat(s,h));const before=s.teams[0].gold;assert.equal(S.command(s,0,{type:'cannibalizeResearch',ids:[crypt.id]}),null);assert.equal(s.teams[0].gold,before-75);assert.equal(crypt.cannibalizeResearch,30);assert.ok(S.command(s,0,{type:'cannibalizeResearch',ids:[other.id]}));assert.ok(S.command(s,0,{type:'train',ids:[crypt.id],kind:'ghoul'}));step(s,70);const saved=S.restore(S.clone(s));step(s,231);step(saved,231);assert.deepEqual(s,saved);assert.equal(s.teams[0].cannibalize,1);assert.equal(crypt.cannibalizeResearch,undefined);assert.ok(S.command(s,0,{type:'cannibalizeResearch',ids:[crypt.id]}));
 const legacy=S.clone(s);delete legacy.teams[0].cannibalize;assert.equal(S.restore(legacy).teams[0].cannibalize,0);
}
{
 const {s,crypt}=arena();assert.equal(S.command(s,0,{type:'cannibalizeResearch',ids:[crypt.id]}),null);const gold=s.teams[0].gold;assert.equal(S.command(s,0,{type:'cancelCannibalizeResearch',ids:[crypt.id]}),null);assert.equal(s.teams[0].gold,gold+75);assert.equal(S.command(s,0,{type:'cannibalizeResearch',ids:[crypt.id]}),null);crypt.hp=0;step(s,310);assert.equal(s.teams[0].cannibalize,0);
}
{
 const {s,h,a}=arena();s.teams[0].cannibalize=1;const c=corpse(s,1,0),d=corpse(s,1,5);assert.equal(eat(s,h,a),null);step(s,10);near(h.hp,20);near(a.hp,115);near(S.feeding(h),32);assert.ok(s.corpses.some(v=>v.id===c.id));
 const n=S.spawn(s,'necromancer',0,-2,0,{damage:0,mana:200,raiseDeadAuto:false,order:{type:'hold'}});S.visibility(s);assert.ok(S.command(s,0,{type:'raiseDead',ids:[n.id],corpse:c.id}),'claimed corpse is unavailable');
 const previous=structuredClone(h.order);assert.equal(S.command(s,0,{type:'move',ids:[h.id,n.id],x:-5,z:0}),null);assert.deepEqual(h.order,previous,'group move preserves feeding');assert.equal(S.command(s,0,{type:'stop',ids:[h.id]}),null);assert.equal(h.order,null);assert.equal(eat(s,h),null);step(s,1);
 const snapshot=S.clone(s),restored=S.restore(snapshot);step(s,80);step(restored,80);assert.deepEqual(s.units,restored.units);assert.deepEqual(s.corpses,restored.corpses);step(s,300);assert.equal(h.hp,h.maxHp);near(a.hp,595);assert.equal(a.order,null);assert.ok(!s.corpses.some(v=>v.id===c.id||v.id===d.id));
}
{
 const {s,h,a}=arena();s.teams[0].cannibalize=1;a.x=0;a.z=0;a.hp=50;const c=corpse(s,1,0);assert.equal(eat(s,a,h),null);assert.equal(h.order.target,c.id,'most injured fraction is served first');assert.equal(a.order.type,'hold');step(s,1);h.stun=1;step(s,1);assert.equal(h.order,null);assert.equal(eat(s,a),null);step(s,1);assert.ok(S.feeding(a)>0);a.hp=0;step(s,1);h.stun=0;assert.equal(eat(s,h),null,'death frees reservation');
}
{
 const {s,h}=arena();s.teams[0].cannibalize=1;const c=corpse(s,5,0);assert.equal(eat(s,h),null);step(s,1);assert.equal(h.hp,10,'walk does not heal');step(s,20);assert.ok(h.hp>10);assert.ok(S.distance(h,c)<=S.cannibalize.reach);assert.equal(S.command(s,0,{type:'move',ids:[h.id],x:-8,z:0}),null);const hp=h.hp;step(s,10);assert.equal(h.hp,hp,'individual command stops healing');
}
for(const setup of [f=>{f.h.hp=f.h.maxHp;},f=>{f.h.stun=1;},f=>{f.s.visible[0].fill(0);},f=>{f.s.corpses[0].kind='hero';},f=>{f.s.corpses[0].x=10;}]){const f=arena();f.s.teams[0].cannibalize=1;corpse(f.s,1,0);setup(f);const before=S.clone(f.s);assert.ok(eat(f.s,f.h));assert.deepEqual(f.s,before,'rejected cannibalize is atomic');}
{
 const {s,h,crypt}=arena();s.teams[0].cannibalize=1;corpse(s,1,0);eat(s,h);step(s,1);for(const patch of [{left:34},{left:0},{active:1},{target:-1}]){const save=S.clone(s);Object.assign(save.units.find(u=>u.id===h.id).order,patch);assert.throws(()=>S.restore(save));}
 const wrong=S.clone(s);wrong.teams[0].faction=0;assert.throws(()=>S.restore(wrong));
 const duplicate=S.clone(s);duplicate.units.find(u=>u.id!==h.id&&u.kind==='abomination').order=S.clone(h.order);assert.throws(()=>S.restore(duplicate));
 const display=S.clone(s);const unit=display.units.find(u=>u.id===crypt.id);unit.feeding=1;const repaired=S.restore(display);assert.equal(repaired.units.find(u=>u.id===crypt.id).feeding,undefined);S.tick(repaired);
 S.spawn(s,'soldier',1,3,0,{damage:0,order:{type:'hold'}});S.visibility(s);const publicState=S.publicState(s,1);assert.ok(S.feeding(publicState.units.find(u=>u.id===h.id))>0,'visible enemy retains feeding presentation');assert.equal(publicState.teams[0].cannibalize,undefined);assert.ok(publicState.units.filter(u=>u.team===0).every(u=>u.order===null&&!u.cannibalizeResearch));const own=S.publicState(s,0);assert.equal(own.units.find(u=>u.id===h.id).order.target,h.order.target);
}
{
 const {s,h}=arena();s.teams[0].cannibalize=1;const c=corpse(s,5,0);assert.equal(eat(s,h),null);h.speed=0;step(s,210);assert.ok(!s.corpses.some(v=>v.id===c.id),'unreachable pending corpse still decays');assert.equal(h.order,null);h.speed=3.8;corpse(s,1,0);eat(s,h);step(s,1);s.winner=0;step(s,210);assert.equal(s.corpses.length,0,'victory does not freeze a reserved corpse');
}
{
 const {s,h}=arena();s.teams[0].cannibalize=1;s.teams[0].ai=true;s.frame=39;corpse(s,1,0);step(s,1);assert.ok(S.feeding(h)>0,'AI eats when injured and safe');
}
console.log('PASS: Cannibalize research/refund, corpse reservation, injured priority, walking, exact healing, group protection, interruption, completion, save validation and privacy');
