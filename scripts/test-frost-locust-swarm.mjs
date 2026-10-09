// Author: MiYu. Moving source Locust actors, delayed attacks, returned life, lifecycle and deterministic save/network state.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cryptLordFixture} from './frost-crypt-lord-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),hold={cd:10000,order:{type:'hold'}},step=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){const f=cryptLordFixture(S,6);assert.equal(cmd(f.s,f.h,'learn',{slot:3}),null);f.h.mana=S.maxMana(f.h);return f;}
function cast(s,h){h.mana=S.maxMana(h);h.spell[3]=0;assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,4);assert.ok(h.locustSwarm);return h.locustSwarm;}
function enemy(s,x=3,z=0,extra={}){const v=S.spawn(s,'soldier',1,x,z,{...hold,hp:10000,maxHp:10000,...extra});S.visibility(s);return v;}
{
 const {s,h}=fixture(),before=h.mana;assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,3);assert.equal(h.locustSwarm,undefined);assert.equal(s.locusts.length,0);const saved=S.restore(s);step(s);step(saved);assert.deepEqual(saved,s);assert.equal(h.spell[3],180);assert.ok(h.mana<before-148);assert.equal(h.locustSwarm.expires-h.locustSwarm.frame,300);assert.equal(s.locusts.length,0);
 step(s);assert.equal(s.locusts.length,0);step(s);assert.equal(s.locusts.length,1);const birth=s.locusts[0];assert.equal(birth.x,h.x);step(s,38);assert.equal(s.locusts.length,20);assert.equal(h.locustSwarm.released,20);assert.deepEqual(s.locusts.map(l=>l.born),Array.from({length:20},(_,i)=>h.locustSwarm.frame+(i+1)*2));assert.ok(S.restore(s));assert.equal(S.population(s,0).used,5);
 const legacy=S.clone(s);legacy.locusts=[];delete legacy.units[0].locustSwarm;delete legacy.locusts;delete legacy.locustSerial;assert.ok(S.restore(legacy));
}
console.log('PASS source ultimate cast point, 150 mana/180s cooldown, staggered twenty releases in four seconds, common 30s duration and legacy save migration');
{
 const {s,h}=fixture(),v=enemy(s,4),outside=enemy(s,10,0),ally=S.spawn(s,'soldier',0,3,1,hold);cast(s,h);const hp=v.hp,far=outside.hp;step(s,2);assert.equal(v.hp,hp);step(s,5);assert.equal(v.hp,hp);assert.ok(s.locusts.some(l=>l.x>0&&l.x<4));assert.equal(ally.hp,ally.maxHp);for(let i=0;i<65;i++){step(s);assert.ok(s.locusts.filter(l=>l.target===v.id).length<=7);}assert.ok(v.hp<hp);assert.equal(outside.hp,far);assert.ok(s.events.some(e=>['launch','impact','damage','heal'].includes(e.type))||s.locusts.some(l=>l.shot));assert.ok(S.restore(s));
 const g=fixture();const foes=[enemy(g.s,3,0),enemy(g.s,3,2),enemy(g.s,3,-2)];cast(g.s,g.h);step(g.s,50);assert.equal(g.s.locusts.length,20);for(const v of foes){assert.ok(g.s.locusts.filter(l=>l.target===v.id).length<=7);assert.ok(v.hp<10000);}assert.ok(S.restore(g.s));
}
console.log('PASS individual flight/contact attacks, seven-per-target allocation, air/ground radius and no instant area or friendly damage');
{
 const {s,h}=fixture(),v=enemy(s,1,0,{armorValue:100});cast(s,h);step(s,2);const l=s.locusts[0];l.x=v.x;l.y=1.5;l.z=v.z;step(s);assert.ok(l.shot);const raw=l.shot.damage,hp=v.hp;const prior=l.collected;step(s);near(hp-v.hp,raw/7);near(l.collected-prior,raw/7*.75);assert.ok(l.collected<20);assert.ok(S.restore(s));
 const g=fixture();g.h.hp-=500;const target=enemy(g.s,6,0,{armorValue:0});cast(g.s,g.h);step(g.s,2);const carrier=g.s.locusts[0];carrier.x=6;carrier.y=1.5;carrier.z=0;carrier.collected=19;step(g.s);const roll=carrier.shot.damage,hpBefore=g.h.hp;step(g.s);assert.equal(carrier.phase,'return');assert.ok(carrier.collected>20);near(carrier.collected,19+roll*.75);assert.ok(carrier.x>g.h.x);assert.ok(g.h.hp<hpBefore+1);carrier.x=g.h.x;carrier.y=1.5;carrier.z=g.h.z;const collected=carrier.collected,hpNow=g.h.hp;step(g.s);assert.ok(g.h.hp>=hpNow+collected);assert.equal(carrier.collected,0);assert.equal(carrier.phase,'seek');assert.ok(S.restore(g.s));
}
console.log('PASS after-armor damage accumulation, twenty-life return threshold without clipping accumulated healing, and healing only on physical arrival');
{
 const {s,h}=fixture(),v=enemy(s,3,0);cast(s,h);step(s,15);const hp=v.hp;assert.equal(cmd(s,h,'move',{x:-5,z:0}),null);step(s,30);assert.ok(h.x<0);assert.ok(h.locustSwarm);assert.ok(s.locusts.some(l=>l.x<0));assert.ok(v.hp<hp);const saved=S.restore(s);step(s,35);step(saved,35);assert.deepEqual(saved,s);h.stun=2;const timer=h.locustSwarm.expires;step(s,10);assert.equal(h.locustSwarm.expires,timer);assert.equal(s.locusts.length,20);assert.ok(S.restore(s));
}
console.log('PASS swarm follows a moving caster, persists through ordinary orders/stun and restores deterministic active combat');
{
 const {s,h}=fixture();h.hp-=500;const v=enemy(s,2,0);cast(s,h);step(s,295);assert.ok(h.locustSwarm);step(s,5);assert.ok(s.locusts.every(l=>l.phase==='return'));const targetHp=v.hp,saved=S.restore(s);step(s,45);step(saved,45);assert.deepEqual(saved,s);assert.equal(s.locusts.length,0);assert.equal(h.locustSwarm,undefined);assert.equal(v.hp,targetHp);assert.ok(S.restore(s));
 const g=fixture();cast(g.s,g.h);step(g.s,40);const old=g.s.locusts.map(l=>l.id);cast(g.s,g.h);assert.equal(g.s.locusts.length,0);assert.ok(!g.s.events.some(e=>e.type==='death'));step(g.s,2);assert.equal(g.s.locusts.length,1);assert.ok(!old.includes(g.s.locusts[0].id));assert.ok(S.restore(g.s));
}
console.log('PASS common expiry recalls all actors, final returns stop attacks and remove state, and recasting replaces actors without death events');
{
 const {s,h}=fixture();cast(s,h);step(s,20);const v=enemy(s,1,0,{damage:10000});S.fire(s,v,h);assert.equal(h.hp,0);assert.equal(h.locustSwarm,undefined);assert.equal(s.locusts.length,0);assert.ok(S.restore(s));step(s,10);assert.equal(s.locusts.length,0);
 const g=fixture(),v1=S.spawn(g.s,'dryad',1,2,0,hold);S.visibility(g.s);assert.ok(S.magicImmune(v1));assert.ok(S.locustTarget(g.s,g.h,v1));cast(g.s,g.h);const hp=v1.hp;step(g.s,25);assert.ok(v1.hp<hp);assert.ok(S.restore(g.s));
}
console.log('PASS caster death cancels all actors and pending shots; source spell-category physical attacks can damage magic-immune units');
{
 const {s,h}=fixture(),v=enemy(s,2,0);cast(s,h);step(s,6);let l=s.locusts[0];for(const mutate of [o=>o.owner=999999,o=>o.collected=-1,o=>o.ordinal=21,o=>o.born++,o=>o.frame++,o=>o.phase='attack',o=>o.cd=2,o=>o.extra=1]){const bad=S.clone(s);mutate(bad.locusts[0]);assert.throws(()=>S.restore(bad),/Locust/);}const bad=S.clone(s);bad.units[0].locustSwarm.released++;assert.throws(()=>S.restore(bad),/Locust/);
 step(s,5);l=s.locusts.find(l=>l.shot);if(!l){s.locusts[0].x=v.x;s.locusts[0].y=1.5;s.locusts[0].z=v.z;s.locusts[0].cd=0;delete s.locusts[0].roam;step(s);l=s.locusts.find(l=>l.shot);}assert.ok(l);const shotBad=S.clone(s);shotBad.locusts.find(v=>v.id===l.id).shot.damage=100;assert.throws(()=>S.restore(shotBad),/Locust missile/);S.visibility(s);const pub=S.publicState(s,1);assert.ok(pub.locusts.length);assert.equal(pub.locustSerial,undefined);assert.equal(pub.units.find(u=>u.id===h.id).locustSwarm,undefined);assert.ok(pub.units.find(u=>u.id===h.id).locustLeft>0);for(const p of pub.locusts)assert.deepEqual(Object.keys(p).sort(),['id','phase','team','x','y','yaw','z']);for(const p of pub.locustMissiles)assert.deepEqual(Object.keys(p).sort(),['id','team','x','y','z']);assert.ok(S.restore(s));
}
console.log('PASS strict actor/caster/missile forgery rejection and private owner/target/collection-free network projection');
{
 const {s,h}=fixture();cast(s,h);step(s,40);assert.equal(s.locusts.length,20);for(const mutate of [a=>a.locusts.pop(),a=>{a.locusts[0].phase='return';delete a.locusts[0].roam;delete a.locusts[0].target;},a=>a.locusts[0].collected=20]){const bad=S.clone(s);mutate(bad);assert.throws(()=>S.restore(bad),/Locust/);}assert.ok(S.restore(s));
}
console.log('PASS save rejection for missing released actors and inconsistent seek/return collection thresholds');
for(const kind of ['dragon','farm','hero']){
 const {s,h}=fixture(),v=S.spawn(s,kind,1,6,0,{...hold,order:kind==='farm'?null:hold.order,...(kind==='hero'?{heroClass:0,level:6,skillPoints:6}:{hp:10000,maxHp:10000})});S.visibility(s);assert.ok(S.locustTarget(s,h,v));cast(s,h);step(s,2);const l=s.locusts[0];l.x=v.x;l.y=S.unitHeight(s,v)+1.5;l.z=v.z;step(s);const raw=l.shot.damage,expected=S.weaponDamage({kind:'locust'},v,raw,s);step(s);near(l.collected,expected*.75);assert.ok(v.hp<v.maxHp);assert.ok(S.restore(s));
}
console.log('PASS actual flying, fortified building and source hero targets with original spell-category armor ratios');
{
 const {s,h}=fixture(),v=enemy(s,6,0);v.shield=100;v.shieldLeft=10;cast(s,h);step(s,2);const l=s.locusts[0];l.x=v.x;l.y=1.5;l.z=v.z;step(s);step(s);assert.equal(l.collected,0);assert.equal(v.hp,v.maxHp);assert.ok(v.shield<100);assert.ok(S.restore(s));
 const f=fixture(),victim=enemy(f.s,6,0,{hp:1});cast(f.s,f.h);step(f.s,2);const carrier=f.s.locusts[0];carrier.x=victim.x;carrier.y=1.5;carrier.z=victim.z;step(f.s,2);assert.equal(victim.hp,0);near(carrier.collected,.75);assert.ok(S.restore(f.s));
}
console.log('PASS fully absorbed hits return no life and overkill credits only actual removed hit points');
{
 const {s,h}=fixture(),v=enemy(s,6,0);cast(s,h);step(s,2);const l=s.locusts[0];l.x=v.x;l.y=1.5;l.z=v.z;step(s);assert.ok(l.shot);v.x=8;S.visibility(s);step(s);assert.ok(l.shot);assert.ok(l.shot.travel>0);assert.ok(l.shot.y>l.shot.baseY);assert.equal(l.shot.flightDistance<=.1+1e-6,true);const saved=S.restore(s);step(s,10);step(saved,10);assert.deepEqual(saved,s);assert.ok(S.restore(s));
}
console.log('PASS source missile speed/arc, moving-target flight and deterministic in-flight restoration');
{
 const {s,h}=fixture(),v=enemy(s,6,0);cast(s,h);step(s,2);const l=s.locusts[0];l.x=v.x;l.y=1.5;l.z=v.z;step(s);v.x=8;S.visibility(s);step(s);assert.ok(l.shot);for(const mutate of [p=>p.age+=.1,p=>p.travel=100,p=>p.flightDistance=0,p=>p.baseY=Infinity,p=>p.extra=1]){const bad=S.clone(s);mutate(bad.locusts[0].shot);assert.throws(()=>S.restore(bad),/Locust missile/);}assert.ok(S.restore(s));
}
console.log('PASS in-flight missile clock, travel, initial distance, height and unknown-field forgery rejection');
{
 const {s,h}=fixture(),mage=S.spawn(s,'hero',1,6,1,{...hold,heroClass:2,level:6,skillPoints:6});assert.equal(cmd(s,mage,'learn',{slot:3}),null);mage.mana=S.maxMana(mage);assert.equal(cmd(s,mage,'spell',{slot:3}),null);step(s,6);const p=s.units.find(S.phoenixUnit);p.cd=10000;cast(s,h);step(s,2);const l=s.locusts[0];l.x=p.x;l.y=S.unitHeight(s,p)+1.5;l.z=p.z;l.target=p.id;step(s);assert.ok(l.shot);p.hp=1;const prior=l.collected;step(s);assert.equal(p.kind,'phoenixegg');near(l.collected-prior,.75);assert.ok(S.restore(s));
}
console.log('PASS fatal Phoenix hit credits removed life before the egg form restores health');
{
 const {s,h}=fixture();s.teams[1].faction=3;const other=S.spawn(s,'hero',1,2,0,{...hold,heroClass:3,level:6,skillPoints:6});assert.equal(cmd(s,other,'learn',{slot:3}),null);other.mana=S.maxMana(other);assert.equal(cmd(s,h,'spell',{slot:3}),null);assert.equal(cmd(s,other,'spell',{slot:3}),null);step(s,6);const first=s.locusts.find(l=>l.owner===h.id),second=s.locusts.find(l=>l.owner===other.id);first.x=other.x;first.y=1.5;first.z=other.z;first.target=other.id;second.x=h.x;second.y=1.5;second.z=h.z;second.target=h.id;step(s);assert.ok(first.shot&&second.shot);other.hp=1;step(s);assert.equal(other.hp,0);assert.equal(other.locustSwarm,undefined);assert.ok(!s.locusts.some(l=>l.owner===other.id));assert.ok(S.restore(s));step(s,20);assert.ok(!s.locusts.some(l=>l.owner===other.id));
}
console.log('PASS opposing active swarms remove a slain caster and its pending actors without iterator reinsertion');
{
 const {s,h}=fixture();s.teams[1].faction=1;const v=S.spawn(s,'hero',1,6,0,{...hold,heroClass:2,level:6,skillPoints:6});assert.equal(cmd(s,v,'learn',{slot:3}),null);cast(s,h);step(s,2);const l=s.locusts[0];l.x=v.x;l.y=1.5;l.z=v.z;l.target=v.id;step(s);assert.ok(l.shot);v.hp=1;step(s);assert.equal(v.hp,0);assert.ok(v.reincarnation);near(l.collected,.75);assert.ok(S.restore(s));
}
console.log('PASS fatal Tauren hit credits removed life before delayed reincarnation');
