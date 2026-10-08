// Author: MiYu. Isolated source Lore/Wonders and living tree for Mountain Giant acceptance.
export function giantFixture(S){
 const map=S.defaultMap();map.name='Original Mountain Giant';map.units=[];map.props=[{kind:'tree',x:3.4,z:4,amount:500}];map.triggers=[];map.doodads=[];map.startingHour=12;for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);
 const s=S.create('skirmish',{map,factions:[2,2],ai:[false,false]});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});const tree=S.spawn(s,'hall',0,-24,24,{upgradeTier:3,damage:0});S.spawn(s,'hall',1,24,-24,{damage:0});S.spawn(s,'hero',0,0,10,{heroClass:3,damage:0});for(const x of [-12,0,12])S.spawn(s,'farm',0,x,16);
 const lore=S.spawn(s,'ancientlore',0,-12,4),wonders=S.spawn(s,'shop',0,-5,5),giant=S.spawn(s,'mountaingiant',0,2,4,{order:{type:'hold'}});S.visibility(s);return {s,tree,lore,wonders,giant};
}
