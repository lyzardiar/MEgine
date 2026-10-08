// Author: MiYu. Original Wisp sacrifice, area dispel, destination travel and persistence boundaries.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),cmd=(s,u,args={})=>S.command(s,u.team,{type:'detonate',ids:[u.id],x:u.x,z:u.z,...args}),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.units=[];map.triggers=[];map.props=[{kind:'tree',x:-4,z:0,amount:100},{kind:'mine',x:-16,z:16,amount:1000}];const s=S.create('skirmish',{map,factions:[2,3],ai:[false,false]});s.units=[];const base=S.spawn(s,'hall',0,-22,16);S.spawn(s,'hall',1,24,-24);const u=S.spawn(s,'worker',0,0,0);S.visibility(s);return {s,u,base};}
{
 const {s,u}=fixture(),ally=S.spawn(s,'hero',0,0,2,{heroClass:3,cd:10000,order:{type:'hold'},mana:20}),enemy=S.spawn(s,'necromancer',1,2,0,{damage:0,mana:100}),outside=S.spawn(s,'shaman',1,3.01,0,{damage:0,mana:100,bloodlust:60}),summon=S.spawn(s,'dragon',1,-2,0,{summoned:true,expires:1000,hp:500,maxHp:500,damage:0}),friendly=S.spawn(s,'skeletonwarrior',0,0,-2,{summoned:true,expires:1000,damage:0}),source={id:enemy.id,kind:'necromancer',team:1,x:enemy.x,z:enemy.z};
 Object.assign(ally,{frenzy:45,frenzySource:source,cripple:10,bloodlust:60,lightningShield:20,lightningSource:{...source,kind:'shaman'},haste:5,shield:250,shieldLeft:7,itemRegen:{hp:10,left:10},avatar:5,itemMagicImmune:5,stun:.5,itemCooldown:10});S.visibility(s);
 const gold=s.teams.map(t=>t.gold),kills=s.teams.map(t=>t.kills),xp=ally.xp,food=S.population(s,0).used;
 assert.equal(cmd(s,u),null);assert.equal(u.hp,120,'target command executes on the next fixed tick');step(s,1);
 assert.ok(!s.units.some(v=>v.id===u.id&&v.hp>0));assert.ok(!s.corpses.some(v=>v.id===u.id),'sacrifice leaves no raisable corpse');assert.equal(S.population(s,0).used,food-1);
 near(ally.mana,(S.wardenRules.units.Ewar.manaRegen+S.wardenRules.units.Ewar.intelligence*Number(S.wardenRules.misc.IntRegenBonus))*S.DT);near(enemy.mana,50.0667);near(outside.mana,100.0667);assert.ok(outside.bloodlust>59);assert.equal(summon.hp,275);assert.equal(friendly.hp,0,'friendly summons are affected without a deny reward');
 for(const key of S.dispellable)assert.ok(!(ally[key]>0),key);assert.equal(ally.itemRegen,undefined);assert.equal(ally.frenzySource,undefined);assert.equal(ally.lightningSource,undefined);assert.ok(ally.avatar>0&&ally.itemMagicImmune>0&&ally.stun>0&&ally.itemCooldown>0,'undispellable abilities, stun and cooldown survive');
 assert.deepEqual(s.teams.map(t=>t.gold),gold);assert.deepEqual(s.teams.map(t=>t.kills),kills);assert.equal(ally.xp,xp);assert.equal(s.events.filter(e=>e.art==='detonate').length,1);assert.doesNotThrow(()=>S.restore(s));step(s,1);assert.ok(!s.events.some(e=>e.art==='detonate'),'one authoritative event, no repeat next tick');
}
{
 const {s,u}=fixture();u.x=-8;const target={x:0,z:0};assert.equal(cmd(s,u,target),null);step(s,10);assert.ok(u.hp>0&&u.x>-8&&u.x<0,'walks toward a fixed location');const saved=S.restore(s);step(s,40);step(saved,40);assert.deepEqual(saved,s,'moving Detonate resumes exactly');assert.ok(!s.units.some(v=>v.id===u.id&&v.hp>0));
 const {s:a,u:w}=fixture();cmd(a,w,{x:10,z:0});step(a,5);assert.equal(S.command(a,0,{type:'stop',ids:[w.id]}),null);step(a,100);assert.equal(w.hp,120);assert.equal(w.order,null);assert.ok(!a.events.some(e=>e.art==='detonate'));
}
{
 const {s,u}=fixture();for(let z=0;z<32;z++)s.map.terrain[z*32+16]=1;u.x=-4;cmd(s,u,{x:4,z:0});step(s,100);assert.equal(u.hp,120,'unreachable destination never sacrifices the caster remotely');assert.equal(u.order.type,'detonate');assert.doesNotThrow(()=>S.restore(s));
 const {s:a,u:w}=fixture();cmd(a,w);w.stun=.3;step(a,1);assert.equal(w.hp,120);step(a,4);assert.ok(!a.units.some(v=>v.id===w.id&&v.hp>0));
}
{
 const {s,u}=fixture();u.x=-2.5;S.command(s,0,{type:'gather',ids:[u.id],resource:0});step(s,1);assert.equal(u.order.bonded,true);const wood=s.teams[0].wood;S.command(s,0,{type:'move',ids:[u.id],x:-8,z:0,append:true});assert.equal(cmd(s,u),null);assert.equal(u.gatherCd,0);assert.deepEqual(u.waypoints,[]);step(s,100);assert.equal(s.teams[0].wood,wood,'harvesting and queued jobs do not survive sacrifice');
}
{
 const {s,u,base}=fixture();const mine=S.startEntangle(s,base,s.resources[1],true);u.x=-14.7;u.z=16;S.visibility(s);assert.equal(S.command(s,0,{type:'gather',ids:[u.id],resource:1}),null);step(s,1);assert.equal(u.inside,mine.id);const before=S.clone(s);assert.match(cmd(s,u),/available Wisp/);assert.deepEqual(s,before,'resident must unload before Detonate');
 assert.equal(S.command(s,0,{type:'unloadWisps',ids:[mine.id],target:u.id}),null);assert.equal(cmd(s,u),null);step(s,1);assert.equal(mine.workers,0);assert.doesNotThrow(()=>S.restore(s));
}
{
 const {s,u}=fixture();const other=S.spawn(s,'worker',0,6,0),foreign=S.spawn(s,'worker',1,5,0);for(const args of [{x:NaN},{z:31},{append:true},{ids:[foreign.id]},{ids:[]}, {ids:[s.units.find(v=>v.kind==='hall').id]}]){const before=S.clone(s);assert.ok(cmd(s,u,args));assert.deepEqual(s,before);}
 u.stun=1;assert.match(cmd(s,u),/available Wisp/);u.stun=0;u.sanctuary=true;u.hp=50;const recovering=S.clone(s);assert.doesNotThrow(()=>S.restore(recovering));assert.match(cmd(s,u),/available Wisp/);assert.deepEqual(s,recovering);delete u.sanctuary;u.hp=120;assert.equal(cmd(s,u,{ids:[u.id,other.id]}),null);step(s,1);assert.equal(other.hp,120,'a group spell command sacrifices one available Wisp');
 const {s:a,u:w}=fixture();cmd(a,w,{x:10,z:0});for(const change of [v=>v.order.x=31,v=>v.order.z=NaN,v=>v.kind='soldier',v=>v.hp=0,v=>{v.sanctuary=true;v.hp=50;},v=>v.waypoints=[{type:'move',x:3,z:0}]]){const bad=S.clone(a);change(bad.units.find(v=>v.id===w.id));assert.throws(()=>S.restore(bad),/Detonate|Wisp/);}
}
{
 const {s,u}=fixture(),enemy=S.spawn(s,'hero',1,2,0,{damage:0,mana:150,order:{type:'hold'}});S.visibility(s);cmd(s,u,{x:8,z:0});let view=S.publicState(s,1);assert.equal(view.units.find(v=>v.id===u.id).order,null,'enemy does not learn planned location');assert.equal(view.units.find(v=>v.id===u.id).waypoints,undefined);assert.ok(!view.events.some(e=>e.art==='detonate'));S.command(s,0,{type:'stop',ids:[u.id]});cmd(s,u);step(s,1);view=S.publicState(s,1);assert.ok(view.events.some(e=>e.art==='detonate'));s.visible[1].fill(0);assert.ok(!S.publicState(s,1).events.some(e=>e.art==='detonate'));assert.ok(enemy.mana<101);
 const {s:a,u:w}=fixture();const immune=S.spawn(a,'dragon',1,2,0,{summoned:true,expires:1000,itemMagicImmune:2,hp:500,maxHp:500,damage:0});cmd(a,w);step(a,1);assert.equal(immune.hp,500,'spell-immune summons keep damage immunity');
}
assert.equal(S.detonateRules.manaDrain,50);assert.equal(S.detonateRules.summonDamage,225);assert.equal(S.detonateRules.radius,3);assert.equal(S.detonateRules.range,1);assert.equal(S.detonateRules.cost,0);assert.equal(S.detonateRules.cooldown,0);
{
 const {s,u}=fixture();s.teams[1].faction=2;s.map.startingHour=22;const hidden=S.spawn(s,'archer',1,2,0,{hiding:true,damage:0,bloodlust:60});S.visibility(s);assert.equal(S.isVisible(s,0,hidden),false);cmd(s,u);step(s,1);assert.equal(hidden.bloodlust,0);assert.ok(!S.publicState(s,0).events.some(e=>e.art==='dispel'&&e.x===hidden.x));assert.ok(S.publicState(s,1).events.some(e=>e.art==='dispel'&&e.x===hidden.x));assert.ok(S.publicState(s,1).events.every(e=>e.audience===undefined),'internal audience masks are not published');
}
console.log('PASS Detonate: source values, friendly/enemy mana and dispel, summoned ground/air damage, immunity, no sacrifice bounty/corpse, travel/stop/stun/blocked paths, gather/resident cleanup, atomic invalid commands, single group caster, exact save and fog privacy');
