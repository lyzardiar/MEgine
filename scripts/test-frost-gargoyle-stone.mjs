// Author: MiYu. Stone Form paid research, original bodies, immunity, regeneration and durable transitions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gargoyleStoneClientFixture,gargoyleStoneDeathFixture} from './frost-gargoyle-stone-client-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),fixture=options=>gargoyleStoneClientFixture(S,options),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),order=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra});
const finish=(s,u)=>{for(let i=0;u.stoneShift&&i<100;i++)S.tick(s);assert.equal(u.stoneShift,undefined);},ready=(s,u)=>step(s,Math.ceil((u.stoneCd||0)/S.DT)+1);
assert.equal(S.PROTOCOL,113);
{
 const {s,unit,producer,base,graveyard}=fixture(),t=s.teams[0],budget=[t.gold,t.wood];assert.equal(S.gargoyleStoneOption(s,unit).enabled,false);assert.ok(order(s,unit,'stoneform'));
 graveyard.hp=0;assert.ok(order(s,producer,'gargoyleStoneResearch'));graveyard.hp=graveyard.maxHp;base.upgradeTier=2;base.hp=base.maxHp=S.mainBase(s,base).hp;S.updateTechnology(s);assert.ok(order(s,producer,'gargoyleStoneResearch'));base.upgradeTier=3;base.hp=base.maxHp=S.mainBase(s,base).hp;S.updateTechnology(s);
 assert.equal(order(s,producer,'gargoyleStoneResearch'),null);assert.deepEqual([t.gold,t.wood],[budget[0]-75,budget[1]-150]);const other=S.spawn(s,'barracks',0,8,8);assert.ok(order(s,other,'gargoyleStoneResearch'));step(s,100);assert.equal(order(s,producer,'cancelTrain',{index:0}),null);assert.deepEqual([t.gold,t.wood],budget);assert.equal(order(s,producer,'gargoyleStoneResearch'),null);step(s,200);const loaded=S.restore(s);step(s,199);step(loaded,199);assert.equal(t.gargoyleStoneResearch,0);step(s,1);step(loaded,1);assert.deepEqual(s,loaded);assert.equal(t.gargoyleStoneResearch,1);assert.equal(S.gargoyleStoneResearchOption(s,producer),null);assert.equal(S.gargoyleStoneOption(s,unit).enabled,true);
 console.log('PASS Stone Form original Graveyard/Black Citadel gates, 75/150 debit/refund, duplicate queue rejection, full 40s and saved continuation');
}
if(process.argv.includes('--research-only'))process.exit(0);
{
 for(const action of ['move','stop','hold','attack','fire']){
  const {s,unit}=fixture({researched:true});assert.equal(order(s,unit,'stoneform'),null);finish(s,unit);assert.equal(order(s,unit,'unstoneform'),null);finish(s,unit);
  const frame=unit.stoneMorphFrame;assert.equal(frame,s.frame);assert.ok(order(s,unit,'move',{x:NaN,z:0}));assert.equal(unit.stoneMorphFrame,frame);
  assert.ok(order(s,unit,'move',{x:2,z:2,append:true}));assert.equal(unit.stoneMorphFrame,frame);
  const target=S.spawn(s,'humanrifleman',1,unit.x+1,unit.z);S.visibility(s);
  assert.equal(action==='fire'?S.fire(s,unit,target):order(s,unit,action,{x:2,z:2,target:target.id}),action==='fire'?true:null);
  assert.equal(unit.stoneMorphFrame,undefined);assert.equal(S.restore(s).units.find(v=>v.id===unit.id).stoneMorphFrame,undefined);
 }
 console.log('PASS Stone animation handoff: accepted orders/fire cancel the tail, rejected orders preserve it, saved state restores');
}
{
 for(const phase of ['stone','flying','entering','leaving']){
  const {s,unit,corpse:c}=gargoyleStoneDeathFixture(S,phase),source=phase==='stone'?'ugrm':'ugar',duration=phase==='stone'?1:2.5;
  assert.equal(unit.hp,0);assert.equal(c.sourceUnit,source,phase);assert.equal(S.corpseDuration(s,c),duration);assert.equal(S.corpseUsable(c,s),false);assert.equal(S.publicState(s,0).corpses.find(v=>v.id===c.id).sourceUnit,source);assert.equal(S.publicState(s,1).corpses.find(v=>v.id===c.id).sourceUnit,source);
  const restored=S.restore(s);step(s,Math.round((duration-c.age)/S.DT)-1);step(restored,Math.round((duration-restored.corpses[0].age)/S.DT)-1);assert.ok(s.corpses.some(v=>v.id===c.id));assert.deepEqual(s,restored);step(s,1);step(restored,1);assert.ok(!s.corpses.some(v=>v.id===c.id));assert.deepEqual(s,restored);
 }
 const {s,corpse}=gargoyleStoneDeathFixture(S),wrongKind=S.clone(s);wrongKind.corpses[0].kind='ghoul';assert.throws(()=>S.restore(wrongKind),/corpse/);const disabled=S.clone(s);disabled.gargoyleStoneVersion=0;for(const t of disabled.teams)t.gargoyleStoneResearch=0;assert.throws(()=>S.restore(disabled),/corpse/);const expired=S.clone(s);expired.corpses[0].age=1;assert.throws(()=>S.restore(expired),/corpse/);assert.equal(corpse.sourceUnit,'ugrm');
 console.log('PASS actual physical death in four Stone phases: source body, exact lifetime, public views, deterministic save/expiry and invalid corpse rejection');
}
{
 const {s,unit:u}=fixture({researched:true});u.hp=100;assert.equal(order(s,u,'stoneform'),null);assert.equal(u.stoneCd,undefined);step(s,5);near(S.flightHeight(s,u),0);near(u.armorValue,3);assert.equal(S.gargoyleStone(u),false);step(s,4);near(u.hp,100);S.tick(s);assert.equal(S.gargoyleStone(u),true);near(u.hp,100);near(u.armorValue,15);assert.equal(order(s,u,'unstoneform'),null);assert.equal(u.stoneCd,30);assert.equal(S.gargoyleStone(u),false);near(u.armorValue,3);step(s,5);assert.equal(u.stoneShift,undefined);near(S.flightHeight(s,u),0);step(s,2);near(S.flightHeight(s,u),0);S.tick(s);near(S.flightHeight(s,u),.48);step(s,4);near(S.flightHeight(s,u),2.4);assert.equal(u.stoneFlight,undefined);near(u.hp,100);assert.ok(S.restore(s));
 console.log('PASS REA Stone timeline: 1s enter commit, immediate exit body/CD, .5s exit lock and independent .7–1.2s ascent');
}
{
 const {s,unit:u}=fixture({researched:true}),position=[u.x,u.z],hp=u.hp;assert.equal(order(s,u,'stoneform'),null);assert.equal(S.magicImmune(u),true);assert.ok(order(s,u,'stop'));assert.ok(order(s,u,'move',{x:3,z:3}));assert.equal(u.hp,hp);
 let restored=S.restore(s);while(u.stoneShift){S.tick(s);S.tick(restored);assert.deepEqual(s,restored);assert.ok(S.restore(s));}
 assert.equal(S.gargoyleStone(u),true);assert.equal(S.isFlying(u),false);assert.equal(S.mobile(u),true);assert.equal(u.speed,0);assert.equal(S.unitType(u).damage,0);near(S.flightHeight(s,u),0);near(S.movementRadius(u),.32);near(u.armorValue,15);assert.deepEqual([u.x,u.z],position);assert.ok(order(s,u,'move',{x:3,z:3}));
 ready(s,u);assert.equal(order(s,u,'unstoneform'),null);restored=S.restore(s);while(u.stoneShift){S.tick(s);S.tick(restored);assert.deepEqual(s,restored);assert.ok(S.restore(s));}
 assert.equal(S.gargoyleStone(u),false);assert.equal(S.isFlying(u),true);assert.equal(S.magicImmune(u),false);near(S.flightHeight(s,u),0);assert.ok(u.stoneCd>29);assert.ok(order(s,u,'stoneform'));while(u.stoneFlight){S.tick(s);S.tick(restored);assert.deepEqual(s,restored);assert.ok(S.restore(s));}near(S.flightHeight(s,u),2.4);near(u.speed,3.5);near(u.armorValue,3);near(S.movementRadius(u),.08);assert.equal(u.hp,hp);
 console.log('PASS Stone Form uninterruptible orders, unchanged health/position, ground body/armor/collision, return to flight and every transition frame restore');
}
{
 const {s,unit:u}=fixture({researched:true});assert.equal(order(s,u,'stoneform'),null);finish(s,u);u.hp=100;assert.equal(S.inBlight(s,u.x,u.z),false);step(s,10);near(u.hp,108);s.blight.push({team:0,x:u.x,z:u.z,radius:3.5});step(s,10);near(u.hp,118);assert.ok(S.restore(s));
 ready(s,u);assert.equal(order(s,u,'unstoneform'),null);finish(s,u);u.hp=100;step(s,10);near(u.hp,102);
 console.log('PASS Stone Form independent +8 regeneration stacks with existing +2 Blight base and is removed on return');
}
{
 const {s,unit:u}=fixture({researched:true}),enemy=S.spawn(s,'cryptfiend',1,1,-6,{cd:99,cryptWebAuto:false,order:{type:'hold'}});S.visibility(s);assert.equal(S.canAttack(enemy,u),false);u.bloodlust=20;u.roar=20;u.cripple=20;assert.equal(order(s,u,'stoneform'),null);assert.equal(u.bloodlust,0);assert.equal(u.roar,0);assert.equal(u.cripple,0);finish(s,u);assert.equal(S.canAttack(enemy,u),true);assert.equal(S.canAttack(u,enemy),false);assert.equal(S.fire(s,u,enemy),false);const hp=u.hp;S.fire(s,enemy,u);step(s,10);assert.ok(u.hp<hp);assert.ok(S.restore(s));
 console.log('PASS Stone Form removes existing magic buffs, cannot fire, and takes physical ground attacks with stone armor');
}
{
 const {s,unit:u}=fixture({researched:true});assert.equal(order(s,u,'stoneform'),null);step(s,1);for(const patch of [{duration:99},{left:99},{frame:s.frame+1},{stone:0},{fromHeight:-1},{unknown:true}]){const bad=S.clone(s);Object.assign(bad.units.find(v=>v.id===u.id).stoneShift,patch);assert.throws(()=>S.restore(bad),/Stone/);}
 for(const patch of [{stoneCd:31},{stoneForm:1},{stoneMorphFrame:s.frame+1}]){const bad=S.clone(s);Object.assign(bad.units.find(v=>v.id===u.id),patch);assert.throws(()=>S.restore(bad),/Stone/);}
 const wrong=S.clone(s);wrong.teams[0].gargoyleStoneResearch=0;assert.throws(()=>S.restore(wrong),/Stone/);finish(s,u);const bad=S.clone(s);bad.units.find(v=>v.id===u.id).armorValue=3;assert.throws(()=>S.restore(bad),/statistics/);
 console.log('PASS Stone Form rejects forged clocks/flags/height/cooldown/research and incorrect source body statistics');
}
{
 const {s,unit:u}=fixture({researched:true});assert.equal(order(s,u,'stoneform'),null);const owner=S.publicState(s,0).units.find(v=>v.id===u.id);assert.ok(owner.stoneShift);assert.equal(owner.stoneCd,undefined);const scout=S.spawn(s,'gargoyle',1,2,-6,{cd:99,order:{type:'hold'}});S.visibility(s);const enemy=S.publicState(s,1),copy=enemy.units.find(v=>v.id===u.id);assert.ok(copy.stoneShift);assert.equal(copy.stoneCd,undefined);assert.equal(enemy.teams[0].gargoyleStoneResearch,undefined);
 finish(s,u);u.hp=0;S.tick(s);assert.equal(u.stoneShift,undefined);assert.equal(S.gargoyleStone(u),true);assert.ok(S.restore(s));
 console.log('PASS Stone Form visible transformation with private enemy cooldown/research and persistent stone death pose');
}
{
 const {s,unit:u}=fixture({researched:true,factions:[3,3]});s.teams[1].cryptWebResearch=1;const enemy=S.spawn(s,'cryptfiend',1,1,-6,{cd:99,cryptWebAuto:false,order:{type:'hold'}});S.visibility(s);assert.equal(order(s,u,'stoneform'),null);finish(s,u);assert.equal(order(s,enemy,'cryptWeb',{target:u.id})===null,false);assert.equal(order(s,u,'unstoneform'),null);assert.equal(order(s,enemy,'cryptWeb',{target:u.id}),null);S.tick(s);assert.equal(S.webbed(u),true);near(u.cryptWebFlight.from,0);assert.equal(u.stoneFlight,undefined);const loaded=S.restore(s);step(s,20);step(loaded,20);assert.deepEqual(s,loaded);near(S.flightHeight(s,u),.9);assert.ok(S.restore(s));
 console.log('PASS physical Web during initial Stone takeoff saves below the usual air floor and resumes capture deterministically');
}
{
 const {s,unit:u}=fixture({researched:true}),x=u.x,z=u.z;assert.equal(order(s,u,'stoneform'),null);finish(s,u);const walker=S.spawn(s,'humanfootman',1,x-2,z,{cd:99,order:{type:'hold'}});S.visibility(s);assert.equal(order(s,walker,'move',{x:x+2,z}),null);step(s,40);near(u.x,x);near(u.z,z);assert.ok(walker.x>x+1);assert.ok(S.restore(s));
 console.log('PASS grounded Stone body uses unit collision and cannot be displaced by passing ground traffic');
}
{
 for(const mode of ['moba','rpg','td'])assert.equal(S.create(mode).gargoyleStoneVersion,0);assert.throws(()=>S.create('moba',{gargoyleStoneVersion:1}),/Stone/);assert.throws(()=>S.create('skirmish',{gargoyleStoneVersion:2}),/Stone/);
 const {s,unit:u}=fixture({gargoyleStoneVersion:0});assert.equal(S.gargoyleStoneOption(s,u),null);delete s.gargoyleStoneVersion;for(const t of s.teams)delete t.gargoyleStoneResearch;const old=S.restore(s);assert.equal(old.gargoyleStoneVersion,0);assert.equal(S.gargoyleStoneOption(old,old.units.find(v=>v.id===u.id)),null);assert.ok(order(old,old.units.find(v=>v.id===u.id),'stoneform'));
 console.log('PASS Stone Form version validation, other game modes and versionless save compatibility');
}
