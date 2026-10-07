// Author: MiYu. Verify original aerial production, source combat, upgrades and saved compatibility.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {hippogryphFixture} from './frost-hippogryph-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra}),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,wind,hippo,rider}=hippogryphFixture(S);assert.deepEqual(S.trainable(s,wind),['druidtalon','hippogryph']);assert.deepEqual(S.trainable(s,S.spawn(s,'altar',0,16,6)),['hero']);assert.equal(cmd(s,wind,'train',{kind:'hippogryph'}),null);assert.equal(wind.queue[0].left,30);assert.equal(s.teams[0].gold,9840);assert.equal(s.teams[0].wood,9980);assert.ok(cmd(s,wind,'train',{kind:'hippogryphrider'}));step(s,150);const saved=S.restore(s);step(s,150);step(saved,150);assert.deepEqual(saved,s);const trained=s.units.find(u=>u.kind==='hippogryph'&&u.id!==hippo.id);assert.ok(trained);assert.equal(trained.maxHp,525);assert.equal(trained.speed,4);assert.equal(trained.mana,0);assert.equal(rider.maxHp,765);assert.equal(rider.speed,3.5);assert.equal(S.population(s,0).used,13);assert.equal(S.projectileSpeed(hippo),0);assert.equal(S.types.hippogryph.flightHeight,2.4);
}
console.log('PASS Hippogryph production: Wind H roster, 160/20 payment, 30s queue, original HP/speed/food/height, saved continuation and no direct rider/altar flight production');
{
 const {s,wind}=hippogryphFixture(S);assert.equal(cmd(s,wind,'train',{kind:'hippogryph'}),null);assert.equal(cmd(s,wind,'uproot'),null);step(s,25);const left=wind.queue[0].left;step(s,20);assert.equal(wind.queue[0].left,left);assert.ok(S.restore(s));assert.equal(cmd(s,wind,'rootAncient'),null);step(s,25);assert.equal(cmd(s,wind,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,10000);assert.equal(s.teams[0].wood,10000);
}
console.log('PASS shared ancient queue: Uproot suspension, saved paused production, Root resumption and cancellation refund');
{
 const {s,hippo}=hippogryphFixture(S),ground=S.spawn(s,'soldier',1,-2,4,{damage:0,order:{type:'hold'}}),air=S.spawn(s,'dragon',1,-2,4,{damage:0,hp:1000,maxHp:1000,order:{type:'hold'}});S.visibility(s);assert.equal(S.canAttack(hippo,ground),false);assert.equal(S.canAttack(hippo,air),true);assert.ok(cmd(s,hippo,'attack',{target:ground.id}));assert.equal(cmd(s,hippo,'attack',{target:air.id}),null);step(s,1);assert.equal(hippo.weaponWindup.left,.6);step(s,5);assert.equal(air.hp,1000);const saved=S.restore(s);step(s,1);step(saved,1);assert.deepEqual(saved,s);assert.ok(air.hp<1000);assert.equal(ground.hp,ground.maxHp);assert.equal(s.projectiles.length,0);assert.ok(S.restore(s));
}
console.log('PASS aerial melee: ground rejection, differing visual flight heights, original 0.6s windup, saved windup and direct damage without a missile');
{
 const {s,rider}=hippogryphFixture(S),target=S.spawn(s,'soldier',1,8,4,{damage:0,order:{type:'hold'}});S.visibility(s);assert.equal(S.canAttack(rider,target),true);assert.equal(S.canAttack(rider,{kind:'dragon'}),true);assert.equal(cmd(s,rider,'attack',{target:target.id}),null);step(s,8);assert.ok(s.projectiles.length);assert.equal(s.projectiles[0].art,'night-arrow');assert.equal(S.projectileSpeed(rider),15);const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);assert.ok(target.hp<target.maxHp);assert.ok(S.restore(s));
}
console.log('PASS mounted source form: independent 765HP, ground/air targeting, original Arrow missile, source launch/speed and saved flight continuation');
{
 const {s,hippo,rider}=hippogryphFixture(S);Object.assign(s.teams[0].nightResearch,{Resw:2,Rerh:2,Resm:1,Rema:1,Reib:1,Remk:1});S.updateNightUnit(s,hippo);S.updateNightUnit(s,rider);assert.equal(hippo.nightLevels.Resw,2);assert.equal(hippo.nightLevels.Resm,undefined);assert.equal(rider.nightLevels.Resm,1);assert.equal(rider.nightLevels.Resw,undefined);assert.equal(S.unitType(rider).range,6);const before=S.clone(s);S.updateNightUnit(s,hippo);S.updateNightUnit(s,rider);assert.deepEqual(s,before);assert.ok(S.restore(s));s.frame=2400;hippo.hp=400;rider.hp=600;step(s,10);close(hippo.hp,400.5);close(rider.hp,601);assert.equal(hippo.mana,0);s.frame=0;step(s,10);close(hippo.hp,400.5);close(rider.hp,601);hippo.hp=1;S.fire(s,{kind:'dragon',team:1,x:hippo.x,z:hippo.z,damage:1000,nightLevels:null},hippo);step(s,20);assert.ok(!s.units.some(u=>u.id===hippo.id));assert.ok(!s.corpses.some(c=>c.id===hippo.id));
}
console.log('PASS source upgrade families, idempotence, Improved Bows, night-only HP regeneration, zero mana and no aerial corpse');
{
 const {s,wind}=hippogryphFixture(S);for(const mutate of [s=>s.hippogryphVersion=3,s=>delete s.hippogryphVersion,s=>s.units.find(S.hippogryphUnit).mana=1,s=>s.units.find(S.hippogryphUnit).speed=4.48,s=>s.units.find(S.hippogryphUnit).maxHp=770,s=>s.units.find(u=>u.id===wind.id).queue=[{kind:'hippogryphrider',left:1}],s=>s.units.find(u=>u.id===wind.id).queue=[{kind:'hippogryph',left:31}]]){const raw=S.clone(s);mutate(raw);assert.throws(()=>S.restore(raw));}
 const legacy=S.clone(s);legacy.units=legacy.units.filter(u=>!S.hippogryphUnit(u));delete legacy.hippogryphVersion;const restored=S.restore(legacy);assert.equal(restored.hippogryphVersion,0);assert.deepEqual(S.trainable(restored,restored.units.find(u=>u.id===wind.id)),['druidtalon']);assert.deepEqual(S.trainable(restored,S.spawn(restored,'altar',0,16,6)),['hero','grovewyrm']);
}
console.log('PASS strict saves: source/version/mana/speed/HP/producer bounds, genuine legacy Wind roster and legacy altar production');
