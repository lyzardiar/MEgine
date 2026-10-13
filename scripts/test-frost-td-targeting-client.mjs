// Author: MiYu. Generated map editor handles tower selection, target-priority hotkey/button and save/load.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),events=[],sent=[],copy=v=>JSON.parse(JSON.stringify(v));
const engine=Object.assign(world.engine,{network:{poll:()=>events.splice(0),connect(){},close(){},send:m=>sent.push(copy(m))},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},assets:{sampleNodes:()=>[]},playAudio(){}}),context=vm.createContext({engine});
const source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');vm.runInContext(source.replace('  return {tick};','  return {tick,action,inspect:()=>({state,editMap,editorPage,tdPoint,actions,mode,selected,online})};'),context);
const S=context.Frost,map=copy(S.defaultMap('td'));for(const key of ['terrain','heights','ramps','relief'])map[key].fill(0);map.props=[];map.doodads=[];map.tdPath=[[-10,-10],[0,-10],[0,10],[10,10]];storage.set('map1',map);
const inspect=()=>context.FrostClient.inspect(),component=(name,key)=>world.entity(name).components[key],telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(context.onTick,dt);}
function key(k,held=[]){tick({pressedKeys:[k],keys:[...held,k]});tick();}
function point(x,z){const t=telemetry(),pitch=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth);return [640+(x-t.camera[0])/t.zoom*360,360+((z-t.camera[1])*Math.sin(pitch)-S.elevation(inspect().state.map,x,z)*Math.cos(pitch))/t.zoom*360];}
function click(x,z){const pointer=point(x,z);tick({pointer,pressedButtons:[0],buttons:[0]});tick({pointer,releasedButtons:[0]});}
const save=()=>{key('F5');return storage.get('map1');};
function button(id){const b=context.FrostButtons.find(b=>b.id===id),pointer=[640+b.x,360+b.y];tick({pointer,pressedButtons:[0],buttons:[0]});tick({pointer,releasedButtons:[0]});}
tick();key('F4');key('F6');key('F7');assert.equal(inspect().mode,'playing');const tower=inspect().state.units.find(u=>u.kind==='tower');click(tower.x,tower.z);assert.deepEqual(copy(inspect().selected),[tower.id]);assert.equal(tower.tdPriority,'first');assert.match(inspect().actions[10].label,/最前/);assert.match(component('Selection stats','Text').text,/目标：最前/);
for(const value of ['last','strongest','weakest','nearest','first']){key('KeyG');assert.equal(tower.tdPriority,value);}button('action10');assert.equal(tower.tdPriority,'last');assert.match(inspect().actions[10].label,/最后/);key('F10');context.FrostClient.action('pauseSave');tick();assert.equal(storage.get('quicksave').units.find(u=>u.id===tower.id).tdPriority,'last');context.FrostClient.action('pauseResume');tick();key('KeyG');assert.equal(tower.tdPriority,'strongest');key('F10');context.FrostClient.action('pauseLoad');tick();assert.equal(inspect().state.units.find(u=>u.id===tower.id).tdPriority,'last');
console.log('PASS generated target priority: physical selection and command-grid coordinates, five-mode G cycle, current mode label, quicksave/load persistence');
