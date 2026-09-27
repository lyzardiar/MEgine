// Author: MiYu. Behavioral checks for campaign, data triggers, save validation and replays.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),R=require('../samples/frostbound-realms/game/session.js');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
check('command recording reproduces simulation and honors the end frame',()=>{
  const state=S.create('skirmish',{ai:[false,true]}),log=R.recording(state),hero=state.units.find(u=>u.team===0&&u.kind==='hero');
  for(let i=0;i<160;i++){if(i===10||i===40){const command={type:'move',ids:[hero.id],x:-12+i/20,z:12};assert.equal(S.command(state,0,command),null);R.append(log,state.frame,0,command);}S.tick(state);}
  log.endFrame=state.frame;const player=R.replay(JSON.parse(JSON.stringify(log)));while(!player.finished)R.advance(player);
  assert.deepEqual(S.clone(player.state),S.clone(state));assert.equal(player.state.frame,160);
});
check('loaded-match recording preserves active navigation paths',()=>{
  const state=S.create(),hero=state.units.find(u=>u.kind==='hero');S.command(state,0,{type:'move',ids:[hero.id],x:0,z:0});for(let i=0;i<35;i++)S.tick(state);
  const log=R.recording(state);for(let i=0;i<50;i++)S.tick(state);log.endFrame=state.frame;const player=R.replay(log);while(!player.finished)R.advance(player);assert.deepEqual(S.clone(player.state),S.clone(state));
});
check('invalid saves and replay sequences reject before activation',()=>{
  const state=S.create();for(const mutate of [s=>s.teams=[],s=>s.units[0].spell=null,s=>s.units[0].kind='constructor',s=>s.resources[0].amount=-1,s=>s.explored=null,s=>s.units[0].td=true]){
    const copy=S.clone(state);mutate(copy);assert.throws(()=>R.restore(copy));
  }
  const log=R.recording(state);log.orders=[{frame:-1,team:0,command:{type:'stop'}}];assert.throws(()=>R.replay(log));
  const restored=R.restore(JSON.parse(JSON.stringify(state)));S.tick(restored);assert.equal(restored.frame,1);
});
check('trigger rewards fire once and survive save/load',()=>{
  const map=S.defaultMap();map.triggers=[{event:'time',threshold:1,action:'gold',team:0,value:80,x:0,z:0,text:'Bounty'}];
  const state=S.create('skirmish',{map,ai:[false,false]});state.units.forEach(u=>u.order=null);for(let i=0;i<15;i++)S.tick(state);assert.equal(state.teams[0].gold,580);assert.deepEqual(state.fired,[0]);
  const restored=R.restore(state);S.tick(restored);assert.equal(restored.teams[0].gold,580);assert.deepEqual(restored.fired,[0]);
});
check('region trigger wins for its owning team',()=>{
  const map=S.defaultMap();map.triggers=[{event:'enter',threshold:1,action:'victory',team:0,value:1,x:0,z:0,text:'Captured'}];
  const state=S.create('skirmish',{map});S.tick(state);assert.equal(state.winner,null);const hero=state.units.find(u=>u.kind==='hero'&&u.team===0);hero.x=0;hero.z=0;S.tick(state);assert.equal(state.winner,0);
});
check('campaign has three validated playable chapters and working objectives',()=>{
  for(let i=0;i<3;i++){const data=R.campaign(i),state=S.create('skirmish',data);assert.ok(state.map.objective);assert.ok(state.units.length>10);if(i===0){state.teams[0].gold=900;S.tick(state);assert.equal(state.winner,0);}if(i===1){state.frame=1799;S.tick(state);assert.equal(state.winner,0);assert.equal(state.fired.length,5);}}
});
check('trigger validation rejects scripts and unbounded spawns',()=>{
  const map=S.defaultMap();map.triggers=[{event:'eval',action:'spawn',team:0,value:3,threshold:1,x:0,z:0}];assert.throws(()=>S.validateMap(map));map.triggers[0].event='time';map.triggers[0].value=Infinity;assert.throws(()=>S.validateMap(map));
});
console.log(`${checks} checks passed`);
