// Author: MiYu. Shared original-pair gameplay fixture for simulation, client, TCP and native checks.
import {hippogryphFixture} from './frost-hippogryph-fixture.mjs';
export function couplingFixture(S,researched=true){const f=hippogryphFixture(S);f.s.units=f.s.units.filter(u=>u.id!==f.rider.id);f.s.teams[0].hippogryphTaming=researched?1:0;f.archer=S.spawn(f.s,'nightarcher',0,-3,6,{order:{type:'hold'}});S.visibility(f.s);return f;}
