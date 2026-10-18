// Author: MiYu. Real attacks, original reward rows, save continuation and mode isolation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {rewardsFixture as makeFixture,rewardFight as makeFight} from './frost-combat-rewards-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),rules=require('../samples/frostbound-realms/combat-rewards.json');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS combat rewards: '+name);};
const rewardsFixture=options=>makeFixture(S,options),rewardFight=(s,kind,team)=>makeFight(S,s,kind,team);
function settle(s,victim){let ticks=0;while(victim.hp>0&&ticks++<30)S.tick(s);assert.ok(victim.hp<=0,'attack must kill its target');}

check('retained source hashes and actual original unit levels',()=>{
 const manifest=require('../samples/frostbound-realms/combat-rewards-sources.json');
 for(const source of manifest.sources){const bytes=fs.readFileSync(new URL('../samples/frostbound-realms/SourceAssets/CombatRewards/'+source.path,import.meta.url));assert.equal(bytes.length,source.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);}
 assert.equal(rules.units.ugho.level,2);assert.deepEqual(rules.units.nwlg.gold,[9,2,3]);assert.equal(rules.units.hbar.building,true);
});
check('player unit kills grant original experience without melee gold income',()=>{
 const {s,hero}=rewardsFixture(),gold=s.teams[0].gold,{victim}=rewardFight(s,'humanfootman',1);settle(s,victim);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].kills,1);assert.equal(hero.xp,40);
});
for(const [level,xp] of [[1,32],[2,28],[3,24],[4,20],[5,0]])check('neutral experience reduction at hero level '+level,()=>{
 const {s,hero}=rewardsFixture();hero.level=level;const gold=s.teams[0].gold,{victim}=rewardFight(s);settle(s,victim);assert.equal(hero.xp,xp);assert.ok(s.teams[0].gold-gold>=26&&s.teams[0].gold-gold<=38);
});
check('global experience is used only when no living hero is inside the original range',()=>{
 const {s,hero}=rewardsFixture();hero.x=20;const {victim}=rewardFight(s,'humanfootman',1);settle(s,victim);assert.equal(hero.xp,40);
 const local=rewardsFixture(),other=S.spawn(local.s,'hero',0,20,0);other.cd=100;const fight=rewardFight(local.s,'humanfootman',1);settle(local.s,fight.victim);assert.equal(local.hero.xp,40);assert.equal(other.xp,0);
});
check('shared integer experience, summoned factor and maximum-level draining',()=>{
 const {s,hero}=rewardsFixture(),second=S.spawn(s,'hero',0,0,4),third=S.spawn(s,'hero',0,0,5);second.cd=third.cd=100;const fight=rewardFight(s,'humanfootman',1);settle(s,fight.victim);assert.deepEqual([hero.xp,second.xp,third.xp],[13,13,13]);
 const high=rewardsFixture(),max=S.spawn(high.s,'hero',0,0,4);max.level=10;max.cd=100;const f=rewardFight(high.s,'humanfootman',1);settle(high.s,f.victim);assert.equal(high.hero.xp,20);assert.equal(max.xp,0);
 const summon=rewardsFixture(),victim=S.spawn(summon.s,'waterelemental',1,1,0,{summoned:true,age:0,lifetime:60,sourceUnit:'hwat'}),killer=S.spawn(summon.s,'soldier',0,0,0);victim.hp=1;victim.cd=100;S.visibility(summon.s);assert.equal(S.command(summon.s,0,{type:'attack',ids:[killer.id],target:victim.id}),null);assert.equal(victim.summoned,true);settle(summon.s,victim);assert.equal(summon.hero.xp,42);
});
check('building kills give no experience and leave player bounty disabled',()=>{
 const {s,hero}=rewardsFixture(),gold=s.teams[0].gold,{victim}=rewardFight(s,'farm',1);settle(s,victim);assert.equal(hero.xp,0);assert.equal(s.teams[0].gold,gold);
});
check('saved RNG and pending lethal attack continue identically',()=>{
 const {s}=rewardsFixture(),{victim}=rewardFight(s),copy=S.restore(s),restored=copy.units.find(u=>u.id===victim.id);settle(s,victim);settle(copy,restored);assert.deepEqual(s,copy);assert.equal(S.publicState(s,0).combatRewardsVersion,1);
});
check('old saves preserve fixed rewards and malformed versions fail',()=>{
 const {s,hero}=rewardsFixture();delete s.combatRewardsVersion;const old=S.restore(s),gold=old.teams[0].gold,{victim}=rewardFight(old);settle(old,victim);assert.equal(old.combatRewardsVersion,0);assert.equal(old.teams[0].gold-gold,25);assert.equal(old.units.find(u=>u.id===hero.id).xp,35);
 for(const version of [2,'1',null])assert.throws(()=>S.restore({...s,combatRewardsVersion:version}),/combat rewards version/);
 assert.throws(()=>S.create('skirmish',{combatRewardsVersion:2}),/combat rewards version/);
 for(const mode of ['moba','td','rpg']){const state=S.create(mode);assert.equal(state.combatRewardsVersion,0);assert.throws(()=>S.restore({...state,combatRewardsVersion:1}),/combat rewards version/);}
});
console.log('PASS combat rewards checks: '+checks);
