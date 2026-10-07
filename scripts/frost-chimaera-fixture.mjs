// Author: MiYu. Isolated source production and dual weapon fixture.
export function chimaeraFixture(S){
 const map=S.defaultMap();map.name='Original Chimaera';map.units=[];map.props=[];map.triggers=[];map.doodads=[];map.startingHour=12;for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);
 const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});
 const tree=S.spawn(s,'hall',0,-24,24,{upgradeTier:3,damage:0});S.spawn(s,'hall',1,24,-24,{damage:0});S.spawn(s,'hero',0,0,10,{damage:0});S.spawn(s,'farm',0,-12,16);S.spawn(s,'farm',0,12,16);
 const wind=S.spawn(s,'ancientwind',0,-15,4),roost=S.spawn(s,'chimaeraroost',0,-7,5),chimaera=S.spawn(s,'chimaera',0,1,4,{order:{type:'hold'}});S.visibility(s);return {s,tree,wind,roost,chimaera};
}
