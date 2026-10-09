// Author: MiYu. Source-ranked permanent Carrion Beetles, corpse arbitration and deterministic save/network checks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cryptLordFixture} from './frost-crypt-lord-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),H=require('../samples/frostbound-realms/game/crypt-lord.js'),hold={cd:10000,order:{type:'hold'}},step=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function learn(s,h,rank){for(let i=0;i<rank;i++)assert.equal(cmd(s,h,'learn',{slot:2}),null);h.mana=S.maxMana(h);}
function corpse(s,h,x=3,z=0){const v=S.spawn(s,'soldier',1,x,z,{...hold,hp:1});S.visibility(s);S.fire(s,h,v);assert.equal(v.hp,0);const body=s.corpses.find(c=>c.id===v.id);assert.ok(body);return body;}
function cast(s,h,body){h.spell[2]=0;h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:2,corpse:body.id}),null);step(s,4);}
for(let rank=1;rank<=3;rank++){
 const {s,h}=cryptLordFixture(S,6);learn(s,h,rank);const body=corpse(s,h);assert.equal(cmd(s,h,'spell',{slot:2,corpse:body.id}),null);assert.ok(s.corpses.includes(body));assert.equal(S.beetleArmy(s,h).length,0);const mana=h.mana;step(s,3);assert.equal(S.beetleArmy(s,h).length,0);assert.ok(s.corpses.includes(body));const saved=S.restore(s);step(s);step(saved);assert.deepEqual(saved,s);const b=S.beetleArmy(s,h)[0],r=H.rules.summons['ucs'+rank];assert.ok(b);assert.equal(s.corpses.some(c=>c.id===body.id),false);assert.equal(b.sourceUnit,r.id);assert.equal(b.maxHp,r.hp);assert.equal(b.damage,r.weapon.damage);assert.equal(b.armorValue,r.armorValue);assert.equal(S.movementRadius(b),r.collision);assert.equal(b.expires,undefined);assert.equal(S.maxMana(b),0);assert.equal(h.spell[2],6);assert.ok(h.mana<mana-28);assert.equal(S.population(s,0).used,5);assert.ok(S.restore(s));b.cd=10000;step(s,1200);assert.equal(b.hp,r.hp);assert.equal(b.mana,0);assert.ok(S.beetleArmy(s,h).includes(b));assert.ok(S.restore(s));
}
console.log('PASS ranked permanent summons, source combat/collision stats, corpse consumption at cast point, no food/mana and deterministic mid-cast restoration');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);const births=[];for(let i=0;i<6;i++){const body=corpse(s,h,3+i*.35,i%2);cast(s,h,body);births.push(s.serial);}const army=S.beetleArmy(s,h);assert.equal(army.length,5);assert.equal(army.some(v=>v.id===births[0]),false);assert.deepEqual(army.map(v=>v.id),births.slice(1));assert.equal(s.corpses.some(c=>c.kind==='carrionbeetle'),false);assert.equal(s.teams[1].kills,0);assert.ok(S.restore(s));learn(s,h,2);cast(s,h,corpse(s,h,5,-1));assert.equal(S.beetleArmy(s,h).filter(v=>v.beetleRank===1).length,4);assert.equal(S.beetleArmy(s,h).at(-1).beetleRank,3);assert.ok(S.restore(s));
 const enemy=S.spawn(s,'soldier',1,-1,0,{...hold,damage:10000});S.fire(s,enemy,h);assert.equal(h.hp,0);assert.equal(S.beetleArmy(s,h).length,5);step(s,20);assert.equal(S.beetleArmy(s,h).length,5);assert.ok(S.restore(s));
}
console.log('PASS oldest-of-five replacement across ranks, no replacement bounty/corpse and summons surviving caster death');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);const b=corpse(s,h);assert.equal(cmd(s,h,'spell',{slot:2,corpse:b.id}),null);assert.equal(cmd(s,h,'stop'),null);step(s,4);assert.ok(s.corpses.some(c=>c.id===b.id));assert.equal(S.beetleArmy(s,h).length,0);assert.equal(h.spell[2],0);
 assert.equal(cmd(s,h,'spell',{slot:2,corpse:b.id}),null);s.corpses=[];const mana=h.mana;step(s,4);assert.ok(h.mana>=mana);assert.equal(h.spell[2],0);assert.equal(S.beetleArmy(s,h).length,0);assert.match(cmd(s,h,'spell',{slot:2}),/corpse/);assert.ok(S.restore(s));
}
console.log('PASS cancelled cast and consumed/expired competing corpse leave mana, cooldown and summon count intact');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);const nearBody=corpse(s,h,2,0),farBody=corpse(s,h,5,1);assert.equal(cmd(s,h,'beetlesAuto',{enabled:true}),null);h.order={type:'move',x:-3,z:0};const route=structuredClone(h.order);step(s,10);assert.equal(h.cryptLordCast.corpse,nearBody.id);assert.equal(h.cryptLordCast.auto,true);assert.deepEqual(h.order,route);const saved=S.restore(s);step(s,4);step(saved,4);assert.deepEqual(saved,s);assert.equal(s.corpses.some(c=>c.id===nearBody.id),false);assert.ok(s.corpses.some(c=>c.id===farBody.id));assert.deepEqual(h.order,route);assert.equal(cmd(s,h,'beetlesAuto',{enabled:false}),null);assert.match(cmd(s,h,'beetlesAuto',{enabled:'true'}),/autocast/);assert.ok(S.restore(s));
}
console.log('PASS autocast picks nearest visible corpse, preserves ordinary order and restores deterministically');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,2);cast(s,h,corpse(s,h));const b=S.beetleArmy(s,h)[0];b.cd=0;const enemy=S.spawn(s,'soldier',1,b.x+.6,b.z,{...hold,hp:1000,maxHp:1000});S.visibility(s);step(s);assert.ok(b.weaponWindup);const saved=S.restore(s),hp=enemy.hp;step(s,4);step(saved,4);assert.deepEqual(saved,s);assert.ok(enemy.hp<hp);assert.equal(b.weaponWindup,undefined);const ranges=new Set();for(let i=0;i<30;i++)ranges.add(S.nightWeaponRoll(s,b));assert.ok([...ranges].every(v=>v>=15&&v<=18));assert.ok(ranges.size>1);
 b.hp-=10;const before=b.hp;step(s);near(b.hp,before);s.blight.push({x:b.x,z:b.z,team:0,radius:3.5});step(s);assert.ok(b.hp>before);assert.ok(S.restore(s));
}
console.log('PASS source melee dice and windup survive restoration, with blight-only health regeneration');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);cast(s,h,corpse(s,h));const b=S.beetleArmy(s,h)[0];S.visibility(s);for(const mutate of [u=>u.sourceUnit='ucs2',u=>u.expires=100,u=>u.beetleRank=4,u=>u.beetleBorn=s.frame+1,u=>u.summoner=999999,u=>u.maxHp++,u=>u.mana=1,u=>u.damage++]){const bad=S.clone(s);mutate(bad.units.find(v=>v.id===b.id));assert.throws(()=>S.restore(bad),/Carrion Beetle/);}const state=S.publicState(s,0),pub=state.units.find(v=>v.id===b.id);assert.equal(pub.summoner,undefined);assert.equal(pub.beetleBorn,undefined);assert.equal(pub.sourceUnit,'ucs1');assert.ok(S.restore(s));
}
console.log('PASS strict ranked summon provenance/expiry/stat forgery rejection and private network projection');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);const body=corpse(s,h);while(s.units.length<S.LIMIT)S.spawn(s,'soldier',0,20,20,hold);const mana=h.mana;assert.match(cmd(s,h,'spell',{slot:2,corpse:body.id}),/capacity/);assert.equal(h.mana,mana);assert.equal(h.spell[2],0);assert.ok(s.corpses.includes(body));
 const f=cryptLordFixture(S,6);learn(f.s,f.h,1);for(let i=0;i<5;i++)cast(f.s,f.h,corpse(f.s,f.h,3+i*.5));const target=corpse(f.s,f.h,5,1),oldest=S.beetleArmy(f.s,f.h)[0];while(f.s.units.length<S.LIMIT)S.spawn(f.s,'soldier',0,20,20,hold);cast(f.s,f.h,target);assert.equal(S.beetleArmy(f.s,f.h).length,5);assert.equal(S.beetleArmy(f.s,f.h).some(v=>v.id===oldest.id),false);assert.equal(oldest.hp,0);assert.equal(oldest.weaponWindup,undefined);assert.ok(S.restore(f.s));
}
console.log('PASS unit capacity rejects growth atomically and permits five-beetle replacement without net growth');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);const body=corpse(s,h);s.teams[0].cannibalize=1;const g=S.spawn(s,'ghoul',0,body.x,body.z,{...hold,hp:100});S.visibility(s);assert.equal(S.command(s,0,{type:'cannibalize',ids:[g.id]}),null);assert.match(cmd(s,h,'spell',{slot:2,corpse:body.id}),/corpse/);assert.equal(h.spell[2],0);assert.equal(S.beetleArmy(s,h).length,0);assert.ok(S.restore(s));
}
console.log('PASS Cannibalize-claimed corpse is not consumed by Carrion Beetles');
for(let rank=2;rank<=3;rank++){
 const {s,h}=cryptLordFixture(S,6);learn(s,h,rank);cast(s,h,corpse(s,h));const b=S.beetleArmy(s,h)[0];b.hp-=20;assert.equal(cmd(s,b,'burrow'),null);assert.match(cmd(s,b,'stop'),/uninterruptible/);assert.ok(S.restore(s));step(s,14);assert.equal(b.sourceUnit,'ucs'+rank);assert.ok(b.beetleShift);const saved=S.restore(s);step(s);step(saved);assert.deepEqual(saved,s);assert.equal(b.sourceUnit,rank===2?'ucsB':'ucsC');assert.equal(b.speed,0);assert.equal(b.damage,0);assert.ok(S.beetleBurrowed(b));assert.ok(S.isHidden(s,b));assert.ok(S.isVisible(s,0,b));const enemy=S.spawn(s,'soldier',1,b.x+.6,b.z,hold);S.visibility(s);assert.equal(S.isVisible(s,1,b),false);b.detectedUntil=[0,s.frame+10];assert.equal(S.isVisible(s,1,b),true);assert.equal(S.canAttack(b,enemy),false);assert.equal(S.fire(s,b,enemy),false);assert.match(cmd(s,b,'move',{x:10,z:0}),/Unburrow/);const hp=b.hp,position=[b.x,b.z];step(s);near(b.hp,hp+.2);assert.deepEqual([b.x,b.z],position);assert.ok(S.restore(s));
 assert.equal(cmd(s,b,'unburrow'),null);b.stun=1;const resume=S.restore(s);step(s,15);step(resume,15);assert.deepEqual(resume,s);assert.equal(b.sourceUnit,'ucs'+rank);assert.equal(b.speed,2.7);assert.equal(b.damage,H.rules.summons['ucs'+rank].weapon.damage);assert.equal(S.isHidden(s,b),false);assert.equal(b.beetleShift,undefined);assert.equal(cmd(s,b,'move',{x:6,z:0}),null);step(s);assert.ok(b.x!==position[0]||b.z!==position[1]);assert.ok(S.restore(s));
}
console.log('PASS source rank 2/3 burrow forms, 1.45s transformation, invisibility/detection, disabled movement/weapon, permanent regeneration and restored unburrow');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);cast(s,h,corpse(s,h));const b=S.beetleArmy(s,h)[0];assert.match(cmd(s,b,'burrow'),/rank 2 or 3/);
 const f=cryptLordFixture(S,6);learn(f.s,f.h,2);cast(f.s,f.h,corpse(f.s,f.h));const v=S.beetleArmy(f.s,f.h)[0];assert.equal(cmd(f.s,v,'burrow'),null);for(const mutate of [c=>c.burrow=false,c=>c.left++,c=>c.frame++,c=>c.extra=1]){const bad=S.clone(f.s);mutate(bad.units.find(u=>u.id===v.id).beetleShift);assert.throws(()=>S.restore(bad),/transformation/);}const enemy=S.spawn(f.s,'soldier',1,v.x+.5,v.z,{...hold,damage:10000});S.fire(f.s,enemy,v);assert.equal(v.hp,0);assert.equal(v.beetleShift,undefined);assert.ok(S.restore(f.s));
}
console.log('PASS rank 1 burrow exclusion, morph-state forgery rejection and death cleanup during transformation');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,2);cast(s,h,corpse(s,h));const b=S.beetleArmy(s,h)[0];b.x=1;b.z=0;const base=S.spawn(s,'hall',0,20,20);h.inventory=[8];S.visibility(s);assert.equal(cmd(s,h,'useItem',{slot:0,item:8,target:base.id}),null);step(s,49);assert.equal(cmd(s,b,'burrow'),null);assert.ok(S.restore(s));step(s);assert.ok(S.distance(b,base)<6);assert.equal(b.order,null);assert.ok(b.beetleShift);const saved=S.restore(s);step(s,14);step(saved,14);assert.deepEqual(saved,s);assert.equal(b.sourceUnit,'ucsB');assert.ok(S.restore(s));
}
console.log('PASS Town Portal during beetle transformation preserves its timer and produces a restorable arrival state');
{
 const {s,h}=cryptLordFixture(S,6);s.teams[1].faction=2;learn(s,h,2);const b=S.spawn(s,'carrionbeetle',0,1,0,{beetleRank:2,sourceUnit:'ucs2',beetleBorn:s.frame,summoner:h.id,summoned:true,...hold}),giant=S.spawn(s,'mountaingiant',1,2,0,hold);S.visibility(s);assert.equal(cmd(s,b,'burrow'),null);assert.equal(S.canAttack(b,giant),false);assert.ok(S.restore(s));assert.equal(cmd(s,giant,'taunt'),null);assert.deepEqual(b.order,{type:'hold'});assert.ok(b.beetleShift);assert.ok(S.restore(s));step(s,15);assert.equal(b.sourceUnit,'ucsB');assert.ok(S.restore(s));
}
console.log('PASS Mountain Giant Taunt respects the beetle transformation and cannot force an attack order');
