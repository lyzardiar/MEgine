// Author: MiYu. Trained Priest fixture with source Human units and disabled AI.
import {sanctumFixture} from './frost-human-sanctum-fixture.mjs';
export function priestFixture(S){const f=sanctumFixture(S);f.s.teams[0].humanSanctum.Rhpt=2;f.hall.upgradeTier=3;f.hall.maxHp=f.hall.hp=S.mainBase(f.s,f.hall).hp;const priest=S.spawn(f.s,'humanpriest',0,-2,0,{mana:400,sanctumAuto:false,cd:99,order:{type:'hold'}}),ally=S.spawn(f.s,'humanknight',0,-1,1,{cd:99,order:{type:'hold'}}),enemy=S.spawn(f.s,'humanfootman',1,2,1,{cd:99,order:{type:'hold'}});S.visibility(f.s);return {...f,priest,ally,enemy};}
