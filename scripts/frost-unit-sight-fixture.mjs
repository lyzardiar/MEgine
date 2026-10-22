// Author: MiYu. Source infantry and worker vision with an enemy beyond the night boundary.
import {humanSightFixture} from './frost-human-sight-fixture.mjs';
export function unitSightFixture(S,{kind='humanfootman',faction=0,hour=12,options={}}={}){
 const {s,building:unit,enemy}=humanSightFixture(S,{kind,hour,options:{factions:[faction,0],...options}});
 Object.assign(unit,{order:{type:'hold'}});enemy.x=kind==='worker'?10:14;S.visibility(s);
 return {s,unit,enemy};
}
