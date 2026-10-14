// Author: MiYu. Generated Edit preview matches the title screen and dormant panels reactivate through real input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),H=createRequire(import.meta.url)('../samples/frostbound-realms/game/hud.js');
const authored=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,native=clientWorldFixture(authored);
const storage=new Map(),engine=Object.assign(native.engine,{snapshot:native.snapshot,assets:{sampleNodes:()=>[]},storage:{load:k=>storage.get(k)??null,save:(k,v)=>storage.set(k,structuredClone(v))},network:{poll:()=>[],close(){},send(){}},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);
const uiNames=world=>world.entities.filter(e=>e.active!==false&&e.components.RectTransform).map(e=>e.name).sort();
const shown=name=>!!native.entity(name)&&native.entity(name).active!==false,component=(name,type)=>native.entity(name).components[type];
function tick(input={},dt=.1){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720],...input};native.render(delta=>context.onTick(delta),dt);}
const key=code=>{tick({keys:[code],pressedKeys:[code]});tick();};
function click(id){let pointer=id;if(!Array.isArray(id)){const r=H.rect(component(id+' box','RectTransform'),engine.input);pointer=[640+r.x,360+r.y];assert.ok(shown(id+' box'),id+' must be visible before clicking');}tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});}
function hiddenPanels(){for(const name of ['Pause title','Rename title','Modal title','Front title','Solo title'])assert.equal(shown(name),false,name);}
const initial=uiNames(authored);assert.ok(initial.length<200);assert.equal(shown('solo box'),true);hiddenPanels();
tick({},0);assert.deepEqual(uiNames(native.snapshot),initial,'authoring preview and first script frame enable identical UI nodes');
assert.deepEqual([...context.FrostSceneInactive].sort(),authored.entities.filter(e=>e.active===false).map(e=>e.name).sort(),'inactive lookup agrees with the generated scene');
click('network');assert.equal(shown('Modal title'),true);assert.equal(shown('netTd box'),true);assert.equal(shown('solo box'),false);click('modalBack');hiddenPanels();
click('options');assert.equal(shown('Front title'),true);assert.equal(shown('musicVolume box'),true);click('optionsBack');hiddenPanels();
click('solo');assert.equal(shown('Solo title'),true);click('custom');assert.equal(shown('Front title'),true);click('map1');click('mapStart');
assert.equal(shown('Menu painting'),false);assert.equal(shown('HUD Console 0'),true);assert.equal(shown('hudMenu box'),true);hiddenPanels();
key('F9');assert.ok(component('Status','Text').text.length>0,'notifications remain visible');assert.equal(shown('Status'),true);
key('F10');assert.equal(shown('Pause title'),true);assert.equal(shown('pauseResume box'),true);key('Escape');assert.equal(shown('Pause title'),false);
key('F10');click('pauseExit');assert.equal(shown('solo box'),true);hiddenPanels();
click('solo');click('editor');for(let i=0;i<4;i++)key('KeyV');click('action0');click([640,280]);key('KeyN');
assert.equal(shown('Rename title'),true);assert.equal(shown('Rename input'),true);assert.equal(shown('renameSave box'),true);assert.equal(shown('Pause title'),false);key('Escape');assert.equal(shown('Rename title'),false);
console.log(JSON.stringify({passed:true,authoredUiNodes:authored.entities.filter(e=>e.components.RectTransform).length,initialActiveUi:initial.length,checks:['first-frame parity','inactive lookup','network and co-op TD menu','options','custom Dota start','HUD and notifications','pause and resume','return to title','map editor region rename']}));
