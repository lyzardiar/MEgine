// Author: MiYu. Generated client selects objective models, explains protection and restores progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),copy=v=>JSON.parse(JSON.stringify(v));
const engine=Object.assign(world.engine,{network:{poll:()=>[],connect(){},close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},assets:{sampleNodes:()=>[]},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8').replace('  return {tick};','  return {tick,action,inspect:()=>({state,mode,selected,actions})};'),context);
const inspect=()=>context.FrostClient.inspect(),component=(name,key)=>world.entity(name).components[key];
function tick(input={}){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(context.onTick,.001);}
function click(u){const t=JSON.parse(component('Frost telemetry','Text').text),pitch=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth),pointer=[640+(u.x-t.camera[0])/t.zoom*360,360+((u.z-t.camera[1])*Math.sin(pitch)-context.Frost.elevation(inspect().state.map,u.x,u.z)*Math.cos(pitch))/t.zoom*360];tick({pointer,pressedButtons:[0],buttons:[0]});tick({pointer,releasedButtons:[0]});}
tick();context.FrostClient.action('moba');tick();tick({pressedKeys:['Space'],keys:['Space']});tick();assert.equal(inspect().mode,'playing');const s=inspect().state,tower=s.units.find(u=>u.team===0&&u.mobaObjective?.tier===3&&u.mobaObjective.lane===1);click(tower);
assert.deepEqual(copy(inspect().selected),[tower.id]);assert.match(component('Selection title','Text').text,/T3/);assert.match(component('Selection stats','Text').text,/保护中/);assert.match(component('Objective text','Text').text,/兵营 6\/6/);assert.equal(inspect().actions.length,0,'system objectives offer no player upgrades');
for(const u of s.units.filter(u=>u.mobaObjective)){const m=context.FrostVisual.model(s,u);assert.ok(m.asset);assert.ok(m.scale>0);}
context.FrostClient.action('pauseSave');tick();assert.equal(storage.get('quicksave').mobaObjectives.length,36);context.FrostClient.action('pauseLoad');tick();assert.deepEqual(copy(inspect().state.mobaObjectives),copy(s.mobaObjectives));assert.equal(inspect().state.units.find(u=>u.id===tower.id).mobaProtected,true);
console.log('PASS generated MOBA objective selection, protected/read-only UI, fixed faction models, global progress and quicksave/load');
