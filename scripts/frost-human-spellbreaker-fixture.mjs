// Author: MiYu. Source Spell Breaker and stationary enemy caster for actual missile-impact acceptance.
import {sanctumFixture} from './frost-human-sanctum-fixture.mjs';
export function spellbreakerFixture(S){const f=sanctumFixture(S),breaker=S.spawn(f.s,'humanspellbreaker',0,-1,0,{cd:99,order:{type:'hold'}}),victim=S.spawn(f.s,'humanpriest',1,1,0,{mana:100,sanctumAuto:false,innerFireAuto:false,cd:99,order:{type:'hold'}});S.visibility(f.s);return {...f,breaker,victim};}
