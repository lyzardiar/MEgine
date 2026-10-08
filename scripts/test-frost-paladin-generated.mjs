// Author: MiYu. Generated Paladin client keyboard skills, source command cards, portrait and sampled effects.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {paladinFixture} from './frost-paladin-fixture.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),H=require('../samples/frostbound-realms/game/hud.js');
const world=JSON.parse(fs.readFileSync(path.join(root,'Assets/Scenes/Main.mscene'))).world,byName=new Map(world.entities.map(e=>[e.name,e])),values=new Map(),active=new Map(),storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o));
const nodeQueries=nativeNodeQueries();
const engine={findEntitiesByName:names=>world.entities.filter(e=>names.includes(e.name)),network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},setActive:(id,on)=>active.set(id,on),playAudio(){},pushCommandJson:raw=>{const c=JSON.parse(raw);values.set(c.entity+'/'+c.component,c.value);},assets:{sampleNodes:(reference,options)=>{try{return nodeQueries.sampleNodes(reference,options);}catch(e){throw Error(reference+': '+e.message);}}}};
const context=vm.createContext({engine});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);vm.runInContext('const paladinRestore=Frost.restore;Frost.restore=raw=>{globalThis.paladinState=paladinRestore(raw);return paladinState;};',context);
const S=context.Frost,component=(n,c)=>values.get(byName.get(n).entity+'/'+c)||byName.get(n).components[c],shown=n=>active.get(byName.get(n).entity)??byName.get(n).active,telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};context.onTick(dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=pointer=>{tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});};
function ui(n){const r=H.rect(component(n,'RectTransform'),{viewport:[1280,720]});return [640+r.x,360+r.y];}
function point(u){const t=telemetry(),a=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth);return [640+(u.x-t.camera[0])/t.zoom*360,360+(u.z-t.camera[1])*Math.sin(a)/t.zoom*360];}
tick();const f=paladinFixture(S,6);f.h.skills=[1,1,1,1];f.h.skillPoints=2;f.h.mana=350;const ally=S.spawn(f.s,'soldier',0,3,0,{hp:30,damage:0,cd:10000,order:{type:'hold'}}),enemy=S.spawn(f.s,'ghoul',1,20,20,{damage:10000,cd:10000,order:{type:'hold'}});for(let i=0;i<2;i++){const v=S.spawn(f.s,'soldier',0,-3,2+i,{damage:0,order:{type:'hold'}});S.fire(f.s,enemy,v);}S.tick(f.s);S.visibility(f.s);storage.set('quicksave',copy(f.s));key('F1');if(!telemetry().paused)key('F10');click(ui('pauseLoad box'));assert.ok(context.paladinState,telemetry().notice);key('Space');const s=context.paladinState,h=s.units[0];
assert.equal(h.sourceHero,'Hpal');assert.equal(component('HUD Stat strength value','Text').text,String(h.strength));const camera=context.FrostPortraitViews.ClassicPaladinPortrait.camera;assert.deepEqual(component('Portrait camera','Transform').position,[1000+camera.position[0],camera.position[1],camera.position[2]]);assert.equal(component('Portrait model mesh 0','MeshRenderer').mesh.split('#')[0],context.FrostArt.ClassicPaladinPortrait.parts[0].mesh);
for(const [slot,id] of [[8,'AHhb'],[9,'AHds'],[10,'AHad'],[11,'AHre']])assert.equal(component('action'+slot+' icon','Image').sprite,S.paladinRules.abilities[id].icon);key('KeyK');for(const slot of [0,1,2,3])assert.ok(component('action'+slot+' label','Text').text);key('KeyK');
key('KeyT');click(point(s.units.find(v=>v.id===ally.id)));assert.equal(h.paladinCast.slot,0);for(let i=0;i<5;i++)tick({},.1);assert.ok(s.units.find(v=>v.id===ally.id).hp>200);assert.ok(shown('Classic spell 1 holyLight'));assert.ok(shown('Classic spell 0 devotionBearer'));
key('KeyD');assert.equal(h.paladinCast.slot,1);for(let i=0;i<5;i++)tick({},.1);assert.ok(h.divineShield>0);assert.ok(shown('Classic spell 0 divineShield'));h.mana=300;key('KeyR');assert.equal(h.paladinCast.slot,3);key('F5');assert.ok(storage.get('quicksave').units[0].paladinCast);for(let i=0;i<5;i++)tick({},.1);assert.equal(s.corpses.length,0);assert.equal(s.units.filter(v=>v.resurrectionFrame!==undefined).length,2);assert.ok(shown('Classic spell 0 resurrectionCaster'));assert.ok(S.restore(s));
console.log('PASS generated Paladin client: T/D/V/R cards, source research slots, STR card, original live portrait, Holy Light, shield/aura effects, target-free Resurrection and F5 saved cast');
