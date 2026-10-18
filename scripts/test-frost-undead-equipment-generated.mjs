// Author: MiYu. Generated original Graveyard rank cards, hotkeys, paid queues and saved upgraded skeletons.
import fs from 'node:fs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {undeadEquipmentFixture} from './test-frost-undead-equipment.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),H=require('../samples/frostbound-realms/game/hud.js');
const native=clientWorldFixture(JSON.parse(fs.readFileSync(path.join(root,'Assets/Scenes/Main.mscene'))).world),world=native.snapshot,byName={get:n=>native.entity(n),has:n=>!!native.entity(n)},values=native.values,active=native.active,storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o)),nodeQueries=nativeNodeQueries();
const engine=Object.assign(native.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:{sampleNodes:(reference,options)=>nodeQueries.sampleNodes(reference,options)}});
const context=vm.createContext({engine});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);vm.runInContext('const undeadRestore=Frost.restore;Frost.restore=raw=>{globalThis.undeadState=undeadRestore(raw);return undeadState;};',context);
const S=context.Frost,component=(n,c)=>values.get(byName.get(n).entity+'/'+c)||byName.get(n).components[c],shown=n=>native.visible(n),telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};native.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=pointer=>{tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});},advance=n=>{for(let i=0;i<n;i++)tick({},.1);};
function ui(n){const r=H.rect(native.canvasRect(n),{viewport:[1280,720]});return [640+r.x,360+r.y];}
function point(u){const t=telemetry(),a=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth);return [640+(u.x-t.camera[0])/t.zoom*360,360+(u.z-t.camera[1])*Math.sin(a)/t.zoom*360];}

tick();
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click(ui('pauseLoad box'));assert.ok(context.undeadState,telemetry().notice);advance(2);return context.undeadState;}
for(const upgrade of Object.keys(S.undeadEquipment.research)){
 const f=undeadEquipmentFixture(),s=load(f.s),graveyard=s.units.find(u=>u.id===f.graveyard.id);click(point(graveyard));assert.equal(telemetry().selected[0],graveyard.id);advance(2);
 for(let rank=1;rank<=3;rank++){const r=S.undeadEquipmentOption(s,graveyard,upgrade);assert.equal(component('action'+r.slot+' icon','Image').sprite,r.icon);assert.ok(component('action'+r.slot+' label','Text').text.includes('['+r.hotkey+']'));const gold=s.teams[0].gold,wood=s.teams[0].wood;key('Key'+r.hotkey);assert.equal(graveyard.queue[0].research,upgrade);assert.equal(graveyard.queue[0].rank,rank);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood-r.wood);assert.ok(!/Select a completed|Unknown command/.test(telemetry().notice));let cancel;for(let i=0;i<12;i++)if(shown('action'+i+' box')&&component('action'+i+' label','Text').text.startsWith('Cancel last'))cancel='action'+i+' box';assert.ok(cancel);click(ui(cancel));assert.equal(graveyard.queue.length,0);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].wood,wood);key('Key'+r.hotkey);graveyard.queue[0].left=.1;S.tick(s);advance(2);assert.equal(s.teams[0].undeadEquipment[upgrade],rank);}
 key('F5');assert.equal(storage.get('quicksave').teams[0].undeadEquipment[upgrade],3);console.log('PASS generated Graveyard '+upgrade+': all three source icons/slots/hotkeys, queued source label, real cancel button/refund and saved rank 3');
}
