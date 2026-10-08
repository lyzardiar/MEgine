// Author: MiYu. Full resource-funded source AI progression; military regrouping isolates the economy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {nightAiFixture} from './frost-night-elf-ai-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),s=nightAiFixture(S),milestones={},started=performance.now();
let continued=null,continuationTicks=0;
const wanted=['altar','barracks','shop','workshop','ancientlore','ancientwind','chimaeraroost','mountaingiant','dryad','faeriedragon','druidclaw'];
for(let i=0;i<24000;i++){
 // Move troops out of production exits, then hold them; only legal military orders isolate combat.
 for(const state of [s,continued].filter(Boolean))for(const u of state.units)if(u.team===0&&S.types[u.kind].speed&&u.kind!=='worker'&&u.hp>0){const x=-8+(u.id%4)*2,z=-18+(Math.floor(u.id/4)%8)*2;if(!u.order||u.order.type==='attackMove')S.command(state,0,{type:S.distance(u,{x,z})<1?'hold':'move',ids:[u.id],x,z});}
 S.tick(s);if(continued){S.tick(continued);continuationTicks++;if(continuationTicks===200){assert.deepEqual(continued,s);continued=null;}}
 for(const u of s.units.filter(u=>u.team===0&&u.hp>0&&u.built===1)){if(wanted.includes(u.kind))milestones[u.kind]??=s.frame;if(u.kind==='hall')milestones['tier'+u.upgradeTier]??=s.frame;}
 if(i===1700)continued=S.restore(s);
 if(i%1000===0){assert.ok(S.restore(s));console.log('AI economy frame',s.frame,'tier',s.teams[0].tier,'gold',s.teams[0].gold,'wood',s.teams[0].wood,'milestones',Object.keys(milestones).length);}
 if(wanted.every(k=>milestones[k]))break;
}
const report={author:'MiYu',passed:wanted.every(k=>milestones[k]),frames:s.frame,simulatedSeconds:s.frame*S.DT,ms:Math.round(performance.now()-started),milestones,resources:{gold:s.teams[0].gold,wood:s.teams[0].wood},sourceFlags:{basic:s.nightAI[0].vars.basic_opening,archer:s.nightAI[0].vars.archer_opening},scope:'Standard 500 gold/150 wood/5 Wisps, legal source AI commands and full native timers. Custom mine/tree map; legal military regroup/hold orders isolate economy and keep production exits free. No injected income, free buildings, shortened timers or completion edits.'};
fs.writeFileSync('tmp/night-ai-economy.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('tmp/night-ai-economy-save.json',JSON.stringify(s));assert.ok(report.passed,JSON.stringify(report));assert.equal(s.teams[0].tier,3);assert.equal(s.nightAI[0].vars.basic_opening,false);
console.log('PASS original AI paid economy: opening, Ages/Eternity, expansions, Lore/Wind/Roost, Giant/Dryad/Claw/Faerie and exact saved continuation; army cap remains enforced');
