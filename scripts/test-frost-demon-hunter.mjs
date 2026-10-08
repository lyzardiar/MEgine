// Author: MiYu. Verify paid source hero lifecycle, learned abilities, form profiles and exact continuation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),DH=require('../samples/frostbound-realms/game/demon-hunter.js');globalThis.Frost=S;
const V=require('../samples/frostbound-realms/game/visuals.js'),root=new URL('../samples/frostbound-realms/',import.meta.url);
globalThis.FrostArt={...JSON.parse(fs.readFileSync(new URL('model-catalog.json',root))),...JSON.parse(fs.readFileSync(new URL('demon-hunter-models.json',root)))};
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra});
export function demonFixture(level=1){const map=S.defaultMap();map.props=[];map.units=[];map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];s.resources=[];const h=S.spawn(s,'hero',0,0,0,{heroClass:0,level,skillPoints:level,order:{type:'hold'}});S.visibility(s);return {s,h};}
function continuation(s,n){const saved=S.restore(s);step(s,n);step(saved,n);assert.deepEqual(saved,s);}
{
 const {s,h}=demonFixture();assert.equal(h.sourceHero,'Edem');assert.equal(h.maxHp,575);assert.equal(h.damage,35);assert.equal(h.armorValue,4.6);assert.equal(h.speed,3.2);assert.equal(h.mana,100);assert.equal(S.maxMana(h),240);assert.equal(S.unitType(h).range,1);assert.equal(S.projectileSpeed(h),0);assert.equal(S.unitType(h).antiAir,false);assert.equal(S.heroExperienceNeed(h),200);assert.deepEqual(S.demonHunterAttributes(h),{strength:19,agility:22,intelligence:16});
 const before=h.mana;step(s,10);assert.ok(Math.abs(h.mana-before-.81)<1e-7);assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.match(cmd(s,h,'spell',{slot:2}),/Learn/);assert.ok(S.restore(s));
 const legacy=S.clone(s);delete legacy.demonHunterVersion;for(const u of legacy.units){for(const k of ['sourceHero','immolation','immolationPulse','metamorphLeft','strength','agility','intelligence'])delete u[k];}assert.equal(S.restore(legacy).units[0].sourceHero,undefined);
 const moba=S.create('moba',{factions:[2,0],ai:[false,false]});assert.equal(moba.units.find(u=>u.kind==='hero').sourceHero,undefined);
}
console.log('PASS Demon Hunter source identity: Edem, 575HP, 100/240 mana, AGI damage/armor/speed, original regen, XP thresholds and versioned legacy/MOBA isolation');
{
 const {s,h}=demonFixture(6);assert.equal(h.maxHp,875);assert.equal(h.damage,42);assert.equal(S.maxMana(h),390);assert.equal(S.heroExperienceNeed(h),700);
 for(const slot of [0,1,2,3])assert.equal(cmd(s,h,'learn',{slot}),null);assert.match(cmd(s,h,'spell',{slot:2}),/passive/);assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.ok(S.restore(s));
 for(const change of [{sourceHero:'Edmm'},{maxHp:1},{mana:999},{immolation:'yes'},{metamorphLeft:61},{demonCast:{slot:2,target:h.id,left:.3}},{immolationPulse:-1}])assert.throws(()=>S.restore({...s,units:[{...h,...change}]}),/Demon Hunter/);
 const {s:low,h:l}=demonFixture();assert.match(cmd(low,l,'learn',{slot:3}),/level 6/);assert.equal(cmd(low,l,'learn',{slot:1}),null);l.level=2;l.skillPoints=1;assert.match(cmd(low,l,'learn',{slot:1}),/level 3/);
}
console.log('PASS original hero growth, 1/3/5/6 skill gates, passive command rejection and strict source identity/stat/status validation');
{
 const {s,h}=demonFixture(),v=S.spawn(s,'shaman',1,2.4,0,{mana:35,damage:0,order:{type:'hold'}});S.visibility(s);cmd(s,h,'learn',{slot:0});const initial=v.hp;assert.match(cmd(s,h,'spell',{slot:0,target:h.id}),/enemy/);assert.match(cmd(s,h,'spell',{slot:0,target:v.id+100}),/enemy/);v.x=4;assert.match(cmd(s,h,'spell',{slot:0,target:v.id}),/range/);v.x=2.4;
 assert.equal(cmd(s,h,'spell',{slot:0,target:v.id}),null);assert.equal(h.mana,100);continuation(s,2);assert.equal(v.hp,initial);continuation(s,4);assert.ok(v.mana<1);assert.ok(v.hp<initial&&v.hp>initial-37);assert.ok(Math.abs(h.spell[0]-6.7)<1e-7);assert.ok(v.manaBurnFrame);assert.ok(S.restore(s));
 h.spell[0]=0;h.mana=100;v.mana=100;assert.equal(cmd(s,h,'spell',{slot:0,target:v.id}),null);for(const order of [{type:'unknown'},{type:'move',x:NaN,z:0},{type:'attack',target:999999},{type:'useItem',slot:6,item:999999}]){const before=S.clone(s);assert.ok(cmd(s,h,order.type,order));assert.deepEqual(s,before);}assert.match(cmd(s,h,'move',{x:5,z:0,append:true}),/Finish this order/);assert.ok(h.demonCast);assert.ok(S.restore(s));assert.equal(cmd(s,h,'stop'),null);step(s,5);assert.ok(v.mana>=100);assert.ok(!h.demonCast);assert.equal(cmd(s,h,'spell',{slot:0,target:v.id}),null);assert.equal(cmd(s,h,'move',{x:5,z:0}),null);assert.equal(h.demonCast,undefined);assert.ok(S.restore(s));
 h.mana=49;assert.match(cmd(s,h,'spell',{slot:0,target:v.id}),/ready/);assert.ok(S.command(s,1,{type:'spell',ids:[h.id],slot:0,target:v.id}));
}
console.log('PASS actual Mana Burn: visible enemy/mana/range/ownership gates, .3s cast then .25s release, paid mana, capped drain/damage, cooldown, cancellation and exact save continuation');
{
 const {s,h}=demonFixture(),v=S.spawn(s,'soldier',1,1.5,0,{damage:0,order:{type:'hold'}}),air=S.spawn(s,'dragon',1,1.5,.2,{damage:0,order:{type:'hold'}}),building=S.spawn(s,'hall',1,1.5,.5);S.visibility(s);cmd(s,h,'learn',{slot:1});const hp=v.hp,airHp=air.hp,buildingHp=building.hp;
 assert.equal(cmd(s,h,'spell',{slot:1}),null);step(s,3);h.stun=10;building.cd=100;assert.equal(h.immolation,true);continuation(s,10);assert.equal(v.hp,hp-10);assert.equal(air.hp,airHp);assert.equal(building.hp,buildingHp);assert.ok(Math.abs(h.mana-69.053)<1e-6);assert.ok(v.immolationHitFrame);assert.equal(cmd(s,h,'spell',{slot:1}),null);assert.equal(h.immolation,false);h.immolation=true;h.immolationFrame=s.frame;h.mana=.1;step(s,1);assert.equal(h.immolation,false);
}
console.log('PASS Immolation: 25 activation mana, 7 mana/sec, original 160 radius and 1s 10-damage pulses, air/building exclusion, off command, exhaustion and exact continuation');
{
 const {s,h}=demonFixture(6);cmd(s,h,'learn',{slot:3});h.mana=300;h.hp=100;assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,3);assert.equal(h.metamorphCastLeft,1.5);assert.ok(cmd(s,h,'move',{x:2,z:0}));continuation(s,15);assert.equal(h.metamorphLeft,60);assert.equal(h.maxHp,1375);assert.ok(h.hp<620&&h.hp>600);assert.equal(S.unitType(h).attack,'chaos');assert.equal(S.unitType(h).range,6);assert.equal(S.unitType(h).antiAir,true);assert.equal(S.projectileSpeed(h),9);assert.equal(S.unitType(h).cooldown,1.6);assert.ok(Math.abs(h.spell[3]-178.5)<1e-7);
 const v=S.spawn(s,'dragon',1,5,0,{damage:0,order:{type:'hold'},hp:10000,maxHp:10000});S.visibility(s);assert.equal(S.fire(s,h,v),true);const p=s.projectiles.at(-1);assert.equal(p.sourceHero,'Edem');assert.equal(p.art,'demon-hunter');assert.equal(S.unitType(p).attack,'chaos');h.metamorphLeft=.1;step(s,1);assert.equal(S.unitType(h).attack,'hero');assert.equal(h.maxHp,875);assert.equal(S.unitType(s.projectiles[0]).attack,'chaos');continuation(s,20);assert.ok(v.hp<10000);assert.ok(S.restore(s));
 const visual=V.model(s,h);assert.equal(visual.key,'ClassicDemonHunter');assert.equal(visual.scale,require('../samples/frostbound-realms/unit-scale-catalog.json').worldScale*S.demonHunterRules.units.Edem.modelScale);const alt={...h,metamorphLeft:10};assert.match(visual.asset.animations[V.classicClip(visual.asset,'Stand',alt)].name,/alternate/i);assert.doesNotMatch(visual.asset.animations[V.classicClip(visual.asset,'Stand',h)].name,/alternate/i);assert.equal(V.unitPortrait(s,h),S.demonHunterRules.units.Edem.icon);
}
console.log('PASS Metamorphosis: paid 150 mana/180s cooldown, 500HP bonus and retained attributes/inventory, 60s Edmm weapon/air/splash profile, revert-safe missile snapshots and original alternate animation selection');
{
 const {s,h}=demonFixture(6);cmd(s,h,'learn',{slot:2});h.hp=h.maxHp;h.mana=0;const a=S.spawn(s,'soldier',1,.5,0,{damage:10,order:{type:'hold'}});s.rng=1972;const before=h.hp;assert.equal(S.fire(s,a,h),true);assert.equal(h.hp,before);assert.ok(s.events.some(e=>e.type==='evade'));assert.ok(S.restore(s));
}
console.log('PASS seeded attack-impact Evasion: source 10% rank, deterministic RNG, no attack damage on evade and saved continuation');
{
 const {s,h}=demonFixture(3),v=S.spawn(s,'shaman',1,2.4,0,{mana:100,damage:0,order:{type:'hold'}});S.visibility(s);cmd(s,h,'learn',{slot:0});cmd(s,h,'spell',{slot:0,target:v.id});step(s,3);assert.equal(h.demonBurn.power,50);assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.equal(S.restore(s).units[0].demonBurn.power,50);continuation(s,4);assert.ok(h.spell[0]>6);assert.ok(S.restore(s));h.spell[0]=0;h.mana=100;v.mana=100;cmd(s,h,'spell',{slot:0,target:v.id});h.cyclone=1;step(s,2);assert.equal(h.demonCast,undefined);step(s,12);assert.ok(h.mana>100);
 const {s:upgrade,h:hero}=demonFixture();hero.xp=199;const victim=S.spawn(upgrade,'soldier',1,.5,0,{hp:1,damage:0});assert.equal(S.fire(upgrade,hero,victim),true);assert.equal(hero.level,2);assert.equal(hero.maxHp,625);assert.equal(hero.damage,36);assert.equal(S.maxMana(hero),270);assert.ok(S.restore(upgrade));
}
console.log('PASS reviewed hero regressions: historical rank cooldown/damage survives learning, Cyclone cancels a pending cast, and actual kill XP applies source attribute growth');
{
 const {s}=demonFixture();s.units=[];s.teams[0].gold=1000;s.teams[0].wood=1000;S.spawn(s,'hall',0,-8,-8);const altar=S.spawn(s,'altar',0,0,0),far=S.spawn(s,'soldier',1,25,25,{damage:0,order:{type:'hold'}});assert.equal(cmd(s,altar,'train',{kind:'hero',heroClass:0}),null);assert.equal(s.teams[0].gold,1000);assert.equal(altar.queue[0].left,55);continuation(s,550);const h=s.units.find(S.demonHunterUnit);assert.ok(h);assert.equal(h.maxHp,575);assert.equal(S.population(s,0).used,5);assert.ok(h.inventory.includes(S.townPortal.item));assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.ok(cmd(s,altar,'train',{kind:'hero',heroClass:0}));const inventory=[...h.inventory];far.damage=100000;S.fire(s,far,h);assert.equal(h.hp,0);assert.equal(h.immolation,false);assert.equal(h.metamorphLeft,0);assert.equal(cmd(s,altar,'revive',{target:h.id}),null);assert.equal(s.teams[0].gold,830);assert.equal(altar.queue[0].left,35.75);continuation(s,358);assert.equal(h.hp,h.maxHp);assert.ok(h.mana>=100&&h.mana<101);assert.deepEqual(h.skills,[1,0,0,0]);assert.deepEqual(h.inventory,inventory);assert.equal(h.sourceHero,'Edem');assert.ok(S.restore(s));
}
console.log('PASS paid Altar lifecycle: complete 55s free-first recruitment, real supply, original identity and portal item, owned-type rejection, death cleanup and full paid revival timer retaining skills/items');
{
 const receipt=JSON.parse(fs.readFileSync(new URL('demon-hunter-sources.json',root)));for(const r of receipt.files){const raw=fs.readFileSync(new URL(r.path,root));assert.equal(raw.length,r.bytes,r.path);assert.equal(createHash('sha256').update(raw).digest('hex'),r.sha256,r.path);}for(const [p,hash] of Object.entries(receipt.generators)){const raw=fs.readFileSync(new URL('../../'+p,root)).toString().replace(/\r\n/g,'\n');assert.equal(createHash('sha256').update(raw).digest('hex'),hash,p);}
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('SourceAssets/WarcraftIII/Units/MiscGame.txt',root))).digest('hex'),'2228cf869991d6ec5133e6115c3457903c2f0da9f0d70acc3d2518fe91e5f5bf');assert.deepEqual(S.demonHunterRules.skillBuilds.first,[1,0,2,0,2,3,0,2,1,1]);
}
console.log('PASS Demon Hunter provenance: exact signed source/generated bytes, LF-canonical generators, patched TFT hero constants and original first/later AI skill builds');
