// Author: MiYu. Generated editor moves objectives through real input and preserves authored layout on play and host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),events=[],sent=[],copy=v=>JSON.parse(JSON.stringify(v));
const engine=Object.assign(world.engine,{network:{poll:()=>events.splice(0),connect(){},close(){},send:m=>sent.push(copy(m))},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},assets:{sampleNodes:()=>[]},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8').replace('  return {tick};','  return {tick,inspect:()=>({state,editMap,editorPage,mobaBuilding,mobaTeam,actions,mode})};'),context);
const S=context.Frost,map=JSON.parse(fs.readFileSync(new URL('Assets/Maps/moba.json',root))),inspect=()=>context.FrostClient.inspect(),telemetry=()=>JSON.parse(world.entity('Frost telemetry').components.Text.text);storage.set('map1',map);
function tick(input={}){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(context.onTick,.001);}
function key(k,held=[]){tick({pressedKeys:[k],keys:[...held,k]});tick();}
function click(x,z){const t=telemetry(),pitch=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth),pointer=[640+(x-t.camera[0])/t.zoom*360,360+((z-t.camera[1])*Math.sin(pitch)-S.elevation(inspect().state.map,x,z)*Math.cos(pitch))/t.zoom*360];tick({pointer,pressedButtons:[0],buttons:[0]});tick({pointer,releasedButtons:[0]});}
tick();key('F4');key('F6');key('KeyB');assert.equal(inspect().editorPage,12);assert.equal(inspect().mode,'editor');assert.deepEqual(copy(inspect().editMap.mobaLayout),map.mobaLayout);assert.ok(inspect().actions.some(a=>a?.label==='移动 [M]'));
click(-24,-13);assert.equal(inspect().mobaBuilding,0);key('KeyM');click(-25,-13);assert.deepEqual(copy(inspect().editMap.mobaLayout[0][0]),[-25,-13]);assert.deepEqual(copy(inspect().state.units.filter(u=>u.team===0&&u.mobaObjective?.role==='tower')[0]).x,-25);
key('F5');const edited=copy(storage.get('map1'));key('KeyZ',['ControlLeft']);assert.deepEqual(copy(inspect().editMap.mobaLayout),map.mobaLayout);key('F6');assert.deepEqual(copy(inspect().editMap.mobaLayout),edited.mobaLayout);
key('KeyM');click(...edited.mobaLayout[0][1]);assert.deepEqual(copy(inspect().editMap.mobaLayout),edited.mobaLayout,'overlapping movement rolls back');assert.match(telemetry().notice,/MOBA/);
inspect().actions[0].run();tick();assert.equal(inspect().mobaTeam,1);const enemy=edited.mobaLayout[1][0];click(...enemy);assert.equal(inspect().mobaBuilding,0);key('KeyM');click(enemy[0]+1,enemy[1]);assert.deepEqual(copy(inspect().editMap.mobaLayout[1][0]),[enemy[0]+1,enemy[1]]);key('KeyZ',['ControlLeft']);
key('F7');assert.equal(inspect().mode,'playing');assert.deepEqual(copy(inspect().state.map.mobaLayout),edited.mobaLayout);key('F10');key('KeyX');assert.equal(inspect().mode,'editor');key('F5');assert.deepEqual(storage.get('map1').mobaLayout,edited.mobaLayout);
key('F10');key('Enter');key('Enter');events.push({type:'connected'});tick();const request=sent.find(m=>m.type==='create');assert.deepEqual(request.map.mobaLayout,edited.mobaLayout,'host sends authored positions');assert.equal(request.mode,'moba');
console.log('PASS generated MOBA editor: both faction selection/move, invalid rollback, undo, save/load, play/return and authored-map hosting');
