// Author: MiYu. Original Gargoyle Stone Form fixture for generated-client and native playback checks.
export function gargoyleStoneClientFixture(S,{researched=false,tier=3,...options}={}){
 const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.players.forEach(p=>p.ai=false);map.spawns[0]=[0,0];const s=S.create('skirmish',{map,factions:[3,0],ai:[false,false],...options});s.units=[];s.resources=[];
 const base=S.spawn(s,'hall',0,-24,24),enemy=S.spawn(s,'hall',1,24,-24);base.upgradeTier=tier;base.maxHp=base.hp=S.mainBase(s,base).hp;S.updateTechnology(s);s.teams[0].gold=s.teams[0].wood=10000;if(researched)s.teams[0].gargoyleStoneResearch=1;
 const producer=S.spawn(s,'barracks',0,-8,-5),graveyard=S.spawn(s,'graveyard',0,-16,-5),unit=S.spawn(s,'gargoyle',0,0,-6,{cd:99,yaw:.9,order:{type:'hold'}});s.units=[unit,producer,graveyard,base,enemy];S.visibility(s);return {s,producer,unit,base,graveyard};
}
