// Author: MiYu. Default source hero, legacy save identity and actual AI skill use.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cryptLordFixture} from './frost-crypt-lord-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},hold={cd:10000,order:{type:'hold'}};
{
 const map=S.defaultMap();map.units=[{kind:'hero',team:0,x:0,z:0,heroClass:3}];const s=S.create('skirmish',{map,factions:[3,0],ai:[false,false]}),h=s.units.find(u=>u.kind==='hero');assert.equal(S.PROTOCOL,74);assert.equal(s.cryptLordVersion,1);assert.equal(h.sourceHero,'Ucrl');assert.equal(h.maxHp,675);assert.ok(S.restore(s));
 const old=S.create('skirmish',{map,factions:[3,0],cryptLordVersion:0,ai:[false,false]});delete old.cryptLordVersion;const legacy=S.restore(old);assert.equal(legacy.cryptLordVersion,0);assert.equal(legacy.units.find(u=>u.kind==='hero').sourceHero,undefined);
 for(const mode of ['moba','rpg','td']){const other=S.create(mode,{factions:[3,0],heroes:[3,0]});assert.ok(!other.units.some(u=>u.sourceHero==='Ucrl'));}
}
console.log('PASS default source Crypt Lord, protocol 74, legacy identity and map-mode boundaries');
{
 const map=S.defaultMap();map.props=[];map.units=[];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);const s=S.create('skirmish',{map,factions:[3,0],ai:[false,false]});s.teams[0].gold=10000;s.teams[0].wood=10000;S.spawn(s,'farm',0,-15,-20);const altar=S.spawn(s,'altar',0,-16,-15);assert.equal(S.command(s,0,{type:'train',ids:[altar.id],kind:'hero',heroClass:3}),null);step(s,560);const h=s.units.find(u=>u.kind==='hero'&&u.team===0);assert.equal(h.sourceHero,'Ucrl');assert.equal(h.maxHp,675);assert.equal(h.beetlesAuto,false);assert.ok(S.restore(s));
}
console.log('PASS completed default Altar recruitment creates the source Crypt Lord with original stats');
{
 const {s,h}=cryptLordFixture(S);const corpse=S.spawn(s,'soldier',1,3,0,{...hold,hp:1});S.fire(s,h,corpse);S.setAI(s,0,true);step(s,50);assert.equal(h.skills[2],1);assert.equal(h.beetlesAuto,true);assert.equal(S.beetleArmy(s,h).length,1);assert.ok(S.restore(s));
}
console.log('PASS first AI skill build summons a nearby corpse as a Carrion Beetle');
{
 const {s,h}=cryptLordFixture(S,6);assert.equal(S.command(s,0,{type:'learn',ids:[h.id],slot:3}),null);h.mana=S.maxMana(h);const target=S.spawn(s,'soldier',1,4,0,{...hold,hp:10000,maxHp:10000});S.visibility(s);S.setAI(s,0,true);step(s,50);assert.ok(h.locustSwarm);assert.ok(s.locusts.length);assert.equal(h.cryptLordLastSlot,3);assert.ok(S.restore(s));
 const idle=cryptLordFixture(S,6);assert.equal(S.command(idle.s,0,{type:'learn',ids:[idle.h.id],slot:3}),null);idle.h.mana=S.maxMana(idle.h);S.setAI(idle.s,0,true);step(idle.s,50);assert.equal(idle.h.locustSwarm,undefined);
}
console.log('PASS AI casts learned Locust Swarm near a valid enemy and preserves mana without enemies');
