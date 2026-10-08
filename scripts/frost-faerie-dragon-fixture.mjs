// Author: MiYu. Source Wind/Wonders prerequisites and isolated Faerie Dragon acceptance.
export function faerieFixture(S){
 const map=S.defaultMap();map.name='Original Faerie Dragon';map.units=[];map.props=[];map.triggers=[];map.doodads=[];map.startingHour=12;for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);
 const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});
 const tree=S.spawn(s,'hall',0,-24,24,{upgradeTier:2,damage:0});S.spawn(s,'hall',1,24,-24,{damage:0});S.spawn(s,'hero',0,0,10,{heroClass:3,damage:0});S.spawn(s,'farm',0,-12,16);S.spawn(s,'farm',0,12,16);
 const wind=S.spawn(s,'ancientwind',0,-12,4),wonders=S.spawn(s,'shop',0,-5,5),faerie=S.spawn(s,'faeriedragon',0,2,4,{order:{type:'hold'}});S.visibility(s);return {s,tree,wind,wonders,faerie};
}
