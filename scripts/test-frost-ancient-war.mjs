// Author: MiYu. Source training gates, complete timers, weapons, save continuation and legacy production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),order=(s,u,type,args={})=>S.command(s,u.team,{type,ids:[u.id],...args});
function arena(faction=2){const map=S.defaultMap();map.props=[];map.units=[];map.triggers=[];map.doodads=[];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);const s=S.create('skirmish',{map,factions:[faction,0],ai:[false,false]});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});S.spawn(s,'hall',0,-24,24,{damage:0});S.spawn(s,'hall',1,24,-24,{damage:0});for(let i=0;i<4;i++)S.spawn(s,'farm',0,-26+i*6,16);return s;}
const kinds=['nightarcher','nighthuntress','glaivethrower'];
for(const [kind,gold,wood,time,food,hp,armor,speed] of [['nightarcher',130,10,20,2,245,0,2.7],['nighthuntress',195,20,30,3,600,2,3.5],['glaivethrower',210,65,48,3,300,2,2.2]]){
 const s=arena(),war=S.spawn(s,'barracks',0,-8,0,{damage:0}),hall=S.spawn(s,'workshop',0,12,0,{built:.5});assert.deepEqual(S.trainable(s,war),kinds);assert.deepEqual(S.trainable(s,hall),[]);assert.equal(S.technologyTier(s,0),1);
 if(kind!=='nightarcher'){const before=S.clone(s);assert.match(order(s,war,'train',{kind}),/Hunter/);assert.deepEqual(s,before);}hall.built=1;
 const before=S.clone(s.teams[0]),used=S.population(s,0).used;assert.equal(order(s,war,'train',{kind}),null);assert.equal(s.teams[0].gold,before.gold-gold);assert.equal(s.teams[0].wood,before.wood-wood);assert.equal(S.population(s,0).used,used+food);assert.equal(war.queue[0].left,time);const saved=S.restore(s);step(s,time*10-1);step(saved,time*10-1);assert.equal(war.queue.length,1);assert.ok(!s.units.some(u=>u.kind===kind));S.tick(s);S.tick(saved);assert.deepEqual(saved,s);assert.equal(war.queue.length,0);const unit=s.units.find(u=>u.kind===kind);assert.ok(unit);assert.equal(unit.maxHp,hp);assert.equal(unit.armorValue,armor);assert.equal(unit.speed,speed);
 assert.equal(order(s,war,'train',{kind}),null);const paid=s.teams[0].gold;assert.equal(order(s,war,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,paid+gold);
}
{
 const s=arena(),w=S.spawn(s,'worker',0,0,0);S.visibility(s);const d=S.buildingType(s,'workshop',0);assert.equal(d.gold,210);assert.equal(d.wood,100);assert.equal(d.time,60);assert.equal(order(s,w,'build',{kind:'workshop',x:2,z:0}),null);const hall=s.units.at(-1);assert.equal(hall.huntersHallRules,1);assert.equal(hall.maxHp,1100);assert.equal(hall.armorValue,5);step(s,599);assert.ok(hall.built<1);S.tick(s);assert.equal(hall.built,1);assert.ok(S.restore(s));
}
for(const faction of [0,1,2,3])for(const kind of kinds){const s=arena(faction),u=S.spawn(s,kind,0,0,0);assert.equal(u.damage,S.types[kind].damage);assert.equal(u.speed,S.types[kind].speed);assert.equal(u.hp,S.types[kind].hp);}
function launch(kind,distance=4){const s=arena(),u=S.spawn(s,kind,0,0,0),target=S.spawn(s,'soldier',1,distance,0,{damage:0,order:{type:'hold'},hp:1000,maxHp:1000});S.visibility(s);assert.equal(order(s,u,'attack',{target:target.id}),null);S.tick(s);assert.ok(u.weaponWindup);assert.equal(s.projectiles.length,0);const saved=S.restore(s);for(let i=0;i<20&&!s.projectiles.length;i++){S.tick(s);S.tick(saved);}assert.deepEqual(saved,s);assert.equal(s.projectiles.length,1);u.cd=100;return {s,u,target,p:s.projectiles[0]};}
{
 const {s,u,target,p}=launch('nightarcher');assert.equal(p.art,'night-arrow');assert.equal(S.projectileSpeed(p),9);assert.ok(s.frame>=9);assert.equal(p.damage,17);const targetHp=target.hp,saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(s,saved);close(targetHp-target.hp,17*.75);const air=S.spawn(s,'dragon',1,4,0,{damage:0});assert.equal(S.canAttack(u,air),true);
}
{
 const {s,u,target,p}=launch('nighthuntress',2),neighbor=S.spawn(s,'soldier',1,4.5,0,{damage:0,order:{type:'hold'},hp:1000,maxHp:1000}),friend=S.spawn(s,'soldier',0,3.5,0,{damage:0,order:{type:'hold'}}),air=S.spawn(s,'dragon',1,3,0,{damage:0,order:{type:'hold'}});assert.equal(p.art,'moon-glaive');assert.equal(S.canAttack(u,air),false);
 for(let i=0;i<20&&s.projectiles[0]?.bounceLeft!==0;i++)S.tick(s);assert.equal(s.projectiles.length,1);assert.equal(p.bounceLeft,0);assert.equal(p.target,neighbor.id);assert.deepEqual(p.bounceHits,[target.id]);close(p.damage,8.5);const saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(saved,s);close(1000-target.hp,17*1.5);close(1000-neighbor.hp,8.5*1.5);assert.equal(friend.hp,friend.maxHp);assert.equal(air.hp,air.maxHp);const bad=S.clone(saved);bad.projectiles=[{...p,bounceHits:[neighbor.id]}];assert.throws(()=>S.restore(bad),/bounce/);
}
{
 const {s,u,target,p}=launch('glaivethrower',7),near=S.spawn(s,'soldier',1,7,.1,{damage:0,order:{type:'hold'},hp:1000,maxHp:1000}),middle=S.spawn(s,'soldier',1,7,.4,{damage:0,order:{type:'hold'},hp:1000,maxHp:1000}),far=S.spawn(s,'soldier',1,7,1.2,{damage:0,order:{type:'hold'},hp:1000,maxHp:1000}),friend=S.spawn(s,'soldier',0,7,-.4,{damage:0,order:{type:'hold'},hp:1000,maxHp:1000});assert.equal(p.art,'glaive');assert.equal(S.projectileSpeed(p),14);const saved=S.restore(s);step(s,15);step(saved,15);assert.deepEqual(saved,s);close(1000-target.hp,44.5*.5);close(1000-near.hp,44.5*.5);close(1000-middle.hp,44.5*.4*.5);close(1000-far.hp,44.5*.25*.5);close(1000-friend.hp,44.5*.4*.5);
 const closeTarget=S.spawn(s,'soldier',1,1,0,{damage:0,order:{type:'hold'}});u.cd=0;assert.equal(order(s,u,'attack',{target:closeTarget.id}),null);step(s,10);assert.equal(s.projectiles.length,0);assert.equal(closeTarget.hp,closeTarget.maxHp);assert.ok(!u.weaponWindup);
}
{
 const s=arena(),u=S.spawn(s,'glaivethrower',0,0,0),closeEnemy=S.spawn(s,'soldier',1,1,0,{damage:0,order:{type:'hold'}}),farEnemy=S.spawn(s,'soldier',1,5,0,{damage:0,order:{type:'hold'}});S.visibility(s);step(s,2);assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].target,farEnemy.id);assert.equal(closeEnemy.hp,closeEnemy.maxHp);
}
{
 const {s,target}=launch('glaivethrower',7),friend=S.spawn(s,'soldier',0,7,.4,{damage:0,order:{type:'hold'},hp:1});const gold=s.teams[0].gold,kills=s.teams[0].kills;step(s,15);assert.equal(friend.hp,0);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].kills,kills);assert.ok(!s.events.some(e=>e.type==='deny'));assert.ok(target.hp>0);
}
{
 const {s,target}=launch('glaivethrower',7);target.z=.75;step(s,15);close(1000-target.hp,44.5*.25*.5);
}
for(const kind of ['nightarcher','nighthuntress']){const s=arena(),u=S.spawn(s,kind,0,0,0);s.map.startingHour=22;u.hp=100;step(s,10);close(u.hp,100.5);assert.equal(order(s,u,'hide'),null);assert.ok(S.isHidden(s,u));S.spawn(s,'soldier',1,2,0,{damage:0,order:{type:'hold'}});step(s,20);assert.equal(s.projectiles.length,0);assert.ok(!u.weaponWindup);assert.ok(S.restore(s));assert.equal(order(s,u,'move',{x:3,z:0}),null);S.tick(s);assert.ok(!S.isHidden(s,u));}
{
 const s=arena(),war=S.spawn(s,'barracks',0,0,0);delete s.ancientWarVersion;const legacy=S.restore(s);assert.deepEqual(S.trainable(legacy,legacy.units.find(u=>u.id===war.id)),['sentinel','huntress','treant','druid']);assert.equal(order(legacy,legacy.units.find(u=>u.id===war.id),'train',{kind:'sentinel'}),null);assert.equal(S.restore(legacy).units.find(u=>u.id===war.id).queue[0].left,S.types.sentinel.time);
 for(const mutate of [s=>s.ancientWarVersion=2,s=>S.spawn(s,'workshop',0,10,0).huntersHallRules=0]){const bad=arena();mutate(bad);assert.throws(()=>S.restore(bad));}
}
console.log('PASS Ancient of War: tier-1 source roster/costs/food/full timers/refunds, full Hunter\'s Hall construction/prerequisite, no faction stat multipliers, source windup/missiles/armor, one half-damage bounce, siege minimum range/three splash bands/friendly fire, night regen/meld, exact saves and legacy production');
