// Author: MiYu. Caster research, targeted magic, attack progress, health drain and dispel.
import assert from 'node:assert/strict';
import {setTechnology} from './frost-battle-fixture.mjs';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{blademasterVersion:0,map,factions:[3,1]});s.units=[];S.spawn(s,'hall',0,-24,24,{damage:0});s.teams[0].gold=3000;s.teams[0].wood=3000;setTechnology(S,s,0,3);const n=S.spawn(s,'necromancer',0,0,0,{damage:0,mana:400,casterRank:2,order:{type:'hold'}}),h=S.spawn(s,'shaman',0,-2,0,{damage:0,mana:200,order:{type:'hold'}}),v=S.spawn(s,'soldier',1,3,0,{damage:0,order:{type:'hold'}});S.visibility(s);return {s,n,h,v};}
const cast=(s,u,spell,v)=>S.command(s,u.team,{type:'casterSpell',ids:[u.id],spell,target:v.id});
{
 const {s,n}=arena();n.casterRank=0;n.mana=150;const temple=S.spawn(s,'temple',0,-5,4),other=S.spawn(s,'temple',0,-8,4);S.spawn(s,'farm',0,-10,8);assert.ok(!S.trainable(s,S.spawn(s,'barracks',0,-16,8)).includes('necromancer'));assert.deepEqual(S.trainable(s,temple),['necromancer']);const hp=n.maxHp;assert.equal(S.command(s,0,{type:'casterResearch',ids:[temple.id]}),null);assert.equal(temple.casterResearch.left,30);assert.equal(s.teams[0].gold,2900);assert.equal(s.teams[0].wood,2950);assert.ok(S.command(s,0,{type:'casterResearch',ids:[other.id]}));assert.ok(S.command(s,0,{type:'train',ids:[temple.id],kind:'necromancer'}));assert.equal(S.publicState(s,1).units.find(u=>u.id===temple.id)?.casterResearch,undefined);
 step(s,20);const restored=S.restore(S.clone(s));step(s,281);step(restored,281);assert.deepEqual(s.units,restored.units);assert.equal(s.teams[0].necromancy,1);assert.equal(n.casterRank,1);assert.equal(n.maxHp,hp+40);assert.equal(S.maxMana(n),300);const fresh=S.spawn(s,'necromancer',0,-6,0);assert.equal(fresh.casterRank,1);assert.equal(fresh.maxHp,S.types.necromancer.hp+40);
 setTechnology(S,s,0,2);assert.ok(S.command(s,0,{type:'casterResearch',ids:[temple.id]}));setTechnology(S,s,0,3);assert.equal(S.command(s,0,{type:'casterResearch',ids:[temple.id]}),null);assert.equal(temple.casterResearch.left,45);const budget=[s.teams[0].gold,s.teams[0].wood];assert.equal(S.command(s,0,{type:'cancelCasterResearch',ids:[temple.id]}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[budget[0]+100,budget[1]+150]);assert.equal(S.command(s,0,{type:'casterResearch',ids:[temple.id]}),null);step(s,451);assert.equal(n.casterRank,2);assert.equal(n.maxHp,hp+80);assert.equal(S.maxMana(n),400);assert.ok(S.command(s,0,{type:'casterResearch',ids:[temple.id]}));
 const legacy=S.clone(s);delete legacy.teams[0].necromancy;legacy.units.forEach(u=>{delete u.casterRank;if(u.kind==='necromancer')u.mana=150;});assert.equal(S.restore(legacy).teams[0].necromancy,0);
}
{
 const {s,n,h,v}=arena();v.cd=1;assert.equal(cast(s,n,'frenzy',v),null);assert.equal(v.frenzy,45);assert.equal(n.mana,350);assert.equal(S.attackRate(v),1.75);const hp=v.hp;step(s,1);assert.ok(Math.abs(v.hp-(hp-.4))<1e-8);assert.ok(Math.abs(v.cd-.825)<1e-8);assert.ok(cast(s,n,'frenzy',v));
 n.castLeft=0;assert.equal(cast(s,n,'cripple',v),null);assert.equal(v.cripple,60);assert.equal(S.attackRate(v),1.25);assert.equal(S.moveRate(v),.25);const copy=S.restore(S.clone(s));step(s,20);step(copy,20);assert.deepEqual(s.units,copy.units,'status clock/source and attack progress survive save');
 assert.equal(cast(s,h,'purge',v),null);assert.equal(v.frenzy,0);assert.equal(v.cripple,0);assert.equal(v.frenzySource,undefined);assert.equal(v.purgeLeft,15);assert.equal(S.moveRate(v),.2);step(s,31);assert.ok(S.moveRate(v)>.2);step(s,120);assert.equal(v.purgeLeft,0);assert.equal(S.moveRate(v),1);
}
{
 const {s,n,h}=arena(),friend=S.spawn(s,'soldier',0,1,0,{hp:.3,damage:0,shield:99,shieldLeft:10,order:{type:'hold'}}),before=[s.teams[0].gold,s.teams[0].kills];S.visibility(s);assert.equal(cast(s,n,'frenzy',friend),null);step(s,1);assert.equal(friend.hp,0);assert.equal(friend.shield,99,'life drain bypasses shields');assert.deepEqual([s.teams[0].gold,s.teams[0].kills],before);assert.ok(s.corpses.some(c=>c.id===friend.id));assert.ok(!s.events.some(e=>e.type==='deny'));
 const enemy=S.spawn(s,'hero',1,1,0,{hp:.3,damage:0});n.frenzyCd=0;S.visibility(s);assert.equal(cast(s,n,'frenzy',enemy),null);n.hp=0;step(s,1);assert.equal(enemy.hp,0);assert.equal(s.teams[0].gold,before[0]+140,'enemy drain kill credits the original caster even after caster death');
}
{
 const {s,n,h}=arena(),hero=S.spawn(s,'hero',1,2,1,{damage:0}),ally=S.spawn(s,'soldier',0,0,1,{damage:0});S.visibility(s);assert.equal(cast(s,n,'cripple',hero),null);assert.equal(hero.cripple,10);assert.equal(cast(s,h,'purge',hero),null);assert.equal(hero.cripple,0);assert.equal(hero.purgeLeft,5);h.purgeCd=0;assert.equal(cast(s,n,'frenzy',ally),null);assert.equal(cast(s,h,'purge',ally),null);assert.equal(ally.frenzy,0);assert.equal(ally.purgeLeft,0,'friendly dispel never slows');
 const summoned=S.spawn(s,'skeletonwarrior',1,1,1,{summoned:true,expires:s.frame+400});h.purgeCd=0;h.mana=200;S.visibility(s);assert.equal(cast(s,h,'purge',summoned),null);assert.equal(summoned.hp,0);assert.ok(!s.corpses.some(c=>c.id===summoned.id));
}
for(const setup of [({n})=>n.casterRank=0,({n})=>n.mana=49,({n})=>n.stun=1,({n})=>n.frenzyCd=.5,({v})=>v.kind='ram',({v})=>v.kind='hall',({v})=>v.hp=0,({v})=>v.x=25,({s})=>s.visible[0].fill(0)]){const f=arena();setup(f);const before=S.clone(f.s);assert.ok(cast(f.s,f.n,'frenzy',f.v));assert.deepEqual(f.s,before);}
{
 const {s,n,v}=arena();cast(s,n,'frenzy',v);for(const patch of [{frenzy:46},{frenzy:-1},{cripple:61},{purgeLeft:null},{frenzySource:null},{frenzySource:{id:999999,kind:'necromancer',team:0,x:0,z:0}}]){const copy=S.clone(s);Object.assign(copy.units.find(u=>u.id===v.id),patch);assert.throws(()=>S.restore(copy));}
}
{
 const {s,n,v}=arena();const archer=S.spawn(s,'archer',1,3,1,{cripple:60,order:{type:'attack',target:n.id}});n.hp=n.maxHp=2000;S.visibility(s);step(s,1);const shot=s.projectiles.find(p=>p.source===archer.id);assert.equal(shot.damage,archer.damage*.5);archer.cripple=0;assert.equal(shot.damage,archer.damage*.5,'flight damage is fixed at launch');
}
{
 const {s,n,h}=arena();const summoned=S.spawn(s,'skeletonwarrior',1,1,0,{summoned:true,expires:400});S.visibility(s);assert.equal(cast(s,h,'purge',summoned),null);assert.equal(s.pendingEvents.filter(e=>e.type==='death').length,1);step(s,1);assert.equal(s.events.filter(e=>e.type==='death').length,1);step(s,1);assert.equal(s.events.filter(e=>e.type==='death').length,0);
 const crypt=S.spawn(s,'barracks',0,-9,9,{queue:[{kind:'necromancer',left:2}]});assert.equal(S.restore(S.clone(s)).units.find(u=>u.id===crypt.id).queue[0].kind,'necromancer','existing crypt training queues survive the Temple migration');
 const worker=S.spawn(s,'worker',0,-14,14);S.spawn(s,'hall',0,-22,22);setTechnology(S,s,0,1);assert.ok(S.command(s,0,{type:'build',ids:[worker.id],kind:'temple',x:-12,z:14}));setTechnology(S,s,0,2);assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'temple',x:-12,z:14}),null);const site=s.units.find(u=>u.kind==='temple');assert.ok(site.built<1);assert.equal(S.command(s,0,{type:'cancelBuild',ids:[site.id]}),null);
}
{
 const {s,n,v}=arena();s.teams[0].ai=true;s.teams[0].necromancy=2;v.hp=v.maxHp=5000;step(s,40);assert.ok(v.cripple>0,'AI uses trained Cripple');assert.equal(n.raiseDeadAuto,true,'AI enables raising during combat');
}
{
 const {s,h,v}=arena();globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/model-catalog.json',import.meta.url)));const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
 assert.equal(cast(s,h,'purge',v),null);const {key,asset}=V.model(s,h);assert.equal(key,'RealShaman');assert.equal(V.heading(s,h,{x:h.x,z:h.z,yaw:0}),Math.atan2(v.x-h.x,v.z-h.z));assert.match(asset.animations[V.classicSample(h,asset,false,0).clip].name,/^Spell/i);
 step(s,4);const restored=S.restore(S.clone(s)),saved=restored.units.find(u=>u.id===h.id);assert.equal(V.pose(saved,asset,false,0),V.pose(h,asset,false,0));assert.equal(V.heading(restored,saved),h.castYaw);
 assert.equal(asset.animations[V.classicSample(h,asset,true,0).clip].name,'Walk');h.stun=1;assert.match(asset.animations[V.classicSample(h,asset,false,0).clip].name,/^Stand/i);h.stun=0;step(s,8);assert.match(asset.animations[V.classicSample(h,asset,false,0).clip].name,/^Stand/i);
}
console.log('PASS: caster rules and saves; realistic shaman cast pose/direction, movement/stun interruption and restored animation');
