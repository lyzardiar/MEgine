// Author: MiYu. Shared isolated original Hippogryph production and aerial combat fixture.
export function hippogryphFixture(S){
 const map=S.defaultMap();map.name='Original Hippogryph';map.units=[];map.props=[];map.triggers=[];map.doodads=[];map.startingHour=12;for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);
 const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});S.spawn(s,'hall',0,-24,24,{upgradeTier:2,damage:0});S.spawn(s,'hall',1,24,-24,{damage:0});S.spawn(s,'hero',0,0,8,{heroClass:1,damage:0});S.spawn(s,'farm',0,-12,16);S.spawn(s,'farm',0,12,16);
 const wind=S.spawn(s,'ancientwind',0,-8,5),hippo=S.spawn(s,'hippogryph',0,-3,4,{order:{type:'hold'}}),rider=S.spawn(s,'hippogryphrider',0,5,4,{order:{type:'hold'}});S.visibility(s);return {s,wind,hippo,rider};
}
