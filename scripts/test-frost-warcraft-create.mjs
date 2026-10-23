// Author: MiYu. Verify source creation anchors and selecting before a network handshake.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root='samples/frostbound-realms/',source=fs.readFileSync(root+'Assets/Scripts/Main.js','utf8'),layout=JSON.parse(fs.readFileSync(root+'warcraft-create-layout.json'));
assert.deepEqual(layout.unresolved,[]);
for(const record of layout.sources)assert.equal(createHash('sha256').update(fs.readFileSync(root+record.path)).digest('hex'),record.sha256,record.path);
for(const viewport of [[1280,720],[960,900]]){
  const world=clientWorldFixture(JSON.parse(fs.readFileSync(root+'Assets/Scenes/Main.mscene')).world),events=[],sent=[];
  const engine={...world.engine,snapshot:world.snapshot,network:{poll:()=>events.splice(0),connect:address=>sent.push({type:'connect',address}),send:m=>sent.push(m),close(){}},storage:{load(){},save(){}},playAudio(){},assets:{sampleNodes:()=>[]}};
  const context=vm.createContext({engine});vm.runInContext(source,context);
  function tick(input={}){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[viewport[0]/2,viewport[1]/2],viewport,...input};context.onTick(1/60);world.commit();}
  function settle(){for(let i=0;i<9;i++)tick();}
  function click(name){const pointer=world.canvasPoint(name,viewport,false);tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});settle();}
  function key(key){tick({pressedKeys:[key],keys:[key]});settle();}
  const state=()=>JSON.parse(world.entity('Frost telemetry').components.Text.text);
  tick();click('network box');events.push({type:'connected'});tick();settle();click('lanCreate box');assert.equal(state().mode,'network');assert.equal(world.visible('Warcraft Create Page'),true);assert.equal(world.visible('Modal shade'),false);assert.equal(world.visible('modalPrimary box'),false);
  const bindings={PlayButton:'createStart',CancelButton:'createCancel',MapInfoButton:'createOptions'};
  for(const f of layout.pages.create){if(f.name.endsWith('ButtonText'))continue;const r=world.canvasRect(bindings[f.name]?'UI Control '+bindings[f.name]:'Warcraft Create '+f.name);assert.deepEqual([...r.anchored_position,...r.size_delta],f.rect,f.name);}
  assert.equal(world.visible('Warcraft Create AdvancedOptionsPaneContainer'),false);assert.equal(world.entity('Warcraft Create GameSpeedValue').components.Text.text,'固定速度');
  const connectCount=sent.filter(m=>m.type==='connect').length;
  for(const id of ['netSkirmish','netMoba','netTd']){click(id+' box');assert.equal(state().mode,'network');assert.equal(world.entity('Warcraft Create Map title').components.Text.text,world.entity(id+' label').components.Text.text);}
  assert.equal(sent.filter(m=>m.type==='connect').length,connectCount,'map selection must not start a connection');assert.equal(sent.some(m=>m.type==='create'),false);
  click('createOptions box');assert.equal(state().mode,'network');key('ArrowUp');assert.equal(world.entity('Warcraft Create Map title').components.Text.text,world.entity('netMoba label').components.Text.text);
  click('createStart box');assert.equal(state().mode,'connecting');assert.equal(world.visible('Warcraft Create Page'),false);events.push({type:'connected'});tick();settle();assert.equal(sent.find(m=>m.type==='create').mode,'moba');assert.equal(sent.find(m=>m.type==='create').map.name,world.entity('netMoba label').components.Text.text);
  events.push({type:'closed'});tick();settle();assert.equal(state().mode,'network');assert.equal(world.visible('Warcraft Create Page'),true);
  key('Escape');assert.equal(state().mode,'connecting');events.push({type:'connected'});tick();settle();assert.equal(state().mode,'rooms');click('lanCreate box');click('createCancel box');assert.equal(state().mode,'connecting');
}
console.log('PASS source creation frames/hashes, two aspect ratios, selection/keyboard, disabled options, create payload, disconnect and cancel recovery');
