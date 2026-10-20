// Author: MiYu. Generated client day/night vision, enemy body visibility and saved continuation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
import {humanSightFixture} from './frost-human-sight-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=clientWorldFixture(JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world),storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o));
const engine=Object.assign(world.engine,{network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},playAudio(){},assets:nativeNodeQueries()}),context=vm.createContext({engine});vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);vm.runInContext('const sightRestore=Frost.restore;Frost.restore=raw=>{globalThis.sightState=sightRestore(raw);return sightState;};',context);
const S=context.Frost,component=(name,c)=>world.entity(name).components[c],telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};world.render(dt=>context.onTick(dt),dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=p=>{tick({pointer:p,buttons:[0],pressedButtons:[0]});tick({pointer:p,releasedButtons:[0]});},step=n=>{for(let i=0;i<n;i++)tick({},.1);};
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click([640,388]);assert.equal(telemetry().mode,'playing');return context.sightState;}

tick();
const {s}=humanSightFixture(S);s.map.startingHour=0;s.frame=3599;S.visibility(s);load(s);
const body=()=>world.snapshot.entities.find(e=>e.name==='Unit 1');
assert.ok(body()?.active,'enemy rendered in daylight');key('F5');load(storage.get('quicksave'));step(1);
assert.equal(context.sightState.frame,3600);assert.equal(body().active,false,'enemy hidden at dusk');assert.equal(context.sightState.explored[0][16*32+21],1);
console.log('PASS generated Human sight: rendered enemy disappears at saved dusk; explored fog retained');
const dawn=copy(context.sightState);dawn.frame=1199;load(dawn);assert.equal(body().active,false);step(1);assert.equal(body().active,true);
console.log('PASS generated Human sight: saved dawn reveals enemy body again');
