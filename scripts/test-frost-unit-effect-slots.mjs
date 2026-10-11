// Author: MiYu. Compare generated unit effect slots with the prior client across active effects, visibility, native retries and death/revival.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {heroDeathFixture,killHero} from './frost-hero-death-fixture.mjs';
import {taurenFixture} from './frost-tauren-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const sources=[execFileSync('git',['show','6da6aff:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8')];
function fixture(source){
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);vm.runInContext(source.replace('  return {tick};',"  return {tick,effectPool,presentUnits(next,nextMode='playing'){state=next;mode=nextMode;team=0;renderUnits({viewport:[1280,720]});}};"),context);context.onTick(0);world.commit();
  let hides=0;const setActive=context.FrostClient.effectPool.setActive,status=context.FrostEffects.status,spells=context.FrostEffects.spells;
  const f={world,context,override:null,hides:()=>hides,present(s,mode='playing',drop=false){context.FrostClient.effectPool.beginFrame();context.FrostClient.presentUnits(s,mode);world.commit(drop);}};
  context.FrostClient.effectPool.setActive=(name,on)=>{if(!on&&/^Classic (status|spell) /.test(name))hides++;return setActive(name,on);};
  context.FrostEffects.status=(...args)=>f.override?.id===args[1].id?f.override.statuses:status(...args);context.FrostEffects.spells=(...args)=>f.override?.id===args[1].id?f.override.spells:spells(...args);
  return f;
}
const before=fixture(sources[0]),after=fixture(sources[1]),S=after.context.Frost;let comparisons=0;
function same(label,s,mode='playing',frames=4,drop=false){
  for(let i=0;i<frames;i++){before.present(s,mode,drop);after.present(s,mode,drop);}
  const nodes=f=>f.world.snapshot.entities.filter(e=>/^(Unit \d+|Unit aura \d+|Ring \d+|HP \d+|Flag \d+|Sleep \d+|Classic (?:status|spell|attachment|Siphon) \d+)/.test(e.name));assert.deepEqual(nodes(after),nodes(before),label);comparisons++;
}
const state=S.create();same('initial slots',state);const oldHides=before.hides(),newHides=after.hides();same('unchanged empty effect lists',state,'playing',10);const baselineRepeatedHides=before.hides()-oldHides,candidateRepeatedHides=after.hides()-newHides;
assert.ok(baselineRepeatedHides>0);assert.equal(candidateRepeatedHides,0,'empty status/spell lists skip all inactive slots');
const statusSlots=after.context.FrostEffects.slots,spellSlots=Object.keys(after.context.FrostEffects.spellBindings).filter(slot=>!['deathDecayArea','carrionSwarm','infernalImpact'].includes(slot)),unit=state.units[5];
const effect=(slot,x=3)=>({slot,component:{effect:after.context.FrostEffectArt.effects.HealingSalveTarget.effect,clip:0,playing:false,looping:true,time_seconds:.3,speed:1},position:[x,4,5],scale:[2,2,2],rotation:[0,0,0,1],parts:[]});
function override(id,statuses=[],spells=[]){for(const f of [before,after])f.override={id,statuses,spells};}
override(unit.id,[effect(statusSlots[2]),effect(statusSlots[0]),effect(statusSlots[0],99),effect('unknown-status')],[effect(spellSlots[2]),effect(spellSlots[0]),effect(spellSlots[0],99),effect('unknown-spell')]);same('binding order, first duplicate and unknown slots',state, 'playing',6);
assert.equal(after.world.entity('Classic status 5 '+statusSlots[0]).components.Transform.position[0],3);assert.equal(after.world.entity('Classic spell 5 '+spellSlots[0]).components.Transform.position[0],3);
override(unit.id,[effect(statusSlots[0],8)],[effect(spellSlots[2],8)]);same('effects change and removed slots hide',state);
override(unit.id);same('discarded effect hide',state,'playing',1,true);same('effect hide retries from the pool',state);assert.equal(after.world.entity('Classic spell 5 '+spellSlots[2]).active,false);
override(unit.id,[effect(statusSlots[0])],[effect(spellSlots[0])]);same('restore reused effects',state);unit.inside=999;same('direct unit invisibility cleanup',state);delete unit.inside;same('visible again with full first-slot cleanup',state);
same('menu transition cleanup',state,'title');same('return to play',state);same('editor transition',state,'editor');same('return to play after editor',state);
state.units.reverse();same('unit reorder',state);state.units.splice(0,2);same('unit shrink',state);
const pending=S.spawn(state,'soldier',0,0,0);override(pending.id,[effect(statusSlots[0])],[effect(spellSlots[0])]);same('new pending effects',state,'playing',1);override(pending.id);same('cancel pending effect creation',state,'playing',6);
for(const f of [before,after])f.override=null;
let death=heroDeathFixture(S);same('living hero effects',death.s);killHero(S,death);same('direct hide and hero Death effects',death.s);death.h.heroDeath.age=S.heroDeathDuration(death.s,death.h)+1;delete death.h.heroDeath;same('expired hero actor hides',death.s);
const replacement=S.spawn(death.s,'soldier',0,0,0);death.s.units=[replacement];same('living soldier reuses hero slot',death.s);
const tauren=taurenFixture(S);tauren.h.skills=[1,1,3,1];same('living Tauren effects',tauren.s);const killer=S.spawn(tauren.s,'soldier',1,1,0,{damage:100000,cd:10000});tauren.h.hp=1;S.fire(tauren.s,killer,tauren.h);assert.ok(tauren.h.reincarnation);same('direct hide and reincarnation effect',tauren.s);delete tauren.h.reincarnation;tauren.h.hp=tauren.h.maxHp;same('reincarnation ended before next visible presentation',tauren.s);assert.equal(after.world.entity('Classic spell 0 reincarnation').active,false);
console.log(JSON.stringify({author:'MiYu',passed:true,comparisons,baselineRepeatedHides,candidateRepeatedHides,scope:'Generated unit node equivalence: binding order, first duplicate, unknown slots, native discarded-hide retry, pending cancellation, visibility/menu/editor invalidation, reorder/shrink, hero Death expiry and reincarnation end.'}));
