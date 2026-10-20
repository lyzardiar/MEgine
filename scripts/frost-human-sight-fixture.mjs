// Author: MiYu. Isolated Human building vision with a stationary enemy at the day/night boundary.
export function humanSightFixture(S,{kind='guardtower',hour=12,tier,options={}}={}){
 const map=S.defaultMap();map.units=[];map.props=[];map.triggers=[];map.doodads=[];map.startingHour=hour;for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);
 const s=S.create('skirmish',{map,factions:[0,0],ai:[false,false],...options});s.units=[];s.resources=[];s.explored=[Array(1024).fill(0),Array(1024).fill(0)];Object.assign(s.teams[0],{gold:10000,wood:10000});
 const building=S.spawn(s,kind,0,0,0,tier?{upgradeTier:tier}:{}),enemy=S.spawn(s,'soldier',1,10,0,{damage:0,cd:99,order:{type:'hold'}});
 S.visibility(s);return {s,building,enemy};
}
export const sightMask=r=>Array.from({length:1024},(_,i)=>+(Math.hypot(i%32-16,Math.floor(i/32)-16)<=r));
