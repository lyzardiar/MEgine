// Author: MiYu. Generated Cannon Tower stats, source missile mesh, arc and saved attacks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {cannonTowerFixture} from './frost-cannon-tower-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o));
const engine=Object.assign(world.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:nativeNodeQueries()}),context=vm.createContext({engine});vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);vm.runInContext('const towerRestore=Frost.restore;Frost.restore=raw=>{globalThis.towerState=towerRestore(raw);return towerState;};',context);
const S=context.Frost,V=context.FrostVisual,component=(name,c)=>world.entity(name).components[c],telemetry=()=>JSON.parse(component('Frost telemetry','Text').text),near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=p=>{tick({pointer:p,buttons:[0],pressedButtons:[0]});tick({pointer:p,releasedButtons:[0]});},point=u=>{const t=telemetry(),angle=Math.atan2(32,42);return [640+(u.x-t.camera[0])/t.zoom*360,360+((u.z-t.camera[1])*Math.sin(angle)-S.unitHeight(context.towerState,u)*Math.cos(angle))/t.zoom*360];},step=n=>{for(let i=0;i<n;i++)tick({},.1);};
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click([640,388]);assert.equal(telemetry().mode,'playing');return context.towerState;}

tick();
{
 const f=cannonTowerFixture(S,{upgrade:true});let s=load(f.s),u=s.units.find(v=>v.id===f.tower.id);click(point(u));
 assert.equal(component('action7 icon','Image').sprite,S.cannonTowerRules.unit.icon);
 key('KeyC');assert.equal(u.guardTowerUpgrade.kind,'cannontower');assert.equal(u.guardTowerUpgrade.left,75);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9830,9900]);
 step(749);assert.equal(u.kind,'scouttower');key('F5');s=load(storage.get('quicksave'));u=s.units.find(v=>v.id===f.tower.id);step(1);assert.equal(u.kind,'cannontower');click(point(u));
 assert.equal(component('HUD Stat Attack value','Text').text.split('\n')[0],'90 - 111');assert.equal(V.model(s,u).key,'KingdomCannonTower');assert.equal(V.model(s,u).asset.classicTier,3);
 step(4);s=context.towerState;assert.ok(s.projectiles.some(p=>p.art==='cannon-tower'&&p.weaponSlot===1));assert.ok(world.snapshot.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/CannonTowerMissile/')));
 key('F5');const saved=copy(storage.get('quicksave'));s=load(saved);assert.deepEqual(copy(s.projectiles),saved.projectiles);const hp=s.units.find(v=>v.id===f.target.id).hp;step(12);assert.ok(context.towerState.units.find(v=>v.id===f.target.id).hp<hp);
 console.log('PASS generated Cannon full upgrade hotkey, source button, 90-111 stats, tier-three body, original missile and saved impact');
}
{
 const f=cannonTowerFixture(S,{upgrade:true});f.workshop.built=.5;const s=load(f.s),u=s.units.find(v=>v.id===f.tower.id);click(point(u));assert.equal(component('action7 icon','Image').sprite,S.cannonTowerRules.unit.disabledIcon);key('KeyC');assert.equal(u.guardTowerUpgrade,undefined);
 console.log('PASS generated Cannon disabled source button and unfinished Workshop rejection');
}
{
 const f=cannonTowerFixture(S);f.target.x=20;S.visibility(f.s);const s=load(f.s),u=s.units.find(v=>v.id===f.tower.id);click(point(u));key('KeyG');click(point({x:4,z:0,kind:'soldier'}));step(4);assert.ok(context.towerState.projectiles.some(p=>p.groundAttack&&p.weaponSlot===1));assert.ok(S.restore(context.towerState));
 console.log('PASS generated Cannon Attack Ground hotkey and saved artillery order');
}
