// Author: MiYu. Stationary Spell Steal donor, recipient and real source-caster fixtures.
import {spellbreakerFixture} from './frost-human-spellbreaker-fixture.mjs';
export function spellstealFixture(S){const f=spellbreakerFixture(S);f.breaker.spellStealAuto=false;f.breaker.mana=250;const recipient=S.spawn(f.s,'humanfootman',0,1,1,{cd:99,order:{type:'hold'}});S.visibility(f.s);return {...f,donor:f.victim,recipient};}
