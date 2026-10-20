// Author: MiYu. Original artillery ward exclusions, primary hits and deterministic saved flight.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {artilleryTargetsFixture} from './frost-artillery-targets-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=s=>{for(let i=0;i<20&&s.projectiles.length;i++)S.tick(s);assert.equal(s.projectiles.length,0);};
for(const w of [S.cannonTowerRules.weapons[0],S.mortarRules.unit.weapons[0]]){assert.ok(w.targets.includes('ward'));assert.ok(!w.splashTargets.includes('ward'));}
assert.equal(S.shadowhunterRules.wards.osp1.sourceRows.UnitData.targType,'ward');
for(const kind of ['cannontower','humanmortar'])for(const mode of ['ground','unit','ward']){
 const f=artilleryTargetsFixture(S,{kind,mode}),{s,primary,nearby,ground,attacker}=f,hp=primary.hp,other=nearby.hp,groundHp=ground.hp;
 assert.equal(S.canAttack(attacker,primary),true);assert.equal(s.projectiles[0].weaponSlot,1);
 const saved=S.restore(s);step(s);step(saved);assert.deepEqual(s,saved);
 assert.ok(Math.abs(hp-primary.hp-f.expectedPrimary)<1e-6);assert.equal(nearby.hp,other);assert.ok(ground.hp<groundHp);
 const own=S.publicState(s,0),enemy=S.publicState(s,1);assert.equal(enemy.units.find(u=>u.id===nearby.id).hp,other);
 assert.ok(!own.projectiles.length&&!enemy.projectiles.length);assert.ok(S.restore(s));
}
console.log('PASS artillery source masks: Cannon/Mortar ground and unit splash exclude wards, direct ward hits remain valid, saved flight and public states agree');
