// Author: MiYu. Generated original Crypt units production cards, hotkeys, source models and saved queues.
import fs from 'node:fs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {cryptUnitCases,cryptUnitFixture} from './test-frost-crypt-units.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),H=require('../samples/frostbound-realms/game/hud.js');
const native=clientWorldFixture(JSON.parse(fs.readFileSync(path.join(root,'Assets/Scenes/Main.mscene'))).world),world=native.snapshot,byName={get:n=>native.entity(n),has:n=>!!native.entity(n)},values=native.values,active=native.active,storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o)),nodeQueries=nativeNodeQueries();
const engine=Object.assign(native.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:{sampleNodes:(reference,options)=>nodeQueries.sampleNodes(reference,options)}});
const context=vm.createContext({engine});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);vm.runInContext('const undeadRestore=Frost.restore;Frost.restore=raw=>{globalThis.undeadState=undeadRestore(raw);return undeadState;};',context);
const S=context.Frost,component=(n,c)=>values.get(byName.get(n).entity+'/'+c)||byName.get(n).components[c],shown=n=>native.visible(n),telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};native.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=pointer=>{tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});},advance=n=>{for(let i=0;i<n;i++)tick({},.1);};
function ui(n){const r=H.rect(native.canvasRect(n),{viewport:[1280,720]});return [640+r.x,360+r.y];}
function point(u){const t=telemetry(),a=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth);return [640+(u.x-t.camera[0])/t.zoom*360,360+((u.z-t.camera[1])*Math.sin(a)-(S.types[u.kind].flying?S.types[u.kind].flightHeight:0)*Math.cos(a))/t.zoom*360];}

tick();
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click(ui('pauseLoad box'));assert.ok(context.undeadState,telemetry().notice);advance(2);return context.undeadState;}
for(const c of cryptUnitCases){
 const f=cryptUnitFixture(c),s=load(f.s),producer=s.units.find(u=>u.id===f.producer.id),r=S.undeadArmyRules.units[c.kind];click(point(producer));advance(2);assert.equal(telemetry().selected[0],producer.id);assert.equal(component('action'+r.slot+' icon','Image').sprite,r.icon);assert.ok(component('action'+r.slot+' label','Text').text.includes('['+r.hotkey+']'));for(let i=0;i<12;i++)if(shown('action'+i+' box'))assert.ok(!/Weapons \+6|bonearcher|ram/i.test(component('action'+i+' label','Text').text));
 const gold=s.teams[0].gold,wood=s.teams[0].wood;key('Key'+r.hotkey);assert.equal(producer.queue[0].kind,c.kind);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood-r.wood);key('F5');const mid=copy(storage.get('quicksave'));assert.equal(mid.units.find(u=>u.id===producer.id).queue[0].kind,c.kind);const restored=load(mid),p=restored.units.find(u=>u.id===producer.id);advance(Math.ceil(p.queue[0].left/S.DT));const recruit=restored.units.find(u=>u.kind===c.kind&&u.id!==f.unit.id);assert.ok(recruit);assert.equal(recruit.hp,r.hp);assert.equal(recruit.undeadArmyRules,1);assert.equal(context.FrostVisual.model(restored,recruit).key,r.model);click(point(recruit));advance(2);assert.equal(telemetry().selected[0],recruit.id);assert.equal(component('Portrait','Image').sprite,r.icon);assert.equal(shown('HUD Live portrait'),true);const portrait=context.FrostArt[r.portrait];assert.ok(portrait);assert.ok(component('Portrait model mesh 0','MeshRenderer').mesh.startsWith(portrait.parts[0].animatedMesh||portrait.parts[0].mesh));key('F5');assert.ok(storage.get('quicksave').units.some(u=>u.id===recruit.id));console.log('PASS generated '+c.kind+': original icon/slot/key, producer roster, full production, mid-queue load, source model and saved recruit');
}
