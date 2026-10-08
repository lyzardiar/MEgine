// Author: MiYu. Source production, evasion, channel spell events and deterministic save tests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {faerieFixture} from './frost-faerie-dragon-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,u,type,data={})=>S.command(s,u.team,{type,ids:[u.id],...data}),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,wind,wonders}=faerieFixture(S);assert.deepEqual(S.trainable(s,wind),['druidtalon','hippogryph','faeriedragon']);wonders.built=.5;assert.match(cmd(s,wind,'train',{kind:'faeriedragon'}),/Wonders/);wonders.built=1;assert.equal(cmd(s,wind,'train',{kind:'faeriedragon'}),null);assert.equal(s.teams[0].gold,9845);assert.equal(s.teams[0].wood,9975);assert.equal(wind.queue[0].left,25);step(s,100);const saved=S.restore(s);step(s,150);step(saved,150);assert.deepEqual(s,saved);assert.equal(s.units.filter(S.faerieUnit).length,2);assert.ok(S.restore(s));
}
console.log('PASS source Faerie production: completed eden gate, tier-two Wind, 155/25/2/25s and exact save continuation');
{
 const {s,faerie}=faerieFixture(S),enemy=S.spawn(s,'archer',1,3,4,{damage:20,order:{type:'hold'}});S.visibility(s);S.fire(s,enemy,faerie);step(s,2);assert.equal(faerie.hp,450);close(faerie.mana,55.15);assert.equal(faerie.phaseLeft,1.5);assert.equal(S.isVisible(s,1,faerie),false);assert.equal(S.canAttack(enemy,faerie),false);const saved=S.restore(s);step(s,16);step(saved,16);assert.deepEqual(s,saved);assert.equal(faerie.phaseLeft,0);assert.ok(faerie.phaseCd>0);assert.equal(cmd(s,faerie,'phaseShift'),'Phase Shift is not ready');assert.equal(cmd(s,faerie,'phaseAuto',{enabled:false}),null);assert.equal(faerie.phaseAuto,false);assert.equal(cmd(s,faerie,'move',{x:8,z:4}),null);step(s,10);assert.ok(faerie.x>2);assert.ok(S.restore(s));
}
console.log('PASS Phase Shift: impact autocast, 20 mana/1.5s/6.5s, hidden/invulnerable interval, manual cooldown, movement and saved continuation');
{
 const {s,faerie}=faerieFixture(S);assert.equal(cmd(s,faerie,'manaFlare'),null);step(s,7);assert.equal(faerie.flareLeft,0);close(faerie.mana,75+.75*.7);const saved=S.restore(s);step(s,1);step(saved,1);assert.deepEqual(s,saved);assert.equal(faerie.flareLeft,30);assert.equal(S.armorValue(faerie),12);close(faerie.mana,25+.75*.8);
 const caster=S.spawn(s,'shaman',1,4,4,{mana:200,damage:0}),ally=S.spawn(s,'soldier',1,4,5,{damage:0,order:{type:'hold'}});S.visibility(s);const hp=caster.hp;assert.equal(cmd(s,caster,'casterSpell',{spell:'purge',target:faerie.id}), 'Invalid spell target');assert.equal(caster.hp,hp);assert.equal(cmd(s,caster,'casterSpell',{spell:'purge',target:ally.id}),null);close(caster.hp,hp-90);assert.ok(s.events.some(e=>e.type==='manaFlare'));const hero=S.spawn(s,'hero',1,4,6,{heroClass:1,skills:[1,0,0,0],skillPoints:0,damage:0});S.visibility(s);const hh=hero.hp;assert.equal(cmd(s,hero,'spell',{slot:0,x:4,z:6}),null);close(hero.hp,hh-S.heroes[hero.heroClass].spells[0].cost);assert.ok(S.restore(s));
 const before=faerie.mana;S.moonRestore(s,S.spawn(s,'farm',0,2,5,{mana:100}),faerie);assert.ok(faerie.mana>=before);assert.equal(caster.hp,hp-90);assert.equal(cmd(s,faerie,'move',{x:10,z:4}),null);assert.equal(faerie.flareLeft,0);assert.equal(S.armorValue(faerie),0);assert.ok(S.restore(s));
}
console.log('PASS Mana Flare: .75s cast/50mana/30s channel/20s cooldown, +12 armor, actual spell expenditure, ordinary/hero caps, immunity rejection and movement cancellation');
{
 const {s,faerie}=faerieFixture(S);cmd(s,faerie,'manaFlare');step(s,309);assert.equal(faerie.flareLeft,0);assert.equal(faerie.order,null);assert.equal(S.armorValue(faerie),0);const mana=faerie.mana;step(s,20);close(faerie.mana,mana+1.5);assert.ok(S.restore(s));
 for(const mutate of [u=>u.phaseAuto=1,u=>u.phaseLeft=2,u=>u.flareCastLeft=1,u=>u.flareLeft=30,u=>u.damage=0,u=>u.mana=201]){const raw=S.clone(s);mutate(raw.units.find(S.faerieUnit));assert.throws(()=>S.restore(raw));}const raw=S.clone(s);raw.units.find(u=>u.kind==='hero').phaseCd=0;assert.throws(()=>S.restore(raw));
 const old=S.clone(s);old.units=old.units.filter(u=>!S.faerieUnit(u));delete old.faerieVersion;assert.equal(S.restore(old).faerieVersion,0);
}
console.log('PASS strict Faerie saves: no automatic channel restart, source ranges, state ownership, derived stats and legacy version zero');
{
 const {s,faerie}=faerieFixture(S),target=S.spawn(s,'dragon',1,5,4,{damage:0,order:{type:'hold'}});S.visibility(s);assert.equal(cmd(s,faerie,'attack',{target:target.id}),null);step(s,6);const shot=s.projectiles[0];assert.equal(shot.art,'faerie-dragon');assert.equal(S.projectileSpeed(shot),9);assert.ok(shot.damage>=14&&shot.damage<=16);const saved=S.restore(s);step(s,12);step(saved,12);assert.deepEqual(s,saved);assert.ok(target.hp<target.maxHp);s.teams[0].nightResearch.Resw=2;s.teams[0].nightResearch.Rerh=3;S.updateNightUnit(s,faerie);assert.equal(faerie.damage,19);assert.equal(faerie.armorValue,6);s.frame=2400;faerie.hp=400;step(s,10);close(faerie.hp,400.5);assert.ok(S.restore(s));
}
console.log('PASS source Faerie weapon: air targeting, 14-16 dice, .5s windup, 900-speed/.15 arc, source upgrades and night regeneration');
{
 const {s,faerie}=faerieFixture(S),hero=s.units.find(u=>u.kind==='hero'&&u.team===0);hero.x=2;hero.z=5;hero.inventory=[S.items.findIndex(i=>i.staff==='preservation')];S.visibility(s);cmd(s,faerie,'manaFlare');step(s,8);assert.equal(cmd(s,hero,'useItem',{slot:0,item:hero.inventory[0],target:faerie.id}),null);assert.equal(faerie.flareLeft,0);assert.equal(S.armorValue(faerie),0);assert.ok(S.restore(s));
 faerie.x=2;faerie.z=4;faerie.hp=400;hero.inventory=[S.items.findIndex(i=>i.staff==='sanctuary')];hero.itemTimers={};S.visibility(s);assert.equal(cmd(s,hero,'useItem',{slot:0,item:hero.inventory[0],target:faerie.id}),null);assert.equal(faerie.sanctuary,true);assert.equal(cmd(s,faerie,'phaseShift'),'Phase Shift is not ready');assert.equal(cmd(s,faerie,'manaFlare'),'Mana Flare is not ready');assert.ok(S.restore(s));
 const f=faerieFixture(S);assert.equal(cmd(f.s,f.faerie,'phaseShift'),null);assert.ok(f.s.pendingEvents.some(e=>e.type==='phaseShift'));step(f.s,1);assert.ok(f.s.events.some(e=>e.type==='phaseShift'));
 step(f.s,64);assert.equal(f.faerie.phaseCd,0);assert.equal(cmd(f.s,f.faerie,'phaseShift'),null);
 const invalid=faerieFixture(S),soldier=S.spawn(invalid.s,'soldier',1,3,4);S.visibility(invalid.s);assert.equal(cmd(invalid.s,soldier,'attack',{target:invalid.faerie.id}),'Selected units cannot attack this target');assert.equal(invalid.faerie.mana,75);
}
console.log('PASS reviewed Faerie boundaries: Staff cancels channel immediately, Sanctuary blocks both skills, manual events persist and invalid ground attacks spend no phase mana');
