// Author: MiYu. Generated skeleton research cards, source training keys and unavailable-command filtering.
import fs from 'node:fs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {skeletonFixture} from './test-frost-skeleton-rules.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),H=require('../samples/frostbound-realms/game/hud.js');
const native=clientWorldFixture(JSON.parse(fs.readFileSync(path.join(root,'Assets/Scenes/Main.mscene'))).world),world=native.snapshot,byName={get:n=>native.entity(n),has:n=>!!native.entity(n)},values=native.values,active=native.active,storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o)),nodeQueries=nativeNodeQueries();
const engine=Object.assign(native.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:{sampleNodes:(reference,options)=>nodeQueries.sampleNodes(reference,options)}});
const context=vm.createContext({engine});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);vm.runInContext('const skeletonRestore=Frost.restore;Frost.restore=raw=>{globalThis.skeletonState=skeletonRestore(raw);return skeletonState;};',context);
const S=context.Frost,component=(n,c)=>values.get(byName.get(n).entity+'/'+c)||byName.get(n).components[c],shown=n=>native.visible(n),telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};native.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=pointer=>{tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});},advance=n=>{for(let i=0;i<n;i++)tick({},.1);};
function ui(n){const r=H.rect(native.canvasRect(n),{viewport:[1280,720]});return [640+r.x,360+r.y];}
function point(u){const t=telemetry(),a=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth);return [640+(u.x-t.camera[0])/t.zoom*360,360+(u.z-t.camera[1])*Math.sin(a)/t.zoom*360];}

tick();
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click(ui('pauseLoad box'));assert.ok(context.skeletonState,telemetry().notice);return context.skeletonState;}
for(const upgrade of ['longevity','mastery']){const f=skeletonFixture();f.s.teams[0].necromancy=2;const s=load(f.s),temple=s.units.find(u=>u.id===f.temple.id),r=S.skeletonRules.research[upgrade];click(point(temple));assert.equal(component('action'+r.slot+' icon','Image').sprite,r.icon);assert.ok(component('action'+r.slot+' label','Text').text.includes('['+r.hotkey+']'));key('Key'+r.hotkey);assert.equal(temple.casterResearch.upgrade,upgrade);assert.equal(s.teams[0].gold,10000-r.gold);assert.equal(s.teams[0].wood,10000-r.wood);assert.ok(!/Select an idle Temple/.test(telemetry().notice));console.log('PASS generated skeleton '+upgrade+': actual source command slot/icon/hotkey and original payment');}
{const f=skeletonFixture();f.s.teams[0].necromancy=1;const s=load(f.s),temple=s.units.find(u=>u.id===f.temple.id);click(point(temple));key('KeyE');assert.equal(temple.casterResearch.rank,2);assert.equal(temple.casterResearch.upgrade,undefined);assert.equal(s.teams[0].gold,9900);assert.equal(s.teams[0].wood,9850);assert.ok(!/Select an idle Temple/.test(telemetry().notice));key('KeyM');assert.equal(temple.casterResearch.rank,2);assert.ok(!/Select an idle Temple/.test(telemetry().notice));console.log('PASS generated source E training and M skeletal mastery: separate original keys, one debit and unavailable research stays inactive');}
