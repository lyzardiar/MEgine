// Author: MiYu. Temple research, mixed summons, piercing missiles and persistence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map,factions:[3,0]});s.units=[];Object.assign(s.teams[0],{gold:3000,wood:3000,tier:3});const temple=S.spawn(s,'temple',0,-10,8),other=S.spawn(s,'temple',0,-18,8),n=S.spawn(s,'necromancer',0,0,0,{damage:0,order:{type:'hold'}});S.spawn(s,'farm',0,-10,15);S.visibility(s);return {s,temple,other,n};}
const research=(s,u,upgrade)=>S.command(s,0,{type:'skeletonResearch',ids:[u.id],upgrade});
function corpse(s,n){const v=S.spawn(s,'soldier',1,2,2,{hp:1,damage:0,speed:0}),gun=S.spawn(s,'rifleman',0,2,0,{damage:100000,order:{type:'attack',target:v.id}});S.visibility(s);step(s,1);assert.equal(v.hp,0);s.units=s.units.filter(u=>u.id!==gun.id);n.raiseDeadCd=0;n.mana=200;return v.id;}
{
 const {s,temple,other}=arena();s.teams[0].tier=2;assert.ok(research(s,temple,'mastery'));assert.equal(research(s,temple,'longevity'),null);assert.deepEqual(temple.casterResearch,{upgrade:'longevity',left:15});assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[2950,2925]);
 const before=S.clone(s);assert.ok(research(s,other,'longevity'));assert.ok(research(s,temple,'mastery'));assert.ok(S.command(s,0,{type:'casterResearch',ids:[temple.id]}));assert.ok(S.command(s,0,{type:'train',ids:[temple.id],kind:'necromancer'}));assert.deepEqual(s,before);
 assert.equal(S.command(s,0,{type:'cancelCasterResearch',ids:[temple.id]}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[3000,3000]);assert.equal(research(s,temple,'longevity'),null);step(s,25);const restored=S.restore(S.clone(s));step(s,126);step(restored,126);assert.deepEqual(s.units,restored.units);assert.equal(s.teams[0].skeletalLongevity,1);assert.ok(research(s,temple,'longevity'));
 s.teams[0].tier=3;assert.equal(research(s,temple,'mastery'),null);assert.equal(S.command(s,0,{type:'casterResearch',ids:[other.id]}),null,'independent research uses another temple');assert.equal(S.command(s,0,{type:'cancelCasterResearch',ids:[temple.id]}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[2850,2875]);assert.equal(research(s,temple,'mastery'),null);step(s,301);assert.equal(s.teams[0].skeletalMastery,1);assert.equal(s.teams[0].necromancy,1);
 const publicEnemy=S.publicState(s,1);assert.equal(publicEnemy.teams[0].skeletalMastery,undefined);assert.ok(!publicEnemy.units.some(u=>u.team===0&&u.casterResearch));
}
for(const setup of [f=>f.s.teams[0].gold=49,f=>f.s.teams[0].wood=74,f=>f.s.teams[0].tier=1,f=>f.s.teams[0].faction=1,f=>f.temple.built=.5,f=>f.temple.hp=0,f=>f.temple.team=1,f=>f.temple.kind='barracks',f=>f.temple.queue=[{kind:'necromancer',left:20}],f=>f.s.mode='moba']){const f=arena();setup(f);const before=S.clone(f.s);assert.ok(research(f.s,f.temple,'longevity'));assert.deepEqual(f.s,before);}
for(const upgrade of [undefined,null,'__proto__','constructor','unknown',0,{toString:null},{toString:1},['mastery']]){const {s,temple}=arena(),before=S.clone(s);assert.ok(research(s,temple,upgrade));assert.deepEqual(s,before);}
{
 const {s,temple,other}=arena();assert.equal(research(s,temple,'mastery'),null);temple.hp=0;step(s,301);assert.equal(s.teams[0].skeletalMastery,0);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[2800,2900]);assert.equal(research(s,other,'mastery'),null,'destroyed temple releases the research lock');
}
{
 const {s,n,temple}=arena();corpse(s,n);assert.equal(S.command(s,0,{type:'raiseDead',ids:[n.id]}),null);const old=s.units.filter(u=>u.summoned);assert.ok(old.every(u=>u.kind==='skeletonwarrior'&&u.expires===s.frame+400));const expires=old.map(u=>u.expires);assert.equal(research(s,temple,'longevity'),null);step(s,151);assert.deepEqual(old.map(u=>u.expires),expires,'existing summons keep their casting lifetime');s.teams[0].skeletalMastery=1;
 corpse(s,n);const food=S.population(s,0).used;assert.equal(S.command(s,0,{type:'raiseDead',ids:[n.id]}),null);const pair=s.units.filter(u=>u.summoned&&!old.includes(u));assert.deepEqual(pair.map(u=>u.kind),['skeletonwarrior','skeletonmage']);assert.ok(pair.every(u=>u.expires===s.frame+550));assert.equal(S.population(s,0).used,food);const mage=pair[1];assert.equal(S.types.skeletonmage.hp,230);assert.equal(S.types.skeletonmage.armor,'medium');assert.equal(S.types.skeletonmage.attack,'pierce');assert.equal(S.projectileArt(mage),'shadow');assert.equal(S.types.skeletonmage.antiAir,true);
 s.units=s.units.filter(u=>!u.summoned||u===mage);Object.assign(mage,{x:0,z:0,cd:0,order:{type:'hold'}});const target=S.spawn(s,'dragon',1,0,3.2,{damage:0,hp:1000,maxHp:1000,order:{type:'hold'}});S.visibility(s);step(s,1);assert.equal(target.hp,1000,'missile flight precedes damage');assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].art,'shadow');mage.cd=99;const copy=S.restore(S.clone(s));step(s,5);step(copy,5);assert.deepEqual(s.units,copy.units);assert.ok(Math.abs(target.hp-(1000-mage.damage*1.35))<1e-7,'pierce multiplier against light air armor');
 const shaman=S.spawn(s,'shaman',1,2,0,{damage:0,bloodlustAuto:false,mana:200,order:{type:'hold'}});S.visibility(s);assert.equal(S.command(s,1,{type:'casterSpell',ids:[shaman.id],spell:'purge',target:mage.id}),null);assert.equal(mage.hp,0);step(s,1);assert.ok(!s.corpses.some(c=>c.id===mage.id));
 corpse(s,n);assert.equal(S.command(s,0,{type:'raiseDead',ids:[n.id]}),null);const expiry=s.units.filter(u=>u.summoned).map(u=>u.id);step(s,551);assert.ok(!s.units.some(u=>expiry.includes(u.id)));assert.ok(!s.corpses.some(c=>expiry.includes(c.id)));
}
{
 const {s,temple,other}=arena();assert.equal(research(s,temple,'mastery'),null);const raw=S.clone(s);
 for(const edit of [x=>x.teams[0].skeletalMastery=true,x=>x.teams[0].skeletalLongevity=-1,x=>x.teams[0].skeletalMastery=1,x=>x.teams[0].tier=2,x=>x.units.find(u=>u.id===temple.id).casterResearch.left=31,x=>x.units.find(u=>u.id===temple.id).casterResearch.upgrade='__proto__',x=>x.units.find(u=>u.id===temple.id).casterResearch.rank=1,x=>x.units.find(u=>u.id===other.id).casterResearch={upgrade:'mastery',left:30}]){const bad=S.clone(raw);edit(bad);assert.throws(()=>S.restore(bad),/research/i);}
 delete raw.units.find(u=>u.id===temple.id).casterResearch;delete raw.teams[0].skeletalMastery;delete raw.teams[0].skeletalLongevity;const legacy=S.restore(raw);assert.equal(legacy.teams[0].skeletalMastery,0);assert.equal(legacy.teams[0].skeletalLongevity,0);
}
{
 const {s,temple,other}=arena();s.units=s.units.filter(u=>u!==other);Object.assign(s.teams[0],{ai:true,tier:2,wood:60});s.frame=39;step(s,1);assert.equal(temple.casterResearch.rank,1,'AI falls back to affordable Adept Training');
}
{
 const {s,temple,other}=arena();Object.assign(s.teams[0],{ai:true,tier:2,necromancy:1});s.frame=39;step(s,1);assert.equal(temple.casterResearch.upgrade,'longevity');assert.equal(other.queue[0].kind,'necromancer','another temple keeps producing while a unique upgrade is in progress');temple.casterResearch.left=.1;step(s,1);s.teams[0].tier=3;s.frame=79;step(s,1);assert.equal(temple.casterResearch.upgrade,'mastery');
}
console.log('PASS: skeleton research costs, cancellation, tier/ownership/queue gates, destruction, mixed summons, lifetime, piercing air missiles, Purge, saves, AI fallback and privacy');
