// Author: MiYu. Source UI geometry, disabled controls, viewport input and paused-options state retention.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root='samples/frostbound-realms/',source=fs.readFileSync(root+'Assets/Scripts/Main.js','utf8');
for(const viewport of [[1280,720],[960,900]]){
  const world=clientWorldFixture(JSON.parse(fs.readFileSync(root+'Assets/Scenes/Main.mscene')).world),saves=[];
  const engine={...world.engine,network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save:(key,value)=>saves.push([key,value])},playAudio(){},assets:{sampleNodes:()=>[]}};
  const context=vm.createContext({engine});vm.runInContext(source,context);
  function tick(input={},dt=1/60){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[0,0],viewport,...input};context.onTick(dt);world.commit();}
  function click(name){const pointer=world.canvasPoint(name,viewport,false);tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});for(let i=0;i<7;i++)tick();}
  const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();for(let i=0;i<7;i++)tick();},state=()=>JSON.parse(world.entity('Frost telemetry').components.Text.text);
  tick();assert.equal(state().mode,'title');assert.deepEqual(world.canvasRect('solo box').size_delta,[214.8,37.2]);
  assert.equal(world.entity('solo label').components.Text.font,'Assets/Fonts/Warcraft-Master.ttf');
  click('multiplayer box');assert.equal(state().mode,'title');
  click('solo box');assert.equal(state().mode,'single');assert.equal(world.visible('UI Control editor'),false);
  assert.ok(world.snapshot.entities.some(e=>e.name.startsWith('Menu decoration left mesh ')&&e.components.MeshRenderer?.mesh.includes('#pose=11:12')));
  click('replay box');assert.equal(state().mode,'single');key('KeyG');assert.equal(state().mode,'custom');assert.ok(world.snapshot.entities.some(e=>e.name.startsWith('Menu decoration right mesh ')&&e.components.MeshRenderer?.mesh.includes('#pose=19:12')));key('Escape');key('Escape');
  click('options box');click('optionsVideo box');assert.equal(world.visible('UI Control menuSnow'),false);click('optionsSound box');assert.equal(world.visible('UI Control musicVolume'),true);click('musicVolume box');assert.equal(state().settings.music,.75);key('Escape');
  key('F1');key('F10');assert.equal(state().paused,true);const frame=state().frame,map=state().map;
  assert.deepEqual(world.canvasRect('hudQuest box').size_delta,[102,26.4]);assert.deepEqual(world.canvasRect('hudChat box').size_delta,[102,26.4]);
  assert.equal(world.entity('Pause frame').components.Image.sprite,'Assets/WarcraftUI/Textures/EscPanel-Normal-346x461.png');
  key('KeyO');assert.equal(state().mode,'options');key('F10');assert.equal(state().mode,'playing');assert.equal(state().paused,true);assert.equal(state().frame,frame);assert.equal(state().map,map);
  key('KeyS');assert.ok(saves.some(([k])=>k==='quicksave'));key('KeyR');assert.equal(state().paused,false);
  assert.equal(world.visible('Menu background model'),false);
}
console.log('PASS original button geometry/font, disabled/hidden controls, settings and paused-game return at two aspect ratios');
