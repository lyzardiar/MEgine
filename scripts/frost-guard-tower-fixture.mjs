// Author: MiYu. Human Guard Tower combat fixture with source units and clear ground.
export function guardTowerFixture(S,{upgrade=false,targetKind='cryptfiend',factions=[0,3]}={}){
 const map=S.defaultMap();map.units=[];map.props=[];map.triggers=[];map.doodads=[];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);
 const s=S.create('skirmish',{map,factions,ai:[false,false]});s.units=[];s.resources=[];Object.assign(s.teams[0],{gold:10000,wood:10000});
 const tower=S.spawn(s,upgrade?'scouttower':'guardtower',0,0,0),target=S.spawn(s,targetKind,1,6,0,{cd:99,order:{type:'hold'},...(targetKind==='cryptfiend'?{cryptWebAuto:false}:{})});
 const hall=S.spawn(s,'hall',0,-18,18),enemy=S.spawn(s,'hall',1,20,-20),mill=S.spawn(s,'lumbermill',0,-8,8);S.visibility(s);
 return {s,tower,target,hall,enemy,mill};
}
