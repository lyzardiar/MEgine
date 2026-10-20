// Author: MiYu. Generated Arcane Tower controls, original model/effects and saved feedback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {arcaneFixture} from './frost-arcane-tower-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o));
const engine=Object.assign(world.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:nativeNodeQueries()}),context=vm.createContext({engine});vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);vm.runInContext('const towerRestore=Frost.restore;Frost.restore=raw=>{globalThis.towerState=towerRestore(raw);return towerState;};',context);
const S=context.Frost,V=context.FrostVisual,component=(name,c)=>world.entity(name).components[c],telemetry=()=>JSON.parse(component('Frost telemetry','Text').text),near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=p=>{tick({pointer:p,buttons:[0],pressedButtons:[0]});tick({pointer:p,releasedButtons:[0]});},point=u=>{const t=telemetry(),angle=Math.atan2(32,42);return [640+(u.x-t.camera[0])/t.zoom*360,360+((u.z-t.camera[1])*Math.sin(angle)-S.unitHeight(context.towerState,u)*Math.cos(angle))/t.zoom*360];},step=n=>{for(let i=0;i<n;i++)tick({},.1);};
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click([640,388]);assert.equal(telemetry().mode,'playing');return context.towerState;}
tick();
{
 const f=arcaneFixture(S,{upgrade:true});let s=load(f.s),u=s.units.find(v=>v.id===f.tower.id);click(point(u));
 assert.equal(component('action10 icon','Image').sprite,S.arcaneTowerRules.unit.icon);key('KeyN');assert.equal(u.guardTowerUpgrade.kind,'arcanetower');
 step(499);assert.equal(u.kind,'scouttower');key('F5');s=load(storage.get('quicksave'));u=s.units.find(v=>v.id===f.tower.id);step(1);assert.equal(u.kind,'arcanetower');click(point(u));
 assert.equal(component('HUD Stat Attack value','Text').text.split('\n')[0],'8 - 10');assert.equal(V.model(s,u).key,'KingdomArcaneTower');assert.equal(V.model(s,u).asset.classicTier,4);assert.equal(V.classicClip(V.model(s,u).asset,'Stand',u),9);assert.equal(V.classicClip(V.model(s,u).asset,'Attack',u),9);
 assert.equal(component('action8 icon','Image').sprite,S.arcaneTowerRules.abilities.AHta.disabledIcon);
 step(4);assert.ok(s.projectiles.some(p=>p.art==='arcane-tower'));assert.ok(world.snapshot.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/OrbOfDeathMissile/')));
 key('F5');const saved=copy(storage.get('quicksave'));s=load(saved);assert.deepEqual(copy(s.projectiles),saved.projectiles);step(8);assert.equal(s.units.find(v=>v.id===f.target.id).feedbackAmount,24);assert.ok(S.restore(s));
 assert.ok(world.snapshot.entities.some(e=>e.active&&e.components.SampledEffect?.effect?.includes('ArcaneTowerFeedback')));
 console.log('PASS generated Arcane upgrade hotkey, original button/body/missile/Feedback, 8-10 HUD and saved impact');
}
{
 const f=arcaneFixture(S);f.target.x=20;f.s.teams[0].humanSanctum.Rhse=1;S.refreshMagicSentry(f.s);S.visibility(f.s);const s=load(f.s),u=s.units.find(v=>v.id===f.tower.id);click(point(u));
 assert.equal(component('action8 icon','Image').sprite,S.arcaneTowerRules.abilities.AHta.icon);key('KeyR');click(point({x:20,z:0,kind:'soldier'}));assert.equal(s.arcaneReveals.length,1);assert.equal(S.detected(s,0,s.units.find(v=>v.id===f.target.id)),true);
 step(2);assert.ok(world.snapshot.entities.some(e=>e.active&&e.components.SampledEffect?.effect?.includes('ArcaneTowerReveal')));assert.ok(world.snapshot.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/CrystalBallCaster/')));key('F5');const saved=copy(storage.get('quicksave'));load(saved);assert.equal(context.towerState.arcaneReveals.length,1);step(150);assert.equal(context.towerState.arcaneReveals.length,0);
 console.log('PASS generated Reveal hotkey/ground click, research icon, original caster effect, save/load and expiry');
}
