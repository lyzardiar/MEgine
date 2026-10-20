// Author: MiYu. Human Cannon Tower fixture with clear ground and source prerequisites.
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
export function cannonTowerFixture(S,{upgrade=false,targetKind='cryptfiend'}={}){
 const f=guardTowerFixture(S,{upgrade:true,targetKind});f.target.cd=999;if(!S.types[targetKind].speed)f.target.order=null;
 f.workshop=S.spawn(f.s,'workshop',0,-12,0);
 if(!upgrade){f.s.units=f.s.units.filter(u=>u.id!==f.tower.id);f.tower=S.spawn(f.s,'cannontower',0,0,0);}
 S.visibility(f.s);return f;
}
