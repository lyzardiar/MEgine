// Author: MiYu. Compare generated unit presentation with the pre-optimization client across visibility and slot lifetimes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {heroDeathFixture,killHero} from './frost-hero-death-fixture.mjs';
import {taurenFixture} from './frost-tauren-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const current=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
const baseline=execFileSync('git',['show','c97a99c:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024});
function client(source){
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  vm.runInContext(source.replace('  return {tick};',"  return {tick,effectPool,presentUnits(next,nextMode='playing'){state=next;mode=nextMode;team=0;renderUnits({viewport:[1280,720]});}};"),context);
  context.onTick(0);world.commit();let hides=0;const setActive=context.FrostClient.effectPool.setActive;
  context.FrostClient.effectPool.setActive=(name,on)=>{if(!on)hides++;return setActive(name,on);};
  return {world,context,hides:()=>hides,present(s,mode='playing',drop=false){context.FrostClient.effectPool.beginFrame();context.FrostClient.presentUnits(s,mode);world.commit(drop);}};
}
const before=client(baseline),after=client(current),S=after.context.Frost;
let checks=0;
function same(s,mode='playing',frames=4){for(let i=0;i<frames;i++){before.present(s,mode);after.present(s,mode);}const selected=w=>JSON.parse(JSON.stringify(w.snapshot.entities.filter(e=>/^(Unit \d+|Unit aura \d+|Ring \d+|HP \d+|Flag \d+|Sleep \d+|Classic (?:status|spell|attachment|Siphon) \d+)/.test(e.name))));assert.deepEqual(selected(after.world),selected(before.world));checks++;}
const state=S.create();same(state);const unit=state.units[0];unit.inside=999;same(state);
const oldHides=before.hides(),newHides=after.hides();same(state,'playing',10);
const baselineHides=before.hides()-oldHides,candidateHides=after.hides()-newHides;assert.ok(candidateHides<baselineHides*.8,{baselineHides,candidateHides});
unit.inside=undefined;same(state);unit.hp=0;same(state);state.units.reverse();same(state);state.units.splice(0,3);same(state);same(state,'title');same(S.create());same(S.create(),'editor');
const fog=S.create();for(const u of fog.units)u.team=1;fog.visible[0].fill(0);same(fog);fog.visible[0].fill(1);same(fog);fog.visible[0].fill(0);same(fog);
let death=heroDeathFixture(S);killHero(S,death);same(death.s);death.h.heroDeath.age=S.heroDeathDuration(death.s,death.h)+1;delete death.h.heroDeath;same(death.s);
death=heroDeathFixture(S);killHero(S,death);same(death.s);death.s.units.splice(0,1);death.s.visible[0].fill(0);same(death.s);
const tauren=taurenFixture(S);tauren.h.skills=[1,1,3,1];const killer=S.spawn(tauren.s,'soldier',1,1,0,{damage:100000,cd:10000});tauren.h.hp=1;S.fire(tauren.s,killer,tauren.h);assert.ok(tauren.h.reincarnation);same(tauren.s);delete tauren.h.reincarnation;same(tauren.s);
const dropped=S.create();same(dropped);dropped.units[0].inside=999;before.present(dropped,'playing',true);after.present(dropped,'playing',true);same(dropped);assert.equal(after.world.entity('Unit 0').active,false,'pooled body hide recovers after a discarded native commit');
console.log(JSON.stringify({author:'MiYu',passed:true,checks,baselineHides,candidateHides,scope:'Generated client equivalence: visibility, fog, death expiry, reincarnation expiry, slot shrink/reorder/reuse, menu/editor transitions and discarded native hide recovery.'}));
