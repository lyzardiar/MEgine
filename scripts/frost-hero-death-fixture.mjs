// Author: MiYu. Real source hero damage and retained altar identity for death presentation acceptance.
import assert from 'node:assert/strict';
export function heroDeathFixture(S,faction=3,heroClass=2,options={}){
  const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.doodads=[];map.triggers=[];map.spawns[0]=[0,0];
  const s=S.create('skirmish',{map,factions:[faction,(faction+1)%4],ai:[false,false],...options});s.units=[];
  const h=S.spawn(s,'hero',0,0,0,{heroClass,level:6,skillPoints:6,inventory:[9],cd:10000,order:{type:'hold'}}),killer=S.spawn(s,'soldier',1,1,0,{damage:100000,cd:10000,order:{type:'hold'}}),altar=S.spawn(s,'altar',0,-6,-4);
  S.spawn(s,'hall',0,-22,-22,{damage:0});S.spawn(s,'hall',1,22,22,{damage:0});s.teams[0].gold=10000;S.visibility(s);return {s,h,killer,altar};
}
export function killHero(S,f){f.h.hp=1;assert.equal(S.fire(f.s,f.killer,f.h),true);f.killer.cd=10000;assert.equal(f.h.hp,0);return f.h.heroDeath;}
