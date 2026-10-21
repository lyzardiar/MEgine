// Author: MiYu. Source Mana/ManaEx policy for caster training and Well Spring; legacy and initial mana.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {hitpointCases,hitpointFixture,hitpointResearch} from './test-frost-hitpoint-upgrades.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
export const manaCases=[...hitpointCases.filter(c=>c.key!=='Rhan'),{key:'Rews',kind:'farm',producer:'workshop',command:'nightResearch',faction:2,ranks:1}];
export function manaFixture(c,options={}){const f=hitpointFixture(c,options);if(c.kind==='farm'){f.unit.rechargeAuto=false;f.unit.order=null;}return f;}
export const manaResearch=(s,c,p)=>c.command==='nightResearch'?S.nightResearchOption(s,p,c.key):hitpointResearch(s,c,p);
export const manaOrder=(s,c,p)=>S.command(s,0,{type:c.command,ids:[p.id],upgrade:c.key});
export const manaRegeneration=(s,u)=>u.moonWellRules===1?(S.isNight(s)?(u.nightLevels.Rews?(s.manaUpgradeVersion===1?S.nightTechnology.specialRules.wellSpring.upgradedManaRegen:1.9):S.nightTechnology.units.emow.manaRegen):0):S.sanctumRules.units[u.kind]?S.sanctumRules.units[u.kind].manaRegen+S.sanctumTrainingBonus(u.kind,u.sanctumRank||0).manaRegen:S.druidRules.units[u.kind].manaRegen+.325*u.druidRank;
const round=x=>Math.floor(Math.fround(Math.fround(x)+.5)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`),initialMana=c=>c.kind==='farm'?S.nightTechnology.units.emow.initialMana:(S.sanctumRules.units[c.kind]||S.druidRules.units[c.kind]).initialMana;
assert.equal(S.PROTOCOL,119);assert.equal(S.create().manaUpgradeVersion,1);
assert.equal(S.nightTechnology.research.Rews.sourceRow.effect2,'rmnr');assert.equal(S.nightTechnology.specialRules.wellSpring.manaRegenBonus,.52);
for(const c of manaCases){
 const {s,producer,unit}=manaFixture(c);assert.equal(unit.mana,initialMana(c));const units=[unit,...Array.from({length:5},(_,i)=>S.spawn(s,c.kind,0,-4-i*3,-4,{...(c.kind==='humanpriest'?{sanctumAuto:false}:{}),...(c.kind==='farm'?{rechargeAuto:false}:{}),order:c.kind==='farm'?null:{type:'hold'}}))];
 for(let rank=1;rank<=c.ranks;rank++){
  const max=S.maxMana(unit),values=[0,.001,1,75.25,max/2,max];units.forEach((u,i)=>u.mana=values[i]);assert.equal(manaOrder(s,c,producer),null);producer.queue[0].left=.1;S.visibility(s);const resumed=S.restore(s);S.tick(s);S.tick(resumed);assert.deepEqual(s,resumed);const next=S.maxMana(unit);assert.equal(next,max+(c.key==='Rews'?125:100));for(let i=0;i<units.length;i++)near(units[i].mana,Math.min(next,round(Math.fround(next*Math.fround(values[i]/max)))+manaRegeneration(s,units[i])*S.DT));const recruit=S.spawn(s,c.kind,0,-8,-10,{...(c.kind==='humanpriest'?{sanctumAuto:false}:{}),...(c.kind==='farm'?{rechargeAuto:false}:{}),order:c.kind==='farm'?null:{type:'hold'}});assert.equal(recruit.mana,initialMana(c));assert.equal(S.maxMana(recruit),next);assert.ok(S.restore(s));
 }
 console.log('PASS source mana '+c.kind+': '+c.key+' all ranks, empty/fractional/half/full pools, rounded ratio, unchanged source initial mana and saved continuation');
}
for(const c of manaCases){const {s,producer,unit}=manaFixture(c,{manaUpgradeVersion:0});unit.mana=75.25;assert.equal(manaOrder(s,c,producer),null);producer.queue[0].left=.1;const raw=S.clone(s);delete raw.manaUpgradeVersion;const resumed=S.restore(raw);assert.equal(resumed.manaUpgradeVersion,0);S.tick(s);S.tick(resumed);assert.deepEqual(s,resumed);near(unit.mana,75.25+manaRegeneration(s,unit)*S.DT);}
for(const version of [0,1]){const c=manaCases.at(-1),{s,producer,unit}=manaFixture(c,{manaUpgradeVersion:version});assert.equal(manaOrder(s,c,producer),null);producer.queue[0].left=.1;S.tick(s);unit.mana=0;s.map.startingHour=22;for(let i=0;i<10;i++)S.tick(s);near(unit.mana,version===1?1.77:1.9);unit.mana=0;s.map.startingHour=8;for(let i=0;i<10;i++)S.tick(s);assert.equal(unit.mana,0);assert.ok(S.restore(s));}
{
 const c=manaCases[0],{s,producer,unit}=manaFixture(c);unit.mana=75.25;assert.equal(S.command(s,0,{type:'sanctumResearch',ids:[producer.id],upgrade:'Rhse'}),null);producer.queue[0].left=.1;S.tick(s);near(unit.mana,75.25+manaRegeneration(s,unit)*S.DT);
 for(const value of [-1,2,null,'1']){assert.throws(()=>S.create('skirmish',{manaUpgradeVersion:value}),/mana upgrade/);assert.throws(()=>S.restore({...S.clone(s),manaUpgradeVersion:value}),/mana upgrade/);}for(const mode of ['moba','td','rpg']){assert.equal(S.create(mode).manaUpgradeVersion,0);assert.throws(()=>S.create(mode,{manaUpgradeVersion:1}),/mana upgrade/);}
 console.log('PASS source mana: old in-flight saves keep current mana, unrelated research preserves fractional pools and invalid policy versions fail');
}
