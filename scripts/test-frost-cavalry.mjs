// Author: MiYu. Kingdom cavalry production, saved queues, movement and melee combat.
import assert from 'node:assert/strict';
import {battleFixture} from './frost-battle-fixture.mjs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
for(let faction=0;faction<4;faction++){
 const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.props=[];const state=battleFixture(S,'skirmish',{map,factions:[faction,0],ai:[false,false]},['hero','barracks','farm','guard','harvest']),barracks=state.units.find(u=>u.team===0&&u.kind==='barracks'),hall=state.units.find(u=>u.team===0&&u.kind==='hall');state.teams[0].gold=5000;state.teams[0].wood=5000;S.spawn(state,'farm',0,-27,25);
 assert.equal(S.trainable(state,barracks).includes('knight'),faction===0);assert.ok(S.command(state,0,{type:'train',ids:[barracks.id],kind:'knight'}));assert.equal(barracks.queue.length,0);
 if(faction)continue;
 assert.equal(S.command(state,0,{type:'tech',ids:[hall.id]}),null);step(state,201);assert.equal(state.teams[0].tier,2);assert.equal(S.command(state,0,{type:'rally',ids:[barracks.id],x:-8,z:10}),null);
 const gold=state.teams[0].gold,wood=state.teams[0].wood;assert.equal(S.command(state,0,{type:'train',ids:[barracks.id],kind:'knight'}),null);assert.equal(state.teams[0].gold,gold-200);assert.equal(state.teams[0].wood,wood-60);step(state,30);
 const restored=S.restore(state);assert.equal(restored.units.find(u=>u.id===barracks.id).queue[0].kind,'knight');step(restored,75);const knight=restored.units.find(u=>u.kind==='knight'&&u.team===0);assert.ok(knight);assert.equal(knight.order.type,'attackMove');assert.equal(knight.order.x,-8);assert.equal(knight.order.z,10);assert.equal(S.types.knight.label,'Knight');
 knight.x=-6;knight.z=8;knight.cd=0;const target=S.spawn(restored,'soldier',1,0,8,{speed:0,damage:0});S.visibility(restored);assert.equal(S.command(restored,0,{type:'attack',ids:[knight.id],target:target.id}),null);step(restored,20);assert.ok(knight.x>-6);assert.ok(target.hp<target.maxHp);assert.equal(S.canAttack(knight,{kind:'dragon'}),false);assert.equal(S.unitType(knight).armor,'heavy');
 const saved=S.restore(restored),savedKnight=saved.units.find(u=>u.id===knight.id);assert.deepEqual(savedKnight.order,knight.order);assert.equal(savedKnight.hp,knight.hp);
}
const aiState=battleFixture(S,'skirmish',{factions:[0,0],ai:[true,false]},['hero','barracks','farm','guard','harvest']);aiState.teams[0].tier=2;aiState.teams[0].gold=5000;aiState.teams[0].wood=5000;S.spawn(aiState,'farm',0,-27,25);S.spawn(aiState,'altar',0,-13,15);aiState.frame=159;S.tick(aiState);assert.ok(aiState.units.some(u=>u.team===0&&u.kind==='barracks'&&u.queue.some(q=>q.kind==='knight')),'Kingdom AI includes its fifth unit');
console.log('PASS: Kingdom-only tier-2 cavalry, cost, saved production/rally, movement, heavy armor and melee attack');
