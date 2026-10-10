// Author: MiYu. Compare complete committed worlds across slot growth, shrink, visibility and mode transitions.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),baseline=process.argv[2]??'5767278',scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const old=execFileSync('git',['show',baseline+':samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),current=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
const clients=[old,current].map(source=>{
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},input:{keys:[],pressedKeys:['RenderProbe'],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  vm.runInContext(source.replace('  return {tick};',"  return {tick,environment,install(value,next='playing'){state=value;editMap=value.map;mode=next;paused=true;selected=[];}};"),context);
  context.onTick(0);world.commit();return {world,context};
});
let checks=0;
function same(label){assert.deepEqual(clients[1].world.snapshot,clients[0].world.snapshot,label+' full committed world');checks++;}
function tick(label,drop=false){for(const {context,world} of clients){context.onTick(0);world.commit(drop);}same(label);}
function install(count,mode='playing',mutate=()=>{}){
  for(const {context} of clients){const S=context.Frost,map=S.defaultMap();map.props=[];map.units=[];map.doodads=[];const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];
    for(let i=0;i<count;i++)S.spawn(s,['worker','soldier','farm'][i%3],i%2,-24+i%16*3,24-Math.floor(i/16)*4);mutate(s,S);S.visibility(s);context.FrostClient.install(s,mode);
  }
}
same('initial authored cleanup');
for(const count of [0,12,160,15,3,0,25,1]){install(count);tick('unit slots '+count);tick('retained unit slots '+count);}
install(12,'playing',s=>{s.units[0].hp=0;s.units[0].reincarnation=2;s.units[1].inside=999;s.visible=[[],[]];});tick('dead reincarnation and resident units');
install(0,'title');tick('menu clears previous slots');tick('menu remains cleared');install(8,'editor');tick('editor shows authored units');install(2);tick('editor to playing shrink');
for(const length of [3,1,0,2,0]){
  for(const {context,world} of clients){context.FrostClient.environment('Scenery 0',length?{parts:Array.from({length},(_,i)=>({mesh:'cube',material:'Assets/Materials/Ground.mmat',visible:i!==1,color:[1,.5,.25,1]})),scale:1.25,yaw:.2}:null,[2,3,4]);world.commit();}same('environment parts '+length);
}
install(20);tick('slots before discarded hide');install(0);tick('discarded hide',true);tick('hide retries');tick('hide confirms');install(9);tick('reused slots after hide');
console.log(JSON.stringify({author:'MiYu',passed:true,baseline,completeWorldsCompared:checks,entities:scene.entities.length,scope:'Generated clients with deferred commits and native-normalized values. Full authored worlds compared after unit slot growth/shrink, maximum capacity, residency/death/reincarnation, menu/editor/game transitions, environment part growth/shrink/hide and discarded writes.'}));
