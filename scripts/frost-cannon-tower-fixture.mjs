// Author: MiYu. Human Cannon Tower fixture with clear ground and source prerequisites.
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
export function cannonTowerFixture(S,{upgrade=false,targetKind='cryptfiend'}={}){
 const f=guardTowerFixture(S,{upgrade:true,targetKind});f.target.cd=999;if(!S.types[targetKind].speed)f.target.order=null;
 f.workshop=S.spawn(f.s,'workshop',0,-12,0);
 if(!upgrade){f.s.units=f.s.units.filter(u=>u.id!==f.tower.id);f.tower=S.spawn(f.s,'cannontower',0,0,0);}
 S.visibility(f.s);return f;
}
export function cannonBoundaryFixture(S,{kind='cryptfiend',radius=50,delta=.00025,diagonal=false}={}){
 const f=cannonTowerFixture(S),collision=kind==='tree'?80:kind==='cannontower'?72:32,r=Math.sqrt(((radius+collision)/32)**2+delta)*.32;
 f.target.x=20;f.tower.cd=999;
 const point={x:6,z:0},x=point.x+(diagonal?r*.6:0),z=diagonal?r*.8:r;
 const victim=kind==='tree'?{kind,x,z,amount:200,hp:50}:S.spawn(f.s,kind,0,x,z,{cd:999,...(kind==='cryptfiend'?{cryptWebAuto:false}:{})});if(kind==='tree')f.s.resources=[victim];
 S.visibility(f.s);S.fire(f.s,f.tower,{...f.target,...point,id:0},{groundAttack:true});
 const factor=radius===125?(delta>0?0:.1):delta<.001?(radius===50?1:.5):(radius===50?.5:.1),p=f.s.projectiles[0];
 return {...f,victim,expected:kind==='tree'?Math.min(victim.hp,p.damage*factor):S.weaponDamage(p,victim,p.damage*factor,f.s)};
}
