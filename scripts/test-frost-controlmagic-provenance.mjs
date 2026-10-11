// Author: MiYu. Captured summon damage sources, launched missiles, transferred buffs and malformed provenance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {controlmagicFixture} from './frost-human-controlmagic-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),copy=v=>JSON.parse(JSON.stringify(v)),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cast=f=>S.command(f.s,0,{type:'controlMagic',ids:[f.breaker.id],target:f.target.id});
{
 const f=controlmagicFixture(S),ally=S.spawn(f.s,'humanfootman',0,5,1,{cd:99,order:{type:'hold'}});assert.ok(S.fire(f.s,f.target,ally));const shot=f.s.projectiles.at(-1);assert.equal(shot.team,1);assert.equal(cast(f),null);step(f.s,4);assert.equal(f.target.team,0);assert.equal(shot.team,1);assert.ok(S.restore(f.s));const enemy=S.spawn(f.s,'humanfootman',1,5,-1,{cd:99,order:{type:'hold'}});assert.ok(S.fire(f.s,f.target,enemy));assert.equal(f.s.projectiles.at(-1).team,0);assert.equal(f.s.projectiles.at(-1).controlMagicOrigin,1);for(let i=0;i<20;i++){step(f.s,1);assert.ok(S.restore(f.s));}assert.ok(ally.hp<ally.maxHp);assert.ok(enemy.hp<enemy.maxHp);
}
{
 const f=controlmagicFixture(S),dryad=S.spawn(f.s,'dryad',0,.5,0,{cd:99,order:{type:'hold'}});assert.ok(S.fire(f.s,dryad,f.target));step(f.s,1);assert.ok(f.target.slowPoison?.length);assert.equal(cast(f),null);step(f.s,4);assert.equal(f.target.slowPoison[0].team,0);assert.equal(f.target.slowPoison[0].controlTeam,1);assert.ok(S.restore(f.s));const bad=copy(f.s);bad.units.find(u=>u.id===f.target.id).slowPoison[0].controlFrame=-1;assert.throws(()=>S.restore(bad),/controlled Slow Poison/);step(f.s,30);assert.ok(S.restore(f.s));
}
{
 const f=controlmagicFixture(S);f.target.innerFire={source:f.h.id,team:1,frame:f.s.frame,left:60};assert.equal(cast(f),null);step(f.s,4);const other=S.spawn(f.s,'humanspellbreaker',1,2,1,{mana:250,spellStealAuto:false,cd:99,order:{type:'hold'}}),receiver=S.spawn(f.s,'humanfootman',1,1,1,{cd:99,order:{type:'hold'}});S.visibility(f.s);assert.equal(S.command(f.s,1,{type:'spellSteal',ids:[other.id],target:f.target.id}),null);step(f.s,4);assert.ok(receiver.innerFire);assert.equal(receiver.innerFire.controlTeam,undefined);assert.ok(S.restore(f.s));
}
{
 const f=controlmagicFixture(S);f.target.faerieFire=10;f.target.faerieTeam=0;assert.equal(cast(f),null);step(f.s,4);assert.equal(f.target.faerieControlTeam,1);assert.ok(S.restore(f.s));const recipient=S.spawn(f.s,'humanfootman',1,1,1,{cd:99,order:{type:'hold'}});S.visibility(f.s);assert.equal(S.command(f.s,0,{type:'spellSteal',ids:[f.breaker.id],target:f.target.id}),null);step(f.s,4);assert.ok(recipient.faerieFire>0);assert.equal(f.target.faerieControlTeam,undefined);assert.ok(S.restore(f.s));
}
console.log('PASS control provenance: old/new actual Water Elemental missiles and damage across capture, real Dryad poison retained with strict clocks, captured Inner Fire/Faerie Fire Spell Steal recipients and immediate saves');
