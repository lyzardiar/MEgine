// Author: MiYu. Source UI geometry, disabled controls, viewport input and paused-options state retention.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {warcraftOptions} from './frost-warcraft-options.mjs';
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
  click('options box');click('optionsVideo box');assert.equal(world.visible('UI Control menuSnow'),false);assert.equal(world.visible('Warcraft options video'),true);click('optionsSound box');assert.equal(world.visible('UI Control musicVolume'),false);assert.equal(world.visible('UI Control optionMusicVolumeSlider'),true);
  const slider='optionMusicVolumeSlider',center=world.canvasPoint(slider+' box',viewport,false),scale=Math.min(viewport[0]/960,viewport[1]/720);
  tick({pointer:center,buttons:[0],pressedButtons:[0]});assert.equal(state().settings.music,.5);
  const beyond=[center[0]+400*scale,center[1]+80*scale];tick({pointer:beyond,buttons:[0]});assert.equal(state().settings.music,1);tick({pointer:beyond,releasedButtons:[0]});
  tick({pointer:[center[0]-400*scale,center[1]],buttons:[]});assert.equal(state().settings.music,1,'release ends capture');
  click(slider+' box');assert.equal(state().settings.music,.5);
  click('optionMusicCheckBox box');assert.equal(state().settings.musicEnabled,false);assert.ok(world.snapshot.entities.filter(e=>e.name.startsWith('Sound ')&&e.components.AudioSource?.looped).every(e=>e.components.AudioSource.volume===0));
  click(slider+' box');assert.equal(state().settings.music,.5,'muted slider retains volume');click('optionMusicCheckBox box');assert.equal(state().settings.musicEnabled,true);
  assert.ok(world.snapshot.entities.some(e=>e.name.startsWith('Sound ')&&e.components.AudioSource?.looped&&e.components.AudioSource.volume>0));
  click('optionAmbientCheckBox box');assert.equal(state().settings.ambient,undefined,'unsupported options cannot alter settings');
  key('Escape');assert.equal(state().settings.music,1,'cancel restores entry settings');assert.equal(saves.some(([k])=>k==='settings'),false);
  click('options box');click('optionsSound box');click(slider+' box');key('KeyO');assert.equal(state().mode,'title');assert.equal(saves.filter(([k])=>k==='settings').length,1);assert.equal(saves.find(([k])=>k==='settings')[1].music,.5);
  click('options box');const keyboard=world.canvasPoint('optionKeyScrollSlider box',viewport,false);tick({pointer:keyboard,buttons:[0],pressedButtons:[0]});const slow=[keyboard[0]-300*scale,keyboard[1]];tick({pointer:slow,buttons:[0]});tick({pointer:slow,releasedButtons:[0]});assert.equal(state().settings.keyScroll,0);click('optionMouseScrollDisableCheckBox box');key('KeyO');
  key('F1');key('F10');assert.equal(state().paused,true);const frame=state().frame,map=state().map;
  assert.deepEqual(world.canvasRect('hudQuest box').size_delta,[102,26.4]);assert.deepEqual(world.canvasRect('hudChat box').size_delta,[102,26.4]);
  assert.equal(world.entity('Pause frame').components.Image.sprite,'Assets/WarcraftUI/Textures/EscPanel-Normal-346x461.png');
  key('KeyO');assert.equal(state().mode,'options');key('F10');assert.equal(state().mode,'playing');assert.equal(state().paused,true);assert.equal(state().frame,frame);assert.equal(state().map,map);
  key('KeyS');assert.ok(saves.some(([k])=>k==='quicksave'));key('KeyR');assert.equal(state().paused,false);
  const before=state().camera[0];tick({keys:['ArrowRight'],pointer:[viewport[0]/2,viewport[1]/2]},.2);assert.ok(Math.abs(state().camera[0]-before-1)<1e-8,'keyboard speed changes actual camera movement');const stopped=state().camera[0];tick({},.2);assert.equal(state().camera[0],stopped,'edge scrolling can be disabled');
  assert.equal(world.visible('Menu background model'),false);
}
const loaded=vm.createContext({FrostWarcraftOptions:warcraftOptions()});vm.runInContext(fs.readFileSync(root+'game/warcraft-options.js','utf8'),loaded);
const restored=loaded.FrostOptions.create({save:()=>false,apply(){}});restored.load({music:5,sfx:-2,musicEnabled:false,sfxEnabled:'false',mouseScroll:NaN,healthBars:false});assert.equal(restored.settings.music,1);assert.equal(restored.settings.sfx,0);assert.equal(restored.settings.sfxEnabled,true);assert.equal(restored.settings.mouseScroll,.5);assert.equal(restored.settings.healthBars,false);restored.begin();restored.settings.music=.4;assert.equal(restored.finish(true),false);restored.finish(false);assert.equal(restored.settings.music,1);
console.log('PASS original button geometry/font, disabled/hidden controls, settings and paused-game return at two aspect ratios');
