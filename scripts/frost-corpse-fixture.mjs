// Author: MiYu. Real combat deaths for saved corpse presentation acceptance.
import assert from 'node:assert/strict';
export function corpseFixture(S,count=5){
  const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.doodads=[];map.triggers=[];map.spawns[0]=[0,0];
  const s=S.create('skirmish',{map,factions:[0,3],ai:[false,false]});s.units=[];S.spawn(s,'hall',0,-22,-22,{damage:0});S.spawn(s,'hall',1,22,22,{damage:0});
  const hero=S.spawn(s,'hero',0,-5,-3,{heroClass:0,cd:10000,order:{type:'hold'}}),kinds=['rifleman','rifleman','rifleman','hunter','mountaingiant'];
  for(let i=0;i<count;i++){
    const kind=kinds[i%kinds.length],x=count===5?(i-2)*3:(i%10-5)*1.8,z=count===5?0:(Math.floor(i/10)-3)*1.8,gun=S.spawn(s,'rifleman',1,x,z-1,{damage:100000,range:12,order:{type:'hold'}}),target=S.spawn(s,kind,0,x,z,{hp:1,damage:0,speed:0,order:{type:'hold'}});gun.order={type:'attack',target:target.id};S.visibility(s);
    for(let j=0;j<30&&target.hp>0;j++)S.tick(s);assert.equal(target.hp,0);assert.ok(s.corpses.some(c=>c.id===target.id));s.units=s.units.filter(u=>u.id!==gun.id);
  }
  for(const [i,c] of s.corpses.entries())c.age=count===5?(i===0?.5:i===1?S.corpseSource(s,c).deathTime+1:30):30;
  S.visibility(s);assert.ok(S.restore(s));return {s,hero};
}
