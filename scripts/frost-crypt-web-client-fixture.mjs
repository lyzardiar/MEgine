// Author: MiYu. Small original Web fixtures shared by generated-client and native playback checks.
export function cryptWebClientFixture(S,{researched=false,targetKind='gargoyle'}={}){
 const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.players.forEach(p=>p.ai=false);map.spawns[0]=[0,0];const s=S.create('skirmish',{map,factions:[3,3],ai:[false,false]});s.units=[];s.resources=[];
 const base=S.spawn(s,'hall',0,-24,24),enemy=S.spawn(s,'hall',1,24,-24);base.upgradeTier=2;base.maxHp=base.hp=S.mainBase(s,base).hp;S.updateTechnology(s);s.teams[0].gold=s.teams[0].wood=10000;s.teams[0].cryptWebResearch=researched?1:0;
 const producer=S.spawn(s,'barracks',0,-8,-5),graveyard=S.spawn(s,'graveyard',0,-16,-5),unit=S.spawn(s,'cryptfiend',0,0,-6,{cd:99,cryptWebAuto:false,order:{type:'hold'}}),target=S.spawn(s,targetKind,1,3,-6,{cd:99,order:{type:'hold'}});s.units=[unit,target,producer,graveyard,base,enemy];S.visibility(s);return {s,producer,unit,target};
}
export function druidWebClientFixture(S){
 const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.players.forEach(p=>p.ai=false);map.spawns[0]=[0,0];const s=S.create('skirmish',{map,factions:[2,3],ai:[false,false]});s.units=[];s.resources=[];
 S.spawn(s,'hall',0,-24,24);S.spawn(s,'hall',1,24,-24);s.teams[0].druidResearch.Redt=1;s.teams[1].cryptWebResearch=1;
 const unit=S.spawn(s,'druidcrow',0,0,-6,{cd:99,order:{type:'hold'}}),caster=S.spawn(s,'cryptfiend',1,1,-6,{cd:99,cryptWebAuto:false,order:{type:'hold'}});unit.mana=150;S.visibility(s);
 if(S.command(s,1,{type:'cryptWeb',ids:[caster.id],target:unit.id})!==null)throw Error('Crow Web fixture cast rejected');for(let i=0;!S.webbed(unit)&&i<20;i++)S.tick(s);
 if(!S.webbed(unit))throw Error('Crow Web fixture missile did not capture target');return {s,unit,caster};
}
