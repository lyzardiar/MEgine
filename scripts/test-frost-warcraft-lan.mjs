// Author: MiYu. Verify the generated LAN browser against source anchors and network transitions.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root='samples/frostbound-realms/',source=fs.readFileSync(root+'Assets/Scripts/Main.js','utf8'),layout=JSON.parse(fs.readFileSync(root+'warcraft-lan-layout.json'));
assert.deepEqual(layout.unresolved,[]);
for(const record of layout.sources)assert.equal(createHash('sha256').update(fs.readFileSync(root+record.path)).digest('hex'),record.sha256,record.path);
for(const viewport of [[1280,720],[960,900]]){
  const world=clientWorldFixture(JSON.parse(fs.readFileSync(root+'Assets/Scenes/Main.mscene')).world),events=[],sent=[],saves=new Map([['playerName','测试玩家']]);
  const engine={...world.engine,snapshot:world.snapshot,network:{poll:()=>events.splice(0),connect:address=>sent.push({type:'connect',address}),send:m=>sent.push(m),close(){}},storage:{load:key=>saves.get(key),save:(key,value)=>saves.set(key,value)},playAudio(){},assets:{sampleNodes:()=>[]}};
  const context=vm.createContext({engine});vm.runInContext(source,context);
  function tick(input={}){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[viewport[0]/2,viewport[1]/2],viewport,...input};context.onTick(1/60);world.commit();}
  function settle(){for(let i=0;i<9;i++)tick();}
  function click(name){const pointer=world.canvasPoint(name,viewport,false);tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});settle();}
  function key(key){tick({pressedKeys:[key],keys:[key]});settle();}
  const state=()=>JSON.parse(world.entity('Frost telemetry').components.Text.text);
  tick();click('network box');assert.equal(state().mode,'connecting');assert.equal(world.visible('Warcraft LAN Browser'),true);assert.equal(world.visible('Modal shade'),false);
  assert.equal(world.entity('Warcraft LAN GameListTitle').components.Text.vertical_overflow,'Overflow');assert.ok(!/\|[cr]/i.test(world.entity('lanJoin label').components.Text.text));assert.equal(world.entity('Status').components.Text.text,'');
  assert.equal(world.entity('Warcraft LAN Player input').components.InputField.text,'测试玩家');
  for(const f of layout.pages.join){const id={CreateButton:'lanCreate',LoadButton:'lanLoad',JoinButton:'lanJoin',CancelButton:'lanCancel'}[f.name];if(f.name.endsWith('ButtonText'))continue;const r=world.canvasRect(id?'UI Control '+id:'Warcraft LAN '+f.name);assert.deepEqual([...r.anchored_position,...r.size_delta],f.rect,f.name);}
  events.push({type:'connected'});tick();settle();assert.equal(state().mode,'rooms');assert.equal(sent.find(m=>m.type==='hello').name,'测试玩家');assert.equal(world.visible('Warcraft LAN Empty list'),true);
  const rooms=Array.from({length:10},(_,i)=>({code:'R'+i,name:'地图 '+i,phase:'lobby',owner:0,players:[{seat:0,name:'房主 '+i,online:true}]}));
  events.push({type:'message',data:{type:'rooms',rooms}});tick();settle();assert.equal(world.visible('Warcraft LAN Empty list'),false);assert.equal(world.visible('room0 box'),true);assert.equal(world.entity('Warcraft LAN GameCreatorValue').components.Text.text,'房主 0');
  click('Warcraft LAN Player input');world.entity('Warcraft LAN Player input').components.InputField.text='中文 Commander';key('KeyC');assert.equal(state().mode,'rooms','typing must not trigger Create shortcut');
  click('lanNext box');assert.equal(world.entity('room0 label').components.Text.text,'地图 8   1/2');assert.equal(world.visible('room2 box'),false);assert.equal(saves.get('playerName'),'中文 Commander');
  click('room1 box');click('lanJoin box');assert.equal(sent.filter(m=>m.type==='join').at(-1).code,'R9');assert.equal(sent.filter(m=>m.type==='hello').at(-1).name,'中文 Commander');
  click('lanPrevious box');rooms[0].players.push({seat:1,name:'另一个玩家'});events.push({type:'message',data:{type:'rooms',rooms}});tick();settle();const joins=sent.filter(m=>m.type==='join').length;key('KeyJ');click('lanJoin box');assert.equal(sent.filter(m=>m.type==='join').length,joins,'full room cannot be joined');
  const lists=sent.filter(m=>m.type==='list').length;key('F5');assert.equal(sent.filter(m=>m.type==='list').length,lists+1);
  click('lanLoad box');assert.equal(state().mode,'rooms','unsupported multiplayer saves stay disabled');click('lanCreate box');assert.equal(state().mode,'network');assert.equal(world.visible('Warcraft LAN Browser'),false);assert.equal(world.visible('Modal shade'),true);assert.equal(world.visible('netSkirmish box'),true);
  click('modalBack box');assert.equal(state().mode,'connecting');key('Escape');assert.equal(state().mode,'title');assert.equal(world.visible('Warcraft LAN Browser'),false);events.push({type:'connected'},{type:'message',data:{type:'rooms',rooms}});tick();settle();assert.equal(state().mode,'title','late events cannot reopen a cancelled browser');
  click('network box');events.push({type:'connected'});tick();events.push({type:'closed'});tick();settle();assert.equal(state().mode,'rooms');assert.equal(world.visible('room0 box'),false);assert.equal(world.entity('Warcraft LAN Server status').components.Text.text.includes('未连接'),true);
  click('lanAddress box');assert.equal(state().mode,'address');key('Escape');assert.equal(state().mode,'connecting');click('lanCancel box');assert.equal(state().mode,'title');
}
console.log('PASS source hashes/25 LAN frames; two aspect ratios, player name/focus, paging, room selection, full-room rejection, refresh, create/back, disconnect/address/cancel');
