// Author: MiYu. Source Cloud building targets beside a valid Shadow Hunter Serpent Ward.
import {mortarFixture} from './frost-human-mortar-fixture.mjs';
export function cloudTargetsFixture(S){
 const {s}=mortarFixture(S);s.teams[0].humanAviary.Rhcd=1;
 const caster=S.spawn(s,'humandragonhawk',0,0,0,{mana:300,cd:999,order:{type:'hold'}}),hero=S.spawn(s,'hero',1,16,-12,{heroClass:3,level:6,skills:[0,0,1,0],skillPoints:5,cd:999,order:{type:'hold'}});
 const ward=S.spawn(s,'serpentward',1,3,0,{wardRank:1,wardBornFrame:0,summoned:true,summoner:hero.id,expires:400,cd:999,order:{type:'hold'}}),tower=S.spawn(s,'guardtower',1,3,1,{cd:999}),ally=S.spawn(s,'guardtower',0,3,-1,{cd:999});
 S.visibility(s);return {s,caster,ward,tower,ally};
}
