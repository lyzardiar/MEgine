// Author: MiYu. Original Gargoyle Stone Form fixture for generated-client and native playback checks.
export function gargoyleStoneClientFixture(S,{researched=false,tier=3,...options}={}){
 const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.players.forEach(p=>p.ai=false);map.spawns[0]=[0,0];const s=S.create('skirmish',{map,factions:[3,0],ai:[false,false],...options});s.units=[];s.resources=[];
 const base=S.spawn(s,'hall',0,-24,24),enemy=S.spawn(s,'hall',1,24,-24);base.upgradeTier=tier;base.maxHp=base.hp=S.mainBase(s,base).hp;S.updateTechnology(s);s.teams[0].gold=s.teams[0].wood=10000;if(researched)s.teams[0].gargoyleStoneResearch=1;
 const producer=S.spawn(s,'barracks',0,-8,-5),graveyard=S.spawn(s,'graveyard',0,-16,-5),unit=S.spawn(s,'gargoyle',0,0,-6,{cd:99,yaw:.9,order:{type:'hold'}});s.units=[unit,producer,graveyard,base,enemy];S.visibility(s);return {s,producer,unit,base,graveyard};
}
export function gargoyleStoneWebFixture(S,{entering=false,delay=0}={}){
 const f=gargoyleStoneClientFixture(S,{researched:true,factions:[3,3]}),{s,unit}=f;s.teams[1].cryptWebResearch=1;
 const caster=S.spawn(s,'cryptfiend',1,unit.x+1,unit.z,{cd:99,cryptWebAuto:false,order:{type:'hold'}});S.visibility(s);
 if(entering){if(S.command(s,0,{type:'stoneform',ids:[unit.id]})!==null)throw Error('Stone Web fixture morph rejected');for(let i=0;i<delay;i++)S.tick(s);}
 if(S.command(s,1,{type:'cryptWeb',ids:[caster.id],target:unit.id})!==null)throw Error('Stone Web fixture cast rejected');
 for(let i=0;!S.webbed(unit)&&i<20;i++)S.tick(s);
 if(!S.webbed(unit))throw Error('Stone Web fixture missile did not capture Gargoyle');return {...f,caster};
}
export function gargoyleStoneDeathFixture(S,phase='stone'){
 const f=gargoyleStoneClientFixture(S,{researched:true}),{s,unit}=f;
 if(phase!=='flying'){S.command(s,0,{type:'stoneform',ids:[unit.id]});for(let i=0;i<(phase==='entering'?2:10);i++)S.tick(s);}
 if(phase==='leaving')S.command(s,0,{type:'unstoneform',ids:[unit.id]});
 const attacker=S.spawn(s,'humanrifleman',1,unit.x+.5,unit.z,{cd:99,order:{type:'hold'}});unit.hp=1;S.visibility(s);if(!S.fire(s,attacker,unit))throw Error('Stone death fixture physical attack failed');
 for(let i=0;unit.hp>0&&i<10;i++)S.tick(s);
 const corpse=s.corpses.find(c=>c.id===unit.id);if(!corpse)throw Error('Stone death fixture did not create a corpse');return {...f,corpse};
}
