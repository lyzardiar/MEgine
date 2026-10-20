// Author: MiYu. Arcane Tower fixture on clear human skirmish ground.
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
export function arcaneFixture(S,{upgrade=false,targetKind='humanpriest'}={}){
 const f=guardTowerFixture(S,{upgrade:true,targetKind,factions:[0,0]});f.target.cd=999;
 if(!upgrade){f.s.units=f.s.units.filter(u=>u.id!==f.tower.id);f.tower=S.spawn(f.s,'arcanetower',0,0,0);}
 S.visibility(f.s);return f;
}
