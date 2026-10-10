// Author: MiYu. Flat source-funded upkeep fixtures shared by rule, TCP and native checks.
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
export function upkeepFixture(faction=0,used=50,upkeepVersion=1){
 const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.props=[{kind:'mine',x:0,z:0,amount:1000},{kind:'tree',x:7,z:0,amount:1000}];map.units=[];map.triggers=[];map.players.forEach(p=>p.ai=false);
 const s=S.create('skirmish',{map,factions:[faction,0],ai:[false,false],upkeepVersion});s.units=[];const hall=S.spawn(s,'hall',0,faction===2?-6:-8,0,{damage:0});S.spawn(s,'hall',1,24,-24,{damage:0});
 for(let i=0;i<15;i++)S.spawn(s,'farm',0,-28+i*3,26);
 const workers=Array.from({length:used},(_,i)=>S.spawn(s,'worker',0,-24+i%12,14+Math.floor(i/12),{damage:0,order:{type:'hold'}}));
 s.teams[0].gold=s.teams[0].wood=5000;S.visibility(s);return {s,hall,workers};
}
