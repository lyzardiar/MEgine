// Author: MiYu. Authored combat reward actors shared by rules, TCP and native checks.
import assert from 'node:assert/strict';
import {battleFixture} from './frost-battle-fixture.mjs';
export function rewardsFixture(S,options={}){
 const s=battleFixture(S,'skirmish',{factions:[0,0],...options},['hero']);for(const u of s.units)u.cd=100;
 const hero=s.units.find(u=>u.team===0&&u.kind==='hero');Object.assign(hero,{x:0,z:3,order:{type:'hold'},xp:0});return {s,hero};
}
export function rewardFight(S,s,kind='ghoul',team=-1){
 const killer=S.spawn(s,'soldier',0,0,0),victim=S.spawn(s,kind,team,1,0);victim.hp=1;victim.cd=100;S.visibility(s);
 assert.equal(S.command(s,0,{type:'attack',ids:[killer.id],target:victim.id}),null);return {killer,victim};
}
