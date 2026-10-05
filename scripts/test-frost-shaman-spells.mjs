// Author: MiYu. Shaman training, friendly-fire shields, Bloodlust, autocast and saves.
import assert from 'node:assert/strict';
import {setTechnology} from './frost-battle-fixture.mjs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function arena(rank=2){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map,factions:[1,0]});s.units=[];S.spawn(s,'hall',0,-24,24,{damage:0,upgradeTier:3});Object.assign(s.teams[0],{gold:3000,wood:3000,tier:3,shamanism:rank});const h=S.spawn(s,'shaman',0,-4,0,{damage:0,mana:200+rank*100,bloodlustAuto:false,order:{type:'hold'}}),v=S.spawn(s,'soldier',1,0,0,{damage:0,hp:1000,maxHp:1000,order:{type:'hold'}});S.visibility(s);return {s,h,v};}
const cast=(s,h,spell,v)=>S.command(s,h.team,{type:'casterSpell',ids:[h.id],spell,target:v.id});
{
 const {s,h}=arena(0),lodge=S.spawn(s,'spiritlodge',0,-10,8),other=S.spawn(s,'spiritlodge',0,-16,8),barracks=S.spawn(s,'barracks',0,-22,8),hp=h.maxHp;S.spawn(s,'farm',0,-10,15);
 assert.deepEqual(S.trainable(s,lodge),['shaman']);assert.ok(!S.trainable(s,barracks).includes('shaman'));setTechnology(S,s,0,2);
 assert.equal(S.command(s,0,{type:'casterResearch',ids:[lodge.id]}),null);assert.deepEqual(lodge.casterResearch,{rank:1,left:60});assert.equal(s.teams[0].gold,2900);assert.equal(s.teams[0].wood,2950);assert.ok(S.command(s,0,{type:'casterResearch',ids:[other.id]}));assert.ok(S.command(s,0,{type:'train',ids:[lodge.id],kind:'shaman'}));
 step(s,20);const restored=S.restore(S.clone(s));step(s,581);step(restored,581);assert.deepEqual(s.units,restored.units);assert.equal(s.teams[0].shamanism,1);assert.equal(h.maxHp,hp+40);assert.equal(h.casterRank,1);assert.equal(S.maxMana(h),300);h.mana=0;step(s,10);near(h.mana,.917);
 assert.ok(S.command(s,0,{type:'casterResearch',ids:[lodge.id]}));setTechnology(S,s,0,3);assert.equal(S.command(s,0,{type:'casterResearch',ids:[lodge.id]}),null);assert.equal(lodge.casterResearch.left,75);const budget=[s.teams[0].gold,s.teams[0].wood];assert.equal(S.command(s,0,{type:'cancelCasterResearch',ids:[lodge.id]}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[budget[0]+100,budget[1]+150]);
 assert.equal(S.command(s,0,{type:'casterResearch',ids:[lodge.id]}),null);step(s,751);assert.equal(h.casterRank,2);assert.equal(h.maxHp,hp+80);assert.equal(S.maxMana(h),400);h.mana=0;step(s,10);near(h.mana,1.167);const trained=S.spawn(s,'shaman',0,-18,-8);assert.equal(trained.casterRank,2);assert.equal(trained.maxHp,hp+80);
 barracks.queue=[{kind:'shaman',left:.1}];assert.equal(S.restore(S.clone(s)).units.find(u=>u.id===barracks.id).queue[0].kind,'shaman');step(s,2);assert.equal(barracks.queue.length,0,'legacy barracks queues finish');
 const old=S.clone(s);delete old.teams[0].shamanism;for(const u of old.units)if(u.kind==='shaman'){delete u.casterRank;delete u.bloodlustAuto;u.mana=150;}const legacy=S.restore(old);assert.equal(legacy.teams[0].shamanism,0);assert.equal(legacy.units.find(u=>u.id===h.id).bloodlustAuto,true);
}
{
 const {s,h,v}=arena(),ally=S.spawn(s,'soldier',0,.8,0,{damage:0,hp:500,maxHp:500,order:{type:'hold'}}),enemy=S.spawn(s,'soldier',1,-.8,0,{damage:0,hp:500,maxHp:500,order:{type:'hold'}}),far=S.spawn(s,'soldier',1,2.3,0,{damage:0,order:{type:'hold'}}),air=S.spawn(s,'dragon',1,0,1,{damage:0,order:{type:'hold'}}),building=S.spawn(s,'farm',1,0,-1);S.visibility(s);
 const untouched=[far.hp,air.hp,building.hp];assert.equal(cast(s,h,'lightningShield',v),null);assert.equal(h.mana,300);assert.equal(v.lightningShield,20);step(s,10);near(ally.hp,480);near(enemy.hp,480);assert.equal(v.hp,1000,'shield excludes its bearer');assert.deepEqual([far.hp,air.hp,building.hp],untouched,'no flying, building or out-of-radius damage');
 assert.equal(S.publicState(s,0).units.find(u=>u.id===v.id).lightningSource,undefined);assert.equal(S.publicState(s,1).units.find(u=>u.id===v.id).lightningSource,undefined);h.hp=0;const gold=s.teams[0].gold;ally.hp=1;enemy.hp=1;step(s,1);assert.equal(ally.hp,0);assert.equal(enemy.hp,0);assert.equal(s.teams[0].gold,gold+25,'enemy kill credit survives caster death; friendly kill gives no reward');assert.ok(!s.events.some(e=>e.type==='deny'));
 const restored=S.restore(S.clone(s));step(s,10);step(restored,10);assert.deepEqual(s.units,restored.units);step(s,180);assert.equal(v.lightningShield,0);assert.equal(v.lightningSource,undefined);
}
{
 const {s,h,v}=arena(),ally=S.spawn(s,'soldier',0,-3,0,{damage:0,order:{type:'hold'}});assert.equal(cast(s,h,'bloodlust',ally),null);assert.equal(h.mana,360);assert.equal(ally.bloodlust,60);near(S.attackRate(ally),1.4);near(S.moveRate(ally),1.25);ally.frenzy=10;near(S.attackRate(ally),2.15);ally.cripple=10;near(S.attackRate(ally),1.65);near(S.moveRate(ally),.3125);ally.frenzy=0;ally.cripple=0;
 assert.equal(cast(s,h,'lightningShield',ally),null);assert.equal(cast(s,h,'purge',ally),null);assert.equal(ally.bloodlust,0);assert.equal(ally.lightningShield,0);assert.equal(ally.lightningSource,undefined);assert.equal(ally.purgeLeft,0);
 h.bloodlustCd=0;h.mana=400;assert.equal(cast(s,h,'bloodlust',h),null);assert.equal(h.bloodlust,60);assert.equal(cast(s,h,'lightningShield',v),null);h.purgeCd=0;assert.equal(cast(s,h,'purge',v),null);assert.equal(v.lightningShield,0);assert.equal(v.lightningSource,undefined);assert.ok(v.purgeLeft>0);
 const restored=S.restore(S.clone(s));step(s,30);step(restored,30);assert.deepEqual(s.units,restored.units);
}
for(const [spell,setup] of [['bloodlust',({v})=>{}],['bloodlust',({v,h})=>{v.team=h.team;v.kind='ram';}],['bloodlust',({h,v})=>{v.team=h.team;h.casterRank=1;}],['lightningShield',({v})=>v.kind='dragon'],['lightningShield',({v})=>v.kind='farm'],['lightningShield',({h})=>h.casterRank=0],['lightningShield',({h})=>h.mana=99],['lightningShield',({h})=>h.stun=1],['lightningShield',({v})=>v.x=20],['lightningShield',({s})=>s.visible[0].fill(0)]]){const f=arena();setup(f);const before=S.clone(f.s);assert.ok(cast(f.s,f.h,spell,f.v));assert.deepEqual(f.s,before,'rejected spell is atomic');}
{
 const {s,h,v}=arena(),ally=S.spawn(s,'soldier',0,1,0,{damage:0,order:{type:'hold'}});assert.equal(cast(s,h,'lightningShield',v),null);v.inside=999;const hp=ally.hp;step(s,10);assert.equal(ally.hp,hp);near(v.lightningShield,19,'hidden carrier duration still expires');delete v.inside;v.lightningShield=.05;step(s,1);near(ally.hp,hp-1);assert.equal(v.lightningShield,0);assert.equal(v.lightningSource,undefined,'fractional final tick clears attribution');
 const air=S.spawn(s,'dragon',0,-3,0,{damage:0,order:{type:'hold'}});S.visibility(s);assert.equal(cast(s,h,'bloodlust',air),null,'organic flying allies are eligible');
}
{
 const {s,h,v}=arena();v.kind='ram';assert.equal(cast(s,h,'lightningShield',v),null,'ground mechanical carriers are legal');
 for(const patch of [{lightningShield:21},{lightningShield:-1},{lightningSource:null},{lightningSource:{id:h.id,kind:'necromancer',team:0,x:0,z:0}},{bloodlust:61},{bloodlustCd:2}]){const saved=S.clone(s);Object.assign(saved.units.find(u=>u.id===v.id),patch);assert.throws(()=>S.restore(saved));}
 for(const patch of [{casterRank:3},{bloodlustAuto:1},{mana:401}]){const saved=S.clone(s);Object.assign(saved.units.find(u=>u.id===h.id),patch);assert.throws(()=>S.restore(saved));}
}
{
 const {s,h,v}=arena(),ally=S.spawn(s,'soldier',0,-3,0,{damage:40,cd:100,order:{type:'hold'}});h.bloodlustAuto=true;step(s,1);near(ally.bloodlust,59.9);assert.ok(h.mana<361);assert.equal(S.command(s,0,{type:'bloodlustAuto',ids:[h.id],enabled:false}),null);step(s,12);assert.equal(h.bloodlust,undefined);assert.equal(S.restore(S.clone(s)).units.find(u=>u.id===h.id).bloodlustAuto,false);
 h.bloodlustAuto=true;h.order={type:'move',x:-12,z:0};h.damage=10;step(s,12);assert.equal(h.bloodlust,undefined,'movement suppresses autocast');h.order={type:'hold'};v.x=h.x+2;S.visibility(s);step(s,1);assert.equal(h.bloodlust,60,'self is an eligible organic ally');assert.equal(S.command(s,0,{type:'bloodlustAuto',ids:[ally.id],enabled:true}),'Select a shaman');
}
{
 const {s,h}=arena(0),lodge=S.spawn(s,'spiritlodge',0,-10,8),worker=S.spawn(s,'worker',0,-18,-12);setTechnology(S,s,0,1);assert.ok(S.command(s,0,{type:'build',ids:[worker.id],kind:'spiritlodge',x:-16,z:-12}));setTechnology(S,s,0,2);assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'spiritlodge',x:-16,z:-12}),null);assert.equal(S.command(s,0,{type:'casterResearch',ids:[lodge.id]}),null);lodge.hp=0;step(s,601);assert.equal(s.teams[0].shamanism,0);assert.equal(h.casterRank,0);
}
{
 const {s,h,v}=arena();const ally=S.spawn(s,'soldier',0,1,0,{damage:0,order:{type:'hold'}});v.team=0;h.bloodlustAuto=false;assert.equal(cast(s,h,'lightningShield',v),null);s.teams[0].ai=true;s.frame=39;step(s,1);assert.equal(v.lightningShield,0,'AI dispels a shield threatening its own clustered troops');assert.equal(v.lightningSource,undefined);assert.ok(ally.hp>0);
}
console.log('PASS: Spirit Lodge training/gates/refunds/legacy queues; Lightning Shield friendly fire, exclusions, expiry and private kill attribution; Bloodlust rates, dispel, autocast and exact save continuity');
