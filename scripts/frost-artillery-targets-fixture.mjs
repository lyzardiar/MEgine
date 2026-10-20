// Author: MiYu. Source artillery against directly targeted and neighboring Serpent Wards.
import {mortarFixture} from './frost-human-mortar-fixture.mjs';
export function artilleryTargetsFixture(S,{kind='cannontower',mode='ground'}={}){
 const {s}=mortarFixture(S);s.resources=[];
 const attacker=S.spawn(s,kind,0,0,0,{cd:999}),hero=S.spawn(s,'hero',1,16,-12,{heroClass:3,level:6,skills:[0,0,1,0],skillPoints:5,cd:999,order:{type:'hold'}});
 const ward=(x,z)=>S.spawn(s,'serpentward',1,x,z,{wardRank:1,wardBornFrame:0,summoned:true,summoner:hero.id,expires:400,cd:999,order:{type:'hold'}});
 const primary=ward(6,0),nearby=ward(6,.4),ground=S.spawn(s,'soldier',1,6,-.4,{cd:999,order:{type:'hold'}});
 const target=mode==='ward'?primary:mode==='unit'?ground:{...ground,id:0,x:6,z:0};S.visibility(s);
 S.fire(s,attacker,target,mode==='ground'?{groundAttack:true}:null);const p=s.projectiles[0];
 return {s,attacker,primary,nearby,ground,expectedPrimary:mode==='ward'?Math.min(primary.hp,S.weaponDamage(p,primary,p.damage,s)):0};
}
