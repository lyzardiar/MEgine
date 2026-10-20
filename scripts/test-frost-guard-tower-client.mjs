// Author: MiYu. Generated Guard Tower stats, source missile mesh, arc and saved attacks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o));
const engine=Object.assign(world.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:nativeNodeQueries()}),context=vm.createContext({engine});vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);vm.runInContext('const towerRestore=Frost.restore;Frost.restore=raw=>{globalThis.towerState=towerRestore(raw);return towerState;};',context);
const S=context.Frost,V=context.FrostVisual,component=(name,c)=>world.entity(name).components[c],telemetry=()=>JSON.parse(component('Frost telemetry','Text').text),near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=p=>{tick({pointer:p,buttons:[0],pressedButtons:[0]});tick({pointer:p,releasedButtons:[0]});},point=u=>{const t=telemetry(),angle=Math.atan2(32,42);return [640+(u.x-t.camera[0])/t.zoom*360,360+((u.z-t.camera[1])*Math.sin(angle)-S.unitHeight(context.towerState,u)*Math.cos(angle))/t.zoom*360];},step=n=>{for(let i=0;i<n;i++)tick({},.1);};
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click([640,388]);assert.equal(telemetry().mode,'playing');return context.towerState;}

tick();
for(const targetKind of ['cryptfiend','gargoyle']){
 const f=guardTowerFixture(S,{targetKind});let s=load(f.s),u=s.units.find(v=>v.id===f.tower.id);click(point(u));
 assert.equal(component('HUD Stat Attack value','Text').text.split('\n')[0],'23 - 27');step(4);s=context.towerState;const p=s.projectiles[0];assert.equal(p.art,'guard-tower');assert.equal(p.guardTowerRules,1);assert.equal(p.born,4);
 step(1);assert.ok(p.y>p.baseY);const missiles=world.snapshot.entities.filter(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/GuardTowerMissile/'));assert.ok(missiles.length>0,'source missile visible');assert.ok(missiles.some(e=>e.components.MeshRenderer.mesh.includes('#pose=')));
 key('F5');const saved=copy(storage.get('quicksave'));s=load(saved);assert.deepEqual(copy(s.projectiles),saved.projectiles);const hp=s.units.find(v=>v.id===f.target.id).hp;step(5);s=context.towerState;assert.ok(s.units.find(v=>v.id===f.target.id).hp<hp);
 if(targetKind==='cryptfiend'){step(90);assert.ok(context.towerState.projectileSerial>=10);}assert.ok(S.restore(context.towerState));
 console.log('PASS generated Guard Tower '+targetKind+': damage range, source sampled missile, curved flight, save/load and actual hit');
}

for(const [x,shots] of [[8.5,1],[10.5,0]]){
 const f=guardTowerFixture(S);S.tick(f.s);f.target.x=x;S.visibility(f.s);load(f.s);key('F5');load(storage.get('quicksave'));step(3);const s=context.towerState;assert.equal(s.projectileSerial,shots);assert.equal(s.units.find(u=>u.id===f.tower.id).weaponWindup,undefined);assert.ok(S.restore(s));
 if(shots)assert.ok(world.snapshot.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/GuardTowerMissile/')));
 console.log('PASS generated Guard release range '+x+': saved moving target, expected shots '+shots);
}

{const f=guardTowerFixture(S);S.tick(f.s);f.target.x=8.5;S.visibility(f.s);const s=load(f.s);click(point(s.units.find(u=>u.id===f.tower.id)));key('KeyS');step(3);assert.equal(context.towerState.projectileSerial,0);assert.equal(context.towerState.units.find(u=>u.id===f.tower.id).weaponWindup,undefined);console.log('PASS generated Guard Stop key cancels buffered windup');}
