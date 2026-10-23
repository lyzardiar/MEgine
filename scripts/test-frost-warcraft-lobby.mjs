// Author: MiYu. Validate original lobby frames and client chat/start/cancel semantics.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root='samples/frostbound-realms/',source=fs.readFileSync(root+'Assets/Scripts/Main.js','utf8'),layout=JSON.parse(fs.readFileSync(root+'warcraft-lobby-layout.json'));
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
  function feed(data){events.push({type:'message',data});tick();settle();}
  const state=()=>JSON.parse(world.entity('Frost telemetry').components.Text.text);
  tick();click('network box');events.push({type:'connected'});tick();settle();
  feed({type:'joined',seat:0,team:0,token:'fixture',code:'ROOM',chat:[{id:1,name:'客人',text:'你好'}],state:null});
  const room={type:'room',code:'ROOM',name:'原版大厅',mode:'skirmish',phase:'lobby',owner:0,players:[{seat:0,team:0,name:'房主',online:true,ready:false,faction:0},{seat:1,team:1,name:'客人',online:true,ready:false,faction:3}]};feed(room);
  assert.equal(state().mode,'lobby');assert.equal(world.visible('Warcraft Lobby Page'),true);assert.equal(world.visible('Modal shade'),false);assert.equal(world.visible('modalPrimary box'),false);assert.equal(world.visible('lobbyHero box'),false);
  for(const f of layout.pages.lobby){if(f.name.endsWith('ButtonText'))continue;const id={StartGameButton:'lobbyStart',CancelButton:'lobbyCancel'}[f.name];const r=world.canvasRect(id?'UI Control '+id:'Warcraft Lobby '+f.name);assert.deepEqual([...r.anchored_position,...r.size_delta],f.rect,f.name);}
  assert.equal(world.entity('Warcraft Lobby Chat input').components.InputField.font_size,18);
  assert.equal(world.entity('Warcraft Lobby ChatTextArea').components.Text.text,'客人: 你好');
  assert.equal(world.entity('Warcraft Lobby Slot 1 NameMenu').components.Text.text,'客人');
  click('Warcraft Lobby Chat input');world.entity('Warcraft Lobby Chat input').components.InputField.text='消息 S A 中文';key('KeyS');key('KeyA');assert.equal(state().mode,'lobby');assert.equal(sent.some(m=>m.type==='start'),false);
  key('Enter');assert.equal(sent.findLast(m=>m.type==='chat').text,'消息 S A 中文');assert.equal(world.entity('Warcraft Lobby Chat input').components.InputField.text,'');
  feed({type:'chat',id:2,name:'房主',text:'消息 S A 中文'});feed({type:'chat',id:2,name:'房主',text:'消息 S A 中文'});assert.equal(world.entity('Warcraft Lobby ChatTextArea').components.Text.text.split('\n').length,2);
  key('Escape');const starts=()=>sent.filter(m=>m.type==='start').length;const before=starts();key('Enter');assert.equal(starts(),before);key('KeyS');assert.equal(starts(),before+1);assert.equal(sent.some(m=>m.type==='ready'),false);
  tick({uiSubmits:[{entity:world.entity('Warcraft Lobby Chat input').entity,component:'InputField',value:'提交事件'}]});settle();assert.equal(sent.findLast(m=>m.type==='chat').text,'提交事件');
  room.owner=1;feed(room);click('lobbyStart box');key('KeyS');assert.equal(starts(),before+1,'guest cannot start');room.owner=0;room.players[1].online=false;feed(room);key('KeyS');assert.equal(starts(),before+1,'offline players prevent start');
  room.players[1].online=true;room.mode='td';feed(room);assert.equal(world.entity('Warcraft Lobby Team 1').components.Text.text,'');
  const row=world.canvasRect('Warcraft Lobby Slot 1 NameMenu'),first=world.canvasRect('Warcraft Lobby Slot 0 NameMenu');assert.ok(Math.abs(row.anchored_position[1]-first.anchored_position[1]-layout.slot.height)<1e-6);
  click('lobbyCancel box');assert.equal(state().mode,'connecting');assert.equal(world.visible('Warcraft Lobby Page'),false);assert.ok(sent.some(m=>m.type==='leave'));
}
console.log('PASS lobby source hashes/13 frames, two aspect ratios, native font settings, chat focus/echo/dedup, host-only start without readiness, team grouping and cancel');
