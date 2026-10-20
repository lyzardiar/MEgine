// Author: MiYu. Feedback mana stays unscaled while impact damage uses the weapon's armor/type path.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spellbreakerFixture} from './frost-human-spellbreaker-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const armor of [0,5,10])for(const [kind,multiplier,burn] of [['humanpriest',1,20],['humanrifleman',1.5,20],['humanfootman',1,20],['hero',1,4]]){
 const {s,breaker,victim}=spellbreakerFixture(S),v={...victim,kind,armorValue:armor};near(S.feedback(s,breaker,v,breaker),burn/(1+.06*armor)*multiplier);assert.equal(v.mana,100-burn);assert.equal(v.feedbackAmount,burn);
}
console.log('PASS Feedback damage: 12 normal/heavy/medium/hero armor cases, unchanged 20/4 mana removal');
for(const buff of ['at-launch','at-impact','removed-in-flight']){
 const {s,breaker,victim}=spellbreakerFixture(S);if(buff!=='at-impact')victim.innerFire={source:victim.id,team:1,frame:0,left:60};
 assert.ok(S.fire(s,breaker,victim));if(buff==='at-impact')victim.innerFire={source:victim.id,team:1,frame:0,left:60};if(buff==='removed-in-flight')delete victim.innerFire;
 const baseline=S.restore(s);baseline.humanSpellbreakerVersion=0;const restored=S.restore(s),armor=buff==='removed-in-flight'?0:5;
 for(let i=0;i<5;i++){S.tick(s);S.tick(baseline);S.tick(restored);}assert.deepEqual(restored,s);const b=baseline.units.find(u=>u.id===victim.id);near(b.hp-victim.hp,20/(1+.06*armor));near(b.mana-victim.mana,20);assert.equal(victim.feedbackAmount,20);assert.ok(S.restore(s));
}
console.log('PASS Feedback real missile: armor at impact, in-flight buff changes, actual mana, exact save continuation');
{
 const {s,breaker,victim}=spellbreakerFixture(S);victim.mana=3;victim.innerFire={source:victim.id,team:1,frame:0,left:60};near(S.feedback(s,breaker,victim,breaker),3/1.3);assert.equal(victim.mana,0);assert.equal(victim.feedbackAmount,3);
}
console.log('PASS Feedback depleted mana: damage scales actual burn and effect retains raw mana amount');
